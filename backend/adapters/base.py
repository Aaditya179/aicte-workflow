from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class BaseAICTEAdapter(ABC):
    @abstractmethod
    def verify_institution(self, aicte_id: str) -> Dict[str, Any]:
        """Verify institutional accreditation and status from AICTE central records."""
        pass

    @abstractmethod
    def get_approval_history(self, aicte_id: str) -> Dict[str, Any]:
        """Fetch past years' approval records and deficiencies."""
        pass
