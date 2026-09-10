"""Source ledger endpoints (Wave 2, contract wave2_intake_core.md section 3).

Empty router: W2-F fills in CRUD, filters, CSV import/export, and bulk ops.
"""
from fastapi import APIRouter

router = APIRouter(tags=["ledger"])
