"""FastAPI application entry (Phase 0 scaffold + WS-CLAIMS router)."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.session import init_db
from app.routers import claims, health, matters


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Bootstrap convenience: create tables if the DB is fresh. Alembic remains
    # the source of truth for schema evolution (see apps/api/alembic/).
    init_db()
    yield


app = FastAPI(
    title="CaseVault API — Legal Matter Intelligence Workspace",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health routes are registered without the /api/v1 prefix except where specified.
app.include_router(health.router)
app.include_router(matters.router, prefix="/api/v1")
app.include_router(claims.router, prefix="/api/v1")
