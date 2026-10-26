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

class AuthenticatedUser(BaseModel):
    id: str
    email: Optional[str] = None
    role: str
    region_id: Optional[str] = None
    institution_id: Optional[str] = None
    full_name: Optional[str] = None

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
) -> AuthenticatedUser:
    token = credentials.credentials
    user_id = None
    role = None
    region_id = None
    institution_id = None
    email = None

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
    except Exception:
        # Fallback: Attempt local JWT decode if secret matches
        try:
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False}
            )
            user_id = payload.get("sub")
            email = payload.get("email")
            app_meta = payload.get("app_metadata", {})
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

    # Fetch profile details if role or context missing from claims
    profile_res = supabase_admin.table("profiles").select("*").eq("user_id", user_id).execute()
    full_name = None
    if profile_res.data and len(profile_res.data) > 0:
        p = profile_res.data[0]
        role = p.get("role") or role
        region_id = p.get("region_id") or region_id
        institution_id = p.get("institution_id") or institution_id
        full_name = p.get("full_name")

    if not role:
        role = "institution"

    return AuthenticatedUser(
        id=user_id,
        email=email,
        role=role,
        region_id=region_id,
        institution_id=institution_id,
        full_name=full_name or email
    )

def require_role(allowed_roles: List[str]):
    def role_checker(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if user.role not in allowed_roles and user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied for role: {user.role}. Allowed: {allowed_roles}"
            )
        return user
    return role_checker
