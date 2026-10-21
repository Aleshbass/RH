import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation, internalMutation, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { ensureUserRole } from "./auth";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Admin console backend: home overview, platform status, analytics, activity log,
 * announcements and transactions.
 *
 * Every function here is admin-only and every read is bounded. Counts stop at a cap and
 * say so (`capped: true`), so the UI shows "1000+" instead of a wrong exact number.
 * Nothing in this file is estimated or made up: if the platform doesn't record a
 * measurement, it isn't returned.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const ROLE_COUNT_CAP = 1000;
const TABLE_COUNT_CAP = 1000;
const REGISTRY_COUNT_CAP = 500;
const WINDOW_SCAN_CAP = 1000;
const SERIES_SCAN_CAP = 2500;
const QUEUE_CAP = 500;

type Counted = { count: number; capped: boolean };
type UserRoleValue = NonNullable<Doc<"users">["role"]>;

const PLATFORM_ROLES: UserRoleValue[] = [
  "patient",
  "physiotherapist",
  "clinic_owner",
  "clinic_staff",
  "doctor",
  "partner",
  "family_member",
  "admin",
];

function counted(rows: unknown[], cap: number): Counted {
  return { count: Math.min(rows.length, cap), capped: rows.length > cap };
}

function displayName(
  user: Pick<Doc<"users">, "firstName" | "lastName" | "email"> | null | undefined,
  fallback = "Unknown user"
) {
  if (!user) return fallback;
  return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || fallback;
}

/** The client's local midnight when it's plausible, otherwise UTC midnight. */
function resolveDayStart(requested: number | undefined, now: number) {
  if (requested !== undefined && Number.isFinite(requested) && requested <= now + HOUR && now - requested < 1.5 * DAY) {
    return requested;
  }
  return Math.floor(now / DAY) * DAY;
}

// ==== USERS BY ROLE ====

/** Accounts per role, read through the by_role index with a cap per role. */
export const getUserRoleCounts = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const entries = await Promise.all(
      [...PLATFORM_ROLES, undefined].map(async (role) => {
        const rows = await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", role))
          .take(ROLE_COUNT_CAP + 1);
        return [role ?? "unassigned", counted(rows, ROLE_COUNT_CAP)] as const;
      })
    );
    const byRole = Object.fromEntries(entries) as Record<UserRoleValue | "unassigned", Counted>;
    return {
      byRole,
      total: {
        count: entries.reduce((sum, [, c]) => sum + c.count, 0),
        capped: entries.some(([, c]) => c.capped),
      } satisfies Counted,
      cap: ROLE_COUNT_CAP,
    };
  },
});

// ==== HOME OVERVIEW ====

/**
 * Home page numbers that aren't queue badges (those come from adminConsole.getNavBadges):
 * clinics, registry size, unassigned referrals and a today-vs-yesterday comparison.
 * `todayStart` is the admin's local midnight so "today" matches their clock.
 */
export const getAdminDashboardStats = query({
  args: { todayStart: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const now = Date.now();
    const todayStart = resolveDayStart(args.todayStart, now);
    const yesterdayStart = todayStart - DAY;
    const tomorrowStart = todayStart + DAY;

    const [clinics, registry, receivedReferrals, legacyReferrals, recentUsers, sessions, recentBookings] =
      await Promise.all([
        ctx.db.query("clinics").take(TABLE_COUNT_CAP + 1),
        Promise.all(
          (["listed", "verified", "pending"] as const).map((status) =>
            ctx.db
              .query("physioRegistry")
              .withIndex("by_verification_status", (q) => q.eq("verificationStatus", status))
              .take(REGISTRY_COUNT_CAP + 1)
          )
        ),
        ctx.db
          .query("inboundReferrals")
          .withIndex("by_status", (q) => q.eq("status", "received"))
          .order("desc")
          .take(QUEUE_CAP + 1),
        ctx.db
          .query("inboundReferrals")
          .withIndex("by_status", (q) => q.eq("status", "pending"))
          .order("desc")
          .take(QUEUE_CAP + 1),
        ctx.db
          .query("users")
          .withIndex("by_creation_time", (q) => q.gte("_creationTime", yesterdayStart))
          .take(WINDOW_SCAN_CAP + 1),
        ctx.db
          .query("appointments")
          .withIndex("by_start_time", (q) => q.gte("startTime", yesterdayStart).lt("startTime", tomorrowStart))
          .take(WINDOW_SCAN_CAP + 1),
        ctx.db
          .query("marketplaceBookings")
          .withIndex("by_creation_time", (q) => q.gte("_creationTime", yesterdayStart))
          .take(WINDOW_SCAN_CAP + 1),
      ]);

    function split<T>(rows: T[], at: (row: T) => number, capped: boolean) {
      let today = 0;
      let yesterday = 0;
      for (const row of rows) {
        const t = at(row);
        if (t >= todayStart && t < tomorrowStart) today++;
        else if (t >= yesterdayStart && t < todayStart) yesterday++;
      }
      return { today, yesterday, capped };
    }

    const sessionsCapped = sessions.length > WINDOW_SCAN_CAP;
    const realSessions = sessions
      .slice(0, WINDOW_SCAN_CAP)
      .filter((a) => !a.isRecordOnly && a.status !== "cancelled_by_patient" && a.status !== "cancelled_by_therapist");

    const unassigned = [...receivedReferrals.slice(0, QUEUE_CAP), ...legacyReferrals.slice(0, QUEUE_CAP)].filter(
      (r) => !r.assignedClinicId && !r.assignedPhysiotherapistId && r.environment !== "sandbox"
    );

    return {
      dayStart: todayStart,
      clinics: counted(clinics, TABLE_COUNT_CAP),
      registryListed: {
        count: registry.reduce((sum, rows) => sum + Math.min(rows.length, REGISTRY_COUNT_CAP), 0),
        capped: registry.some((rows) => rows.length > REGISTRY_COUNT_CAP),
      } satisfies Counted,
      unassignedReferrals: {
        count: unassigned.length,
        capped: receivedReferrals.length > QUEUE_CAP || legacyReferrals.length > QUEUE_CAP,
      } satisfies Counted,
      today: {
        sessions: split(realSessions, (a) => a.startTime, sessionsCapped),
        completedSessions: split(
          realSessions.filter((a) => a.status === "completed"),
          (a) => a.startTime,
          sessionsCapped
        ),
        signups: split(recentUsers.slice(0, WINDOW_SCAN_CAP), (u) => u._creationTime, recentUsers.length > WINDOW_SCAN_CAP),
        bookings: split(
          recentBookings.slice(0, WINDOW_SCAN_CAP),
          (b) => b._creationTime,
          recentBookings.length > WINDOW_SCAN_CAP
        ),
      },
    };
  },
});

// ==== PLATFORM STATUS ====

type HealthStatus = "ok" | "warning" | "error" | "idle";
type HealthCheck = {
  key: string;
  label: string;
  status: HealthStatus;
  value: string;
  detail: string;
  /** Timestamp the detail refers to (e.g. last webhook), formatted by the client. */
  at?: number;
  href?: string;
};

const STATUS_RANK: Record<HealthStatus, number> = { idle: 0, ok: 1, warning: 2, error: 3 };

function fmtCount(rows: unknown[], cap: number) {
  return rows.length > cap ? `${cap}+` : String(rows.length);
}

/**
 * Background delivery and error signals the platform actually records: retry queues,
 * failed notifications, partner/AwaDoc webhooks, the Joy outbox and error logs.
 * There is deliberately no uptime, CPU or latency figure; Convex doesn't expose them here.
 */
export const getSystemHealth = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);

    const now = Date.now();
    const dayAgo = now - DAY;
    const weekAgo = now - WEEK;
    const overdueBefore = now - 15 * 60 * 1000;

    const [
      retryPending,
      retryOverdue,
      retryFailed,
      emailOverdue,
      emailFailed,
      failedNotifications,
      webhookFailed,
      webhookPending,
      awadocRecent,
      joyFailed,
      joyDead,
      errorLogs,
      apiErrors,
      systemErrors,
    ] = await Promise.all([
      ctx.db
        .query("notificationRetryQueue")
        .withIndex("by_status_and_next_retry", (q) => q.eq("status", "pending"))
        .take(QUEUE_CAP + 1),
      ctx.db
        .query("notificationRetryQueue")
        .withIndex("by_status_and_next_retry", (q) => q.eq("status", "pending").lt("nextRetryAt", overdueBefore))
        .take(QUEUE_CAP + 1),
      ctx.db
        .query("notificationRetryQueue")
        .withIndex("by_status_and_next_retry", (q) => q.eq("status", "failed"))
        .order("desc")
        .take(QUEUE_CAP + 1),
      ctx.db
        .query("emailRetryQueue")
        .withIndex("by_status_and_next_retry", (q) => q.eq("status", "pending").lt("nextRetryAt", overdueBefore))
        .take(QUEUE_CAP + 1),
      ctx.db
        .query("emailRetryQueue")
        .withIndex("by_status_and_next_retry", (q) => q.eq("status", "failed"))
        .order("desc")
        .take(QUEUE_CAP + 1),
      ctx.db
        .query("notifications")
        .withIndex("by_status", (q) => q.eq("status", "failed"))
        .order("desc")
        .take(QUEUE_CAP + 1),
      ctx.db
        .query("partnerWebhookDeliveries")
        .withIndex("by_status_next_attempt", (q) => q.eq("status", "failed"))
        .order("desc")
        .take(QUEUE_CAP + 1),
      ctx.db
        .query("partnerWebhookDeliveries")
        .withIndex("by_status_next_attempt", (q) => q.eq("status", "pending"))
        .take(QUEUE_CAP + 1),
      ctx.db.query("awadocEventLog").withIndex("by_processed_at").order("desc").take(100),
      ctx.db
        .query("joyEventOutbox")
        .withIndex("by_status", (q) => q.eq("status", "failed"))
        .take(QUEUE_CAP + 1),
      ctx.db
        .query("joyEventOutbox")
        .withIndex("by_status", (q) => q.eq("status", "dead_letter"))
        .take(QUEUE_CAP + 1),
      ctx.db
        .query("systemLogs")
        .withIndex("by_type", (q) => q.eq("type", "error").gte("_creationTime", dayAgo))
        .take(QUEUE_CAP + 1),
      ctx.db
        .query("analytics_events")
        .withIndex("by_type_and_timestamp", (q) => q.eq("type", "api_error").gte("timestamp", dayAgo))
        .take(QUEUE_CAP + 1),
      ctx.db
        .query("analytics_events")
        .withIndex("by_type_and_timestamp", (q) => q.eq("type", "system_error").gte("timestamp", dayAgo))
        .take(QUEUE_CAP + 1),
    ]);

    const checks: HealthCheck[] = [];

    // 1. Notification retry queue
    {
      const failed7d = retryFailed.filter((r) => r.createdAt >= weekAgo);
      const overdue = retryOverdue.length;
      const status: HealthStatus =
        overdue >= 50 ? "error" : overdue > 0 || failed7d.length > 0 ? "warning" : "ok";
      const parts: string[] = [];
      if (overdue > 0) parts.push(`${fmtCount(retryOverdue, QUEUE_CAP)} overdue by 15+ min (the retry job may be stuck)`);
      if (failed7d.length > 0) parts.push(`${fmtCount(failed7d, QUEUE_CAP)} gave up in the last 7 days`);
      checks.push({
        key: "notificationRetries",
        label: "Notification retries",
        status,
        value: `${fmtCount(retryPending, QUEUE_CAP)} waiting`,
        detail: parts.length ? parts.join(" · ") : "Retries are running on schedule",
      });
    }

    // 2. Failed in-app notifications
    {
      const recent = failedNotifications.filter((n) => (n.failedAt ?? n.updatedAt ?? n.createdAt) >= dayAgo);
      checks.push({
        key: "failedNotifications",
        label: "Failed notifications (24h)",
        status: recent.length >= 25 ? "error" : recent.length > 0 ? "warning" : "ok",
        value: fmtCount(recent, QUEUE_CAP),
        detail: recent.length > 0 ? "Notifications marked failed in the last 24 hours" : "No delivery failures in the last 24 hours",
      });
    }

    // 3. Email retries
    {
      const failed7d = emailFailed.filter((r) => r.createdAt >= weekAgo);
      const parts: string[] = [];
      if (emailOverdue.length > 0) parts.push(`${fmtCount(emailOverdue, QUEUE_CAP)} overdue`);
      if (failed7d.length > 0) parts.push(`${fmtCount(failed7d, QUEUE_CAP)} gave up in the last 7 days`);
      checks.push({
        key: "emailRetries",
        label: "Email retries",
        status: emailOverdue.length >= 50 ? "error" : parts.length ? "warning" : "ok",
        value: parts.length ? `${emailOverdue.length + failed7d.length} need attention` : "Clear",
        detail: parts.length ? parts.join(" · ") : "No overdue or failed email retries",
      });
    }

    // 4. Partner webhooks
    {
      const failed7d = webhookFailed.filter((d) => d.updatedAt >= weekAgo);
      const overdue = webhookPending.filter((d) => (d.nextAttemptAt ?? d.createdAt) < now - 10 * 60 * 1000);
      const parts: string[] = [];
      if (overdue.length > 0) parts.push(`${fmtCount(overdue, QUEUE_CAP)} deliveries overdue`);
      if (failed7d.length > 0) parts.push(`${fmtCount(failed7d, QUEUE_CAP)} failed in the last 7 days`);
      checks.push({
        key: "partnerWebhooks",
        label: "Partner webhooks",
        status: overdue.length >= 25 ? "error" : parts.length ? "warning" : "ok",
        value: `${fmtCount(webhookPending, QUEUE_CAP)} queued`,
        detail: parts.length ? parts.join(" · ") : "Deliveries are going out",
        href: "/dashboard/admin/partnerships",
      });
    }

    // 5. AwaDoc webhooks
    {
      const last = awadocRecent[0];
      const errors24h = awadocRecent.filter((e) => e.status === "error" && e.processedAt >= dayAgo);
      checks.push({
        key: "awadoc",
        label: "AwaDoc webhooks",
        status: !last ? "idle" : errors24h.length >= 10 ? "error" : errors24h.length > 0 ? "warning" : "ok",
        value: !last ? "No events" : errors24h.length > 0 ? `${errors24h.length} errors (24h)` : "No errors (24h)",
        detail: !last
          ? "No AwaDoc events recorded yet"
          : `Last event: ${last.eventType} (${last.direction}, ${last.status})`,
        at: last?.processedAt,
        href: "/dashboard/admin/awadoc",
      });
    }

    // 6. Joy event outbox
    {
      const parts: string[] = [];
      if (joyDead.length > 0) parts.push(`${fmtCount(joyDead, QUEUE_CAP)} dead-lettered`);
      if (joyFailed.length > 0) parts.push(`${fmtCount(joyFailed, QUEUE_CAP)} retrying`);
      checks.push({
        key: "joyOutbox",
        label: "Joy event outbox",
        status: joyDead.length > 0 ? "error" : joyFailed.length >= 10 ? "warning" : "ok",
        value: parts.length ? parts.join(", ") : "Clear",
        detail: joyDead.length > 0 ? "Events that ran out of retries need manual repair" : "No stuck events",
      });
    }

    // 7. Error logs
    {
      const total = errorLogs.length + apiErrors.length + systemErrors.length;
      const capped = errorLogs.length > QUEUE_CAP || apiErrors.length > QUEUE_CAP || systemErrors.length > QUEUE_CAP;
      checks.push({
        key: "errorLogs",
        label: "Error logs (24h)",
        status: total >= 50 ? "error" : total > 0 ? "warning" : "ok",
        value: capped ? `${total}+` : String(total),
        detail: total > 0 ? "Errors written to systemLogs and analytics events" : "No errors logged in the last 24 hours",
      });
    }

    const worst = checks.reduce<HealthStatus>(
      (acc, c) => (STATUS_RANK[c.status] > STATUS_RANK[acc] ? c.status : acc),
      "ok"
    );

    return { status: worst, checkedAt: now, checks };
  },
});

// ==== ANALYTICS ====

function monthWindow(months: number) {
  const now = new Date();
  const starts: number[] = [];
  for (let i = months - 1; i >= 0; i--) starts.push(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
  return { starts, rangeStart: starts[0], rangeEnd: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) };
}

function monthKey(ts: number) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function safeMonths(requested: number | undefined) {
  return requested === 3 || requested === 12 ? requested : 6;
}

/** Monday 00:00 UTC of the week containing `ts`. */
function startOfUtcWeek(ts: number) {
  const day = Math.floor(ts / DAY) * DAY;
  const weekday = (new Date(day).getUTCDay() + 6) % 7; // Monday = 0
  return day - weekday * DAY;
}

const SIGNUP_GROUPS = ["patient", "physiotherapist", "clinic", "other"] as const;
type SignupGroup = (typeof SIGNUP_GROUPS)[number];

function signupGroup(role: Doc<"users">["role"]): SignupGroup {
  if (role === "patient") return "patient";
  if (role === "physiotherapist") return "physiotherapist";
  if (role === "clinic_owner" || role === "clinic_staff") return "clinic";
  return "other";
}

/** New accounts per month (by role group) and per week for the last 12 weeks. */
export const getPlatformAnalytics = query({
  args: { months: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const months = safeMonths(args.months);
    const { starts, rangeStart } = monthWindow(months);
    const WEEKS = 12;
    const thisWeek = startOfUtcWeek(Date.now());
    const weekStarts = Array.from({ length: WEEKS }, (_, i) => thisWeek - (WEEKS - 1 - i) * WEEK);
    const scanStart = Math.min(rangeStart, weekStarts[0]);

    // Newest first, so if the cap is hit it's the oldest buckets that are incomplete
    const users = await ctx.db
      .query("users")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", scanStart))
      .order("desc")
      .take(SERIES_SCAN_CAP + 1);
    const capped = users.length > SERIES_SCAN_CAP;
    const rows = users.slice(0, SERIES_SCAN_CAP);

    const byMonth = new Map(
      starts.map((s) => [monthKey(s), { patient: 0, physiotherapist: 0, clinic: 0, other: 0, total: 0 }])
    );
    const byWeek = new Map(weekStarts.map((s) => [s, 0]));
    for (const u of rows) {
      const bucket = byMonth.get(monthKey(u._creationTime));
      if (bucket && u._creationTime >= rangeStart) {
        bucket[signupGroup(u.role)]++;
        bucket.total++;
      }
      const week = startOfUtcWeek(u._creationTime);
      if (byWeek.has(week)) byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
    }

    return {
      months,
      capped,
      cap: SERIES_SCAN_CAP,
      signupsByMonth: starts.map((s) => ({ month: monthKey(s), monthStart: s, ...byMonth.get(monthKey(s))! })),
      signupsByWeek: weekStarts.map((s) => ({ weekStart: s, signups: byWeek.get(s) ?? 0 })),
    };
  },
});

/** Appointments per month by their scheduled date, split by outcome. */
export const getAppointmentAnalytics = query({
  args: { months: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const months = safeMonths(args.months);
    const { starts, rangeStart, rangeEnd } = monthWindow(months);
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_start_time", (q) => q.gte("startTime", rangeStart).lt("startTime", rangeEnd))
      .order("desc")
      .take(SERIES_SCAN_CAP + 1);
    const capped = appointments.length > SERIES_SCAN_CAP;

    const byMonth = new Map(
      starts.map((s) => [monthKey(s), { total: 0, completed: 0, cancelled: 0, noShow: 0, upcoming: 0 }])
    );
    for (const a of appointments.slice(0, SERIES_SCAN_CAP)) {
      if (a.isRecordOnly) continue;
      const bucket = byMonth.get(monthKey(a.startTime));
      if (!bucket) continue;
      bucket.total++;
      if (a.status === "completed") bucket.completed++;
      else if (a.status === "cancelled_by_patient" || a.status === "cancelled_by_therapist") bucket.cancelled++;
      else if (a.status === "no_show") bucket.noShow++;
      else bucket.upcoming++;
    }

    return {
      months,
      capped,
      cap: SERIES_SCAN_CAP,
      appointmentsByMonth: starts.map((s) => ({ month: monthKey(s), monthStart: s, ...byMonth.get(monthKey(s))! })),
    };
  },
});

/**
 * Paid invoice volume and platform fees per month (amounts in kobo), plus marketplace
 * bookings made per month. Marketplace payments also create invoices, so revenue is
 * counted once, from invoices.
 */
export const getRevenueAnalytics = query({
  args: { months: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const months = safeMonths(args.months);
    const { starts, rangeStart, rangeEnd } = monthWindow(months);

    const [invoices, bookings] = await Promise.all([
      // Invoices paid in the window can be issued a little before it
      ctx.db
        .query("invoices")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", rangeStart - 31 * DAY))
        .order("desc")
        .take(SERIES_SCAN_CAP + 1),
      ctx.db
        .query("marketplaceBookings")
        .withIndex("by_creation_time", (q) => q.gte("_creationTime", rangeStart))
        .order("desc")
        .take(SERIES_SCAN_CAP + 1),
    ]);

    const revenue = new Map(starts.map((s) => [monthKey(s), { grossKobo: 0, platformFeeKobo: 0, paidInvoices: 0 }]));
    for (const inv of invoices.slice(0, SERIES_SCAN_CAP)) {
      if (inv.status !== "paid") continue;
      const paidAt = inv.paymentDate ?? inv.issueDate;
      if (paidAt < rangeStart || paidAt >= rangeEnd) continue;
      const bucket = revenue.get(monthKey(paidAt));
      if (!bucket) continue;
      bucket.grossKobo += inv.totalAmount || 0;
      bucket.platformFeeKobo += inv.platformFeeAmount || 0;
      bucket.paidInvoices++;
    }

    const bookingMonths = new Map(starts.map((s) => [monthKey(s), { created: 0, paid: 0, cancelled: 0 }]));
    for (const b of bookings.slice(0, SERIES_SCAN_CAP)) {
      const bucket = bookingMonths.get(monthKey(b._creationTime));
      if (!bucket) continue;
      bucket.created++;
      if (b.paymentStatus === "completed") bucket.paid++;
      if (b.bookingStatus === "cancelled") bucket.cancelled++;
    }

    return {
      months,
      cap: SERIES_SCAN_CAP,
      invoicesCapped: invoices.length > SERIES_SCAN_CAP,
      bookingsCapped: bookings.length > SERIES_SCAN_CAP,
      revenueByMonth: starts.map((s) => ({ month: monthKey(s), monthStart: s, ...revenue.get(monthKey(s))! })),
      bookingsByMonth: starts.map((s) => ({ month: monthKey(s), monthStart: s, ...bookingMonths.get(monthKey(s))! })),
    };
  },
});

// ==== ACTIVITY & AUDIT LOG ====
// Source: analytics_events. Event types are grouped into categories so the activity page
// can filter through the by_type_and_timestamp index instead of scanning.

const ACTIVITY_CATEGORIES = {
  security: ["user_login", "user_logout", "failed_authentication", "role_changed", "permission_updated"],
  admin: ["admin_settings_updated", "admin_announcement_sent"],
  account: [
    "user_signup",
    "user_settings_update",
    "patient_created",
    "patient_updated",
    "patient_archived",
    "profile_view",
  ],
  appointments: [
    "appointment_created",
    "appointment_updated",
    "appointment_cancelled",
    "appointment_completed",
    "treatment_started",
    "treatment_updated",
    "treatment_completed",
  ],
  payments: ["payment_initialized", "payment_completed", "payment_failed", "balance_updated"],
  notifications: [
    "notification_created",
    "notification_sent",
    "notification_delivered",
    "notification_read",
    "notification_failed",
  ],
  errors: ["api_error", "system_error"],
} as const;

type ActivityCategory = keyof typeof ACTIVITY_CATEGORIES | "other";

const CATEGORY_BY_TYPE = new Map<string, ActivityCategory>(
  (Object.entries(ACTIVITY_CATEGORIES) as [ActivityCategory, readonly string[]][]).flatMap(([category, types]) =>
    types.map((t) => [t, category] as const)
  )
);

const activityCategoryValidator = v.union(
  v.literal("all"),
  v.literal("security"),
  v.literal("admin"),
  v.literal("account"),
  v.literal("appointments"),
  v.literal("payments"),
  v.literal("notifications"),
  v.literal("errors")
);

const ACTIVITY_LABELS: Record<string, string> = {
  admin_settings_updated: "Platform settings changed",
  admin_announcement_sent: "Announcement sent",
  failed_authentication: "Failed sign-in",
  user_login: "Signed in",
  user_logout: "Signed out",
};

function activityLabel(type: string) {
  return ACTIVITY_LABELS[type] ?? type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** A one-line, human-readable summary of an event's metadata. */
function describeEvent(event: Doc<"analytics_events">): string {
  const details = event.metadata?.details as Record<string, unknown> | undefined;
  if (event.type === "admin_settings_updated" && Array.isArray(details?.changes)) {
    return (details.changes as { field: string; from: unknown; to: unknown }[])
      .map((c) => `${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`)
      .join(", ")
      .slice(0, 240);
  }
  if (event.type === "admin_announcement_sent" && details) {
    const roles = Array.isArray(details.targetRoles) ? (details.targetRoles as string[]).join(", ") : "";
    return `"${String(details.title ?? "")}"${roles ? ` to ${roles}` : ""}`.slice(0, 240);
  }
  const parts: string[] = [];
  if (event.metadata?.error) parts.push(String(event.metadata.error));
  if (event.metadata?.path) parts.push(String(event.metadata.path));
  if (details && typeof details === "object") {
    for (const [key, value] of Object.entries(details)) {
      if (value === null || value === undefined || typeof value === "object") continue;
      parts.push(`${key}: ${String(value)}`);
      if (parts.length >= 4) break;
    }
  }
  return parts.join(" · ").slice(0, 240);
}

const MAX_ACTIVITY_LIMIT = 1000;

/**
 * The activity & audit log. Newest first, within `sinceMs`, optionally one category.
 * "Load more" works by raising `limit` (capped at 1000); the query stays live.
 */
export const getUserActivityLogs = query({
  args: {
    limit: v.optional(v.number()),
    sinceMs: v.optional(v.number()),
    category: v.optional(activityCategoryValidator),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const limit = Math.min(Math.max(1, Math.floor(args.limit ?? 50) || 50), MAX_ACTIVITY_LIMIT);
    const since = args.sinceMs ?? 0;
    const category = args.category ?? "all";

    let events: Doc<"analytics_events">[];
    if (category === "all") {
      events = await ctx.db
        .query("analytics_events")
        .withIndex("by_timestamp", (q) => q.gte("timestamp", since))
        .order("desc")
        .take(limit + 1);
    } else {
      const perType = await Promise.all(
        (ACTIVITY_CATEGORIES[category] as readonly string[]).map((type) =>
          ctx.db
            .query("analytics_events")
            .withIndex("by_type_and_timestamp", (q) => q.eq("type", type).gte("timestamp", since))
            .order("desc")
            .take(limit + 1)
        )
      );
      events = perType.flat().sort((a, b) => b.timestamp - a.timestamp);
    }

    const hasMore = events.length > limit;
    const page = events.slice(0, limit);

    const userCache = new Map<Id<"users">, Doc<"users"> | null>();
    const getUser = async (id: Id<"users">) => {
      if (!userCache.has(id)) userCache.set(id, await ctx.db.get(id));
      return userCache.get(id) ?? null;
    };

    const items = await Promise.all(
      page.map(async (event) => {
        const user = event.userId ? await getUser(event.userId) : null;
        return {
          _id: event._id,
          type: event.type,
          category: CATEGORY_BY_TYPE.get(event.type) ?? ("other" as ActivityCategory),
          activity: activityLabel(event.type),
          summary: describeEvent(event),
          status: event.metadata?.status ?? null,
          userId: event.userId ?? null,
          userName: event.userId ? displayName(user, "Deleted user") : "System",
          userRole: user?.role ?? (event.userId ? "unknown" : "system"),
          userEmail: user?.email ?? null,
          timestamp: event.timestamp,
        };
      })
    );

    return { items, hasMore, limit };
  },
});

const SECURITY_SUMMARY = [
  { key: "signIns", label: "Sign-ins", types: ["user_login"] },
  { key: "failedSignIns", label: "Failed sign-ins", types: ["failed_authentication"] },
  { key: "roleChanges", label: "Role & permission changes", types: ["role_changed", "permission_updated"] },
  { key: "adminChanges", label: "Admin actions", types: ["admin_settings_updated", "admin_announcement_sent"] },
] as const;

/**
 * Security-relevant counts for the activity page header. `tracked: false` means the app
 * has never recorded that kind of event, so the UI says "Not recorded" instead of 0.
 */
export const getSecurityEvents = query({
  args: { sinceMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const since = args.sinceMs ?? Date.now() - DAY;

    return Promise.all(
      SECURITY_SUMMARY.map(async (group) => {
        const [inWindow, ever] = await Promise.all([
          Promise.all(
            (group.types as readonly string[]).map((type) =>
              ctx.db
                .query("analytics_events")
                .withIndex("by_type_and_timestamp", (q) => q.eq("type", type).gte("timestamp", since))
                .take(QUEUE_CAP + 1)
            )
          ),
          Promise.all(
            (group.types as readonly string[]).map((type) =>
              ctx.db
                .query("analytics_events")
                .withIndex("by_type", (q) => q.eq("type", type))
                .first()
            )
          ),
        ]);
        const total = inWindow.reduce((sum, rows) => sum + Math.min(rows.length, QUEUE_CAP), 0);
        return {
          key: group.key,
          label: group.label,
          count: total,
          capped: inWindow.some((rows) => rows.length > QUEUE_CAP),
          tracked: ever.some((row) => row !== null),
        };
      })
    );
  },
});

// ==== ANNOUNCEMENTS ====

const ANNOUNCEMENT_ROLES = ["patient", "physiotherapist", "clinic_owner", "clinic_staff", "doctor", "partner", "admin"] as const;
const ANNOUNCEMENT_BATCH_SIZE = 200;
const MAX_ANNOUNCEMENT_TITLE = 120;
const MAX_ANNOUNCEMENT_MESSAGE = 1000;

/** Announcements sent from the admin console, newest first. */
export const getAnnouncements = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);
    const limit = Math.min(Math.max(1, Math.floor(args.limit ?? 20) || 20), 100);
    const rows = await ctx.db
      .query("platformAnnouncements")
      .withIndex("by_created_at")
      .order("desc")
      .take(limit + 1);
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  },
});

/**
 * Record an announcement and start delivering it. Delivery runs in background batches of
 * 200 users per role (deliverAnnouncementBatch), so it never hits mutation limits. Users get
 * an in-app notification; no email or push is sent.
 */
export const broadcastAnnouncement = mutation({
  args: {
    title: v.string(),
    message: v.string(),
    targetRoles: v.array(v.string()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
  },
  handler: async (ctx, args): Promise<{ announcementId: Id<"platformAnnouncements"> }> => {
    const admin = await ensureUserRole(ctx, ["admin"]);

    const title = args.title.trim();
    const message = args.message.trim();
    if (!title || !message) throw new ConvexError("Add a title and a message.");
    if (title.length > MAX_ANNOUNCEMENT_TITLE) throw new ConvexError(`Keep the title under ${MAX_ANNOUNCEMENT_TITLE} characters.`);
    if (message.length > MAX_ANNOUNCEMENT_MESSAGE) {
      throw new ConvexError(`Keep the message under ${MAX_ANNOUNCEMENT_MESSAGE} characters.`);
    }
    const targetRoles = [...new Set(args.targetRoles)];
    if (targetRoles.length === 0) throw new ConvexError("Choose at least one audience.");
    const unknown = targetRoles.filter((r) => !(ANNOUNCEMENT_ROLES as readonly string[]).includes(r));
    if (unknown.length) throw new ConvexError(`Unknown audience: ${unknown.join(", ")}`);

    const now = Date.now();
    const priority = args.priority ?? "medium";
    const createdByName = displayName(admin, "Admin");
    const announcementId = await ctx.db.insert("platformAnnouncements", {
      title,
      message,
      priority,
      targetRoles,
      status: "sending",
      recipientCount: 0,
      createdBy: admin._id,
      createdByName,
      createdAt: now,
    });

    await ctx.db.insert("analytics_events", {
      type: "admin_announcement_sent",
      userId: admin._id,
      timestamp: now,
      metadata: {
        status: "success",
        details: { announcementId, title, targetRoles, priority },
      },
    });

    await ctx.scheduler.runAfter(0, internal.admin.deliverAnnouncementBatch, {
      announcementId,
      roleIndex: 0,
      cursor: null,
    });

    return { announcementId };
  },
});

/** One delivery batch: notify up to 200 users of one role, then schedule the next batch. */
export const deliverAnnouncementBatch = internalMutation({
  args: {
    announcementId: v.id("platformAnnouncements"),
    roleIndex: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement || announcement.status !== "sending") return null;

    const role = announcement.targetRoles[args.roleIndex] as UserRoleValue | undefined;
    if (role === undefined) {
      await ctx.db.patch(args.announcementId, { status: "sent", completedAt: Date.now() });
      return null;
    }

    const result = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", role))
      .paginate({ numItems: ANNOUNCEMENT_BATCH_SIZE, cursor: args.cursor });

    const now = Date.now();
    let delivered = 0;
    for (const user of result.page) {
      if (user.status === "suspended" || user.status === "terminated") continue;
      await ctx.db.insert("notifications", {
        userId: user._id,
        type: "announcement",
        priority: announcement.priority,
        status: "pending",
        payload: {
          title: announcement.title,
          body: announcement.message,
          data: { entityType: "announcement", entityId: args.announcementId },
        },
        createdAt: now,
      });
      delivered++;
    }

    await ctx.db.patch(args.announcementId, { recipientCount: announcement.recipientCount + delivered });

    await ctx.scheduler.runAfter(
      0,
      internal.admin.deliverAnnouncementBatch,
      result.isDone
        ? { announcementId: args.announcementId, roleIndex: args.roleIndex + 1, cursor: null }
        : { announcementId: args.announcementId, roleIndex: args.roleIndex, cursor: result.continueCursor }
    );
    return null;
  },
});

// ==== TRANSACTIONS ====

const invoiceStatusValidator = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("paid"),
  v.literal("overdue"),
  v.literal("void"),
  v.literal("partial_payment"),
  v.literal("failed")
);

/**
 * Invoices (marketplace and clinic), newest first, one page at a time, with patient,
 * physiotherapist and linked-booking details. Use with usePaginatedQuery.
 */
export const getMarketplaceTransactions = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(invoiceStatusValidator),
  },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    let invoicesQuery = ctx.db.query("invoices").order("desc");
    const status = args.status;
    if (status) invoicesQuery = invoicesQuery.filter((q) => q.eq(q.field("status"), status));
    const result = await invoicesQuery.paginate(args.paginationOpts);

    const profileCache = new Map<Id<"users">, Doc<"physiotherapistProfiles"> | null>();

    const page = await Promise.all(
      result.page.map(async (invoice) => {
        const [patient, physio, linkedBooking] = await Promise.all([
          ctx.db.get(invoice.patientId),
          invoice.physiotherapistId ? ctx.db.get(invoice.physiotherapistId) : Promise.resolve(null),
          invoice.paymentReference
            ? ctx.db
                .query("marketplaceBookings")
                .withIndex("by_payment_reference", (q) => q.eq("paymentReference", invoice.paymentReference!))
                .first()
            : Promise.resolve(null),
        ]);

        let physioProfile: Doc<"physiotherapistProfiles"> | null = null;
        if (physio) {
          if (!profileCache.has(physio._id)) {
            profileCache.set(
              physio._id,
              await ctx.db
                .query("physiotherapistProfiles")
                .withIndex("by_user_id", (q) => q.eq("userId", physio._id))
                .first()
            );
          }
          physioProfile = profileCache.get(physio._id) ?? null;
        }

        return {
          _id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          isMarketplace: Boolean(linkedBooking),
          isGuest: Boolean(linkedBooking?.isGuestBooking),
          // Finance shows the patient's Rehabify ID, never their name or contact details.
          // Admins follow up by opening the patient's user page.
          patientUserId: patient?._id ?? null,
          patientNumber: patient?.patientNumber ?? null,
          physiotherapistName: physio ? displayName(physio, "Unknown") : "Unknown",
          physiotherapistEmail: physio?.email || "",
          physioLocation: physioProfile?.location || "",
          physioOffersOnline: physioProfile?.offersOnlineSessions ?? false,
          physioOffersInPerson: physioProfile?.offersInPersonSessions ?? false,
          subtotalAmount: invoice.subtotalAmount || 0,
          platformFeeAmount: invoice.platformFeeAmount || 0,
          paystackFeeAmount: invoice.paystackFeeAmount || 0,
          totalAmount: invoice.totalAmount || 0,
          physiotherapistShare: invoice.physiotherapistShare || 0,
          currency: invoice.currency || "NGN",
          status: invoice.status,
          paymentMethod: invoice.paymentMethod || "",
          paymentReference: invoice.paymentReference || "",
          paymentDate: invoice.paymentDate ?? null,
          issueDate: invoice.issueDate,
        };
      })
    );

    return { ...result, page };
  },
});

// ==== ADMIN USER DETAIL VIEW ====

/**
 * Get full details of a user including their physiotherapist profile,
 * patient relationships, appointment stats, and documents.
 * Admin-only access.
 */
export const getAdminUserDetails = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ensureUserRole(ctx, ["admin"]);

    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }

    // Get physiotherapist profile if the user is a physiotherapist
    let physioProfile = null;
    if (user.role === "physiotherapist" && user.physiotherapistProfileId) {
      physioProfile = await ctx.db.get(user.physiotherapistProfileId);
    }
    // Fallback: query by userId if the link is missing
    if (user.role === "physiotherapist" && !physioProfile) {
      physioProfile = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .unique();
    }

    // Get patient profile if the user is a patient
    let patientProfile = null;
    if (user.role === "patient" && user.patientProfileId) {
      patientProfile = await ctx.db.get(user.patientProfileId);
    }

    // Get clinic info if linked
    let clinic = null;
    if (user.clinicId) {
      clinic = await ctx.db.get(user.clinicId);
    }
    // Also check physio profile's clinicId
    if (!clinic && physioProfile?.clinicId) {
      clinic = await ctx.db.get(physioProfile.clinicId);
    }

    // Count patient relationships (for physiotherapists)
    let patientCount = 0;
    if (user.role === "physiotherapist") {
      const relationships = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id))
        .collect();
      patientCount = relationships.filter((r) => r.status === "active").length;
    }

    // Count appointments
    let appointmentCount = 0;
    let upcomingAppointments = 0;
    const now = Date.now();
    if (user.role === "physiotherapist") {
      const appointments = await ctx.db
        .query("appointments")
        .withIndex("by_physiotherapist_id_and_time", (q) => q.eq("physiotherapistId", user._id))
        .collect();
      appointmentCount = appointments.length;
      upcomingAppointments = appointments.filter(
        (a) =>
          a.startTime > now &&
          a.status !== "cancelled_by_patient" &&
          a.status !== "cancelled_by_therapist"
      ).length;
    }

    // Get recent appointments
    let recentAppointments: Array<{
      _id: Id<"appointments">;
      startTime: number;
      endTime: number;
      serviceType: string;
      status: string;
      appointmentType?: string;
      isOnline?: boolean;
      patientName: string;
    }> = [];
    if (user.role === "physiotherapist") {
      const appts = await ctx.db
        .query("appointments")
        .withIndex("by_physiotherapist_id_and_time", (q) => q.eq("physiotherapistId", user._id))
        .order("desc")
        .take(5);

      recentAppointments = await Promise.all(
        appts.map(async (a) => {
          const patient = await ctx.db.get(a.patientId);
          const patientName = patient
            ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim() || patient.email || "Patient"
            : "Patient";
          return {
            _id: a._id,
            startTime: a.startTime,
            endTime: a.endTime,
            serviceType: a.serviceType,
            status: a.status,
            appointmentType: a.appointmentType,
            isOnline: a.isOnline,
            patientName,
          };
        })
      );
    }

    // Get active patients list
    let activePatientsList: Array<{
      _id: Id<"patientPhysiotherapistRelationships">;
      patientId: Id<"users">;
      status: string;
      startDate: number;
      name: string;
      email?: string;
      imageUrl?: string;
    }> = [];
    if (user.role === "physiotherapist") {
      const relationships = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id))
        .take(6);

      activePatientsList = await Promise.all(
        relationships.map(async (rel) => {
          const pUser = await ctx.db.get(rel.patientId);
          return {
            _id: rel._id,
            patientId: rel.patientId,
            status: rel.status,
            startDate: rel.startDate,
            name: pUser
              ? `${pUser.firstName || ""} ${pUser.lastName || ""}`.trim() || pUser.email || "Patient"
              : "Patient",
            email: pUser?.email,
            imageUrl: pUser?.imageUrl,
          };
        })
      );
    }

    // Get marketplace reviews count and rating
    let reviewStats = { count: 0, averageRating: 0 };
    if (physioProfile) {
      reviewStats = {
        count: physioProfile.reviewCount || 0,
        averageRating: physioProfile.averageRating || 0,
      };
    }

    // Get account approval status
    const approvalStatus = await ctx.db
      .query("accountApprovalStatus")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();

    return {
      user,
      physioProfile,
      patientProfile,
      clinic: clinic ? { _id: clinic._id, name: clinic.name } : null,
      stats: {
        patientCount,
        appointmentCount,
        upcomingAppointments,
        reviewStats,
      },
      recentAppointments,
      activePatientsList,
      approvalStatus: approvalStatus
        ? {
            status: approvalStatus.status,
            reviewedAt: approvalStatus.reviewedAt,
            declineReason: approvalStatus.comments,
          }
        : null,
    };
  },
});
