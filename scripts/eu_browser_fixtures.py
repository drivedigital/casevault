#!/usr/bin/env python
"""EU-V — synthetic browser fixtures for evidence acceptance runs.

Reuses the wave-standard generator (`scripts/pipeline_smoke.synthetic_fixtures`)
so the browser fixtures are byte-identical in kind to the ones WS-D proved at
the HTTP/worker level: a structurally valid two-page PDF, a CRC-valid RGB PNG
and a UTF-8/CRLF text file. Files are written to a git-ignored scratch
directory; no real evidence, no identifying filenames, nothing to commit.

Usage
    python scripts/eu_browser_fixtures.py [--dir DIR] [--json]
    python scripts/eu_browser_fixtures.py --dir data/temp/eu-browser/fixtures --json

Exit codes: 0 ok, 1 failure.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))


def write_fixtures(directory: pathlib.Path) -> dict[str, dict[str, object]]:
    from scripts.pipeline_smoke import synthetic_fixtures  # real generator, stdlib-built

    directory.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, object]] = {}
    for kind, fixture in synthetic_fixtures().items():
        path = directory / fixture.filename
        path.write_bytes(fixture.content)
        manifest[kind] = {
            "path": str(path),
            "filename": fixture.filename,
            "mime": fixture.mime,
            "source_type": fixture.source_type,
            "size": len(fixture.content),
            "sha256": hashlib.sha256(fixture.content).hexdigest(),
        }
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dir",
        default=str(REPO_ROOT / "data" / "temp" / "eu-browser" / "fixtures"),
        help="scratch output directory (default: data/temp/eu-browser/fixtures)",
    )
    parser.add_argument("--json", action="store_true", help="print the manifest as JSON")
    args = parser.parse_args(argv)

    directory = pathlib.Path(args.dir).resolve()
    manifest = write_fixtures(directory)
    if args.json:
        print(json.dumps(manifest, indent=2))
    else:
        for kind, meta in manifest.items():
            print(
                f"{kind:6s} {meta['filename']:24s} {meta['size']:>6} B "
                f"{meta['sha256'][:16]}…  {meta['path']}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
