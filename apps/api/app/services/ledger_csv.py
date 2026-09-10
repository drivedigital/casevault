"""CSV codecs and row validation for the source ledger.

The codec is intentionally independent of SQLAlchemy.  Keeping CSV parsing,
normalisation, and serialization here makes the import rules easy to exercise
without a database and keeps the router small.
"""
from __future__ import annotations

import csv
import io
from collections.abc import Iterable, Mapping
from datetime import date
from typing import Any

from pydantic import ValidationError

from app.schemas.ledger import LedgerEntryCreate

# Export order is part of wave2_intake_core.md §3.1.  Import accepts any order
# and ignores columns not in this list.
CSV_COLUMNS: tuple[str, ...] = (
    "external_ledger_id",
    "date_start",
    "date_end",
    "date_text_raw",
    "fact_short_name",
    "fact_statement",
    "claim_use_text",
    "relief_use_text",
    "source_path_text",
    "source_locator_text",
    "source_status",
    "authentication_or_witness",
    "confidence_level",
    "verification_task_text",
    "restrictions_or_notes",
    "tags",
)

# The import contract requires a statement, while all other CSV columns are
# optional.  A short name is synthesized from the statement when omitted so
# the database's non-null fact_short_name column remains satisfied.
REQUIRED_IMPORT_COLUMNS = {"fact_statement"}


class CSVHeaderError(ValueError):
    def __init__(self, message: str = "CSV header is missing fact_statement") -> None:
        super().__init__(message)
        self.expected = list(CSV_COLUMNS)


class CSVContentError(ValueError):
    pass


def _string(value: Any) -> str | None:
    if value is None:
        return None
    enum_value = getattr(value, "value", None)
    return str(enum_value if enum_value is not None else value)


def _date_text(value: date | None) -> str:
    return value.isoformat() if value is not None else ""


def _tags_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return ";".join(str(tag) for tag in value)


def row_from_entry(entry: Any) -> dict[str, str]:
    """Return the contract's CSV columns for an ORM row or row-like object."""
    tags = getattr(entry, "tags_json", None)
    return {
        "external_ledger_id": _string(getattr(entry, "external_ledger_id", None)) or "",
        "date_start": _date_text(getattr(entry, "date_start", None)),
        "date_end": _date_text(getattr(entry, "date_end", None)),
        "date_text_raw": _string(getattr(entry, "date_text_raw", None)) or "",
        "fact_short_name": _string(getattr(entry, "fact_short_name", None)) or "",
        "fact_statement": _string(getattr(entry, "fact_statement", None)) or "",
        "claim_use_text": _string(getattr(entry, "claim_use_text", None)) or "",
        "relief_use_text": _string(getattr(entry, "relief_use_text", None)) or "",
        "source_path_text": _string(getattr(entry, "source_path_text", None)) or "",
        "source_locator_text": _string(getattr(entry, "source_locator_text", None)) or "",
        "source_status": _string(getattr(entry, "source_status", None)) or "",
        "authentication_or_witness": _string(getattr(entry, "authentication_or_witness", None))
        or "",
        "confidence_level": _string(getattr(entry, "confidence_level", None)) or "",
        "verification_task_text": _string(getattr(entry, "verification_task_text", None)) or "",
        "restrictions_or_notes": _string(getattr(entry, "restrictions_or_notes", None)) or "",
        "tags": _tags_text(tags),
    }


def export_csv(entries: Iterable[Any]) -> str:
    """Serialize entries as RFC 4180 CSV with CRLF record terminators."""
    output = io.StringIO(newline="")
    writer = csv.DictWriter(
        output,
        fieldnames=list(CSV_COLUMNS),
        extrasaction="ignore",
        lineterminator="\r\n",
    )
    writer.writeheader()
    for entry in entries:
        writer.writerow(row_from_entry(entry))
    return output.getvalue()


def parse_csv(content: bytes | str) -> list[dict[str, str]]:
    """Parse a UTF-8 CSV and return only known columns.

    ``utf-8-sig`` accepts ordinary UTF-8 as well as the BOM emitted by some
    spreadsheet applications.  The header check is deliberately narrow:
    unknown columns are allowed, but without fact_statement no row can be
    valid under the frozen contract.
    """
    if isinstance(content, bytes):
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise CSVContentError("CSV must be UTF-8") from exc
    else:
        text = content

    try:
        reader = csv.DictReader(io.StringIO(text, newline=""))
        headers = reader.fieldnames
        if not headers:
            raise CSVHeaderError("CSV must include a header row")
        header_map = {header: header.strip() for header in headers if header is not None}
        normalized = list(header_map.values())
        if not REQUIRED_IMPORT_COLUMNS.issubset(normalized):
            raise CSVHeaderError()
        rows: list[dict[str, str]] = []
        for row in reader:
            # A completely empty trailing record is ignored; a row containing
            # an empty statement is retained and reported as a row error.
            if row and all(value in (None, "") for value in row.values()):
                continue
            normalized_row = {
                header_map[original]: (value or "")
                for original, value in row.items()
                if original in header_map
            }
            rows.append(
                {
                    column: normalized_row.get(column, "")
                    for column in CSV_COLUMNS
                    if column in normalized
                }
            )
        return rows
    except csv.Error as exc:
        raise CSVContentError(f"Malformed CSV: {exc}") from exc


def _parse_tags(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, str):
        return [part.strip() for part in value.split(";") if part.strip()]
    if isinstance(value, list):
        return value
    raise ValueError("tags must be a semicolon-separated string or an array")


def normalize_import_row(row: Mapping[str, Any], *, matter_id: Any = None) -> dict[str, Any]:
    """Convert one CSV/JSON row into ``LedgerEntryCreate`` input.

    The returned dictionary is validated with the public create schema.  This
    function does not write anything and raises ``ValueError`` for a row-level
    failure, allowing callers to continue with later rows.
    """
    # Only the frozen CSV columns are copied.  This also makes JSON imports
    # behave like header-matched CSV imports and prevents internal fields from
    # being smuggled into an import.
    source = {key: row.get(key) for key in CSV_COLUMNS}
    statement = source.get("fact_statement")
    if statement is None or not str(statement).strip():
        raise ValueError("fact_statement is required")

    statement_text = str(statement)
    short_name = source.get("fact_short_name")
    short_name = str(short_name).strip() if short_name not in (None, "") else statement_text.strip()[:255]

    data: dict[str, Any] = {
        "matter_id": matter_id,
        "external_ledger_id": _none_if_blank(source.get("external_ledger_id")),
        "date_start": _none_if_blank(source.get("date_start")),
        "date_end": _none_if_blank(source.get("date_end")),
        "date_text_raw": _none_if_blank(source.get("date_text_raw")),
        "fact_short_name": short_name,
        "fact_statement": statement_text,
        "claim_use_text": _none_if_blank(source.get("claim_use_text")),
        "relief_use_text": _none_if_blank(source.get("relief_use_text")),
        "source_path_text": _none_if_blank(source.get("source_path_text")),
        "source_locator_text": _none_if_blank(source.get("source_locator_text")),
        "source_status": _none_if_blank(source.get("source_status")),
        "authentication_or_witness": _none_if_blank(source.get("authentication_or_witness")),
        "confidence_level": _none_if_blank(source.get("confidence_level")),
        "verification_task_text": _none_if_blank(source.get("verification_task_text")),
        "restrictions_or_notes": _none_if_blank(source.get("restrictions_or_notes")),
        "tags": _parse_tags(source.get("tags")),
    }
    try:
        return LedgerEntryCreate.model_validate(data).model_dump()
    except ValidationError as exc:
        # Pydantic's structured message is stable enough for a user-facing row
        # error and avoids returning an implementation traceback.
        messages = []
        for item in exc.errors():
            location = ".".join(str(part) for part in item.get("loc", ()))
            messages.append(f"{location}: {item['msg']}" if location else item["msg"])
        raise ValueError("; ".join(messages)) from exc


def _none_if_blank(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def canonical_import_row(row: Mapping[str, Any]) -> tuple[Any, ...]:
    """Canonical comparable tuple for duplicate-import detection."""
    return tuple(
        row.get(column)
        if column != "tags"
        else tuple(row.get("tags") or [])
        for column in CSV_COLUMNS
    )
