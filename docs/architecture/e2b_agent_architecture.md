# E2B Dedicated Agent Architecture for CaseVault

This document outlines the architecture for integrating an [E2B](https://e2b.dev/) dedicated cloud sandbox agent into CaseVault.

---

## 1. Executive Summary

E2B provides isolated, fast-starting (~150ms) Linux micro-VMs with full root privileges and dedicated compute. In CaseVault, an E2B agent bridges the gap between our lightweight Cloudflare Edge / local developer environment and heavy, compute-intensive legal tasks.

```mermaid
flowchart LR
    User[User / Counsel] -->|Upload File or Docket No.| Web[CaseVault Web UI / Edge Worker]
    Web -->|Dispatch Heavy Task| E2B[E2B Dedicated Sandbox VM]
    
    subgraph E2B Sandbox
        direction TB
        P[Playwright Docket Scraper]
        O[Poppler + Tesseract OCR Engine]
        C[Pandas Financial & Damages Calc]
        W[Whisper Audio Transcriber]
    end
    
    E2B -->|Normalized PDFs + OCR Text + Extracted Facts| API[CaseVault API / KV Store]
    API -->|Alerts in Review Inbox| Review[/ai-review Queue]
```

---

## 2. High-Impact Use Cases

### A. High-Throughput OCR & Document Conversion Engine
* **Offloading Local & Edge**: Cloudflare Workers cannot run native binaries like Tesseract, Poppler, or LibreOffice. E2B runs in parallel Linux sandboxes.
* **Document Normalization**: Converts raw `.msg`, `.eml`, and `.docx` discovery bundles into web-renderable PDFs for the inline exhibit viewer (`/evidence/[sourceId]`).
* **Bates Stamping**: Automated Bates range stamping (`PLTF-0001` through `PLTF-0404`) and exhibit cover sheet generation.

### B. Autonomous Court Docket Watcher (NYSCEF & PACER Scraper)
* **Playwright Automation**: Runs a persistent, headless browser with authenticated sessions.
* **Docket Polling**: Scheduled polling of NYSCEF for Index No. 153243/2026 (*Part 19* Article 81 guardianship) and Housing Part dockets.
* **Automated Ingestion**: Automatically downloads newly filed stamped motions, computes SHA-256 hashes, and registers candidate facts in the `/ai-review` inbox.

### C. Forensic Financial Audit & Damages Modeling
* **Code Interpreter**: Executes Python code (`pandas`, `numpy`) on financial ledgers and hotel payroll sheets (e.g. *Urban Resort LLC*).
* **Statutory Calculations**:
  * **RPAPL § 853**: Treble damages computation on property loss and leasehold interest.
  * **RPAPL § 768**: Statutory civil penalty accruals per violation day.
  * **CPLR § 5004**: Pre-judgment statutory interest calculation at 9% per annum from eviction date.

### D. Audio & Video Evidence Transcription
* **Whisper Integration**: Direct local transcription of 911 dispatch calls, police bodycam footage, and voicemails into timestamped, speaker-attributed transcripts with line numbers for exhibit cross-referencing.

---

## 3. Integration Specification

1. **SDK**: Use `@e2b/code-interpreter` or Python `e2b` client in `apps/api/app/integrations/e2b_worker.py`.
2. **Authentication**: `E2B_API_KEY` stored in `.env.local` / Cloudflare secrets.
3. **Ingest Webhook**: The E2B agent posts processed outputs to `POST /api/v1/proposals` and `POST /api/v1/sources` with cryptographic SHA-256 verification.
