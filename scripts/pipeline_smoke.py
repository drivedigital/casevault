#!/usr/bin/env python
"""Independent Sprint 3 evidence verification over HTTP + real Postgres + Redis.

Run after scripts/setup_local.sh, with the venv activated and Postgres running::

    eval "$(python scripts/agent_pg.py env)"  # or export TEST_DATABASE_URL
    python scripts/pipeline_smoke.py
    python scripts/pipeline_smoke.py --strict-v1

The default target is sprint3_evidence.md's 2026-09-10 AS-SHIPPED override,
plus the merged reprocess follow-up in wave2_intake_core.md v1.0 section 6.
Original-v1 differences are printed as GAPs, never described as implemented.
--strict-v1 makes those gaps fatal. Reprocess is always required: no 404 fallback.

No existing API/worker/Redis is used. Each run migrates a disposable PostgreSQL
schema (no public search-path fallback), starts Uvicorn and a private Redis,
and tears them down even on assertion failure. The DB role needs CREATE SCHEMA.
A missing/down DB or broken migration FAILS; it is never a skip condition.

Only synthetic bytes are generated. CLI artifacts stay in ignored data/temp/;
pytest supplies its own scratch directory, never the application's data tree.
No product imports, ORM create_all, dependency overrides, or mocked services.
redis-server must be on PATH (or set REDIS_SERVER to its executable path).
"""
from __future__ import annotations

import argparse
import errno
import hashlib
import json
import os
import shutil
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import time
import uuid
import zlib
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

import httpx
import redis
from rq import Queue
from rq.job import Job
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import NullPool

REPO_ROOT = Path(__file__).resolve().parents[1]
API_PREFIX = "/api/v1"
DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/casevault_test"


class SmokeFailure(AssertionError):
    """An actual assertion/setup failure, NOT an optional-dependency skip."""


class PrerequisiteUnavailable(RuntimeError):
    """Only an absent binary or unavailable scratch storage can cause a skip."""


def equal(observed, expected, where: str) -> None:
    if observed != expected:
        raise SmokeFailure(f"{where}: expected {expected!r}; observed {observed!r}")


def require(condition: bool, where: str) -> None:
    if not condition:
        raise SmokeFailure(where)


@dataclass(frozen=True)
class ContractGap:
    code: str
    section: str
    endpoint: str
    expected: str
    observed: str


@dataclass
class SmokeReport:
    checks: list[str] = field(default_factory=list)
    gaps: dict[str, ContractGap] = field(default_factory=dict)

    def passed(self, message: str) -> None:
        self.checks.append(message)
        print(f"PASS {message}", flush=True)

    def gap(self, code: str, section: str, endpoint: str, expected: str, observed: str) -> None:
        if code not in self.gaps:
            self.gaps[code] = ContractGap(code, section, endpoint, expected, observed)
            print(
                f"GAP {code} [§{section}] {endpoint}\n"
                f"    original v1 expected: {expected}\n"
                f"    observed: {observed}",
                flush=True,
            )

    def enforce(self, *, strict_v1: bool = False) -> None:
        if strict_v1 and self.gaps:
            raise SmokeFailure(f"original Sprint 3 v1.0 has {len(self.gaps)} observed contract gaps")


@dataclass(frozen=True)
class Fixture:
    filename: str
    mime: str
    source_type: str
    content: bytes


def synthetic_fixtures() -> dict[str, Fixture]:
    """Valid two-page PDF and RGB PNG, built with stdlib only (not fake headers)."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
        (b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] "
         b"/Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>"),
        (b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] "
         b"/Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>"),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for label in (b"SYNTHETIC PDF PAGE ONE", b"SYNTHETIC PDF PAGE TWO"):
        stream = b"BT /F1 14 Tf 20 100 Td (" + label + b") Tj ET\n"
        objects.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"endstream")
    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n".encode()
    )

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    # A checkerboard, deliberately not a claim of OCR-recognizable text.
    pixels = b"".join(
        b"\x00" + b"".join(bytes([255 * ((x // 4 + y // 4) % 2)]) * 3 for x in range(16))
        for y in range(16)
    )
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", 16, 16, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b"")
    return {
        "text": Fixture(
            "synthetic.txt", "text/plain", "text",
            "CASEVAULT SYNTHETIC FIXTURE\r\nNo case material.\nUTF-8: café — 123.\n".encode(),
        ),
        "pdf": Fixture("synthetic.pdf", "application/pdf", "pdf", bytes(pdf)),
        "image": Fixture("synthetic.png", "image/png", "image", png),
    }


def check_prerequisites(artifact_root: Path) -> str:
    binary = shutil.which(os.environ.get("REDIS_SERVER", "redis-server"))
    if binary is None:
        raise PrerequisiteUnavailable(
            "redis-server binary absent: install Redis or set REDIS_SERVER to its executable; "
            "the required real-Redis half of the evidence run cannot execute"
        )
    try:
        artifact_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryFile(dir=artifact_root) as probe:
            probe.write(b"synthetic storage probe")
    except OSError as exc:
        if exc.errno not in (errno.EACCES, errno.EROFS, errno.ENOENT, errno.ENOTDIR):
            raise
        raise PrerequisiteUnavailable(f"scratch storage unavailable: {exc.strerror}") from exc
    return binary


@contextmanager
def child_process(
    command: list[str], env: dict[str, str], log: Path, *, pass_fds: tuple[int, ...] = (),
) -> Iterator[subprocess.Popen]:
    """Always reap the whole process group, including RQ's forked work horse."""
    with log.open("w") as output:
        process = subprocess.Popen(
            command, cwd=REPO_ROOT, env=env, stdout=output, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL, start_new_session=True, pass_fds=pass_fds,
        )
        try:
            yield process
        finally:
            # The leader can exit before its children (notably a failed worker).
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
            finally:
                # Also kill any surviving children if the leader already exited.
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=5)


def run_command(command: list[str], env: dict[str, str], log: Path) -> str:
    with child_process(command, env, log) as process:
        try:
            code = process.wait(timeout=90)
        except subprocess.TimeoutExpired as exc:
            raise SmokeFailure(f"{log.stem} timed out after 90s; see {log}") from exc
        equal(code, 0, f"{log.stem} exit status (diagnostics: {log})")
    return log.read_text()


@contextmanager
def migrated_database(
    database_url: str, env: dict[str, str], artifacts: Path, report: SmokeReport,
) -> Iterator[tuple[Engine, dict[str, str]]]:
    """Isolate even bootstrap identities/enums; never truncate a shared DB."""
    admin = create_engine(database_url, poolclass=NullPool, connect_args={"connect_timeout": 5})
    equal(admin.dialect.name, "postgresql", "evidence requires real PostgreSQL")
    schema = f"evidence_smoke_{uuid.uuid4().hex}"
    created = False
    engine = None
    try:
        with admin.begin() as connection:
            version = connection.scalar(text("SHOW server_version"))
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
            created = True
        # libpq applies PGOPTIONS in *every* child: migrations, API, direct and RQ workers.
        # Omitting public is essential: otherwise Alembic could see public.alembic_version.
        options = f"-csearch_path={schema}"
        env = {**env, "DATABASE_URL": database_url, "TEST_DATABASE_URL": database_url,
               "PGOPTIONS": options}
        run_command(
            [sys.executable, "-m", "alembic", "-c", "apps/api/alembic.ini", "upgrade", "head"],
            env, artifacts / "migrations.log",
        )
        engine = create_engine(
            database_url, poolclass=NullPool,
            connect_args={"options": options, "connect_timeout": 5},
        )
        with engine.connect() as connection:
            equal(connection.scalar(text("SELECT current_schema()")), schema, "DB isolation")
            revision = connection.scalar(text("SELECT version_num FROM alembic_version"))
            equal(connection.scalar(text("SELECT count(*) FROM sources")), 0, "fresh sources table")
        report.passed(f"PostgreSQL {version}; migrations through {revision} in a disposable schema")
        yield engine, env
    finally:
        if engine is not None:
            engine.dispose()
        if created:
            with admin.begin() as connection:
                # Only this generated schema can be dropped; no caller-supplied identifier.
                connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        admin.dispose()


def wait_ready(process: subprocess.Popen, probe, label: str, log: Path) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise SmokeFailure(f"{label} exited before readiness; see {log}")
        if probe():
            return
        time.sleep(0.05)
    raise SmokeFailure(f"{label} not ready after 30s; see {log}")


@contextmanager
def private_redis(binary: str, env: dict[str, str], artifacts: Path) -> Iterator[redis.Redis]:
    socket_path = artifacts / "redis.sock"
    require(len(os.fsencode(socket_path)) < 104, "scratch path too long for a Redis Unix socket")
    log = artifacts / "redis.log"
    command = [
        binary, "--port", "0", "--unixsocket", str(socket_path), "--unixsocketperm", "700",
        "--save", "", "--appendonly", "no", "--dir", str(artifacts), "--daemonize", "no",
    ]
    with child_process(command, env, log) as process:
        connection = redis.Redis(unix_socket_path=str(socket_path), socket_timeout=1)
        try:
            def ready() -> bool:
                try:
                    return connection.ping()
                except redis.exceptions.ConnectionError:
                    return False

            wait_ready(process, ready, "private Redis", log)
            equal(connection.dbsize(), 0, "private Redis starts empty (no shared queues)")
            yield connection
        finally:
            connection.close()


@contextmanager
def live_api(env: dict[str, str], artifacts: Path, mode: str) -> Iterator[httpx.Client]:
    log = artifacts / f"api-{mode}.log"
    # Hand off an already-bound fd to avoid a free-port selection race.
    with socket.socket() as listener:
        listener.bind(("0.0.0.0", 0))
        listener.listen(128)
        port = listener.getsockname()[1]
        command = [
            sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0",
            "--fd", str(listener.fileno()), "--no-access-log", "--log-level", "warning",
        ]
        # Loopback is internal test traffic, not a browser-facing service URL.
        with (
            child_process(command, env, log, pass_fds=(listener.fileno(),)) as process,
            httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10, trust_env=False) as client,
        ):
            def ready() -> bool:
                try:
                    return client.get("/health", timeout=1).status_code == 200
                except httpx.TransportError:
                    return False

            wait_ready(process, ready, f"API ({mode})", log)
            yield client


class EvidenceRun:
    def __init__(
        self, client: httpx.Client, db: Engine, env: dict[str, str], artifacts: Path,
        report: SmokeReport, connection: redis.Redis | None,
    ) -> None:
        self.client, self.db, self.env = client, db, env
        self.artifacts, self.report, self.connection = artifacts, report, connection
        self.mode = "redis" if connection is not None else "no-redis"
        self.workspace_id: str | None = None
        self.command_number = 0

    def request(self, method: str, path: str, status: int = 200, **kwargs) -> httpx.Response:
        params = dict(kwargs.pop("params", {}))
        if self.workspace_id is not None:
            params.setdefault("workspace_id", self.workspace_id)
        response = self.client.request(method, API_PREFIX + path, params=params, **kwargs)
        equal(response.status_code, status, f"{self.mode}: {method} {path} HTTP status")
        if status >= 400:
            require(isinstance(response.json().get("detail"), str), f"{method} {path}: ApiError.detail")
        return response

    def rows(self, query: str, **params) -> list[dict]:
        with self.db.connect() as connection:
            return [dict(row) for row in connection.execute(text(query), params).mappings()]

    def detail(self, source_id: str) -> dict:
        return self.request("GET", f"/sources/{source_id}").json()

    def pages(self, source_id: str) -> list[dict]:
        pages = self.request("GET", f"/sources/{source_id}/pages").json()
        require(isinstance(pages, list), "as-shipped GET /sources/{id}/pages must be an array")
        return pages

    def persisted(self, source: dict, fixture: Fixture) -> None:
        source_id = source["id"]
        uuid.UUID(source_id)
        equal(source["workspace_id"], self.workspace_id, "source workspace")
        equal(source["source_type"], fixture.source_type, "§4.3 classification")
        equal(source["sha256"], hashlib.sha256(fixture.content).hexdigest(), "§3.1 sha256")
        equal(source["file_size_bytes"], len(fixture.content), "§3.1 byte size")
        equal(source["mime_type"], fixture.mime, "upload MIME type")
        key = PurePosixPath(source["storage_path"])
        require(not key.is_absolute() and ".." not in key.parts, "storage key must be relative/safe")
        equal(key.parts[:2], ("uploads", self.workspace_id), "§4.2 workspace storage partition")
        equal(len(key.parts), 5, "as-shipped time-partitioned storage key")
        self.report.gap(
            "storage-key-layout", "4.2", "POST /sources -> storage_path",
            "uploads/{workspace_id}/{source_id}/original{ext}",
            "uploads/{workspace_id}/{YYYY}/{MM}/{uuid}__{filename} (approved override)",
        )
        storage = Path(self.env["LOCAL_STORAGE_ROOT"]).resolve()
        stored = (storage / key).resolve()
        require(stored.is_relative_to(storage), "stored file must remain inside isolated storage")
        equal(stored.read_bytes(), fixture.content, "on-disk original bytes")
        rows = self.rows("SELECT * FROM sources WHERE id = :id", id=source_id)
        equal(len(rows), 1, "exactly one committed source row")
        row = rows[0]
        for name in (
            "id", "workspace_id", "source_type", "title", "original_filename", "mime_type",
            "storage_path", "sha256", "file_size_bytes", "page_count", "source_status",
            "evidence_review_status", "included_flag", "excluded_flag", "exclusion_reason",
            "authentication_notes", "restrictions_notes", "processing_status", "ocr_status",
        ):
            value = str(row[name]) if isinstance(row[name], uuid.UUID) else row[name]
            equal(value, source[name], f"committed sources.{name} vs HTTP response")
        require(not (row["included_flag"] and row["excluded_flag"]), "§2 include/exclude invariant")
        meta = self.metadata(source_id)
        equal(meta["ingest"]["sha256"], source["sha256"], "ingest provenance sha256")
        equal(meta["ingest"]["size_bytes"], len(fixture.content), "ingest provenance size")
        equal(meta["ingest"]["filename"], source["original_filename"], "ingest provenance filename")

    def metadata(self, source_id: str) -> dict:
        rows = self.rows("SELECT metadata_json FROM source_metadata WHERE source_id = :id", id=source_id)
        equal(len(rows), 1, "one committed source_metadata row")
        return rows[0]["metadata_json"]

    def extraction(self, source_id: str, fixture: Fixture) -> None:
        source = self.detail(source_id)
        self.persisted(source, fixture)
        equal(source["processing_status"], "complete", "§5 completed processing")
        pages = self.pages(source_id)
        db_pages = self.rows(
            "SELECT id, source_id, page_number, ocr_text FROM source_pages "
            "WHERE source_id = :id ORDER BY page_number", id=source_id,
        )
        if fixture.source_type == "text":
            equal(source["ocr_status"], "complete", "§5 text OCR status")
            equal(source["page_count"], 1, "text page_count")
            equal(len(pages), 1, "one HTTP text page (including after repeat processing)")
            equal(pages[0]["page_number"], 1, "text page number")
            equal(pages[0]["ocr_text"], fixture.content.decode(), "exact extracted UTF-8/CRLF text")
            equal(len(db_pages), 1, "one committed source_pages row")
            for name in ("id", "source_id", "page_number", "ocr_text"):
                value = db_pages[0][name]
                equal(str(value) if isinstance(value, uuid.UUID) else value, pages[0][name],
                      f"committed source_pages.{name} vs HTTP response")
        else:
            # This is a positive assertion of the approved stub, NOT a pytest skip.
            equal(source["ocr_status"], "skipped", "§5 as-shipped PDF/image OCR stub")
            equal(source["page_count"], None, "as-shipped binary page_count")
            equal(pages, [], "as-shipped PDF/image pages")
            equal(db_pages, [], "no fabricated OCR rows")
            ocr = self.metadata(source_id)["ocr"]
            equal(ocr["engine"], "stub", "explicit OCR stub engine")
            require(isinstance(ocr["reason"], str) and bool(ocr["reason"].strip()),
                    "OCR skipped requires a persisted nonempty reason")

    def command(self, args: list[str]) -> str:
        self.command_number += 1
        return run_command(
            [sys.executable, *args], self.env,
            self.artifacts / f"worker-{self.mode}-{self.command_number}.log",
        )

    def run_jobs(self, sources: list[dict], *, repeat: bool = False) -> None:
        if self.connection is None:
            for source in sources:
                output = self.command(["-m", "workers.run_process", "--source-id", source["id"]])
                if repeat:
                    require("already_complete" in output, "§5 repeat direct worker must be idempotent")
            return
        queue = Queue("ingest", connection=self.connection)
        if repeat:
            equal(queue.count, 0, "repeat starts with drained ingest queue")
            for source in sources:
                queue.enqueue("workers.pipeline.jobs.process_source", source["id"])
        jobs = queue.jobs
        equal(sorted(job.args[0] for job in jobs), sorted(s["id"] for s in sources),
              "real RQ enqueue source IDs (not a manually substituted initial enqueue)")
        for job in jobs:
            equal(job.func_name, "workers.pipeline.jobs.process_source", "shipped ingest job target")
            equal(len(job.args), 1, "shipped ingest job arguments")
        self.drain_worker(jobs, repeat=repeat)

    def drain_worker(self, jobs: list[Job], *, repeat: bool = False) -> None:
        self.command([
            "-c", "from rq.cli import main; main()", "worker", "--url", self.env["REDIS_URL"],
            "--burst", "--disable-job-desc-logging", "--logging_level", "WARNING", "ingest", "ocr",
        ])
        for job in jobs:
            equal(job.get_status(refresh=True), "finished", "RQ job must finish, not merely enqueue")
            result = job.return_value(refresh=True)
            equal(result["status"], "already_complete" if repeat else "complete", "RQ job result")
        for name in ("ingest", "ocr"):
            queue = Queue(name, connection=self.connection)
            equal(queue.count, 0, f"RQ {name} queue drained")
            equal(queue.failed_job_registry.count, 0, f"RQ {name} has no failed jobs")

    def reprocess(self, sources: dict[str, dict], fixtures: dict[str, Fixture]) -> None:
        self.run_jobs(list(sources.values()), repeat=True)
        for kind, source in sources.items():
            self.extraction(source["id"], fixtures[kind])
        self.report.passed(f"{self.mode}: repeat direct/RQ ingest is idempotent")

        # WS-EV is merged: 404 is now a hard failure, never an accepted backlog gap.
        # Exercise both stages, each stage alone, and the no-body default on a repeated source.
        for kind, payload in (
            ("text", {"stages": ["ingest", "ocr"]}),
            ("pdf", {"stages": ["ingest"]}),
            ("image", {"stages": ["ocr"]}),
            ("text", None),
        ):
            source_id = sources[kind]["id"]
            before = self.detail(source_id)
            stages = payload["stages"] if payload is not None else ["ocr"]
            body = {"json": payload} if payload is not None else {}
            result = self.request("POST", f"/sources/{source_id}/reprocess", 202, **body).json()
            equal(type(result["queued"]), bool, "reprocess queued must be a JSON boolean")
            equal(result["queued"], self.connection is not None, "§3.2 reprocess queued flag")
            queued = self.detail(source_id)
            # Wave 2 §6 queues the relevant status, not unrelated stages.
            for stage, column in (("ingest", "processing_status"), ("ocr", "ocr_status")):
                equal(queued[column], "queued" if stage in stages else before[column],
                      f"reprocess {column} before worker for stages={stages}")
            self.persisted(queued, fixtures[kind])
            if self.connection is None:
                equal(result["job_id"], None, "offline reprocess job_id")
                require(isinstance(result["reason"], str) and bool(result["reason"].strip()),
                        "offline reprocess requires an actionable reason")
                for stage in stages:
                    # Call the *same* stage target RQ uses, in a fresh process. The generic
                    # process_source runner is a no-op for OCR-only on complete sources.
                    output = self.command([
                        "-c", (
                            "import json, sys; from workers.pipeline import jobs; "
                            "result = getattr(jobs, sys.argv[1] + '_source')(sys.argv[2], sys.argv[3]); "
                            "print(json.dumps(result))"
                        ),
                        stage, source_id, self.workspace_id,
                    ])
                    direct_result = json.loads(output.splitlines()[-1])
                    equal(direct_result["status"], "complete", f"direct {stage} stage result")
                    equal(direct_result["source_id"], source_id, "direct stage source identity")
            else:
                require(isinstance(result["job_id"], str) and bool(result["job_id"]),
                        "online reprocess requires a real job_id")
                equal(result["reason"], None, "online reprocess reason")
                jobs = []
                for stage in ("ingest", "ocr"):
                    queued_jobs = Queue(stage, connection=self.connection).jobs
                    equal(len(queued_jobs), int(stage in stages), f"exact {stage} stage job count")
                    for job in queued_jobs:
                        equal(job.func_name, f"workers.pipeline.jobs.{stage}_source", "RQ stage target")
                        equal(job.args, (source_id, self.workspace_id), "RQ source/workspace arguments")
                        equal(job.get_status(), "queued", "reprocess job is really queued")
                        jobs.append(job)
                require(result["job_id"] in {job.id for job in jobs}, "202 job_id must identify a queued job")
                self.drain_worker(jobs)  # Check *all* stages, not just the one ID in the response.
            self.extraction(source_id, fixtures[kind])
            after = self.detail(source_id)
            for name in (
                "id", "title", "source_type", "original_filename", "storage_path", "sha256",
                "file_size_bytes", "source_status", "evidence_review_status", "included_flag",
                "excluded_flag", "exclusion_reason", "duplicate_of",
            ):
                equal(after[name], before[name], f"reprocess preserves source.{name}")
        self.report.passed(f"{self.mode}: /reprocess 202, both/single/default stages, completion + repeat safety")

    def lifecycle(self, source_id: str) -> None:
        path = f"/sources/{source_id}"
        included = self.request("PATCH", path, json={
            "source_status": "primary", "evidence_review_status": "reviewed", "included_flag": True,
        }).json()
        equal((included["included_flag"], included["excluded_flag"]), (True, False), "include patch")
        self.request("PATCH", path, 409, json={
            "title": "MUST NOT COMMIT", "included_flag": True, "excluded_flag": True,
        })
        equal(self.detail(source_id), included, "conflicting PATCH must roll back the entire update")
        self.request("PATCH", path, 409, json={"excluded_flag": True})
        equal(self.detail(source_id), included, "single-flag conflict must also roll back")
        excluded = self.request("PATCH", path, json={
            "included_flag": False, "excluded_flag": True, "exclusion_reason": "Synthetic test only",
        }).json()
        equal((excluded["included_flag"], excluded["excluded_flag"]), (False, True), "explicit exclude")
        self.request("PATCH", path, 409, json={"included_flag": True})
        equal(self.detail(source_id), excluded, "reverse single-flag conflict rolls back")
        self.report.gap(
            "flag-conflict-status", "3.2", "PATCH /sources/{id} (both flags true)",
            "422 validation error", "409 constraint error (approved as-shipped override)",
        )
        self.report.gap(
            "flag-auto-clear", "3.2", "PATCH /sources/{id} (opposite flag already true)",
            "200; setting one true automatically clears the other",
            "409; caller must explicitly send the opposite flag=false",
        )
        self.report.passed(f"{self.mode}: include/exclude exclusivity, explicit transitions, rollback")

    def matter_links(self, source_id: str) -> None:
        matter = self.request("POST", "/matters", 201, json={"name": "WS-D synthetic matter"}).json()
        matter_id = matter["id"]
        link_path = f"/matters/{matter_id}/sources"
        payload = {"source_id": source_id, "link_reason": "Synthetic verification"}
        link = self.request("POST", link_path, 201, json=payload).json()
        equal((link["source_id"], link["matter_id"]), (source_id, matter_id), "matter link identity")
        self.request("POST", link_path, 409, json=payload)
        equal([s["id"] for s in self.request("GET", link_path).json()], [source_id], "matter sources")
        equal([s["id"] for s in self.request("GET", "/sources", params={"matter_id": matter_id}).json()],
              [source_id], "matter_id filter")
        for path in (f"/sources/{source_id}/matters", f"/matters/{matter_id}/source-links"):
            equal([row["id"] for row in self.request("GET", path).json()], [link["id"]], path)
        equal(len(self.rows("SELECT id FROM source_matter_links WHERE source_id = :id", id=source_id)),
              1, "duplicate matter link creates no extra DB row")
        self.request("DELETE", f"/source-matter-links/{link['id']}", 204)
        for path in (link_path, f"/sources/{source_id}/matters", f"/matters/{matter_id}/source-links"):
            equal(self.request("GET", path).json(), [], f"unlink visible at {path}")
        equal(self.rows("SELECT id FROM source_matter_links WHERE source_id = :id", id=source_id),
              [], "unlink removes the DB link, not the source")
        equal(self.detail(source_id)["id"], source_id, "unlink preserves source")
        self.report.gap(
            "matter-link-route", "3.2", "POST/GET /sources/{id}/matter-links",
            "source-centric /matter-links routes",
            "shipped POST /matters/{id}/sources + GET /sources/{id}/matters; same link semantics",
        )
        self.report.passed(f"{self.mode}: matter link/unlink, duplicate 409, both views + committed rows")

    def run(self) -> None:
        bootstrap = self.request("GET", "/workspaces/current").json()
        equal(self.request("GET", "/workspaces/current").json()["id"], bootstrap["id"],
              "bootstrap is idempotent")
        self.workspace_id = self.request(
            "POST", "/workspaces", 201, json={"name": f"WS-D synthetic {self.mode}"},
        ).json()["id"]
        equal(len(self.rows("SELECT id FROM workspaces WHERE id = :id", id=self.workspace_id)),
              1, "committed workspace row")
        self.report.passed(f"{self.mode}: HTTP bootstrap + isolated workspace")
        fixtures = synthetic_fixtures()
        sources = {}
        fixture_dir = self.artifacts / "fixtures"
        fixture_dir.mkdir(exist_ok=True)
        for kind, fixture in fixtures.items():
            file_path = fixture_dir / fixture.filename
            file_path.write_bytes(fixture.content)
            with file_path.open("rb") as upload:
                source = self.request("POST", "/sources", 201,
                                      files={"file": (fixture.filename, upload, fixture.mime)},
                                      data={"title": f"WS-D {self.mode} {kind}"}).json()
            sources[kind] = source
            self.persisted(source, fixture)
            equal(source["duplicate_of"], None, "first upload is not a duplicate")
            equal(source["source_status"], "derived", "default source status")
            equal(source["evidence_review_status"], "uploaded", "default review status")
            equal((source["included_flag"], source["excluded_flag"]), (False, False), "default flags")
            if kind == "text":
                self.extraction(source["id"], fixture)
            else:
                equal((source["processing_status"], source["ocr_status"]), ("queued", "not_started"),
                      "binary upload stays queued until a real worker runs")
                equal(self.pages(source["id"]), [], "no binary pages before processing")
        self.report.passed(f"{self.mode}: valid TXT/PDF/PNG upload, SQL rows, sha256, size, storage bytes")
        text_source = sources["text"]
        duplicate = self.request(
            "POST", "/sources", 201,
            files={"file": ("synthetic-copy.txt", fixtures["text"].content, "text/plain")},
            data={"title": "WS-D duplicate copy"},
        ).json()
        require(duplicate["id"] != text_source["id"], "duplicate must remain a distinct source")
        require(duplicate["storage_path"] != text_source["storage_path"], "duplicate preserves own file")
        equal(duplicate["evidence_review_status"], "duplicate", "duplicate review warning")
        equal(duplicate["duplicate_of"], {
            "source_id": text_source["id"], "title": text_source["title"], "sha256": text_source["sha256"],
        }, "shipped duplicate warning pointer")
        self.persisted(duplicate, fixtures["text"])
        self.extraction(duplicate["id"], fixtures["text"])
        equal(self.detail(text_source["id"]), text_source, "duplicate upload preserves original row")
        self.report.gap(
            "duplicate-pointer", "3.1", "POST /sources -> duplicate_of",
            "{id, title}", "{source_id, title, sha256}; distinct provenance and original preserved",
        )
        self.report.passed(f"{self.mode}: duplicate warning + independent copy; original unchanged")

        self.run_jobs([sources["pdf"], sources["image"]])
        for kind, source in sources.items():
            self.extraction(source["id"], fixtures[kind])
        self.report.gap(
            "binary-ocr-deferred", "5", "GET /sources/{id}/pages + pipeline (PDF/image)",
            "PDF page count/extraction and optional OCR when engines are installed",
            "processing=complete, ocr=skipped, page_count=null, no pages; persisted stub reason",
        )
        self.report.passed(f"{self.mode}: real worker completion; exact text page; explicit PDF/image stub reasons")
        self.lifecycle(text_source["id"])
        self.matter_links(text_source["id"])

        all_ids = {s["id"] for s in sources.values()} | {duplicate["id"]}
        listed = self.request("GET", "/sources").json()
        require(isinstance(listed, list), "as-shipped source list must be an array")
        equal({s["id"] for s in listed}, all_ids, "source listing contains every distinct upload")
        for params, expected in (
            ({"source_type": "image"}, {sources["image"]["id"]}),
            ({"source_type": "text"}, {text_source["id"], duplicate["id"]}),
            ({"evidence_review_status": "duplicate"}, {duplicate["id"]}),
            ({"q": f"WS-D {self.mode} pdf"}, {sources["pdf"]["id"]}),
        ):
            equal({s["id"] for s in self.request("GET", "/sources", params=params).json()},
                  expected, f"supported source filters {params}")
        # Original v1 filter is deliberately probed, not assumed to work just because HTTP is 200.
        filtered = self.request("GET", "/sources", params={"source_status": "primary"}).json()
        equal({s["id"] for s in filtered}, all_ids, "as-shipped source_status filter is unsupported")
        self.report.gap(
            "list-envelope-filters", "3.2", "GET /sources?source_status=primary",
            "{items,total,limit,offset}; only primary sources",
            "plain array; source_status ignored (all 4 rows), documented reduced filter set",
        )
        self.report.gap(
            "detail-page-shapes", "3.2", "GET /sources/{id} and /sources/{id}/pages",
            "SourceDetailOut wrapper + paginated pages including layout_json/has_text",
            "flat SourceOut + page array; no detail metadata envelope or layout_json/has_text",
        )
        self.report.passed(f"{self.mode}: list + supported type/review/title/matter filters")

        other_workspace = self.request("POST", "/workspaces", 201,
                                       json={"name": "WS-D scope sentinel"}).json()["id"]
        for suffix in ("", "/file", "/pages"):
            self.request("GET", f"/sources/{text_source['id']}{suffix}", 404,
                         params={"workspace_id": other_workspace})
        self.request("PATCH", f"/sources/{text_source['id']}", 404,
                     params={"workspace_id": other_workspace}, json={"title": "MUST NOT CHANGE"})
        self.request("POST", f"/sources/{text_source['id']}/reprocess", 404,
                     params={"workspace_id": other_workspace}, json={"stages": ["ocr"]})
        self.report.passed(f"{self.mode}: wrong-workspace detail/file/pages/patch/reprocess return 404")

        self.reprocess(sources, fixtures)
        for kind, source in {**sources, "copy": duplicate}.items():
            fixture = fixtures["text" if kind == "copy" else kind]
            current = self.detail(source["id"])
            self.persisted(current, fixture)
            equal(current["storage_path"], source["storage_path"], "processing preserves original key")
            response = self.request("GET", f"/sources/{source['id']}/file")
            equal(response.content, fixture.content, "§7 original download byte-for-byte equality")
            equal(response.headers["content-type"].split(";")[0], fixture.mime, "download media type")
            require(response.headers.get("content-disposition", "").startswith("attachment;"),
                    "download Content-Disposition must be attachment")
            require(current["original_filename"] in response.headers["content-disposition"],
                    "download Content-Disposition must retain original filename")
        equal(len(self.rows("SELECT id FROM sources WHERE workspace_id = :id", id=self.workspace_id)),
              4, "processing/linking/unlinking never creates or removes evidence sources")
        self.report.passed(f"{self.mode}: all 4 originals byte-equal after processing, patches and unlink")


def verify_web_route_entrypoints(report: SmokeReport) -> None:
    """Catch a missing WS-C delivery even when next build succeeds without those routes.

    This is deliberately only a source-entrypoint guard; it does not pretend to
    replace a browser walk. CI's Python job need not install Node/build artifacts.
    """
    missing = []
    for suffix, route in (("evidence", "/evidence"), ("evidence/[id]", "/evidence/{id}")):
        directory = REPO_ROOT / "apps" / "web" / "app" / suffix
        if not any((directory / f"page.{ext}").is_file() for ext in ("tsx", "ts", "jsx", "js")):
            missing.append(route)
    require(
        not missing,
        "§6 / §7 WS-C: expected Next page entrypoints for " + ", ".join(missing)
        + "; observed missing apps/web/app/evidence pages. Owning UI workstream must restore them.",
    )
    report.passed("WS-C evidence index/detail route entrypoints exist (static guard, not a browser walk)")


def run_smoke(
    artifact_root: Path, *, database_url: str | None = None, strict_v1: bool = False,
) -> SmokeReport:
    artifact_root = artifact_root.resolve()
    binary = check_prerequisites(artifact_root)
    report = SmokeReport()
    print("Evidence smoke: as-shipped contract; synthetic fixtures; original-v1 GAPs are explicit.", flush=True)
    env = {
        **os.environ,
        "PYTHONPATH": os.pathsep.join((str(REPO_ROOT / "apps/api"), str(REPO_ROOT),
                                      os.environ.get("PYTHONPATH", ""))),
        "STORAGE_MODE": "local", "LOCAL_STORAGE_ROOT": str(artifact_root / "storage"),
    }
    url = database_url or os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    with migrated_database(url or DEFAULT_DATABASE_URL, env, artifact_root, report) as (db, env):
        offline_url = f"unix://{artifact_root / 'redis-disabled.sock'}"
        # No accidental dependency on a developer's Redis being down/on a particular TCP port.
        with redis.Redis.from_url(offline_url, socket_timeout=1) as absent:
            try:
                absent.ping()
            except redis.exceptions.ConnectionError:
                pass
            else:
                raise SmokeFailure("no-Redis scenario unexpectedly reached a Redis server")
        offline_env = {**env, "REDIS_URL": offline_url}
        with live_api(offline_env, artifact_root, "no-redis") as client:
            EvidenceRun(client, db, offline_env, artifact_root, report, None).run()
        with private_redis(binary, env, artifact_root) as connection:
            online_env = {**env, "REDIS_URL": f"unix://{artifact_root / 'redis.sock'}"}
            with live_api(online_env, artifact_root, "redis") as client:
                EvidenceRun(client, db, online_env, artifact_root, report, connection).run()
    report.passed("API/worker/Redis processes stopped; only the generated DB schema removed")
    verify_web_route_entrypoints(report)
    report.enforce(strict_v1=strict_v1)
    print(f"EVIDENCE GREEN (as-shipped): {len(report.checks)} checks; "
          f"{len(report.gaps)} original-v1 gaps; 0 scenarios skipped.", flush=True)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--strict-v1", action="store_true", help="fail on every observed original-v1 gap")
    args = parser.parse_args(argv)
    parent = REPO_ROOT / "data" / "temp"
    parent.mkdir(parents=True, exist_ok=True)
    artifacts = Path(tempfile.mkdtemp(prefix="evidence-smoke-", dir=parent))
    print(f"Synthetic artifacts and diagnostic logs: {artifacts}", flush=True)
    try:
        run_smoke(artifacts, strict_v1=args.strict_v1)
    except PrerequisiteUnavailable as exc:
        print(f"EVIDENCE BLOCKED: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001 - CLI fails closed without dumping credentials
        # Keep full subprocess logs local, not DSNs/environment dumps in PR proof.
        if isinstance(exc, SmokeFailure):
            message = str(exc)
        else:
            message = f"{type(exc).__name__}; check PostgreSQL/setup and the local diagnostic logs"
        print(f"EVIDENCE FAILED: {message}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
