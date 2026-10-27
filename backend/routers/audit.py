from fastapi import APIRouter, Depends
from core.security import AuthenticatedUser, require_role
from services import audit as audit_service

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("")
async def list_audit_log(
    actor: AuthenticatedUser = Depends(require_role(["bureau_officer", "admin", "auditor"])),
):
    from supabase import create_client
    from core.config import settings
    sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    res = sb.table("audit_log").select("*").order("seq", desc=True).limit(200).execute()
    return {"entries": res.data or []}


@router.get("/verify")
async def verify_audit_chain(
    actor: AuthenticatedUser = Depends(require_role(["bureau_officer", "admin", "auditor"])),
):
    return audit_service.verify_chain()
