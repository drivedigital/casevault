"""Independent evidence flow; no tests/api fixtures or product dependency overrides."""
import os
import re
import struct
import zlib

import pytest
from scripts.pipeline_smoke import (
    PrerequisiteUnavailable,
    SmokeFailure,
    SmokeReport,
    run_smoke,
    synthetic_fixtures,
)


def test_evidence_e2e(tmp_path_factory):
    # A short, isolated path also fits Redis's Unix socket length limit.
    # Never reuse LOCAL_STORAGE_ROOT: tests/api/conftest.py mutates it at collection.
    artifacts = tmp_path_factory.mktemp("evidence")
    try:
        report = run_smoke(
            artifacts,
            require_reprocess=os.environ.get("EVIDENCE_REQUIRE_REPROCESS") == "1",
        )
    except PrerequisiteUnavailable as exc:
        reason = f"evidence integration prerequisites unavailable: {exc}"
        if os.environ.get("EVIDENCE_REQUIRE_DEPS") == "1":
            pytest.fail(reason, pytrace=False)
        # ONLY missing redis-server / unavailable scratch storage. Connection errors,
        # migrations, worker failures, bad HTTP responses and assertions all fail.
        pytest.skip(reason)
    assert any(check.startswith("no-redis:") for check in report.checks)
    assert any(check.startswith("redis:") for check in report.checks)
    assert sum("all 4 originals byte-equal" in check for check in report.checks) == 2


def test_synthetic_fixtures_are_real_file_structures():
    """Validate fixture offsets/CRCs independently, without optional PDF/OCR libs."""
    fixtures = synthetic_fixtures()
    pdf = fixtures["pdf"].content
    assert pdf.startswith(b"%PDF-1.4\n") and pdf.endswith(b"%%EOF\n")
    startxref = int(re.search(rb"startxref\n(\d+)\n", pdf)[1])
    xref_lines = pdf[startxref:].splitlines()
    assert xref_lines[:3] == [b"xref", b"0 8", b"0000000000 65535 f "]
    for number, line in enumerate(xref_lines[3:10], 1):
        offset = int(line.split()[0])
        assert pdf[offset:].startswith(f"{number} 0 obj\n".encode())
    assert pdf.count(b"/Type /Page ") == 2
    assert b"/Kids [3 0 R 4 0 R] /Count 2" in pdf
    assert b"SYNTHETIC PDF PAGE ONE" in pdf and b"SYNTHETIC PDF PAGE TWO" in pdf
    for match in re.finditer(rb"/Length (\d+) >>\nstream\n(.*?)endstream", pdf, re.DOTALL):
        assert len(match[2]) == int(match[1])

    png = fixtures["image"].content
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    offset, chunks = 8, []
    while offset < len(png):
        size = struct.unpack(">I", png[offset:offset + 4])[0]
        kind = png[offset + 4:offset + 8]
        data = png[offset + 8:offset + 8 + size]
        crc = struct.unpack(">I", png[offset + 8 + size:offset + 12 + size])[0]
        assert crc == zlib.crc32(kind + data)
        chunks.append((kind, data))
        offset += size + 12
    assert offset == len(png)
    assert [kind for kind, data in chunks] == [b"IHDR", b"IDAT", b"IEND"]
    assert struct.unpack(">IIBBBBB", chunks[0][1]) == (16, 16, 8, 2, 0, 0, 0)
    pixels = zlib.decompress(chunks[1][1])
    assert len(pixels) == 16 * (1 + 16 * 3)
    assert pixels[::49] == b"\0" * 16  # a valid filter byte per scanline
    assert "café" in fixtures["text"].content.decode("utf-8")


def test_original_contract_and_required_reprocess_gates_fail_closed():
    report = SmokeReport()
    report.gap("reprocess-deferred", "3.2", "POST /sources/{id}/reprocess", "202", "404")
    report.enforce()  # Explicitly accepted as-shipped backlog, not an implemented endpoint.
    with pytest.raises(SmokeFailure, match="observed contract gaps"):
        report.enforce(strict_v1=True)
    with pytest.raises(SmokeFailure, match="required 202, observed 404"):
        report.enforce(require_reprocess=True)
