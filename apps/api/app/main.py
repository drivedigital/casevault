"""CaseVault API — Phase 0 scaffold.

Phase 0 exposes health checks only. Domain routers (workspaces, matters,
actors, sources, proposals, facts, events, claims, ...) are added from
Phase 1 onward per the roadmap.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import actors, health, matters, workspaces


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="CaseVault API",
        version="0.1.0",
        description="Legal Matter Intelligence Workspace API (Phase 0 scaffold).",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.app_base_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # /health for infrastructure probing, /api/v1/health for the app surface.
    app.include_router(health.router)
    app.include_router(health.router, prefix="/api/v1")
    for r in (workspaces.router, matters.router, actors.router):
        app.include_router(r, prefix="/api/v1")
    return app


app = create_app()
