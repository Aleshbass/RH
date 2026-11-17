/**
 * Patient journeys (Mary, 17 Nov 2026): every physio's patient from booked → treatment started →
 * finished, and whether the patient paid and the physio was paid. One row per patient and physio.
 *
 *  - booked: an appointment or a website/Joy booking exists
 *  - started: at least one session marked completed
 *  - finished: the care episode was completed (discharged)
 *  - patient paid: invoices for the pair (or a paid booking); "none" when nothing was billed
 *  - physio paid: Rehabify payouts for the pair, or paid at once by the Paystack split
 *    (payoutRoute split_to_provider); "—" when there's nothing to pay out
 *
 * Reads the newest rows of each table (caps below), enough for the current size of the platform.
 */
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

const DAY_MS = 86_400_000;
const CAP = { appointments: 3000, invoices: 2000, payouts: 2000, episodes: 1500, bookings: 1500 };

export type JourneyStage = "booked" | "in_treatment" | "finished" | "cancelled";
export type PatientPaid = "paid" | "part" | "unpaid" | "none";
export type PhysioPaid = "paid" | "pending" | "failed" | "held" | "none";

export type Journey = {
  key: string;
  patientId: Id<"users">;
  physioId: Id<"users">;
  clinicId: Id<"clinics"> | null;
  bookedAt: number;
  stage: JourneyStage;
  sessions: { total: number; completed: number; upcoming: number; overdue: number; cancelled: number; noShow: number };
  firstCompletedAt: number | null;
  lastSessionAt: number | null;
  nextSessionAt: number | null;
  finishedAt: number | null;
  billedKobo: number;
  paidKobo: number;
  owedKobo: number;
  overdueInvoices: number;
  patientPaid: PatientPaid;
  physioPaid: PhysioPaid;
  physioPaidKobo: number;
  physioPendingKobo: number;
  /** Why this one needs a person (empty when all is well) */
  attention: string[];
  lastActivityAt: number;
};

type Draft = Omit<Journey, "stage" | "patientPaid" | "physioPaid" | "attention"> & {
  episodeStatus: Doc<"careEpisodes">["status"] | null;
  payoutStatuses: string[];
  splitPaid: boolean;
  bookingPaid: boolean;
};

export async function buildJourneys(ctx: QueryCtx, now: number): Promise<Journey[]> {
  const [appointments, invoices, payouts, episodes, bookings] = await Promise.all([
    ctx.db.query("appointments").order("desc").take(CAP.appointments),
    ctx.db.query("invoices").order("desc").take(CAP.invoices),
    ctx.db.query("payouts").order("desc").take(CAP.payouts),
    ctx.db.query("careEpisodes").order("desc").take(CAP.episodes),
    ctx.db.query("marketplaceBookings").order("desc").take(CAP.bookings),
  ]);
  const map = new Map<string, Draft>();
  const get = (patientId: Id<"users">, physioId: Id<"users">, at: number, clinicId?: Id<"clinics">) => {
    const key = `${patientId}|${physioId}`;
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        patientId,
        physioId,
        clinicId: clinicId ?? null,
        bookedAt: at,
        sessions: { total: 0, completed: 0, upcoming: 0, overdue: 0, cancelled: 0, noShow: 0 },
        firstCompletedAt: null,
        lastSessionAt: null,
        nextSessionAt: null,
        finishedAt: null,
        billedKobo: 0,
        paidKobo: 0,
        owedKobo: 0,
        overdueInvoices: 0,
        physioPaidKobo: 0,
        physioPendingKobo: 0,
        lastActivityAt: at,
        episodeStatus: null,
        payoutStatuses: [],
        splitPaid: false,
        bookingPaid: false,
      };
      map.set(key, row);
    }
    row.bookedAt = Math.min(row.bookedAt, at);
    row.lastActivityAt = Math.max(row.lastActivityAt, at);
    if (!row.clinicId && clinicId) row.clinicId = clinicId;
    return row;
  };

  for (const a of appointments) {
    if (!a.patientId || !a.physiotherapistId) continue;
    const row = get(a.patientId, a.physiotherapistId, a._creationTime, a.clinicId ?? undefined);
    row.sessions.total++;
    if (a.status === "completed") {
      row.sessions.completed++;
      row.firstCompletedAt = row.firstCompletedAt === null ? a.startTime : Math.min(row.firstCompletedAt, a.startTime);
      row.lastSessionAt = Math.max(row.lastSessionAt ?? 0, a.startTime);
    } else if (a.status === "scheduled" || a.status === "confirmed") {
      if (a.endTime < now) row.sessions.overdue++;
      else {
        row.sessions.upcoming++;
        row.nextSessionAt = row.nextSessionAt === null ? a.startTime : Math.min(row.nextSessionAt, a.startTime);
      }
    } else if (a.status === "no_show") row.sessions.noShow++;
    else row.sessions.cancelled++;
    row.lastActivityAt = Math.max(row.lastActivityAt, a.startTime <= now ? a.startTime : a._creationTime);
  }

  for (const b of bookings) {
    if (!b.physiotherapistId || b.bookingStatus === "cancelled") continue;
    const row = get(b.patientId, b.physiotherapistId, b.createdAt);
    if (b.paymentStatus === "completed" || b.paidAt) row.bookingPaid = true;
  }

  for (const e of episodes) {
    const row = get(e.patientId, e.physiotherapistId, e.startedAt, e.clinicId ?? undefined);
    // The newest episode decides (the list is newest first)
    if (row.episodeStatus === null) {
      row.episodeStatus = e.status;
      row.finishedAt = e.status === "completed" ? (e.completedAt ?? null) : null;
    }
  }

  for (const inv of invoices) {
    if (!inv.physiotherapistId || inv.status === "draft" || inv.status === "void") continue;
    const key = `${inv.patientId}|${inv.physiotherapistId}`;
    const row = map.get(key) ?? get(inv.patientId, inv.physiotherapistId, inv.issueDate, inv.clinicId ?? undefined);
    const total = inv.totalAmount;
    const paid = inv.status === "paid" ? Math.max(inv.paidAmount ?? total, total) : (inv.paidAmount ?? 0);
    row.billedKobo += total;
    row.paidKobo += Math.min(paid, total);
    row.owedKobo += Math.max(0, total - paid);
    if (inv.status !== "paid" && inv.dueDate < now) row.overdueInvoices++;
    if (inv.status === "paid" && inv.payoutRoute === "split_to_provider") row.splitPaid = true;
    row.lastActivityAt = Math.max(row.lastActivityAt, inv.paymentDate ?? inv.issueDate);
  }

  // Payouts name the recipient (physio or clinic owner); match them to the invoice's pair
  const invoicePair = new Map<string, string>();
  for (const inv of invoices) if (inv.physiotherapistId) invoicePair.set(inv._id, `${inv.patientId}|${inv.physiotherapistId}`);
  for (const p of payouts) {
    if (p.type === "platform_fee") continue;
    const key = invoicePair.get(p.invoiceId);
    const row = key ? map.get(key) : undefined;
    if (!row) continue;
    row.payoutStatuses.push(p.heldAt && !p.releasedAt ? "held" : p.status);
    if (p.status === "completed") row.physioPaidKobo += p.amount;
    else if (p.status !== "failed") row.physioPendingKobo += p.amount;
  }

  const out: Journey[] = [];
  for (const d of map.values()) {
    const stage: JourneyStage =
      d.episodeStatus === "completed"
        ? "finished"
        : d.sessions.completed > 0
          ? "in_treatment"
          : d.episodeStatus === "cancelled" || (d.sessions.total > 0 && d.sessions.total === d.sessions.cancelled + d.sessions.noShow)
            ? "cancelled"
            : "booked";
    const patientPaid: PatientPaid =
      d.billedKobo === 0 ? (d.bookingPaid ? "paid" : "none") : d.owedKobo === 0 ? "paid" : d.paidKobo > 0 ? "part" : "unpaid";
    const physioPaid: PhysioPaid = d.payoutStatuses.includes("failed")
      ? "failed"
      : d.payoutStatuses.includes("held")
        ? "held"
        : d.payoutStatuses.some((s) => s === "pending" || s === "processing")
          ? "pending"
          : d.payoutStatuses.length > 0 || d.splitPaid
            ? "paid"
            : "none";
    const attention: string[] = [];
    if (d.sessions.overdue > 0) attention.push(`${d.sessions.overdue} past session${d.sessions.overdue === 1 ? "" : "s"} not marked done`);
    if (d.overdueInvoices > 0) attention.push(`${d.overdueInvoices} unpaid invoice${d.overdueInvoices === 1 ? "" : "s"} past due`);
    if (stage === "finished" && (patientPaid === "unpaid" || patientPaid === "part")) attention.push("Finished but not fully paid");
    if (physioPaid === "failed") attention.push("Physio payout failed");
    if (physioPaid === "held") attention.push("Physio payout on hold");
    if (physioPaid === "pending" && d.lastSessionAt !== null && now - d.lastSessionAt > 7 * DAY_MS) attention.push("Physio not paid a week after the session");
    if (stage === "booked" && d.sessions.upcoming === 0 && d.sessions.overdue === 0 && now - d.bookedAt > 14 * DAY_MS) attention.push("Booked 2 weeks ago, no session since");
    const { episodeStatus: _e, payoutStatuses: _p, splitPaid: _s, bookingPaid: _b, ...rest } = d;
    out.push({ ...rest, stage, patientPaid, physioPaid, attention });
  }
  return out.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

/** Counts for the "Sessions" widget and the journeys page header. */
export function sessionTotals(journeys: Journey[]) {
  const t = { completed: 0, upcoming: 0, overdue: 0, cancelled: 0, noShow: 0, total: 0 };
  for (const j of journeys) {
    t.completed += j.sessions.completed;
    t.upcoming += j.sessions.upcoming;
    t.overdue += j.sessions.overdue;
    t.cancelled += j.sessions.cancelled;
    t.noShow += j.sessions.noShow;
    t.total += j.sessions.total;
  }
  return t;
}
