"""
Document storage and protection (§15.8).

Files live in a private Supabase Storage bucket and are served only through short-lived
HMAC-signed links to the API, so every download passes through the access log. Uploads are
limited to PDF, PNG and JPG up to MAX_UPLOAD_BYTES, checked by their leading bytes.
"""
from datetime import timedelta
from typing import Any, Dict, Optional, Tuple
import hashlib
import hmac
import logging
import uuid

from supabase import create_client

from core import clock
from core.config import settings

logger = logging.getLogger("aicte.storage")
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

# (media type, extension) by leading bytes
_SIGNATURES = [
    (b"%PDF-", "application/pdf", "pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
]
DOWNLOAD_ANOMALY_COUNT = 10
DOWNLOAD_ANOMALY_WINDOW = timedelta(minutes=5)

_bucket_ready = False


class UploadRejected(ValueError):
    pass


def detect_type(content: bytes) -> Tuple[str, str]:
    """The media type and extension from the file's content; the declared type is not trusted."""
    for magic, media_type, ext in _SIGNATURES:
        if content.startswith(magic):
            return media_type, ext
    raise UploadRejected("Only PDF, PNG and JPG files are allowed")


def validate_upload(content: bytes) -> Tuple[str, str, str]:
    """Returns (media_type, extension, sha256) or raises UploadRejected."""
    if not content:
        raise UploadRejected("The file is empty")
    if len(content) > settings.MAX_UPLOAD_BYTES:
        raise UploadRejected(f"Files must be {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MB or smaller")
    media_type, ext = detect_type(content)
    if not scan_for_malware(content):
        raise UploadRejected("The file failed the malware scan")
    return media_type, ext, hashlib.sha256(content).hexdigest()


def scan_for_malware(content: bytes) -> bool:
    """
    MALWARE SCAN HOOK (production design, §15.8). The prototype accepts every file that passed the
    type and size checks. In production, send `content` to the approved scanning service here and
    return False on a detection.
    """
    return True


def _ensure_bucket() -> None:
    global _bucket_ready
    if _bucket_ready:
        return
    names = {b.name for b in _supabase.storage.list_buckets()}
    if settings.STORAGE_BUCKET not in names:
        _supabase.storage.create_bucket(
            settings.STORAGE_BUCKET,
            options={"public": False, "file_size_limit": settings.MAX_UPLOAD_BYTES,
                     "allowed_mime_types": [t for _, t, _ in _SIGNATURES]},
        )
    _bucket_ready = True


def put(institution_id: str, content: bytes, media_type: str, ext: str) -> str:
    _ensure_bucket()
    path = f"{institution_id}/{uuid.uuid4().hex}.{ext}"
    _supabase.storage.from_(settings.STORAGE_BUCKET).upload(path, content, {"content-type": media_type})
    return path


def get(path: str) -> bytes:
    return _supabase.storage.from_(settings.STORAGE_BUCKET).download(path)


def media_type_for(path: str) -> str:
    ext = (path or "").rsplit(".", 1)[-1].lower()
    return {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(ext, "application/octet-stream")


# --- Signed links -----------------------------------------------------------

def _link_secret() -> bytes:
    return ("doc-link:" + settings.SUPABASE_JWT_SECRET).encode()


def _link_sig(doc_id: str, user_id: str, exp: int) -> str:
    return hmac.new(_link_secret(), f"{doc_id}:{user_id}:{exp}".encode(), hashlib.sha256).hexdigest()


def signed_link(doc_id: str, user_id: str) -> Dict[str, Any]:
    """A link to the API download route, bound to the user and valid for SIGNED_LINK_TTL_SECONDS of real time."""
    import time
    exp = int(time.time()) + settings.SIGNED_LINK_TTL_SECONDS
    sig = _link_sig(doc_id, user_id, exp)
    return {
        "url": f"{settings.API_PUBLIC_URL}/api/v1/documents/{doc_id}/file?uid={user_id}&exp={exp}&sig={sig}",
        "expires_at": exp,
        "ttl_seconds": settings.SIGNED_LINK_TTL_SECONDS,
    }


def verify_link(doc_id: str, user_id: str, exp: int, sig: str) -> bool:
    import time
    if exp < int(time.time()):
        return False
    return hmac.compare_digest(_link_sig(doc_id, user_id, exp), sig or "")


# --- Access log and anomaly alert ---------------------------------------------

def log_access(document_id: str, user_id: Optional[str], action: str, ip: Optional[str] = None) -> None:
    try:
        _supabase.table("document_access_log").insert({
            "document_id": document_id, "user_id": user_id, "action": action, "ip": ip,
            "created_at": clock.now().isoformat(),
        }).execute()
    except Exception as e:
        logger.error(f"Failed to write document_access_log ({action} {document_id}): {e}")


def check_download_anomaly(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Ten or more downloads by one user within five minutes raises a warning alert to the bureau
    officers (§15.8). At most one alert per user per five-minute bucket.
    """
    now = clock.now()
    since = (now - DOWNLOAD_ANOMALY_WINDOW).isoformat()
    rows = _supabase.table("document_access_log").select("id").eq("user_id", user_id) \
        .eq("action", "download").gte("created_at", since).execute().data or []
    if len(rows) < DOWNLOAD_ANOMALY_COUNT:
        return None
    bucket = int(now.timestamp() // DOWNLOAD_ANOMALY_WINDOW.total_seconds())
    existing = _supabase.table("alerts").select("id").eq("entity_type", "user").eq("entity_id", user_id) \
        .eq("kind", "escalation").gte("fired_at", since).limit(1).execute().data
    if existing:
        return None
    prof = _supabase.table("profiles").select("full_name, role").eq("user_id", user_id).limit(1).execute().data
    who = f"{prof[0]['full_name']} ({prof[0]['role']})" if prof else user_id
    message = f"Unusual document access: {who} downloaded {len(rows)} documents in 5 minutes."
    try:
        alert = _supabase.table("alerts").insert({
            "entity_type": "user", "entity_id": user_id, "kind": "escalation", "level": bucket % 1_000_000,
            "severity": "warning", "message": message, "status": "open", "target_role": "bureau_officer",
            "fired_at": now.isoformat(), "cycle": "download-anomaly",
        }).execute().data[0]
    except Exception as e:
        logger.debug(f"Download anomaly alert not created: {e}")
        return None
    from services import notifier
    bureau = [p["user_id"] for p in (_supabase.table("profiles").select("user_id").eq("role", "bureau_officer").execute().data or [])]
    notifier.notify_users(bureau, "[WARNING] Unusual document access", message, alert_id=alert["id"],
                          severity="warning", channels=["in_app"], kind="escalation", reference_no=f"USR-{user_id[:8].upper()}")
    return alert
