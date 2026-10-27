from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import jwt
from core.config import settings
from supabase import create_client, Client

security_scheme = HTTPBearer()

# Supabase Admin client with service-role key
supabase_admin: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

# Roles that work on cases and therefore need MFA (§15.8)
OFFICER_ROLES = {"scrutiny_officer", "regional_officer", "evc_member", "sac_shc_member", "bureau_officer"}
# Roles that may read case data. The administrator and the auditor never do (§15.0, §15.8).
CASE_ROLES = OFFICER_ROLES | {"institution"}


class AuthenticatedUser(BaseModel):
    id: str
    email: Optional[str] = None
    role: str
    region_id: Optional[str] = None
    institution_id: Optional[str] = None
    full_name: Optional[str] = None
    aal: str = "aal1"


def _unverified_claims(token: str) -> dict:
    """Claims of a token already validated by Supabase; used only to read `aal`."""
    try:
        return jwt.decode(token, options={"verify_signature": False})
    except jwt.PyJWTError:
        return {}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
) -> AuthenticatedUser:
    token = credentials.credentials
    user_id = None
    role = None
    region_id = None
    institution_id = None
    email = None
    claims: dict = {}

    # First attempt: Verify via Supabase Auth API
    try:
        user_res = supabase_admin.auth.get_user(token)
        if user_res and user_res.user:
            user_id = user_res.user.id
            email = user_res.user.email
            app_meta = user_res.user.app_metadata or {}
            role = app_meta.get("role")
            region_id = app_meta.get("region_id")
            institution_id = app_meta.get("institution_id")
            claims = _unverified_claims(token)
    except Exception:
        # Fallback: Attempt local JWT decode if secret matches
        try:
            claims = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False}
            )
            user_id = claims.get("sub")
            email = claims.get("email")
            app_meta = claims.get("app_metadata", {})
            role = app_meta.get("role")
            region_id = app_meta.get("region_id")
            institution_id = app_meta.get("institution_id")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication credentials"
            )

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID not found in token"
        )

    # The profile is the source of truth for role and scope
    profile_res = supabase_admin.table("profiles").select("*").eq("user_id", user_id).execute()
    full_name = None
    if profile_res.data and len(profile_res.data) > 0:
        p = profile_res.data[0]
        role = p.get("role") or role
        region_id = p.get("region_id") or region_id
        institution_id = p.get("institution_id") or institution_id
        full_name = p.get("full_name")

    if not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account has no role assigned")

    return AuthenticatedUser(
        id=user_id,
        email=email,
        role=role,
        region_id=region_id,
        institution_id=institution_id,
        full_name=full_name or email,
        aal=claims.get("aal") or "aal1",
    )


def mfa_satisfied(user: AuthenticatedUser) -> bool:
    """Officers need a TOTP-verified (aal2) session; the demo bypass skips it for most demo accounts."""
    if user.role not in OFFICER_ROLES or user.aal == "aal2":
        return True
    if settings.DEMO_MFA_BYPASS and (user.email or "").lower() not in settings.mfa_enforced_emails:
        return True
    return False


async def get_verified_user(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    """The current user, rejected with `mfa_required` when an officer has not completed MFA."""
    if not mfa_satisfied(user):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="mfa_required")
    return user


def require_role(allowed_roles: List[str]):
    """Only the listed roles pass. The administrator has no implicit access to anything."""
    def role_checker(user: AuthenticatedUser = Depends(get_verified_user)) -> AuthenticatedUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied for role: {user.role}. Allowed: {allowed_roles}"
            )
        return user
    return role_checker


def require_case_access(user: AuthenticatedUser = Depends(get_verified_user)) -> AuthenticatedUser:
    """Any role that works on cases; excludes the administrator and the auditor (§15.0)."""
    if user.role not in CASE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Role {user.role} has no access to case data")
    return user
