from fastapi import APIRouter, Depends, HTTPException, Query, Response
from typing import Optional, List, Dict, Any
import io
from datetime import datetime
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, require_role
from core import clock
from services import audit as audit_service

# ReportLab imports
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

# openpyxl imports
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

router = APIRouter(prefix="/reports", tags=["Reports"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def _generate_pdf(title: str, headers: List[str], data_rows: List[List[Any]], generated_at: str) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontSize=16,
        leading=20,
        textColor=colors.HexColor('#1e3a8a'),
        alignment=0
    )
    meta_style = ParagraphStyle(
        'MetaStyle',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#64748b')
    )
    disclaimer_style = ParagraphStyle(
        'Disclaimer',
        parent=styles['Italic'],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#475569')
    )

    elements = [
        Paragraph(f"AICTE SLA & Workflow Engine — {title}", title_style),
        Spacer(1, 4),
        Paragraph(f"Generated at: {generated_at} (Simulated Clock) | Official Governance Report", meta_style),
        Spacer(1, 14),
    ]

    # Table formatting
    table_content = [headers] + data_rows
    col_widths = None  # Auto
    t = Table(table_content, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a8a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
    ]))

    elements.append(t)
    elements.append(Spacer(1, 20))
    elements.append(Paragraph("Notice: Advisory only, final decisions rest with the competent authority.", disclaimer_style))

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()


def _generate_excel(sheet_title: str, headers: List[str], data_rows: List[List[Any]]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]

    # Header styling
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    ws.append(headers)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="left", vertical="center")

    # Data rows
    for row_idx, row in enumerate(data_rows, start=2):
        ws.append(row)
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.border = thin_border
            cell.font = Font(name="Calibri", size=10)

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


@router.get("/{report_type}")
async def get_report(
    report_type: str,
    format: str = Query("json", pattern="^(json|pdf|xlsx)$"),
    user: AuthenticatedUser = Depends(require_role(["scrutiny_officer", "regional_officer", "bureau_officer", "auditor"]))
):
    """
    Export reports as JSON, PDF, or Excel (Section 6, 7.1):
    - pendency: Stage & regional pendency analysis
    - overdue_summary: Regional overdue summary (apps, evc, undertakings, docs)
    - officer_workload: Officer case distribution and SLA metrics
    - compliance: Institutional compliance & health scores
    - audit: Cryptographically verified audit log
    """
    now = clock.now()
    generated_at = now.strftime("%Y-%m-%d %H:%M:%S UTC")
    if report_type == "audit" and user.role not in ("bureau_officer", "auditor"):
        raise HTTPException(status_code=403, detail="The audit trail report is for bureau officers and auditors")
    # Regional staff report on their own region only
    own_region = None
    if user.role in ("scrutiny_officer", "regional_officer") and user.region_id:
        reg = _supabase.table("regions").select("name").eq("id", user.region_id).limit(1).execute().data
        own_region = reg[0]["name"] if reg else ""

    def scoped(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return rows if own_region is None else [r for r in rows if r.get("region_name") == own_region]

    if report_type == "pendency":
        title = "Stage & Regional Pendency Analysis"
        res = _supabase.table("v_pendency_by_stage_region").select("*").execute()
        rows = scoped(res.data or [])
        headers = ["Region", "Stage", "Total Cases", "Open Cases", "Overdue Cases", "Avg Stage Age (Days)", "Avg Total Age (Days)"]
        data_rows = [
            [
                r.get("region_name") or "All",
                r.get("current_stage", "").upper(),
                r.get("total_cases", 0),
                r.get("open_cases", 0),
                r.get("overdue_cases", 0),
                r.get("avg_stage_age_days", 0),
                r.get("avg_total_age_days", 0)
            ]
            for r in rows
        ]

    elif report_type == "overdue_summary":
        title = "Regional Overdue Governance Summary"
        res = _supabase.table("v_overdue_summary").select("*").execute()
        rows = scoped(res.data or [])
        headers = ["Region", "Overdue Applications", "Overdue EVC Visits", "Overdue Undertakings", "Expired / Expiring Docs"]
        data_rows = [
            [
                r.get("region_name") or "All",
                r.get("overdue_applications", 0),
                r.get("overdue_evcs", 0),
                r.get("overdue_undertakings", 0),
                r.get("expired_documents", 0)
            ]
            for r in rows
        ]

    elif report_type == "officer_workload":
        title = "Officer Workload & SLA Metrics"
        res = _supabase.table("v_officer_workload").select("*").execute()
        rows = scoped(res.data or [])
        headers = ["Officer Name", "Role", "Region", "Open Cases", "Overdue Cases", "Avg Case Age (Days)"]
        data_rows = [
            [
                r.get("officer_name") or "Officer",
                r.get("officer_role", "").replace("_", " ").title(),
                r.get("region_name") or "HQ",
                r.get("open_cases", 0),
                r.get("overdue_cases", 0),
                r.get("avg_case_age_days", 0)
            ]
            for r in rows
        ]

    elif report_type == "compliance":
        title = "Institutional Compliance & Health Score"
        res = _supabase.table("v_institution_compliance").select("*").execute()
        rows = scoped(res.data or [])
        headers = ["Institution Name", "AICTE ID", "Region", "Health Score", "Pending Undertakings", "Overdue Undertakings", "Expiring Docs", "Expired Docs"]
        data_rows = [
            [
                r.get("institution_name", "College"),
                r.get("aicte_id", ""),
                r.get("region_name") or "",
                f"{r.get('health_score', 85)}/100",
                r.get("pending_undertakings", 0),
                r.get("overdue_undertakings", 0),
                r.get("expiring_documents", 0),
                r.get("expired_documents", 0)
            ]
            for r in rows
        ]

    elif report_type == "audit":
        title = "Chained Cryptographic Audit Trail"
        verification = audit_service.verify_chain()
        res = _supabase.table("audit_log").select("seq, action, entity_type, actor_role, created_at, hash") \
            .order("seq", desc=True).limit(100).execute()
        rows = res.data or []
        headers = ["Seq #", "Action", "Entity", "Actor Role", "Timestamp", "SHA-256 Hash"]
        data_rows = [
            [
                r.get("seq"),
                r.get("action"),
                r.get("entity_type"),
                r.get("actor_role"),
                str(r.get("created_at"))[:19],
                str(r.get("hash"))[:16] + "..."
            ]
            for r in rows
        ]
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported report type: {report_type}")

    # Every export is logged (§15.8)
    if format in ("pdf", "xlsx"):
        audit_service.record(
            actor=user, action="REPORT_EXPORTED", entity_type="report", entity_id=None,
            before=None, after={"report_type": report_type, "format": format, "rows": len(data_rows),
                                "region": own_region or "all"},
            reason=f"Exported {report_type} as {format}",
        )

    # Format return
    if format == "pdf":
        pdf_bytes = _generate_pdf(title, headers, data_rows, generated_at)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={report_type}_report.pdf"}
        )

    if format == "xlsx":
        xlsx_bytes = _generate_excel(title, headers, data_rows)
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={report_type}_report.xlsx"}
        )

    # JSON response
    return {
        "report_type": report_type,
        "title": title,
        "generated_at": generated_at,
        "simulated_time": now.isoformat(),
        "disclaimer": "Advisory only, final decisions rest with the competent authority.",
        "headers": headers,
        "total_records": len(data_rows),
        "data": [dict(zip([h.lower().replace(" ", "_").replace("(", "").replace(")", "").replace("#", "no") for h in headers], row)) for row in data_rows]
    }
