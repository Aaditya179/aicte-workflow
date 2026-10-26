from datetime import datetime, timedelta, timezone
from typing import Optional
from supabase import create_client
from core.config import settings

_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

def _get_offset_seconds() -> int:
    try:
        res = _supabase.table("system_settings").select("value").eq("key", "clock_offset_seconds").limit(1).execute()
        if res.data:
            return int(res.data[0]["value"])
    except Exception:
        pass
    return 0

def now() -> datetime:
    offset = _get_offset_seconds()
    return datetime.now(timezone.utc) + timedelta(seconds=offset)

def set_offset(offset_seconds: int) -> None:
    _supabase.table("system_settings").update({"value": offset_seconds}).eq("key", "clock_offset_seconds").execute()

def advance_days(days: float) -> datetime:
    current_offset = _get_offset_seconds()
    new_offset = current_offset + int(days * 86400)
    set_offset(new_offset)
    return now()

def reset() -> None:
    set_offset(0)

def get_offset_days() -> float:
    return _get_offset_seconds() / 86400.0
