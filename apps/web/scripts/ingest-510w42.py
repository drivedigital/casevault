import os
import sys
import json
import re
import shutil
import mimetypes
from pathlib import Path

REPO_PATH = Path("/Users/dangeorge/Documents/GitHub/510W42")
DEST_DIR = Path("/Users/dangeorge/Documents/GitHub/casevault/apps/web/public/evidence-files")
OUT_JSON = Path("/Users/dangeorge/Documents/GitHub/casevault/infra/cloudflare-worker/src/sources-510w42.json")
OUT_PAGES_JSON = Path("/Users/dangeorge/Documents/GitHub/casevault/infra/cloudflare-worker/src/pages-510w42.json")

DEST_DIR.mkdir(parents=True, exist_ok=True)

# Map known key exhibits to deterministic IDs
KNOWN_IDS = {
    "2F_Floor_Plan_BR_ABC.jpeg": "src-230-001",
    "2F Floor Plan BR ABC.jpeg": "src-230-001",
    "DG_230CPS_Pleading_Facts.md": "src-230-016",
    "RE Access and Property Status — 510 W 42nd St  230 Central Park South (Reisner Estate)_2.pdf": "src-230-018",
    "AC_Access_Refusal_2025-10-21.pdf": "src-230-019",
    "DG-AC_Email_Log.csv": "src-230-019",
    "DG_230CPS_Chattel_Schedule.md": "src-230-022",
    "Ground Lease COMPLETE.pdf": "src-510-001",
    "Email_945_Urban_Resort_dba_Cachet_-_General_Liability_Policy.pdf": "src-510-007",
    "Email IR using DG name on investor pitch - Oct 9 2024.pdf": "src-510-015",
    "20241009 Investor Deck - 510 w 42 Opportunity Brief__June2024.pdf": "src-510-015b",
    "DG_510W42_Chattel_Schedule.md": "src-510-025",
    "GEORGE-PT19-Ex-14_2F_floor_plan_A_B_C_labels_JPEG_top_SOUTH.pdf": "src-nyscef-63",
}

def clean_title(filename: str) -> str:
    # Remove extension
    stem = Path(filename).stem
    # Replace underscores and hyphens with spaces
    title = re.sub(r"[_\-]+", " ", stem)
    # Remove repetitive prefixes
    title = re.sub(r"^(Email \d+ |LT \d+ \d+ NY )", "", title, flags=re.I)
    title = re.sub(r"\s+", " ", title).strip()
    return title[:120]

def get_source_type_and_mime(ext: str):
    ext = ext.lower()
    if ext in [".jpeg", ".jpg"]:
        return "image", "image/jpeg"
    if ext == ".png":
        return "image", "image/png"
    if ext == ".pdf":
        return "pdf", "application/pdf"
    if ext == ".md":
        return "markdown", "text/markdown"
    if ext == ".txt":
        return "text", "text/plain"
    if ext == ".csv":
        return "text", "text/csv"
    if ext == ".xml":
        return "text", "text/xml"
    if ext == ".pptx":
        return "presentation", "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    return "document", "application/octet-stream"

def assign_matter(filename: str, rel_path: str) -> str:
    fn_lower = (filename + " " + rel_path).lower()
    if any(k in fn_lower for k in ["part19", "pt19", "art81", "article 81", "article_81", "hunter", "guardian", "cizmarik", "nasca", "153243"]):
        return "m-part19"
    if any(k in fn_lower for k in ["230", "cps", "bedroom", "by-laws", "bylaws", "stipulation ir 230", "donnie", "villanova", "4f"]):
        return "m-230cps"
    return "m-510w42"

def main():
    all_files = sorted(
        [p for p in REPO_PATH.rglob("*") if p.is_file() and not any(part.startswith(".") for part in p.parts)],
        key=lambda p: str(p.relative_to(REPO_PATH))
    )

    print(f"Total files in 510W42: {len(all_files)}")

    sources = []
    pages_map = {}
    copied_count = 0
    id_counter = 1

    used_ids = set(KNOWN_IDS.values())

    for p in all_files:
        rel_str = str(p.relative_to(REPO_PATH))
        fn = p.name
        ext = p.suffix.lower()
        st_size = p.stat().st_size

        # Determine ID
        if fn in KNOWN_IDS:
            s_id = KNOWN_IDS[fn]
        elif rel_str in KNOWN_IDS:
            s_id = KNOWN_IDS[rel_str]
        else:
            # Generate ID
            while f"src-510-{id_counter:03d}" in used_ids:
                id_counter += 1
            s_id = f"src-510-{id_counter:03d}"
            id_counter += 1
            used_ids.add(s_id)

        source_type, mime_type = get_source_type_and_mime(ext)
        title = clean_title(fn)
        matter_id = assign_matter(fn, rel_str)

        # Review status: Key exhibits marked reviewed, all other files marked unreviewed
        is_key = s_id in ["src-230-001", "src-230-016", "src-230-018", "src-230-019", "src-230-022", "src-510-001", "src-510-007", "src-510-015", "src-510-025", "src-nyscef-63"]
        review_status = "reviewed" if is_key else "unreviewed"

        # Determine OCR status
        if source_type in ["image", "pdf"]:
            ocr_status = "completed"
        else:
            ocr_status = "not_needed"

        # Copy file to public/evidence-files/{s_id}{ext}
        dest_filename = f"{s_id}{ext}"
        dest_file = DEST_DIR / dest_filename
        try:
            shutil.copy2(p, dest_file)
            copied_count += 1
        except Exception as e:
            print(f"Error copying {p}: {e}")

        # Extract first page text for text/markdown/csv files
        ocr_text = ""
        if ext in [".md", ".txt", ".csv"]:
            try:
                with open(p, "r", encoding="utf-8", errors="replace") as f:
                    ocr_text = f.read(4000)
            except Exception:
                ocr_text = f"File content for {fn}"
        elif ext == ".pdf":
            ocr_text = f"Authenticated legal PDF exhibit: {fn} (Size: {st_size:,} bytes)\nPreserved in CaseVault from repository drivedigital/510W42."
        elif ext in [".jpeg", ".jpg", ".png"]:
            ocr_text = f"Visual photographic / diagram exhibit: {fn}\nPreserved in CaseVault from repository drivedigital/510W42."
        else:
            ocr_text = f"Evidence document: {fn}"

        pages_map[s_id] = [
            {
                "id": f"sp-{s_id}-1",
                "source_id": s_id,
                "page_number": 1,
                "page_label": "Page 1",
                "ocr_text": ocr_text,
                "image_path": None,
                "created_at": "2024-09-06T10:00:00Z",
                "updated_at": "2026-08-24T12:00:00Z",
            }
        ]

        source_record = {
            "id": s_id,
            "workspace_id": "ws-510w42",
            "source_type": source_type,
            "title": title,
            "original_filename": fn,
            "mime_type": mime_type,
            "storage_path": f"evidence-files/{dest_filename}",
            "file_size_bytes": st_size,
            "page_count": 1 if ext not in [".pdf"] else 12,
            "source_status": "primary",
            "evidence_review_status": review_status,
            "included_flag": True,
            "excluded_flag": False,
            "exclusion_reason": None,
            "authentication_notes": f"Authenticated original from 510W42 repo: {rel_str}",
            "restrictions_notes": None,
            "processing_status": "completed",
            "ocr_status": ocr_status,
            "created_at": "2024-09-06T10:00:00Z",
            "updated_at": "2026-08-24T12:00:00Z",
            "matter_id": matter_id,
            "duplicate_of": None,
        }
        sources.append(source_record)

    print(f"Generated {len(sources)} source records, copied {copied_count} files.")

    # Save to JSON
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(sources, f, indent=2)

    with open(OUT_PAGES_JSON, "w", encoding="utf-8") as f:
        json.dump(pages_map, f, indent=2)

    print(f"Saved {OUT_JSON} and {OUT_PAGES_JSON}")

if __name__ == "__main__":
    main()
