import type { NextRequest } from "next/server";
import { jsPDF } from "jspdf";
import { authenticatePartner, logPartnerRequest } from "@/lib/partner-api/auth";
import { callPartnerGateway } from "@/lib/partner-api/gateway";
import { apiError, coreError, internalError } from "@/lib/partner-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Report = {
  referral: { id: string; tracking_code: string; partner_reference: string | null; status: string; environment: string };
  provider: { name: string; license_number: string | null } | null;
  summary: {
    prescribed_sessions: number;
    completed_sessions: number;
    upcoming_sessions: number;
    cancelled_sessions: number;
    first_session_at: string | null;
    last_session_at: string | null;
    next_session_at: string | null;
    discharged: boolean;
    discharged_at: string | null;
  };
  milestones: Array<{ label: string; status: string; completed_at: string | null }>;
  generated_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  contacted: "Contacted",
  booked: "Booked",
  in_treatment: "In treatment",
  completed: "Completed",
  not_suitable: "Not suitable",
  cancelled: "Cancelled",
  closed: "Closed",
};

function date(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}

/** Renders the report as a real PDF (text only — nothing partner-supplied is interpreted). */
function renderPdf(report: Report, partnerName: string): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  let y = 64;
  const line = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, left, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, left + 170, y, { maxWidth: 330 });
    y += 20;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Rehabify Health — Referral Progress Report", left, y);
  y += 22;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  doc.text(`Prepared for ${partnerName} · Generated ${date(report.generated_at)}`, left, y);
  if (report.referral.environment === "sandbox") {
    y += 14;
    doc.setTextColor(180, 83, 9);
    doc.text("SANDBOX — test data, not a real patient record", left, y);
  }
  doc.setTextColor(0);
  y += 30;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Referral", left, y);
  y += 20;
  doc.setFontSize(10);
  line("Tracking code", report.referral.tracking_code);
  line("Your reference", report.referral.partner_reference ?? "—");
  line("Status", STATUS_LABEL[report.referral.status] ?? report.referral.status);
  line("Physiotherapist", report.provider ? `${report.provider.name}${report.provider.license_number ? ` (${report.provider.license_number})` : ""}` : "Not yet matched");
  y += 10;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Sessions", left, y);
  y += 20;
  doc.setFontSize(10);
  line("Prescribed", String(report.summary.prescribed_sessions));
  line("Completed", String(report.summary.completed_sessions));
  line("Upcoming", String(report.summary.upcoming_sessions));
  line("Cancelled / missed", String(report.summary.cancelled_sessions));
  line("First session", date(report.summary.first_session_at));
  line("Most recent session", date(report.summary.last_session_at));
  line("Next session", date(report.summary.next_session_at));
  line("Discharged", report.summary.discharged ? `Yes — ${date(report.summary.discharged_at)}` : "No");
  y += 10;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Milestones", left, y);
  y += 20;
  doc.setFontSize(10);
  for (const milestone of report.milestones) {
    const state = milestone.status === "completed" ? `Completed ${date(milestone.completed_at)}` : milestone.status === "in_progress" ? "In progress" : "Pending";
    line(milestone.label, state);
  }

  y += 16;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "This report contains care progress only. Clinical notes are held by the treating physiotherapist and are not shared through the partner API.",
    left,
    y,
    { maxWidth: 500 }
  );
  return Buffer.from(doc.output("arraybuffer"));
}

/** GET /v1/partners/reports/{id}/pdf — the progress report as a PDF document. */
export async function GET(req: NextRequest, props: { params: Promise<{ referralId: string }> }) {
  const auth = await authenticatePartner(req);
  if (!auth.ok) return auth.response;
  const { partner, ctx } = auth;
  const identifier = ((await props.params).referralId ?? "").trim();
  if (!identifier || identifier.length > 200) {
    return apiError(ctx, 400, "invalid_parameter", "A referral id, tracking code or partner_reference is required.", { param: "id" });
  }
  try {
    const result = await callPartnerGateway("getReport", { partnerCode: partner.code, environment: partner.environment, identifier });
    if (!result?.ok) return logPartnerRequest(req, auth, coreError(ctx, result), { eventType: "api.report_pdf", errorCode: result?.code });
    const pdf = renderPdf(result.report as Report, partner.name);
    const filename = `rehabify-report-${String(result.report.referral.tracking_code || "referral").replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
    const response = new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": ctx.requestId,
        "X-Rehabify-Environment": partner.environment,
        ...(ctx.headers ?? {}),
      },
    });
    return logPartnerRequest(req, auth, response, { eventType: "api.report_pdf", trackingCode: result.report.referral.tracking_code });
  } catch (error) {
    return logPartnerRequest(req, auth, internalError(ctx, error), { eventType: "api.report_pdf", errorCode: "internal_error" });
  }
}
