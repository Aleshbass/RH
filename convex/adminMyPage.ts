/**
 * Admin › My page (owner 2026-11-17): the numbers behind the widgets each admin chose
 * (lib/adminWidgets.ts), and a quick contact search. Every admin can open My page; each widget is
 * only filled when the admin has its page (Admin › Admin access).
 */
import { ConvexError, v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getViewer } from "./helpers/partnerAccess";
import { adminAccessOf, type AdminAccess } from "./helpers/adminAccess";
import { buildJourneys, sessionTotals } from "./helpers/journeys";
import { openCareSignalCount } from "./careQueue";
import { isClinicSequence } from "./helpers/outreachShared";
import { ADMIN_WIDGETS, widgetAllowed, type AdminWidgetKey } from "../lib/adminWidgets";

const DAY_MS = 86_400_000;
const CAP = 100;

async function adminViewer(ctx: QueryCtx): Promise<{ user: Doc<"users">; access: AdminAccess } | null> {
  const user = (await getViewer(ctx))?.user ?? null;
  if (!user || user.role !== "admin") return null;
  return { user, access: await adminAccessOf(ctx, user._id) };
}

const count = async (rows: Promise<unknown[]>) => (await rows).length;
const lagosDay = (ms: number) => new Date(ms + 3_600_000).toISOString().slice(0, 10);

/** The chosen widgets' numbers (only those this admin may see). */
export const summary = query({
  args: { widgets: v.array(v.string()) },
  handler: async (ctx, args) => {
    const me = await adminViewer(ctx);
    if (!me) return null;
    const now = Date.now();
    const weekAgo = now - 7 * DAY_MS;
    const wanted = new Set(args.widgets);
    const can = (key: AdminWidgetKey) => {
      const w = ADMIN_WIDGETS.find((x) => x.key === key);
      return Boolean(w && wanted.has(key) && widgetAllowed(w, me.access));
    };
    const out: Record<string, unknown> = {};
    // Journeys feed two widgets; build once
    const journeys = can("sessions") || can("journeys") ? await buildJourneys(ctx, now) : null;

    if (can("sessions") && journeys) {
      const t = sessionTotals(journeys);
      out.sessions = { completed: t.completed, upcoming: t.upcoming, overdue: t.overdue, cancelled: t.cancelled, total: t.total };
    }
    if (can("journeys") && journeys) {
      out.journeys = {
        total: journeys.length,
        inTreatment: journeys.filter((j) => j.stage === "in_treatment").length,
        attention: journeys.filter((j) => j.attention.length > 0).length,
        unpaid: journeys.filter((j) => j.patientPaid === "unpaid" || j.patientPaid === "part").length,
        physioUnpaid: journeys.filter((j) => j.physioPaid === "pending" || j.physioPaid === "failed" || j.physioPaid === "held").length,
      };
    }
    if (can("signups") || can("clinicSignups")) {
      const recent = await ctx.db.query("users").order("desc").take(600);
      const week = recent.filter((u) => u._creationTime >= weekAgo && !u.deletedAt);
      if (can("signups")) {
        out.signups = {
          physios: week.filter((u) => u.role === "physiotherapist").length,
          patients: week.filter((u) => u.role === "patient").length,
          clinics: week.filter((u) => u.role === "clinic_owner").length,
          family: week.filter((u) => u.role === "family_member").length,
        };
      }
    }
    if (can("clinicSignups")) {
      const clinics = await ctx.db.query("clinics").order("desc").take(50);
      const newest = clinics.filter((c) => c._creationTime >= weekAgo).slice(0, 5);
      out.clinicSignups = {
        count: clinics.filter((c) => c._creationTime >= weekAgo).length,
        latest: await Promise.all(
          newest.map(async (c) => {
            const owner = await ctx.db.get(c.ownerId);
            return { id: c._id, name: c.name, owner: [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") || null, at: c._creationTime };
          })
        ),
      };
    }
    if (can("clinicPlans")) {
      const [active, pastDue, readOnly, open] = await Promise.all([
        ctx.db.query("clinicSubscriptions").withIndex("by_status", (q) => q.eq("status", "active")).take(500),
        ctx.db.query("clinicSubscriptions").withIndex("by_status", (q) => q.eq("status", "past_due")).take(200),
        ctx.db.query("clinicSubscriptions").withIndex("by_status", (q) => q.eq("status", "read_only")).take(200),
        ctx.db.query("clinicSubscriptionInvoices").withIndex("by_status", (q) => q.eq("status", "open")).take(500),
      ]);
      out.clinicPlans = {
        onPlan: active.length + pastDue.length + readOnly.length,
        pastDue: pastDue.length,
        readOnly: readOnly.length,
        owedKobo: open.reduce((s, inv) => s + inv.amountKobo, 0),
      };
    }
    if (can("outreach")) {
      const settings = await ctx.db.query("outreachSettings").first();
      const sentToday = await count(ctx.db.query("outreachMessages").withIndex("by_day", (q) => q.eq("day", lagosDay(now))).take(1000));
      // Clinic outreach only: employer outreach shares the inbox and the sender (emails sent today
      // is the shared daily count)
      const inbox = await ctx.db.query("outreachInbox").order("desc").take(200);
      const recent = inbox.filter((m) => m.kind === "reply" && m.receivedAt >= weekAgo);
      const replies: typeof recent = [];
      for (const m of recent) if ((await ctx.db.get(m.leadId))?.kind !== "employer") replies.push(m);
      const employerSequences = new Set(
        (await ctx.db.query("outreachSequences").take(200)).filter((q) => !isClinicSequence(q)).map((q) => q._id)
      );
      const activeRows = await ctx.db.query("outreachEnrollments").withIndex("by_status_next", (q) => q.eq("status", "active")).take(2000);
      const active = activeRows.filter((e) => !employerSequences.has(e.sequenceId)).length;
      out.outreach = {
        sendingOn: Boolean(settings?.sendingOn),
        sentToday,
        repliesThisWeek: replies.length,
        latestReply: replies[0] ? { from: replies[0].fromEmail ?? null, subject: replies[0].subject, at: replies[0].receivedAt } : null,
        inSequence: active,
      };
    }
    if (can("emails")) {
      const campaigns = await ctx.db.query("marketingCampaigns").withIndex("by_created").order("desc").take(3);
      out.emails = {
        latest: campaigns.map((c) => ({
          id: c._id,
          subject: (c as { subject?: string }).subject ?? (c as { name?: string }).name ?? "Campaign",
          status: c.status,
          sent: c.sentCount,
          opened: c.openedCount ?? null,
          at: c.sentAt ?? c.createdAt,
        })),
      };
    }
    if (can("inquiries")) out.inquiries = { count: await count(ctx.db.query("partnershipInquiries").withIndex("by_status", (q) => q.eq("status", "new")).take(CAP)) };
    if (can("approvals")) out.approvals = { count: await count(ctx.db.query("accountApprovalStatus").withIndex("by_status", (q) => q.eq("status", "pending_review")).take(CAP)) };
    if (can("careQueue")) out.careQueue = { count: await openCareSignalCount(ctx, CAP) };
    if (can("safety")) out.safety = { count: await count(ctx.db.query("safetyAlerts").withIndex("by_status", (q) => q.eq("status", "open")).take(CAP)) };
    if (can("reports")) {
      const [pending, review] = await Promise.all([
        count(ctx.db.query("physiotherapistReports").withIndex("by_status", (q) => q.eq("status", "pending")).take(CAP)),
        count(ctx.db.query("physiotherapistReports").withIndex("by_status", (q) => q.eq("status", "under_review")).take(CAP)),
      ]);
      out.reports = { count: pending + review };
    }
    if (can("accessApplications")) {
      const [submitted, review] = await Promise.all([
        count(ctx.db.query("assistedCareApplications").withIndex("by_status", (q) => q.eq("status", "submitted")).take(CAP)),
        count(ctx.db.query("assistedCareApplications").withIndex("by_status", (q) => q.eq("status", "under_review")).take(CAP)),
      ]);
      out.accessApplications = { count: submitted + review };
    }
    if (can("physioPro")) {
      const [active, scheduled, pastDue] = await Promise.all([
        count(ctx.db.query("physioSubscriptions").withIndex("by_status_end", (q) => q.eq("status", "active")).take(2000)),
        count(ctx.db.query("physioSubscriptions").withIndex("by_status_end", (q) => q.eq("status", "scheduled")).take(2000)),
        count(ctx.db.query("physioSubscriptions").withIndex("by_status_end", (q) => q.eq("status", "past_due")).take(2000)),
      ]);
      out.physioPro = { active, scheduled, pastDue };
    }
    if (can("payouts")) {
      const [pending, processing, failed] = await Promise.all([
        ctx.db.query("payouts").withIndex("by_status", (q) => q.eq("status", "pending")).take(1000),
        ctx.db.query("payouts").withIndex("by_status", (q) => q.eq("status", "processing")).take(500),
        ctx.db.query("payouts").withIndex("by_status", (q) => q.eq("status", "failed")).take(200),
      ]);
      const owed = [...pending, ...processing].filter((p) => p.type !== "platform_fee");
      out.payouts = { waiting: owed.length, waitingKobo: owed.reduce((s, p) => s + p.amount, 0), failed: failed.filter((p) => p.type !== "platform_fee").length };
    }
    if (can("refunds")) out.refunds = { count: await count(ctx.db.query("refundRequests").withIndex("by_status", (q) => q.eq("status", "pending")).take(CAP)) };
    if (can("bankTransfers")) {
      const pending = await ctx.db.query("marketplaceBookings").withIndex("by_payment_status", (q) => q.eq("paymentStatus", "pending")).order("desc").take(200);
      out.bankTransfers = { count: pending.filter((b) => b.physiotherapistId && b.bookingStatus !== "cancelled").length };
    }
    if (can("agreements")) out.agreements = { count: await count(ctx.db.query("agreementSignatures").withIndex("by_status", (q) => q.eq("status", "awaiting_countersign")).take(CAP)) };
    if (can("awadoc")) {
      const events = await ctx.db.query("awadocEventLog").withIndex("by_processed_at", (q) => q.gte("processedAt", now - DAY_MS)).take(500);
      const errors = events.filter((e) => e.status === "error");
      out.awadoc = { errors: errors.length, total: events.length, lastError: errors.length ? (errors[errors.length - 1].errorMessage ?? "Error").slice(0, 140) : null };
    }
    return out;
  },
});

/** Quick contact: physios and clinics by name, email or Rehabify ID, with how to reach them. */
export const contacts = query({
  args: { term: v.string() },
  handler: async (ctx, args) => {
    const me = await adminViewer(ctx);
    const widget = ADMIN_WIDGETS.find((w) => w.key === "contacts")!;
    if (!me) return [];
    if (!widgetAllowed(widget, me.access)) throw new ConvexError("You don't have access to people pages.");
    const term = args.term.trim().toLowerCase();
    if (term.length < 2) return [];
    const out: { kind: "physio" | "clinic"; id: string; name: string; detail: string | null; phone: string | null; email: string | null; href: string }[] = [];
    const physios = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "physiotherapist")).take(3000);
    for (const u of physios) {
      if (out.length >= 8) break;
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
      if (!`${name} ${u.email ?? ""} ${u.staffNumber ?? ""}`.toLowerCase().includes(term) || u.deletedAt) continue;
      out.push({ kind: "physio", id: u._id, name: name || u.email || "Physio", detail: u.staffNumber ?? null, phone: u.phoneNumber ?? null, email: u.email ?? null, href: `/dashboard/admin/users/${u._id}` });
    }
    const clinics = await ctx.db.query("clinics").order("desc").take(1000);
    for (const c of clinics) {
      if (out.length >= 12) break;
      if (!`${c.name} ${c.contactEmail ?? ""} ${c.clinicNumber ?? ""}`.toLowerCase().includes(term)) continue;
      const owner = await ctx.db.get(c.ownerId);
      out.push({
        kind: "clinic",
        id: c._id,
        name: c.name,
        detail: [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") || c.clinicNumber || null,
        phone: c.contactPhone ?? owner?.phoneNumber ?? null,
        email: c.contactEmail ?? owner?.email ?? null,
        href: `/dashboard/admin/clinics/${c._id}`,
      });
    }
    return out;
  },
});
