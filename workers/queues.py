"""Queue names (Technical Spec §10.1). One worker codebase, multiple queues."""
QUEUES = [
    "ingest",      # source ingest, metadata, duplicate detection
    "ocr",         # OCR / page splitting
    "extract",     # excerpts, entities, proposals
    "embed",       # embeddings / search indexing
    "analysis",    # claim support recompute, gap detection
    "connectors",  # MCP / external connector jobs
    "exports",     # PDF export jobs
]
