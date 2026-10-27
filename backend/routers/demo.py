from fastapi import APIRouter
from typing import List
from pydantic import BaseModel

router = APIRouter(prefix="/demo", tags=["Demo"])

class DemoAccount(BaseModel):
    email: str
    role: str
    role_label: str
    title: str
    description: str
    region: str
    password: str = "password123"
    mfa: bool = False  # signs in with the full TOTP flow on screen (§15.8, §15.9)

DEMO_ACCOUNTS: List[DemoAccount] = [
    DemoAccount(
        email="institution@demo.sih",
        role="institution",
        role_label="Institution",
        title="Demo Institute Principal",
        description="See what a college sees: track application progress, compliance health score, and respond to deficiencies.",
        region="Western Region"
    ),
    DemoAccount(
        email="scrutiny@demo.sih",
        role="scrutiny_officer",
        role_label="Scrutiny Officer",
        title="Western Scrutiny Officer",
        description="Examine institute applications, verify submitted evidence, or return for deficiencies.",
        region="Western Region"
    ),
    DemoAccount(
        email="regional@demo.sih",
        role="regional_officer",
        role_label="Regional Officer",
        title="Western Regional Officer",
        description="Monitor regional pendency, schedule EVC inspection visits, and balance officer workload.",
        region="Western Region"
    ),
    DemoAccount(
        email="mfa.officer@demo.sih",
        role="regional_officer",
        role_label="Regional Officer (MFA)",
        title="Western Regional Officer, MFA",
        description="Same access as the regional officer, but signs in with the full authenticator (TOTP) step.",
        region="Western Region",
        mfa=True
    ),
    DemoAccount(
        email="evc@demo.sih",
        role="evc_member",
        role_label="EVC Committee Member",
        title="Western EVC Member",
        description="Conduct on-site inspections, review physical infrastructure, and submit committee visit reports.",
        region="Western Region"
    ),
    DemoAccount(
        email="bureau@demo.sih",
        role="bureau_officer",
        role_label="Bureau Officer",
        title="AICTE Bureau Officer",
        description="Pan-India oversight, critical escalation inbox, final decisions with Decision Assurance, and approval of overrides.",
        region="National Bureau"
    ),
    DemoAccount(
        email="admin@demo.sih",
        role="admin",
        role_label="System Administrator",
        title="System Administrator",
        description="Run the demo clock, propose rule and timeline changes, and manage users. No access to case data.",
        region="All Regions"
    ),
    DemoAccount(
        email="admin2@demo.sih",
        role="admin",
        role_label="Second Administrator",
        title="Second Administrator",
        description="Approves rule and timeline changes proposed by the first administrator (maker-checker).",
        region="All Regions"
    ),
    DemoAccount(
        email="sacshc@demo.sih",
        role="sac_shc_member",
        role_label="SAC/SHC Member",
        title="SAC/SHC Committee Member",
        description="Sees only the cases assigned to them and records committee recommendations.",
        region="Assigned cases"
    ),
    DemoAccount(
        email="auditor@demo.sih",
        role="auditor",
        role_label="Auditor",
        title="Internal Auditor",
        description="Read-only access to the tamper-evident audit trail, document access logs and reports.",
        region="All Regions"
    )
]

@router.get("/accounts", response_model=List[DemoAccount])
async def get_demo_accounts():
    """Public endpoint providing demo account metadata for rapid login and evaluation."""
    return DEMO_ACCOUNTS
