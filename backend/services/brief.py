"""
Daily brief: what needs attention today, for the signed-in officer or institution.

The facts are computed here from the same data the dashboards show, each as a plain sentence
with a link. The LLM only turns them into a short summary, and that summary is discarded when
it contains a number the facts do not, so the brief can never report a figure nobody computed.
"""
import hashlib
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from core import clock
from core.db import db
from core.security import AuthenticatedUser
from services import llm

logger = logging.getLogger("aicte.brief")

STAGE_LABELS = {
    "scrutiny": "Scrutiny", "institution_response": "institution response", "evc_queue": "EVC scheduling",
    "evc_visit": "the EVC visit", "sac_shc": "SAC/SHC review", "final_decision": "final decision",
}
WEEK = 7
SOON_DAYS = 30
_SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}

# Summaries per person, day and set of facts; a new jump of the clock changes the facts and the key
_cache: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
_CACHE_MAX = 500
# Whole briefs for a few seconds: the dashboard reloads on every realtime change
_recent: Dict[Tuple[str, int], Tuple[float, Dict[str, Any]]] = {}
RECENT_SECONDS = 30


def _dt(val: Any) -> Optional[datetime]:
    if not val:
        return None
    try:
        dt = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _day(dt: datetime) -> str:
    return f"{dt.day} {dt.strftime('%b')}"


def _plural(n: int, word: str, plural: Optional[str] = None) -> str:
    return f"{n} {word if n == 1 else (plural or word + 's')}"


def _fact(key: str, severity: str, text: str, link: str) -> Dict[str, Any]:
    return {"key": key, "severity": severity, "text": text, "link": link}


def _in_chunks(table: str, cols: str, field: str, ids: List[str], **eq) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for i in range(0, len(ids), 100):
        q = db.table(table).select(cols).in_(field, ids[i:i + 100])
        for k, v in eq.items():
            q = q.eq(k, v)
        rows += q.execute().data or []
    return rows


# ─── Facts ────────────────────────────────────────────────────────────────────

def _deadline_facts(apps: List[Dict[str, Any]], now: datetime, scope: str) -> List[Dict[str, Any]]:
    """Overdue applications in the scope, and those whose deadline falls in the next week."""
    facts = []
    overdue = sorted((a for a in apps if (_dt(a.get("due_at")) or now) < now), key=lambda a: a["due_at"])
    if overdue:
        worst = overdue[0]
        days = (now - _dt(worst["due_at"])).days
        facts.append(_fact(
            "overdue", "critical",
            f"{_plural(len(overdue), 'application')} {scope} {'is' if len(overdue) == 1 else 'are'} past the "
            f"stage deadline; the longest, {worst['application_no']}, is {_plural(days, 'day')} overdue at "
            f"{STAGE_LABELS.get(worst['current_stage'], worst['current_stage'])}.",
            f"/applications/{worst['id']}"))
    week_end = now + timedelta(days=WEEK)
    due_soon = sorted((a for a in apps if now <= (_dt(a.get("due_at")) or now - timedelta(1)) <= week_end),
                      key=lambda a: a["due_at"])
    if due_soon:
        first = due_soon[0]
        facts.append(_fact(
            "due_this_week", "warning",
            f"{_plural(len(due_soon), 'application')} {scope} will pass the stage deadline in the next "
            f"{WEEK} days, the first being {first['application_no']} on {_day(_dt(first['due_at']))}.",
            f"/applications/{first['id']}"))
    return facts


def _my_cases_fact(uid: str, apps: List[Dict[str, Any]], now: datetime) -> Optional[Dict[str, Any]]:
    mine = [a for a in apps if str(a.get("assigned_to") or "") == uid]
    if not mine:
        return None
    overdue = sum(1 for a in mine if (_dt(a.get("due_at")) or now) < now)
    week = sum(1 for a in mine if now <= (_dt(a.get("due_at")) or now - timedelta(1)) <= now + timedelta(days=WEEK))
    severity = "critical" if overdue else "warning" if week else "info"
    return _fact("my_cases", severity,
                 f"You have {_plural(len(mine), 'open case')} assigned: {overdue} overdue and {week} due in the "
                 f"next {WEEK} days.", "/applications")


def _my_alerts_fact(uid: str) -> Optional[Dict[str, Any]]:
    notes = db.table("notifications").select("alert_id").eq("user_id", uid).eq("channel", "in_app") \
        .not_.is_("alert_id", "null").order("created_at", desc=True).limit(500).execute().data or []
    alert_ids = list({n["alert_id"] for n in notes})
    if not alert_ids:
        return None
    open_alerts = _in_chunks("alerts", "id, kind", "id", alert_ids, status="open")
    if not open_alerts:
        return None
    escalations = sum(1 for a in open_alerts if a["kind"] == "escalation")
    return _fact("unacknowledged", "critical" if escalations else "warning",
                 f"{_plural(len(open_alerts), 'alert')} sent to you {'is' if len(open_alerts) == 1 else 'are'} "
                 f"still unacknowledged, {escalations} of them {'an escalation' if escalations == 1 else 'escalations'}.",
                 "/alerts")


def _document_facts(inst_ids: Optional[List[str]], today, scope: str) -> List[Dict[str, Any]]:
    cols = "id, title, valid_until, status"
    if inst_ids is None:
        docs = db.table("documents").select(cols).not_.is_("valid_until", "null").execute().data or []
    else:
        docs = _in_chunks("documents", cols, "institution_id", inst_ids)
    docs = [d for d in docs if d.get("valid_until") and d.get("status") != "renewed"]
    expired = [d for d in docs if str(d["valid_until"])[:10] < today.isoformat()]
    soon_end = (today + timedelta(days=SOON_DAYS)).isoformat()
    expiring = sorted((d for d in docs if today.isoformat() <= str(d["valid_until"])[:10] <= soon_end),
                      key=lambda d: d["valid_until"])
    facts = []
    if expired:
        facts.append(_fact("documents_expired", "critical",
                           f"{_plural(len(expired), 'document')} {scope} {'has' if len(expired) == 1 else 'have'} "
                           f"expired without a verified renewal.", "/documents"))
    if expiring:
        first = expiring[0]
        facts.append(_fact("documents_expiring", "warning",
                           f"{_plural(len(expiring), 'document')} {scope} expire{'s' if len(expiring) == 1 else ''} "
                           f"within {SOON_DAYS} days, the first being '{first['title']}' on "
                           f"{_day(_dt(first['valid_until']))}.", f"/documents/{first['id']}"))
    return facts


def _undertaking_fact(inst_ids: Optional[List[str]], now: datetime, scope: str) -> Optional[Dict[str, Any]]:
    cols = "id, due_at, status"
    rows = (db.table("undertakings").select(cols).execute().data or []) if inst_ids is None \
        else _in_chunks("undertakings", cols, "institution_id", inst_ids)
    late = [u for u in rows if u.get("status") not in ("verified",) and (_dt(u.get("due_at")) or now) < now]
    if not late:
        return None
    return _fact("undertakings_overdue", "warning",
                 f"{_plural(len(late), 'undertaking')} {scope} {'is' if len(late) == 1 else 'are'} past due "
                 f"and not yet verified.", "/undertakings")


def _slowest_stage_fact(region_id: Optional[str]) -> Optional[Dict[str, Any]]:
    q = db.table("v_pendency_by_stage_region").select("region_name, current_stage, open_cases, avg_stage_age_days")
    if region_id:
        q = q.eq("region_id", region_id)
    rows = [r for r in (q.execute().data or []) if (r.get("open_cases") or 0) >= 2]
    if not rows:
        return None
    worst = max(rows, key=lambda r: float(r.get("avg_stage_age_days") or 0))
    days = round(float(worst["avg_stage_age_days"]))
    stage = STAGE_LABELS.get(worst["current_stage"], worst["current_stage"])
    where = "Cases in your region" if region_id else f"Cases in the {worst.get('region_name') or 'unassigned'} region"
    return _fact("slowest_stage", "info",
                 f"{where} wait longest at {stage}: {_plural(days, 'day')} on average across "
                 f"{_plural(worst['open_cases'], 'open case')}.", "/applications")


def _evc_fact(app_ids: List[str], now: datetime, scope: str) -> Optional[Dict[str, Any]]:
    queued = _in_chunks("evc_visits", "id, scheduling_due_at", "application_id", app_ids, status="queued")
    if not queued:
        return None
    late = sum(1 for v in queued if (_dt(v.get("scheduling_due_at")) or now) < now)
    return _fact("evc_queue", "warning" if late else "info",
                 f"{_plural(len(queued), 'EVC visit')} {scope} {'is' if len(queued) == 1 else 'are'} waiting to be "
                 f"scheduled, {late} past the scheduling deadline.", "/evc")


def _institution_facts(inst_id: str, now: datetime) -> List[Dict[str, Any]]:
    facts = []
    apps = db.table("applications").select("id, application_no, current_stage, due_at") \
        .eq("institution_id", inst_id).eq("status", "in_progress").execute().data or []
    awaiting = sorted((a for a in apps if a["current_stage"] == "institution_response"), key=lambda a: a["due_at"] or "")
    if awaiting:
        a = awaiting[0]
        due = _dt(a.get("due_at"))
        late = bool(due and due < now)
        when = f", {'which was due' if late else 'due'} on {_day(due)}" if due else ""
        facts.append(_fact("awaiting_response", "critical" if late else "warning",
                           f"{a['application_no']} is waiting for your response{when}.",
                           f"/applications/{a['id']}"))
    elif apps:
        nxt = min(apps, key=lambda a: a.get("due_at") or "9999")
        due = _dt(nxt.get("due_at"))
        facts.append(_fact("in_progress", "info",
                           f"You have {_plural(len(apps), 'application')} in progress; {nxt['application_no']} is at "
                           f"{STAGE_LABELS.get(nxt['current_stage'], nxt['current_stage'])}"
                           f"{', due ' + _day(due) if due else ''}.", f"/applications/{nxt['id']}"))
    facts += _document_facts([inst_id], now.date(), "of yours")
    upcoming = [u for u in (db.table("undertakings").select("id, title, due_at, status").eq("institution_id", inst_id)
                            .execute().data or [])
                if u.get("status") not in ("verified",) and (_dt(u.get("due_at")) or now) <= now + timedelta(days=SOON_DAYS)]
    if upcoming:
        late = sum(1 for u in upcoming if (_dt(u["due_at"]) or now) < now)
        facts.append(_fact("undertakings", "critical" if late else "warning",
                           f"{_plural(len(upcoming), 'undertaking')} {'is' if len(upcoming) == 1 else 'are'} due within "
                           f"{SOON_DAYS} days or overdue, {late} of them overdue.", "/undertakings"))
    inst = db.fetch_one("institutions", id=inst_id) or {}
    if inst.get("health_score") is not None:
        score = int(inst["health_score"])
        facts.append(_fact("health_score", "info" if score >= 70 else "warning",
                           f"Your compliance health score is {score} out of 100.", "/compliance-calendar"))
    return facts


def compute_facts(user: AuthenticatedUser) -> List[Dict[str, Any]]:
    """The brief's facts for this user's role and scope, most urgent first."""
    now = clock.now()
    uid = str(user.id)
    if user.role == "institution":
        facts = _institution_facts(user.institution_id, now) if user.institution_id else []
    else:
        regional = user.role != "bureau_officer" and bool(user.region_id)
        q = db.table("applications").select("id, application_no, current_stage, due_at, assigned_to, institution_id") \
            .eq("status", "in_progress")
        if regional:
            q = q.eq("region_id", user.region_id)
        apps = q.execute().data or []
        scope = "in your region" if regional else "nationally"
        inst_ids = None
        if regional:
            inst_ids = [i["id"] for i in (db.table("institutions").select("id").eq("region_id", user.region_id)
                                          .execute().data or [])]
        facts = [f for f in (_my_cases_fact(uid, apps, now), _my_alerts_fact(uid)) if f]
        if user.role in ("regional_officer", "bureau_officer", "scrutiny_officer"):
            facts += _deadline_facts(apps, now, scope)
        if user.role in ("regional_officer", "bureau_officer"):
            facts += _document_facts(inst_ids, now.date(), scope)
            facts += [f for f in (_undertaking_fact(inst_ids, now, scope),
                                  _slowest_stage_fact(user.region_id if regional else None)) if f]
        if user.role in ("regional_officer", "evc_member"):
            evc = _evc_fact([a["id"] for a in apps], now, scope)
            if evc:
                facts.append(evc)
    facts.sort(key=lambda f: _SEVERITY_ORDER[f["severity"]])
    return facts


# ─── Summary ──────────────────────────────────────────────────────────────────

_NUMBER = re.compile(r"\d+(?:\.\d+)?")
_NUMBER_WORDS = {
    w: str(i) for i, w in enumerate(
        "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
        "sixteen seventeen eighteen nineteen twenty".split())
}
_NUMBER_WORDS.update({"thirty": "30", "forty": "40", "fifty": "50", "sixty": "60", "seventy": "70",
                      "eighty": "80", "ninety": "90", "hundred": "100"})
_WORD = re.compile(r"\b(" + "|".join(_NUMBER_WORDS) + r")\b", re.IGNORECASE)


def _numbers_supported(summary: str, facts: List[Dict[str, Any]]) -> bool:
    """
    Every number in the summary appears in a fact (counts, days, dates, application numbers),
    including numbers written as words, which would otherwise slip past the check.
    """
    allowed = set(_NUMBER.findall(" ".join(f["text"] for f in facts)))
    used = set(_NUMBER.findall(summary)) | {_NUMBER_WORDS[w.lower()] for w in _WORD.findall(summary)}
    return used <= allowed


def _template_summary(facts: List[Dict[str, Any]]) -> str:
    if not facts:
        return "Nothing needs your attention today."
    return " ".join(f["text"] for f in facts[:2])


def build_brief(user: AuthenticatedUser) -> Dict[str, Any]:
    # Keyed on the clock offset too, so a jump of the simulated clock shows at once
    recent_key = (str(user.id), int(clock.get_offset_days() * 86400))
    hit = _recent.get(recent_key)
    if hit and time.monotonic() - hit[0] < RECENT_SECONDS:
        return hit[1]
    brief = _build_brief(user)
    if len(_recent) >= _CACHE_MAX:
        _recent.clear()
    _recent[recent_key] = (time.monotonic(), brief)
    return brief


def _build_brief(user: AuthenticatedUser) -> Dict[str, Any]:
    now = clock.now()
    facts = compute_facts(user)
    digest = hashlib.sha256("\n".join(f["text"] for f in facts).encode()).hexdigest()
    key = (str(user.id), now.date().isoformat(), digest)
    cached = _cache.get(key)
    if cached is None:
        summary, mode = None, "production"
        if facts:
            result = llm.write_daily_brief(user.role, facts)
            summary = result.get("summary") if result else None
            if summary and not _numbers_supported(summary, facts):
                logger.warning("Daily brief summary used a number not in the facts; using the template")
                summary = None
        if not summary:
            mode = "template" if not facts else ("mock" if not llm.llm_enabled() else "mock_fallback")
            summary = _template_summary(facts)
        if len(_cache) >= _CACHE_MAX:
            _cache.clear()
        cached = _cache[key] = {"summary": summary, "mode": mode}
    return {
        "date": now.date().isoformat(),
        "is_simulated": abs((now - datetime.now(timezone.utc)).total_seconds()) > 60,
        "summary": cached["summary"],
        "mode": cached["mode"],
        "facts": facts,
        "advisory": llm.ADVISORY,
    }
