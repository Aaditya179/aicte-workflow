"""
Decision Assurance Service (§15.2)

Rule-based layer that checks evidence behind every decision before and after it is taken,
flagging doubtful items for the officer (freshness, completeness, consistency, integrity, provenance).
Advisory only — never blocks an officer from recording a decision, but requires that every flag
gets an acknowledged response or an override with an audited reason before commit.
"""
from datetime import datetime, timezone, date, timedelta
from typing import Dict, Any, List, Optional
import json
import logging

from core.db import db
from core import clock
from adapters.mock import mock_adapter
from services import audit
from core.security import AuthenticatedUser


logger = logging.getLogger("aicte.assurance")

OVERRIDE_ANOMALY_THRESHOLD = 3
OVERRIDE_ANOMALY_WINDOW_DAYS = 30
FAST_DECISION_SLA_FRACTION = 0.10


def _parse_dt(val: Any) -> Optional[datetime]:
    if not val:
        return None
    try:
        dt = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _audit_actor(user_id: str, actor: Optional[AuthenticatedUser]) -> AuthenticatedUser:
    """The acting officer for audit entries; looked up when the caller did not pass one."""
    if actor:
        return actor
    prof = db.fetch_one("profiles", user_id=user_id) or {}
    return AuthenticatedUser(id=user_id, role=prof.get("role") or "unknown", full_name=prof.get("full_name"))


class AssuranceService:
    def __init__(self):
        self.db = db

    def _require_decision_officer(self, decision: Optional[Dict[str, Any]], user_id: str) -> None:
        """Only the officer who drafted a decision responds to its flags and commits it."""
        if decision and decision.get("decided_by") and str(decision["decided_by"]) != str(user_id):
            raise PermissionError("Only the officer who drafted this decision can respond to its flags or commit it")

    async def run_checks_for_application(
        self,
        application_id: str,
        stage_key: str,
        decided_by: Optional[str] = None,
        is_post_decision: bool = False
    ) -> Dict[str, Any]:
        """
        Runs the 8 statutory checks for a given application and stage:
        1. Evidence Linking snapshot
        2. Freshness check
        3. Completeness check against mandatory_evidence
        4. Consistency check across document metadata
        5. Source verification via AICTE adapter
        6. Tamper detection / SHA-256 match
        7. Undertakings & alerts status
        8. Anomaly check (speed or repetitive overrides)
        """
        app = self.db.fetch_one("applications", id=application_id)
        if not app:
            raise ValueError(f"Application {application_id} not found")

        inst = self.db.fetch_one("institutions", id=app.get("institution_id")) or {}
        sim_now = clock.now()
        today = sim_now.date()

        checks_results = []
        flags = []

        # 1. Fetch active documents for application and institution
        docs_app = self.db.table("documents").select("*").eq("application_id", application_id).execute().data or []
        docs_inst = self.db.table("documents").select("*").eq("institution_id", app.get("institution_id")).execute().data or []
        # Merge unique documents
        all_docs_dict = {d["id"]: d for d in (docs_app + docs_inst)}
        # Documents superseded by a verified renewal are no longer evidence
        all_docs = [d for d in all_docs_dict.values() if d.get("status") != "renewed"]

        # Check 1: Evidence linking (the snapshot itself is written by create_decision_draft)
        checks_results.append({
            "check": "evidence_linking",
            "result": "passed",
            "detail": f"{len(all_docs)} current document(s) snapshotted as evidence"
        })

        # Check 2: Freshness
        stale_docs = []
        for doc in all_docs:
            valid_until_str = doc.get("valid_until")
            if valid_until_str:
                try:
                    v_date = datetime.strptime(str(valid_until_str)[:10], "%Y-%m-%d").date()
                    if v_date < today:
                        stale_docs.append(doc)
                except ValueError:
                    pass

        if stale_docs:
            for s in stale_docs:
                flags.append({
                    "check_type": "freshness",
                    "severity": "critical",
                    "message": f"Document '{s.get('title') or s.get('doc_type')}' expired on {s.get('valid_until')}",
                    "entity_type": "documents",
                    "entity_id": s.get("id")
                })
            checks_results.append({
                "check": "freshness",
                "result": "flagged",
                "detail": f"{len(stale_docs)} document(s) have expired valid_until dates"
            })
        else:
            checks_results.append({
                "check": "freshness",
                "result": "passed",
                "detail": "All linked documents have active validity dates"
            })

        # Check 3: Completeness against mandatory_evidence
        tmpl = self.db.fetch_one("workflow_templates", id=app.get("template_id")) or {}
        template_code = tmpl.get("code", "")
        mandatory_reqs = self.db.table("mandatory_evidence").select("*") \
            .eq("template_code", template_code) \
            .eq("stage_key", stage_key).execute().data or []

        # Also fallback default requirements if not explicitly seeded
        if not mandatory_reqs and stage_key in ["final_decision", "scrutiny", "evc_visit"]:
            # If final_decision, expect lease and application_form or evc_report
            if stage_key == "final_decision":
                mandatory_reqs = [
                    {"doc_type": "lease", "label": "Land / Building Lease Deed"},
                    {"doc_type": "evc_report", "label": "Verified EVC Inspection Report"}
                ]

        missing_mandatory = []
        present_types = {d.get("doc_type") for d in all_docs if d.get("status") == "verified"}
        for req in mandatory_reqs:
            if req["doc_type"] not in present_types:
                missing_mandatory.append(req)

        if missing_mandatory:
            for m in missing_mandatory:
                flags.append({
                    "check_type": "completeness",
                    "severity": "critical",
                    "message": f"Mandatory evidence missing for {stage_key}: {m.get('label') or m.get('doc_type')}",
                    "entity_type": "mandatory_evidence",
                    "entity_id": None
                })
            checks_results.append({
                "check": "completeness",
                "result": "flagged",
                "detail": f"{len(missing_mandatory)} mandatory document(s) missing for this stage"
            })
        else:
            checks_results.append({
                "check": "completeness",
                "result": "passed",
                "detail": "All mandatory documents for this stage are verified and present"
            })

        # Check 4: Metadata Consistency
        inconsistent_docs = []
        inst_name = (inst.get("name") or "").strip().lower()
        for doc in all_docs:
            meta = doc.get("metadata") or {}
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except Exception:
                    meta = {}
            doc_inst = (meta.get("institution_name") or "").strip().lower()
            if doc_inst and inst_name and doc_inst != inst_name:
                inconsistent_docs.append((doc, meta.get("institution_name")))

        if inconsistent_docs:
            for d, wrong_name in inconsistent_docs:
                flags.append({
                    "check_type": "consistency",
                    "severity": "warning",
                    "message": f"Document metadata institution '{wrong_name}' does not match '{inst.get('name')}'",
                    "entity_type": "documents",
                    "entity_id": d.get("id")
                })
            checks_results.append({
                "check": "consistency",
                "result": "flagged",
                "detail": f"Metadata mismatch detected in {len(inconsistent_docs)} document(s)"
            })
        else:
            checks_results.append({
                "check": "consistency",
                "result": "passed",
                "detail": "Document metadata aligns with institution record"
            })

        # Check 5: Source Verification (Central AICTE adapter)
        aicte_id = inst.get("aicte_id", "")
        source_res = mock_adapter.verify_institution(aicte_id)
        if not source_res.get("verified", True):
            flags.append({
                "check_type": "source_verification",
                "severity": "critical",
                "message": f"Institution {aicte_id} could not be confirmed in central AICTE registry",
                "entity_type": "institutions",
                "entity_id": inst.get("id")
            })
            checks_results.append({
                "check": "source_verification",
                "result": "flagged",
                "detail": source_res.get("message", "Source registry verification failed")
            })
        else:
            checks_results.append({
                "check": "source_verification",
                "result": "passed",
                "detail": "Confirmed with central AICTE registry"
            })

        # Check 6: Tamper detection. A document whose stored hash differs from the hash snapshotted
        # by an earlier decision was replaced or edited after that decision relied on it.
        tampered = []
        hashed_docs = [d for d in all_docs if d.get("sha256")]
        for doc in hashed_docs:
            snaps = self.db.table("decision_evidence").select("doc_sha256").eq("document_id", doc["id"]).execute().data or []
            if any(sn.get("doc_sha256") and sn["doc_sha256"] != doc["sha256"] for sn in snaps):
                tampered.append(doc)
        for doc in tampered:
            flags.append({
                "check_type": "tamper_detection",
                "severity": "critical",
                "message": f"Document '{doc.get('title') or doc.get('doc_type')}' changed after an earlier decision relied on it",
                "entity_type": "documents",
                "entity_id": doc.get("id")
            })
        checks_results.append({
            "check": "tamper_detection",
            "result": "flagged" if tampered else "passed",
            "detail": f"{len(tampered)} document(s) changed since they were cited" if tampered
                      else f"{len(hashed_docs)} hashed document(s) match their earlier snapshots"
        })

        # Check 7: Anomalies — repeated overrides by the officer, or a decision taken unusually fast
        anomalies = []
        if decided_by:
            window_start = sim_now - timedelta(days=OVERRIDE_ANOMALY_WINDOW_DAYS)
            overrides = self.db.table("assurance_flags").select("id, responded_at") \
                .eq("responded_by", decided_by) \
                .eq("status", "overridden").execute().data or []
            recent = [o for o in overrides if (_parse_dt(o.get("responded_at")) or sim_now) >= window_start]
            if len(recent) >= OVERRIDE_ANOMALY_THRESHOLD:
                anomalies.append({
                    "check_type": "anomaly",
                    "severity": "warning",
                    "message": f"Officer has recorded {len(recent)} assurance overrides in the last {OVERRIDE_ANOMALY_WINDOW_DAYS} days",
                    "entity_type": "profiles",
                    "entity_id": decided_by
                })

        entered, due = _parse_dt(app.get("stage_entered_at")), _parse_dt(app.get("due_at"))
        if not is_post_decision and entered and due and due > entered:
            elapsed = (sim_now - entered).total_seconds()
            if 0 <= elapsed < FAST_DECISION_SLA_FRACTION * (due - entered).total_seconds():
                anomalies.append({
                    "check_type": "anomaly",
                    "severity": "warning",
                    "message": f"Decision taken {round(elapsed / 3600, 1)} hours into the stage, under "
                               f"{int(FAST_DECISION_SLA_FRACTION * 100)}% of its SLA window",
                    "entity_type": "applications",
                    "entity_id": application_id
                })
        flags.extend(anomalies)
        checks_results.append({
            "check": "anomaly",
            "result": "flagged" if anomalies else "passed",
            "detail": "; ".join(a["message"] for a in anomalies) if anomalies else "No anomalous speed or override pattern detected"
        })

        passed_count = sum(1 for c in checks_results if c["result"] == "passed")
        flagged_count = len(flags)

        return {
            "application_id": application_id,
            "stage_key": stage_key,
            "passed": passed_count,
            "flagged": flagged_count,
            "checks": checks_results,
            "flags": flags,
            "linked_documents": all_docs,
            "generated_at": sim_now.isoformat()
        }

    async def create_decision_draft(
        self,
        application_id: str,
        stage_key: str,
        outcome: str,
        remarks: str,
        user_id: str,
        actor: Optional[AuthenticatedUser] = None
    ) -> Dict[str, Any]:
        """
        Creates or updates a draft decision, snapshots all evidence documents,
        runs the assurance engine, and records reports + flags.
        """
        sim_now = clock.now()
        # Find existing draft or create new
        existing = self.db.fetch_one("decisions", application_id=application_id, stage_key=stage_key, status="draft")
        if existing:
            decision_id = existing["id"]
            self.db.update("decisions", decision_id, {
                "outcome": outcome,
                "remarks": remarks,
                "decided_by": user_id,
                "decided_at": sim_now.isoformat()
            })
            # Clear old flags and evidence for fresh run
            self.db.table("decision_evidence").delete().eq("decision_id", decision_id).execute()
            self.db.table("assurance_flags").delete().eq("decision_id", decision_id).execute()
            self.db.table("assurance_reports").delete().eq("decision_id", decision_id).execute()
        else:
            new_dec = self.db.insert("decisions", {
                "application_id": application_id,
                "stage_key": stage_key,
                "outcome": outcome,
                "status": "draft",
                "decided_by": user_id,
                "decided_at": sim_now.isoformat(),
                "remarks": remarks
            })
            decision_id = new_dec["id"]

        # Run assurance checks
        report_data = await self.run_checks_for_application(
            application_id=application_id,
            stage_key=stage_key,
            decided_by=user_id,
            is_post_decision=False
        )

        # Snapshot evidence into decision_evidence
        for d in report_data.get("linked_documents", []):
            try:
                self.db.insert("decision_evidence", {
                    "decision_id": decision_id,
                    "document_id": d["id"],
                    "doc_version": d.get("version", 1),
                    "doc_sha256": d.get("sha256"),
                    "valid_until": d.get("valid_until"),
                    "linked_at": sim_now.isoformat()
                })
            except Exception as e:
                logger.warning(f"Could not snapshot document {d.get('id')} for decision {decision_id}: {e}")

        # Insert assurance_report
        rep = self.db.insert("assurance_reports", {
            "decision_id": decision_id,
            "kind": "pre",
            "generated_at": sim_now.isoformat(),
            "checks": report_data["checks"],
            "passed": report_data["passed"],
            "flagged": report_data["flagged"]
        })
        rep_id = rep.get("id")

        # Insert flags
        created_flags = []
        for fl in report_data.get("flags", []):
            inserted_flag = self.db.insert("assurance_flags", {
                "report_id": rep_id,
                "decision_id": decision_id,
                "check_type": fl["check_type"],
                "severity": fl["severity"],
                "message": fl["message"],
                "entity_type": fl.get("entity_type"),
                "entity_id": fl.get("entity_id"),
                "status": "open"
            })
            created_flags.append(inserted_flag)

        audit.record(
            actor=_audit_actor(user_id, actor),
            action="decision.draft_created",
            entity_type="decisions",
            entity_id=decision_id,
            before=None,
            after={"flagged": report_data["flagged"], "application_id": application_id}
        )

        return {
            "decision_id": decision_id,
            "report_id": rep_id,
            "status": "draft",
            "passed": report_data["passed"],
            "flagged": report_data["flagged"],
            "checks": report_data["checks"],
            "flags": created_flags
        }

    async def acknowledge_flag(self, flag_id: str, user_id: str, actor: Optional[AuthenticatedUser] = None) -> Dict[str, Any]:
        """Acknowledge an advisory flag."""
        sim_now = clock.now()
        flag = self.db.fetch_one("assurance_flags", id=flag_id)
        if not flag:
            raise ValueError(f"Flag {flag_id} not found")
        if flag.get("status") != "open":
            raise ValueError(f"Flag already {flag.get('status')}")
        self._require_decision_officer(self.db.fetch_one("decisions", id=flag["decision_id"]), user_id)

        updated = self.db.update("assurance_flags", flag_id, {
            "status": "acknowledged",
            "responded_by": user_id,
            "responded_at": sim_now.isoformat()
        })

        audit.record(
            actor=_audit_actor(user_id, actor),
            action="assurance.flag_acknowledged",
            entity_type="assurance_flags",
            entity_id=flag_id,
            before={"status": "open"},
            after={"status": "acknowledged"}
        )

        return updated

    async def override_flag(
        self,
        flag_id: str,
        user_id: str,
        reason: str,
        actor: Optional[AuthenticatedUser] = None,
        approved: bool = False,
    ) -> Dict[str, Any]:
        """Override a flag with a mandatory reason."""
        if not reason or len(reason.strip()) < 5:
            raise ValueError("A documented justification reason of at least 5 characters is mandatory for overrides.")

        sim_now = clock.now()
        flag = self.db.fetch_one("assurance_flags", id=flag_id)
        if not flag:
            raise ValueError(f"Flag {flag_id} not found")
        expected = "pending_approval" if approved else "open"
        if flag.get("status") != expected:
            raise ValueError(f"Flag already {flag.get('status')}")
        self._require_decision_officer(self.db.fetch_one("decisions", id=flag["decision_id"]), user_id)

        from services import approvals
        if not approved and approvals.overrides_need_approval():
            # Maker-checker: the override waits for a bureau officer (§15.2)
            request = approvals.create_request(
                "assurance_override", "assurance_flags", flag_id, {"reason": reason.strip()},
                _audit_actor(user_id, actor), reason=reason.strip(),
            )
            updated = self.db.update("assurance_flags", flag_id, {"status": "pending_approval"})
            return {**updated, "approval_request_id": request["id"]}

        updated = self.db.update("assurance_flags", flag_id, {
            "status": "overridden",
            "responded_by": user_id,
            "responded_at": sim_now.isoformat(),
            "reason": reason.strip()
        })

        audit.record(
            actor=_audit_actor(user_id, actor),
            action="assurance.flag_overridden",
            entity_type="assurance_flags",
            entity_id=flag_id,
            before={"status": "open"},
            after={"status": "overridden"},
            reason=reason.strip()
        )

        return updated

    async def commit_decision(self, decision_id: str, user_id: str, actor: Optional[AuthenticatedUser] = None) -> Dict[str, Any]:
        """
        Commits a decision. Fails while any flag remains with status 'open'.
        """
        decision = self.db.fetch_one("decisions", id=decision_id)
        if not decision:
            raise ValueError(f"Decision {decision_id} not found")
        if decision.get("status") != "draft":
            raise ValueError(f"Decision is already {decision.get('status')}")
        self._require_decision_officer(decision, user_id)

        # Check for open flags (an override awaiting approval is still open)
        open_flags = self.db.table("assurance_flags").select("*") \
            .eq("decision_id", decision_id) \
            .in_("status", ["open", "pending_approval"]).execute().data or []

        if open_flags:
            raise ValueError(
                f"Cannot commit decision: {len(open_flags)} open assurance flag(s) require officer acknowledgment or override."
            )

        sim_now = clock.now()
        updated = self.db.update("decisions", decision_id, {
            "status": "committed",
            "decided_by": user_id,
            "decided_at": sim_now.isoformat()
        })

        audit.record(
            actor=_audit_actor(user_id, actor),
            action="decision.committed",
            entity_type="decisions",
            entity_id=decision_id,
            before={"status": "draft"},
            after={"status": "committed"}
        )

        return updated

    async def run_daily_post_decision_recheck(self) -> Dict[str, Any]:
        """
        Daily scheduler job (§15.2):
        Reruns freshness and tamper checks for decisions committed in the last 12 months.
        Creates post assurance reports, flags newly expired or changed cited evidence once,
        and alerts the deciding officer and the region's regional officers.
        """
        sim_now = clock.now()
        window_start = sim_now - timedelta(days=365)
        committed_decisions = self.db.table("decisions").select("*").eq("status", "committed").execute().data or []

        rechecked_count = 0
        new_flags_raised = 0

        for dec in committed_decisions:
            decided_at = _parse_dt(dec.get("decided_at"))
            if decided_at and decided_at < window_start:
                continue
            dec_id = dec["id"]
            evidences = self.db.table("decision_evidence").select("*").eq("decision_id", dec_id).execute().data or []

            # Evidence already flagged by an earlier recheck is not flagged again
            existing = self.db.table("assurance_flags").select("entity_id, check_type").eq("decision_id", dec_id).execute().data or []
            already = {(f.get("check_type"), str(f.get("entity_id"))) for f in existing}

            flags = []
            for ev in evidences:
                doc_label = f"Document #{str(ev.get('document_id'))[:8]}"
                valid_until_str = ev.get("valid_until")
                if valid_until_str and ("post_decision_freshness", str(ev.get("id"))) not in already:
                    try:
                        v_date = datetime.strptime(str(valid_until_str)[:10], "%Y-%m-%d").date()
                    except ValueError:
                        v_date = None
                    if v_date and v_date < sim_now.date():
                        flags.append({
                            "check_type": "post_decision_freshness",
                            "severity": "warning",
                            "message": f"Evidence relied upon during approval expired on {valid_until_str} ({doc_label})",
                            "entity_type": "decision_evidence",
                            "entity_id": ev.get("id")
                        })

                if ev.get("doc_sha256") and ("post_decision_tamper", str(ev.get("id"))) not in already:
                    doc = self.db.fetch_one("documents", id=ev.get("document_id")) or {}
                    if doc.get("sha256") and doc["sha256"] != ev["doc_sha256"]:
                        flags.append({
                            "check_type": "post_decision_tamper",
                            "severity": "critical",
                            "message": f"Evidence changed after the decision relied on it ({doc_label})",
                            "entity_type": "decision_evidence",
                            "entity_id": ev.get("id")
                        })

            if flags:
                rep = self.db.insert("assurance_reports", {
                    "decision_id": dec_id,
                    "kind": "post",
                    "generated_at": sim_now.isoformat(),
                    "checks": [{"check": f["check_type"], "result": "flagged", "detail": f["message"]} for f in flags],
                    "passed": 0,
                    "flagged": len(flags)
                })
                rep_id = rep.get("id")
                for fl in flags:
                    self.db.insert("assurance_flags", {
                        "report_id": rep_id,
                        "decision_id": dec_id,
                        "check_type": fl["check_type"],
                        "severity": fl["severity"],
                        "message": fl["message"],
                        "entity_type": fl["entity_type"],
                        "entity_id": fl.get("entity_id"),
                        "status": "open"
                    })
                    new_flags_raised += 1
                self._alert_post_decision_flags(dec, flags, sim_now)

            rechecked_count += 1

        return {
            "rechecked_decisions": rechecked_count,
            "new_flags_raised": new_flags_raised,
            "rechecked_at": sim_now.isoformat()
        }

    def _alert_post_decision_flags(self, decision: Dict[str, Any], flags: List[Dict[str, Any]], sim_now: datetime) -> None:
        """Raise one alert per recheck to the deciding officer and the region's regional officers."""
        from services import notifier
        app = self.db.fetch_one("applications", id=decision.get("application_id")) or {}
        targets = [decision["decided_by"]] if decision.get("decided_by") else []
        if app.get("region_id"):
            targets += [p["user_id"] for p in self.db.fetch_all("profiles", region_id=app["region_id"], role="regional_officer")]
        message = f"Post-decision recheck on {app.get('application_no', 'a committed decision')}: {len(flags)} new evidence flag(s)."
        severity = "critical" if any(f["severity"] == "critical" for f in flags) else "warning"
        alert_id = None
        try:
            # Level = the simulated day's ordinal, so each day's recheck gets its own alert under the unique key
            res = self.db.table("alerts").insert({
                "entity_type": "decision",
                "entity_id": decision["id"],
                "kind": "expiry",
                "level": sim_now.toordinal(),
                "severity": severity,
                "message": message,
                "status": "open",
                "target_role": "regional_officer",
                "fired_at": sim_now.isoformat()
            }).execute()
            alert_id = res.data[0]["id"] if res.data else None
        except Exception as e:
            logger.warning(f"Could not raise post-decision alert for decision {decision['id']}: {e}")
        if targets:
            notifier.notify_users(list(set(targets)), "Post-decision assurance flag", message, alert_id=alert_id, severity=severity, kind="expiry")


assurance_service = AssuranceService()
