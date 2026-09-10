"""Proposal review inbox endpoints (Wave 2, contract wave2_intake_core.md
section 4.2).

Empty router: W2-G fills in listing, manual creation, review actions,
bulk review, and the proposal generation job.
"""
from fastapi import APIRouter

router = APIRouter(tags=["proposals"])
