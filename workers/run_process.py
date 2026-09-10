"""Direct-run source processor — no redis required.

Processes every source still in `queued` state (or one by --source-id).
Useful for local development without `make worker`:

    python -m workers.run_process                 # all queued
    python -m workers.run_process --source-id X   # one source
"""

import argparse


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-id", help="process a single source id")
    args = parser.parse_args()

    from workers.pipeline.jobs import _connect, process_source

    session = _connect()
    try:
        if args.source_id:
            ids = [args.source_id]
        else:
            from sqlalchemy import select

            from app.models.source import Source

            ids = [
                str(row[0])
                for row in session.execute(
                    select(Source.id).where(Source.processing_status == "queued")
                )
            ]
        if not ids:
            print("[run_process] nothing queued")
            return
        for source_id in ids:
            result = process_source(source_id)
            print(f"[run_process] {source_id}: {result}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
