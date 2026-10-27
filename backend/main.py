from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.security import get_current_user, AuthenticatedUser, OFFICER_ROLES, mfa_satisfied
from core.ratelimit import rate_limit
from contextlib import asynccontextmanager
from routers import (
    demo, applications, audit, alerts, notifications, admin, evc, undertakings, documents, dashboards,
    reports, ai, assurance, auth, webhooks, institution, communications,
)
from services import scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize background scheduler if enabled
    scheduler.start_background_scheduler()
    yield

app = FastAPI(
    title="AICTE Workflow & SLA Monitoring API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS Middleware
origins = [
    settings.FRONTEND_ORIGIN,
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(demo.router, prefix="/api/v1")
app.include_router(applications.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(evc.router, prefix="/api/v1")
app.include_router(undertakings.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(dashboards.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1", dependencies=[Depends(rate_limit("30/minute", "ai"))])
app.include_router(assurance.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(webhooks.router, prefix="/api/v1")
app.include_router(institution.router, prefix="/api/v1")
app.include_router(communications.router, prefix="/api/v1")

@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "aicte-workflow-backend",
        "version": "1.0.0"
    }

@app.get("/api/v1/health", tags=["Health"])
async def api_health_check():
    return {
        "status": "healthy",
        "service": "aicte-workflow-backend-api-v1"
    }

@app.get("/api/v1/clock", tags=["Health"])
async def get_clock_public(user: AuthenticatedUser = Depends(get_current_user)):
    """Simulated date for the demo banner, readable by every signed-in user (§8.3)."""
    from core import clock
    offset = clock.get_offset_days()
    return {"clock_now": clock.now().isoformat(), "offset_days": round(offset, 2), "is_simulated": abs(offset) > 0.0001,
            "can_reset": user.role == "admin"}


@app.get("/api/v1/me", tags=["Auth"])
async def get_me(user: AuthenticatedUser = Depends(get_current_user)):
    return {
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "region_id": user.region_id,
        "institution_id": user.institution_id,
        "full_name": user.full_name,
        "aal": user.aal,
        "mfa_role": user.role in OFFICER_ROLES,
        "mfa_required": not mfa_satisfied(user),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
