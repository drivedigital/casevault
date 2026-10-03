"""Source ledger endpoints (contract wave2_intake_core.md v1.0, section 3).

Stub only in WS-E: the APIRouter exists so main.py can register it under
/api/v1; WS-F fills in the endpoints.
"""
from fastapi import APIRouter

router = APIRouter(tags=["ledger"])
