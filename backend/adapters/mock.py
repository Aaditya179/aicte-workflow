from typing import Dict, Any
from adapters.base import BaseAICTEAdapter

class MockAICTEAdapter(BaseAICTEAdapter):
    """
    Mock adapter for SIH26262 prototype evaluation.
    Simulates external central AICTE verification API responses.
    """
    def verify_institution(self, aicte_id: str) -> Dict[str, Any]:
        # Seeded Case G / unverified institutions test
        if "UNVERIFIED" in (aicte_id or "").upper() or aicte_id == "CASE-G-MOCK":
            return {
                "verified": False,
                "aicte_id": aicte_id,
                "status": "unverified",
                "message": "Data could not be confirmed with the central AICTE registry"
            }
        
        return {
            "verified": True,
            "aicte_id": aicte_id,
            "status": "active",
            "recognized_year": 2012,
            "message": "Institution verified in central AICTE registry"
        }

    def get_approval_history(self, aicte_id: str) -> Dict[str, Any]:
        return {
            "aicte_id": aicte_id,
            "previous_approvals": ["2022-2023", "2023-2024"],
            "has_punitive_action": False
        }

mock_adapter = MockAICTEAdapter()
