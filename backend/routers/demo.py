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
        description="Pan-India oversight, SAC/SHC review, critical escalation inbox, and final approval decisions.",
        region="National Bureau"
    ),
    DemoAccount(
        email="admin@demo.sih",
        role="admin",
        role_label="System Administrator",
        title="System Administrator",
        description="Control time-travel clock simulation, configure dynamic SLA rules, and verify cryptographically chained audit logs.",
        region="All Regions"
    )
]

@router.get("/accounts", response_model=List[DemoAccount])
async def get_demo_accounts():
    """Public endpoint providing demo account metadata for rapid login and evaluation."""
    return DEMO_ACCOUNTS
