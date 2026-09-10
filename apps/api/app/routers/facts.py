"""Fact assertion endpoints (Wave 2, contract wave2_intake_core.md
section 4.3).

Empty router: W2-G fills in listing, creation (always review_state=
proposed), the /approve route (the only path to accepted), review-state
transitions, supersede, and source/actor links.
"""
from fastapi import APIRouter

router = APIRouter(tags=["facts"])
