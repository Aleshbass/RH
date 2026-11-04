/**
 * AwaDoc marketplace integration (AwaDoc "Therapy Provider Guide").
 *
 *  - Webhook handlers, called by app/api/awadoc/webhook with CONVEX_SERVER_SECRET after it has
 *    checked AwaDoc's signature: availability, request, confirmed, session.assigned, scheduled.
 *  - The callback outbox (claimed and reported by app/api/awadoc/outbox/flush, which signs).
 *  - The assigned physio's visits (start, complete, follow-ups, pick a time, can't make it).
 *  - Admin: overview, settings, manual assignment, payouts, retries.
 *  - The patient's guest video link (app/api/awadoc/validate-guest).
 *
 * Shared logic and the payload shapes live in helpers/awadocCore.ts.
 */
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { ensureUserRole, getAuthenticatedUser } from "./auth";
import { REHABIFY_SERVICES } from "../lib/rehabify-services";
import { appLink } from "./helpers/appUrl";
import {
    AWADOC_MODES,
    AWADOC_MODE_LABEL,
    assignVisit,
    autoAssignVisit,
    eligiblePhysios,
    enqueueCallback,
    ensureVideoRoom,
    findEarliestSlot,
    flatBody,
    hasFreePhysio,
    isPhysioFree,
    isPhysioSpecialist,
    loadAwadocOffer,
    loadAwadocSettings,
    normalizeMode,
    notifyAdmins,
    scheduledBody,
    therapyObject,
    type AwadocMode,
} from "./helpers/awadocCore";
import { lagosDateTime } from "./helpers/lagosTime";
import { insertNotification } from "./helpers/pushNotify";
import { assertServerCaller } from "./helpers/serverSecret";

const envV = v.union(v.literal("production"), v.literal("test"));
const modeV = v.union(v.literal("virtual"), v.literal("home_visit"), v.literal("office_visit"));

type WebhookAnswer = { httpStatus?: number; body: Record<string, unknown> };

const nowIso = () => new Date().toISOString();
const acknowledged = (): WebhookAnswer => ({ body: { status: "acknowledged", acknowledged_at: nowIso() } });
const notFound = (message: string): WebhookAnswer => ({ httpStatus: 404, body: { error: "not_found", message } });

function parseTime(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : undefined;
}

function cleanText(value: string | undefined, max: number): string | undefined {
    const text = value?.trim();
    return text ? text.slice(0, max) : undefined;
}

async function findTherapy(ctx: QueryCtx, therapyId?: string, requestId?: string) {
    if (therapyId) {
        const byId = await ctx.db.query("awadocTherapies").withIndex("by_therapy_id", (q) => q.eq("therapyId", therapyId)).first();
        if (byId) return byId;
    }
    if (requestId) {
        return await ctx.db.query("awadocTherapies").withIndex("by_request_id", (q) => q.eq("requestId", requestId)).first();
    }
    return null;
}

async function visitsOf(ctx: QueryCtx, therapyDocId: Id<"awadocTherapies">) {
    const visits = await ctx.db.query("awadocVisits").withIndex("by_therapy", (q) => q.eq("therapyDocId", therapyDocId)).collect();
    return visits.sort((a, b) => a.visitNumber - b.visitNumber);
}

const OPEN_VISIT = new Set(["needs_time", "scheduled", "started"]);

// ── Event log ───────────────────────────────────────────

/** Strip patient contact details and free text before an AwaDoc payload is stored in the log. */
function sanitizeForLog(payload: unknown): unknown {
    if (!payload || typeof payload !== "object") return payload;
    const copy = JSON.parse(JSON.stringify(payload)) as Record<string, any>;
    if (copy.user && typeof copy.user === "object") {
        delete copy.user.phone;
        delete copy.user.email;
    }
    if (copy.context && typeof copy.context === "object") {
        if (copy.context.location) copy.context.location = "[redacted]";
        if (copy.context.notes) copy.context.notes = "[redacted]";
    }
    if (copy.context?.meeting?.link) copy.context.meeting.link = "[guest link]";
    if (copy.context?.doctor) {
        delete copy.context.doctor.email;
        delete copy.context.doctor.contact;
    }
    const text = JSON.stringify(copy);
    return text.length > 20_000 ? { truncated: text.slice(0, 20_000) } : copy;
}

export const logEvent = mutation({
    args: {
        eventId: v.string(),
        eventType: v.string(),
        direction: v.union(v.literal("inbound"), v.literal("outbound")),
        payload: v.any(),
        responsePayload: v.optional(v.any()),
        status: v.union(v.literal("success"), v.literal("error")),
        errorMessage: v.optional(v.string()),
        serverSecret: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        assertServerCaller(args.serverSecret);
        const now = Date.now();
        const existing = await ctx.db.query("awadocEventLog").withIndex("by_event_id", (q) => q.eq("eventId", args.eventId)).first();
        const fields = {
            eventType: args.eventType.slice(0, 120),
            status: args.status,
            errorMessage: args.errorMessage?.slice(0, 500),
            payload: sanitizeForLog(args.payload),
            responsePayload: args.responsePayload === undefined ? undefined : sanitizeForLog(args.responsePayload),
            processedAt: now,
        };
        if (existing) {
            await ctx.db.patch(existing._id, fields);
            return;
        }
        await ctx.db.insert("awadocEventLog", { eventId: args.eventId.slice(0, 160), direction: args.direction, createdAt: now, ...fields });
    },
});

// ── Event 1: availability ───────────────────────────────

export const availability = query({
    args: {
        serverSecret: v.optional(v.string()),
        queryId: v.string(),
        preferredMode: v.optional(v.string()),
        specialistType: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        assertServerCaller(args.serverSecret);
        const settings = await loadAwadocSettings(ctx);
        const offer = await loadAwadocOffer(ctx, settings.serviceId);
        const wanted = normalizeMode(args.preferredMode);

        const specialists: Array<Record<string, unknown>> = [];
        if (settings.enabled && offer.priceKobo > 0 && isPhysioSpecialist(args.specialistType)) {
            for (const mode of settings.modes) {
                if (wanted !== "any" && wanted !== mode) continue;
                if ((await eligiblePhysios(ctx, mode)).length === 0) continue;
                specialists.push({
                    type: "physiotherapist",
                    name: "Physiotherapist",
                    availability_mode: mode,
                    scheduling_mode: "patient_choice",
                    pricing: { amount: offer.priceKobo / 100, currency: "NGN" },
                });
            }
        }
        return {
            status: specialists.length > 0 ? "available" : "unavailable",
            query_id: args.queryId,
            queried_at: nowIso(),
            specialists,
        };
    },
});

// ── Event 2: request ────────────────────────────────────

export const receiveRequest = mutation({
    args: {
        serverSecret: v.optional(v.string()),
        env: envV,
        newTherapyId: v.string(), // fresh id from the route, used only if this is a new request
        newGuestToken: v.string(),
        eventId: v.optional(v.string()),
        requestId: v.string(),
        traceId: v.optional(v.string()),
        userId: v.string(),
        userName: v.string(),
        userPhone: v.optional(v.string()),
        specialistType: v.optional(v.string()),
        sessionType: v.optional(v.string()),
        preferredMode: v.optional(v.string()),
        preferredTime: v.optional(v.string()),
        preferredLang: v.optional(v.string()),
        complaint: v.optional(v.string()),
        address: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<WebhookAnswer> => {
        assertServerCaller(args.serverSecret);
        const existing = await ctx.db.query("awadocTherapies").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).first();
        // Retries get the same answer. Only a request we offered another time for is looked at again.
        if (existing && existing.status !== "reschedule_proposed") return { body: existing.response };

        const settings = await loadAwadocSettings(ctx);
        const offer = await loadAwadocOffer(ctx, settings.serviceId);
        const now = Date.now();
        const wanted = normalizeMode(args.preferredMode);
        const mode: AwadocMode = wanted === "any" || wanted === null ? settings.modes[0] : wanted;
        const durationMs = offer.durationMinutes * 60_000;
        const requested = parseTime(args.preferredTime);
        const earliest = now + settings.minLeadMinutes * 60_000;

        let outcome: { status: "declined"; reason: string } | { status: "reschedule_proposed"; at: number; reason: string } | { status: "quoted"; at: number };
        if (!settings.enabled || offer.priceKobo <= 0) outcome = { status: "declined", reason: "provider_unavailable" };
        else if (!isPhysioSpecialist(args.specialistType)) outcome = { status: "declined", reason: "specialist_type_not_offered" };
        else if (wanted === null || !settings.modes.includes(mode)) outcome = { status: "declined", reason: "mode_not_supported" };
        else if (requested !== undefined && requested >= earliest && (await hasFreePhysio(ctx, mode, { start: requested, end: requested + durationMs }))) {
            outcome = { status: "quoted", at: requested };
        } else {
            const from = requested !== undefined && requested >= earliest ? requested : earliest;
            const next = await findEarliestSlot(ctx, mode, from, durationMs);
            if (next === null) outcome = { status: "declined", reason: "no_available_therapist" };
            else if (requested === undefined) outcome = { status: "quoted", at: next };
            else
                outcome = {
                    status: "reschedule_proposed",
                    at: next,
                    reason: requested < earliest ? "requested_time_too_soon" : "therapist_unavailable_at_requested_time",
                };
        }

        const therapyId = existing?.therapyId ?? args.newTherapyId;
        const start = outcome.status === "declined" ? (requested ?? earliest) : outcome.at;
        const record = {
            therapyId,
            requestId: args.requestId,
            eventId: args.eventId,
            traceId: args.traceId,
            env: args.env,
            awadocUserId: args.userId,
            patientName: cleanText(args.userName, 120) ?? "AwaDoc patient",
            patientPhone: cleanText(args.userPhone, 40),
            address: cleanText(args.address, 300),
            complaint: cleanText(args.complaint, 2000),
            specialistType: "physiotherapist",
            sessionType: cleanText(args.sessionType, 40),
            mode,
            preferredLang: cleanText(args.preferredLang, 10),
            requestedTime: requested,
            scheduledStart: start,
            scheduledEnd: start + durationMs,
            serviceId: offer.serviceId,
            priceKobo: offer.priceKobo,
            payoutKobo: offer.payoutKobo,
            currency: "NGN",
            status: outcome.status,
            declineReason: outcome.status === "declined" ? outcome.reason : undefined,
            guestToken: existing?.guestToken ?? (mode === "virtual" ? args.newGuestToken : undefined),
            sessionsCompleted: 0,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };

        let response: Record<string, unknown>;
        if (outcome.status === "declined") {
            response = { status: "declined", request_id: args.requestId, reason: outcome.reason };
        } else if (outcome.status === "reschedule_proposed") {
            response = {
                status: "reschedule_proposed",
                request_id: args.requestId,
                proposed_time: new Date(outcome.at).toISOString(),
                reason: outcome.reason,
            };
        } else {
            const therapy = therapyObject({ ...record, response: null } as unknown as Doc<"awadocTherapies">);
            response = {
                status: "confirmed",
                request_id: args.requestId,
                confirmed_at: nowIso(),
                therapy,
            };
        }

        if (existing) await ctx.db.patch(existing._id, { ...record, response });
        else await ctx.db.insert("awadocTherapies", { ...record, response });
        return { body: response };
    },
});

// ── Event 3: confirmed (paid) ───────────────────────────

export const receiveConfirmed = mutation({
    args: {
        serverSecret: v.optional(v.string()),
        therapyId: v.optional(v.string()),
        requestId: v.optional(v.string()),
        preferredTime: v.optional(v.string()),
        amount: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<WebhookAnswer> => {
        assertServerCaller(args.serverSecret);
        const therapy = await findTherapy(ctx, args.therapyId, args.requestId);
        if (!therapy) return notFound(`No booking for therapy ${args.therapyId ?? "?"} / request ${args.requestId ?? "?"}`);
        if (therapy.paidAt || therapy.status === "cancelled") return acknowledged();

        const now = Date.now();
        const length = therapy.scheduledEnd - therapy.scheduledStart;
        const paidTime = parseTime(args.preferredTime);
        // What the patient paid for wins (they may have accepted the time we proposed)
        const start = paidTime ?? therapy.scheduledStart;
        await ctx.db.patch(therapy._id, {
            paidAt: now,
            paidAmountKobo: typeof args.amount === "number" ? Math.round(args.amount * 100) : undefined,
            scheduledStart: start,
            scheduledEnd: start + length,
            status: "needs_physio",
            updatedAt: now,
        });
        const visitId = await ctx.db.insert("awadocVisits", {
            therapyDocId: therapy._id,
            therapyId: therapy.therapyId,
            visitNumber: 1,
            callId: `${therapy.therapyId}-1`,
            scheduledStart: start,
            scheduledEnd: start + length,
            status: "scheduled",
            payoutKobo: therapy.payoutKobo,
            payoutStatus: "not_due",
            createdAt: now,
            updatedAt: now,
        });
        await autoAssignVisit(ctx, therapy._id, visitId);
        return acknowledged();
    },
});

// ── Event 9: follow-up session assigned (platform → us) ─

export const receiveSessionAssigned = mutation({
    args: {
        serverSecret: v.optional(v.string()),
        therapyId: v.optional(v.string()),
        requestId: v.optional(v.string()),
        therapistId: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<WebhookAnswer> => {
        assertServerCaller(args.serverSecret);
        const therapy = await findTherapy(ctx, args.therapyId, args.requestId);
        if (!therapy) return notFound(`No booking for therapy ${args.therapyId ?? "?"}`);
        const visits = await visitsOf(ctx, therapy._id);
        // A retry, or a follow-up already waiting: nothing new to set up
        if (visits.some((visit) => visit.visitNumber > 1 && OPEN_VISIT.has(visit.status))) return acknowledged();

        let physio: Doc<"users"> | null = null;
        if (args.therapistId) {
            physio =
                (await ctx.db.query("users").withIndex("by_staff_number", (q) => q.eq("staffNumber", args.therapistId)).first()) ??
                await (async () => {
                    const id = ctx.db.normalizeId("users", args.therapistId!);
                    return id ? await ctx.db.get(id) : null;
                })();
        }
        if (!physio && therapy.physiotherapistId) physio = await ctx.db.get(therapy.physiotherapistId);
        if (physio && physio.role !== "physiotherapist") physio = null;

        const now = Date.now();
        const visitNumber = (visits[visits.length - 1]?.visitNumber ?? 0) + 1;
        const visitId = await ctx.db.insert("awadocVisits", {
            therapyDocId: therapy._id,
            therapyId: therapy.therapyId,
            visitNumber,
            callId: `${therapy.therapyId}-${visitNumber}`,
            physiotherapistId: physio?._id,
            status: "needs_time",
            payoutKobo: therapy.payoutKobo,
            payoutStatus: "not_due",
            createdAt: now,
            updatedAt: now,
        });
        await ctx.db.patch(therapy._id, { status: physio ? "active" : "needs_physio", physiotherapistId: physio?._id, updatedAt: now });
        if (physio) {
            await ensureVideoRoom(ctx, therapy, (await ctx.db.get(visitId))!, physio._id);
            await insertNotification(ctx, {
                userId: physio._id,
                type: "referral_assigned",
                priority: "high",
                status: "pending",
                payload: {
                    title: "AwaDoc follow-up confirmed",
                    body: `${therapy.patientName}: pick a time for session ${visitNumber}.`,
                    link: `/dashboard/physiotherapist?awadoc=${visitId}`,
                    data: { actionUrl: `/dashboard/physiotherapist?awadoc=${visitId}`, pushTag: `awadoc-${visitId}` },
                },
                createdAt: now,
            });
        } else {
            await notifyAdmins(ctx, "AwaDoc follow-up needs a physio", `${therapy.patientName}: session ${visitNumber} has no physio. Assign one in Admin › AwaDoc.`);
        }
        return acknowledged();
    },
});

// ── Event 5 inbound: AwaDoc set or changed the time ─────

export const receiveScheduled = mutation({
    args: {
        serverSecret: v.optional(v.string()),
        therapyId: v.optional(v.string()),
        requestId: v.optional(v.string()),
        startTime: v.optional(v.string()),
        endTime: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<WebhookAnswer> => {
        assertServerCaller(args.serverSecret);
        const therapy = await findTherapy(ctx, args.therapyId, args.requestId);
        if (!therapy) return notFound(`No booking for therapy ${args.therapyId ?? "?"}`);
        const start = parseTime(args.startTime);
        if (start === undefined) return { httpStatus: 400, body: { error: "invalid_payload", message: "meeting.start_time missing" } };
        const end = parseTime(args.endTime) ?? start + (therapy.scheduledEnd - therapy.scheduledStart);
        const open = (await visitsOf(ctx, therapy._id)).filter((x) => OPEN_VISIT.has(x.status));
        const visit = open[open.length - 1];
        if (!visit) return acknowledged();
        if (visit.scheduledStart === start && visit.scheduledEnd === end) return acknowledged();

        const now = Date.now();
        await ctx.db.patch(visit._id, { scheduledStart: start, scheduledEnd: end, status: visit.status === "needs_time" ? "scheduled" : visit.status, remindedAt: undefined, updatedAt: now });
        if (visit.visitNumber === 1) await ctx.db.patch(therapy._id, { scheduledStart: start, scheduledEnd: end, updatedAt: now });
        if (visit.physiotherapistId) {
            await insertNotification(ctx, {
                userId: visit.physiotherapistId,
                type: "appointment_rescheduled",
                priority: "high",
                status: "pending",
                payload: {
                    title: "AwaDoc visit time changed",
                    body: `${therapy.patientName}: now ${lagosDateTime(start)}.`,
                    link: `/dashboard/physiotherapist?awadoc=${visit._id}`,
                    data: { actionUrl: `/dashboard/physiotherapist?awadoc=${visit._id}` },
                },
                createdAt: now,
            });
        }
        return acknowledged();
    },
});

// ── Outbox (sent by app/api/awadoc/outbox/flush) ────────

const LEASE_MS = 2 * 60_000;
const MAX_ATTEMPTS = 10;
const backoffMs = (attempts: number) => Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000;

/**
 * Lease the callbacks that are due, oldest first. Per booking, only the run of due rows before
 * the first one that isn't due yet, so AwaDoc always gets a booking's events in order.
 */
export const outboxClaim = mutation({
    args: { serverSecret: v.optional(v.string()) },
    handler: async (ctx, args) => {
        assertServerCaller(args.serverSecret);
        const now = Date.now();
        const due = await ctx.db
            .query("awadocOutbox")
            .withIndex("by_status_and_next", (q) => q.eq("status", "pending").lte("nextAttemptAt", now))
            .take(50);
        const claimed: Array<{ id: Id<"awadocOutbox">; env: "production" | "test"; eventType: string; therapyId: string; body: unknown }> = [];
        for (const therapyId of [...new Set(due.map((row) => row.therapyId))]) {
            const rows = (await ctx.db.query("awadocOutbox").withIndex("by_therapy", (q) => q.eq("therapyId", therapyId)).collect())
                .filter((row) => row.status === "pending")
                .sort((a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime);
            for (const row of rows) {
                if (row.nextAttemptAt > now) break;
                await ctx.db.patch(row._id, { nextAttemptAt: now + LEASE_MS });
                claimed.push({ id: row._id, env: row.env, eventType: row.eventType, therapyId, body: row.body });
                if (claimed.length >= 25) return claimed;
            }
        }
        return claimed;
    },
});

export const outboxResult = mutation({
    args: {
        serverSecret: v.optional(v.string()),
        id: v.id("awadocOutbox"),
        ok: v.boolean(),
        httpStatus: v.optional(v.number()),
        error: v.optional(v.string()),
        responseText: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        assertServerCaller(args.serverSecret);
        const row = await ctx.db.get(args.id);
        if (!row || row.status !== "pending") return;
        const now = Date.now();
        const attempts = row.attempts + 1;
        let responsePayload: unknown = args.responseText;
        try {
            responsePayload = args.responseText ? JSON.parse(args.responseText) : undefined;
        } catch {
            // keep the text
        }
        await ctx.db.insert("awadocEventLog", {
            eventId: `out:${row._id}:${attempts}`,
            eventType: row.eventType,
            direction: "outbound",
            payload: sanitizeForLog(row.body),
            responsePayload: responsePayload === undefined ? undefined : sanitizeForLog(responsePayload),
            status: args.ok ? "success" : "error",
            errorMessage: args.ok ? undefined : `${args.error ?? "failed"}${args.httpStatus ? ` (HTTP ${args.httpStatus})` : ""}`.slice(0, 500),
            createdAt: now,
            processedAt: now,
        });

        if (args.ok) {
            await ctx.db.patch(row._id, { status: "sent", attempts, sentAt: now, lastHttpStatus: args.httpStatus, lastError: undefined });
            return;
        }
        const giveUp = attempts >= MAX_ATTEMPTS;
        const nextAttemptAt = now + backoffMs(attempts);
        await ctx.db.patch(row._id, {
            status: giveUp ? "failed" : "pending",
            attempts,
            nextAttemptAt,
            lastError: args.error?.slice(0, 500),
            lastHttpStatus: args.httpStatus,
        });
        // Later events for this booking wait behind this one
        const siblings = await ctx.db.query("awadocOutbox").withIndex("by_therapy", (q) => q.eq("therapyId", row.therapyId)).collect();
        for (const sibling of siblings) {
            if (sibling._id !== row._id && sibling.status === "pending" && sibling.createdAt >= row.createdAt && sibling.nextAttemptAt < nextAttemptAt) {
                await ctx.db.patch(sibling._id, { nextAttemptAt: nextAttemptAt + 1 });
            }
        }
        if (giveUp) {
            await notifyAdmins(ctx, "AwaDoc update failed", `${row.eventType} for ${row.therapyId} failed ${attempts} times. Retry it in Admin › AwaDoc.`);
        }
    },
});

export const hasDueOutbox = internalQuery({
    args: {},
    handler: async (ctx) => {
        const row = await ctx.db
            .query("awadocOutbox")
            .withIndex("by_status_and_next", (q) => q.eq("status", "pending").lte("nextAttemptAt", Date.now()))
            .first();
        return row !== null;
    },
});

/** Ask the Next.js server (it holds the AwaDoc secret) to send what is due. */
export const kickOutbox = internalAction({
    args: {},
    handler: async (ctx): Promise<void> => {
        const due: boolean = await ctx.runQuery((internal as any).awadoc.hasDueOutbox, {});
        if (!due) return;
        const secret = process.env.CONVEX_SERVER_SECRET;
        if (!secret) return;
        try {
            const response = await fetch(appLink("/api/awadoc/outbox/flush"), {
                method: "POST",
                headers: { "x-server-secret": secret },
            });
            if (!response.ok) console.warn("[awadoc] outbox flush returned", response.status);
        } catch (err) {
            console.warn("[awadoc] outbox flush unreachable:", err instanceof Error ? err.message : String(err));
        }
    },
});

/** Cron: "starts soon" push to the physio 15 minutes before a visit (AwaDoc allows 20 minutes' grace). */
export const remindUpcomingVisits = internalMutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const scheduled = await ctx.db.query("awadocVisits").withIndex("by_status", (q) => q.eq("status", "scheduled")).take(200);
        for (const visit of scheduled) {
            if (!visit.physiotherapistId || visit.remindedAt || visit.scheduledStart === undefined) continue;
            if (visit.scheduledStart > now + 15 * 60_000 || visit.scheduledStart < now - 10 * 60_000) continue;
            const therapy = await ctx.db.get(visit.therapyDocId);
            if (!therapy) continue;
            await ctx.db.patch(visit._id, { remindedAt: now });
            const link = therapy.mode === "virtual" ? `/video-call/${visit.callId}` : `/dashboard/physiotherapist?awadoc=${visit._id}`;
            await insertNotification(ctx, {
                userId: visit.physiotherapistId,
                type: "session_starting",
                priority: "urgent",
                status: "pending",
                payload: {
                    title: "AwaDoc visit starts soon",
                    body: `${therapy.patientName} at ${lagosDateTime(visit.scheduledStart)}. ${therapy.mode === "virtual" ? "Open the call to start." : "Tap Start when you arrive."}`,
                    link,
                    data: { actionUrl: link, pushTag: `awadoc-${visit._id}` },
                },
                createdAt: now,
            });
        }
    },
});

/** Cron: keep 90 days of AwaDoc event log. */
export const purgeOldEvents = internalMutation({
    args: {},
    handler: async (ctx) => {
        const cutoff = Date.now() - 90 * 86400_000;
        const old = await ctx.db.query("awadocEventLog").withIndex("by_processed_at", (q) => q.lt("processedAt", cutoff)).take(500);
        for (const row of old) await ctx.db.delete(row._id);
    },
});

// ── Physio ──────────────────────────────────────────────

async function myVisit(ctx: MutationCtx, visitId: Id<"awadocVisits">) {
    const me = await getAuthenticatedUser(ctx);
    const visit = await ctx.db.get(visitId);
    if (!visit) throw new ConvexError("Visit not found.");
    if (visit.physiotherapistId !== me._id && me.role !== "admin") throw new ConvexError("This visit isn't assigned to you.");
    const therapy = await ctx.db.get(visit.therapyDocId);
    if (!therapy) throw new ConvexError("Booking not found.");
    return { me, visit, therapy };
}

/** The physio's AwaDoc visits: open ones and those finished in the last 3 days. */
export const myVisits = query({
    args: {},
    handler: async (ctx) => {
        const me = await getAuthenticatedUser(ctx).catch(() => null);
        if (!me || me.role !== "physiotherapist") return [];
        const visits = await ctx.db.query("awadocVisits").withIndex("by_physio_and_start", (q) => q.eq("physiotherapistId", me._id)).order("desc").take(100);
        const recent = Date.now() - 3 * 86400_000;
        const out = [];
        for (const visit of visits) {
            const open = OPEN_VISIT.has(visit.status);
            if (!open && !(visit.status === "completed" && (visit.completedAt ?? 0) > recent)) continue;
            const therapy = await ctx.db.get(visit.therapyDocId);
            if (!therapy) continue;
            out.push({
                visitId: visit._id,
                therapyId: therapy.therapyId,
                visitNumber: visit.visitNumber,
                callId: visit.callId,
                status: visit.status,
                scheduledStart: visit.scheduledStart,
                scheduledEnd: visit.scheduledEnd,
                startedAt: visit.startedAt,
                completedAt: visit.completedAt,
                summary: visit.summary,
                payoutKobo: visit.payoutKobo,
                payoutStatus: visit.payoutStatus,
                mode: therapy.mode,
                patientName: therapy.patientName,
                patientPhone: therapy.patientPhone,
                address: therapy.mode === "home_visit" ? therapy.address : undefined,
                complaint: therapy.complaint,
                sessionsRemaining: therapy.sessionsRemaining,
                followupNotes: therapy.followupNotes,
            });
        }
        return out.sort((a, b) => (a.scheduledStart ?? Infinity) - (b.scheduledStart ?? Infinity));
    },
});

/** For the video page: the AwaDoc visit behind a room, if the viewer is its physio or an admin. */
export const visitForCall = query({
    args: { callId: v.string() },
    handler: async (ctx, args) => {
        const me = await getAuthenticatedUser(ctx).catch(() => null);
        if (!me) return null;
        const visit = await ctx.db.query("awadocVisits").withIndex("by_call_id", (q) => q.eq("callId", args.callId)).first();
        if (!visit || (visit.physiotherapistId !== me._id && me.role !== "admin")) return null;
        return { visitId: visit._id, status: visit.status };
    },
});

async function markStarted(ctx: MutationCtx, visit: Doc<"awadocVisits">, therapy: Doc<"awadocTherapies">, at: number) {
    await ctx.db.patch(visit._id, { status: "started", startedAt: at, updatedAt: Date.now() });
    await enqueueCallback(ctx, therapy, `${therapy.therapyId}:${visit.visitNumber}:session.started`, flatBody(therapy, "session.started", { started_at: new Date(at).toISOString() }));
}

/** Event 6: the physio starts the visit (or joins its video call). */
export const startVisit = mutation({
    args: { visitId: v.id("awadocVisits") },
    handler: async (ctx, args) => {
        const { visit, therapy } = await myVisit(ctx, args.visitId);
        if (visit.status === "started") return;
        if (visit.status !== "scheduled") throw new ConvexError("This visit can't be started now.");
        if (visit.scheduledStart !== undefined && visit.scheduledStart - Date.now() > 60 * 60_000) {
            throw new ConvexError("You can start this visit from an hour before its time.");
        }
        await markStarted(ctx, visit, therapy, Date.now());
    },
});

/** The video page calls this when the assigned physio joins an AwaDoc room. Quietly does nothing otherwise. */
export const startVisitByCall = mutation({
    args: { callId: v.string() },
    handler: async (ctx, args) => {
        const me = await getAuthenticatedUser(ctx).catch(() => null);
        if (!me) return;
        const visit = await ctx.db.query("awadocVisits").withIndex("by_call_id", (q) => q.eq("callId", args.callId)).first();
        if (!visit || visit.physiotherapistId !== me._id || visit.status !== "scheduled") return;
        if (visit.scheduledStart !== undefined && visit.scheduledStart - Date.now() > 60 * 60_000) return;
        const therapy = await ctx.db.get(visit.therapyDocId);
        if (therapy) await markStarted(ctx, visit, therapy, Date.now());
    },
});

/** Events 7, 8 and 10: the visit is done; optionally more sessions are needed. */
export const completeVisit = mutation({
    args: {
        visitId: v.id("awadocVisits"),
        summary: v.string(),
        moreSessions: v.optional(v.number()),
        planNotes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { visit, therapy } = await myVisit(ctx, args.visitId);
        if (visit.status !== "scheduled" && visit.status !== "started") throw new ConvexError("This visit is already closed.");
        const summary = cleanText(args.summary, 2000);
        if (!summary) throw new ConvexError("Add a short summary for AwaDoc.");
        const more = Math.max(0, Math.min(30, Math.round(args.moreSessions ?? 0)));
        if (more > 0 && !cleanText(args.planNotes, 1000)) throw new ConvexError("Say how often the follow-up sessions should be.");

        const now = Date.now();
        if (visit.status === "scheduled") await markStarted(ctx, visit, therapy, Math.min(now, visit.scheduledStart ?? now));
        await ctx.db.patch(visit._id, { status: "completed", completedAt: now, summary, payoutStatus: "owed", updatedAt: now });
        await enqueueCallback(
            ctx,
            therapy,
            `${therapy.therapyId}:${visit.visitNumber}:session.completed`,
            flatBody(therapy, "session.completed", { completed_at: new Date(now).toISOString(), summary })
        );

        const sessionsCompleted = therapy.sessionsCompleted + 1;
        if (more > 0) {
            const notes = cleanText(args.planNotes, 1000)!;
            await enqueueCallback(
                ctx,
                therapy,
                `${therapy.therapyId}:${visit.visitNumber}:followup.required`,
                flatBody(therapy, "followup.required", { sessions_remaining: more, notes })
            );
            await ctx.db.patch(therapy._id, { sessionsCompleted, sessionsRemaining: more, followupNotes: notes, status: "followup_pending", updatedAt: now });
        } else if (therapy.sessionsRemaining !== undefined) {
            await enqueueCallback(ctx, therapy, `${therapy.therapyId}:plan.completed`, flatBody(therapy, "plan.completed", { completed_at: new Date(now).toISOString() }));
            await ctx.db.patch(therapy._id, { sessionsCompleted, sessionsRemaining: 0, status: "plan_completed", completedAt: now, updatedAt: now });
        } else {
            await ctx.db.patch(therapy._id, { sessionsCompleted, status: "completed", completedAt: now, updatedAt: now });
        }
        const room = await ctx.db.query("videoCalls").withIndex("by_room_id", (q) => q.eq("roomId", visit.callId)).first();
        if (room && room.status !== "ended") await ctx.db.patch(room._id, { status: "ended", endTime: now, updatedAt: now });
    },
});

/** The physio (or an admin) picks or changes a visit's time; AwaDoc gets therapy.scheduled. */
export const setVisitTime = mutation({
    args: { visitId: v.id("awadocVisits"), start: v.number() },
    handler: async (ctx, args) => {
        const { me, visit, therapy } = await myVisit(ctx, args.visitId);
        if (visit.status !== "needs_time" && visit.status !== "scheduled") throw new ConvexError("This visit's time can't be changed now.");
        if (args.start < Date.now() + 30 * 60_000) throw new ConvexError("Pick a time at least 30 minutes from now.");
        const length = (visit.scheduledEnd && visit.scheduledStart ? visit.scheduledEnd - visit.scheduledStart : therapy.scheduledEnd - therapy.scheduledStart) || 30 * 60_000;
        const slot = { start: args.start, end: args.start + length };
        const physioId = visit.physiotherapistId;
        if (physioId && me.role !== "admin") {
            const profile = await ctx.db.query("physiotherapistProfiles").withIndex("by_user_id", (q) => q.eq("userId", physioId)).first();
            if (profile && !(await isPhysioFree(ctx, { profile, user: me }, slot, visit._id))) {
                throw new ConvexError("You already have something then, or it's outside your working hours.");
            }
        }
        const now = Date.now();
        await ctx.db.patch(visit._id, { scheduledStart: slot.start, scheduledEnd: slot.end, status: "scheduled", remindedAt: undefined, updatedAt: now });
        if (visit.visitNumber === 1) await ctx.db.patch(therapy._id, { scheduledStart: slot.start, scheduledEnd: slot.end, updatedAt: now });
        const fresh = (await ctx.db.get(visit._id))!;
        const freshTherapy = (await ctx.db.get(therapy._id))!;
        await enqueueCallback(ctx, freshTherapy, `${therapy.therapyId}:${visit.visitNumber}:scheduled:${slot.start}:${physioId ?? "none"}`, scheduledBody(freshTherapy, fresh));
        const room = await ctx.db.query("videoCalls").withIndex("by_room_id", (q) => q.eq("roomId", visit.callId)).first();
        if (room) await ctx.db.patch(room._id, { scheduledAt: slot.start, startTime: slot.start, updatedAt: now });
    },
});

/** "I can't make it": hand the visit to the next best free physio, or to the admins. */
export const releaseVisit = mutation({
    args: { visitId: v.id("awadocVisits"), reason: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const { me, visit, therapy } = await myVisit(ctx, args.visitId);
        if (visit.status !== "scheduled" && visit.status !== "needs_time") throw new ConvexError("This visit can't be handed back now.");
        const reason = cleanText(args.reason, 300);
        if (visit.scheduledStart === undefined) {
            await ctx.db.patch(visit._id, { physiotherapistId: undefined, updatedAt: Date.now() });
            await ctx.db.patch(therapy._id, { status: "needs_physio", physiotherapistId: undefined, updatedAt: Date.now() });
            await notifyAdmins(ctx, "AwaDoc follow-up needs a physio", `${therapy.patientName}: the physio handed it back${reason ? ` (${reason})` : ""}.`);
            return { reassigned: false };
        }
        const exclude = visit.physiotherapistId ? [visit.physiotherapistId] : [me._id];
        const next = await autoAssignVisit(ctx, therapy._id, visit._id, exclude);
        return { reassigned: next !== null };
    },
});

// ── Patient guest link ──────────────────────────────────

/** Server only (validate-guest route): may this guest token join this room? */
export const guestJoin = query({
    args: { serverSecret: v.optional(v.string()), callId: v.string(), guestToken: v.string() },
    handler: async (ctx, args) => {
        assertServerCaller(args.serverSecret);
        const visit = await ctx.db.query("awadocVisits").withIndex("by_call_id", (q) => q.eq("callId", args.callId)).first();
        if (!visit) return { valid: false as const, error: "This session link isn't valid." };
        const therapy = await ctx.db.get(visit.therapyDocId);
        if (!therapy?.guestToken || therapy.guestToken.length !== args.guestToken.length || therapy.guestToken !== args.guestToken) {
            return { valid: false as const, error: "This session link isn't valid." };
        }
        if (visit.status === "cancelled") return { valid: false as const, error: "This session was cancelled." };
        if (visit.status === "completed" && Date.now() - (visit.completedAt ?? 0) > 2 * 3600_000) {
            return { valid: false as const, error: "This session has ended." };
        }
        const physio = visit.physiotherapistId ? await ctx.db.get(visit.physiotherapistId) : null;
        return {
            valid: true as const,
            session: {
                patientName: therapy.patientName,
                physioName: physio ? [physio.firstName, physio.lastName].filter(Boolean).join(" ") || "Your physiotherapist" : "Your physiotherapist",
                scheduledStart: visit.scheduledStart,
                status: visit.status,
            },
        };
    },
});

// ── Admin ───────────────────────────────────────────────

export const adminOverview = query({
    args: {},
    handler: async (ctx) => {
        await ensureUserRole(ctx, ["admin"]);
        const settings = await loadAwadocSettings(ctx);
        const offer = await loadAwadocOffer(ctx, settings.serviceId);
        const therapies = await ctx.db.query("awadocTherapies").order("desc").take(80);
        const names = new Map<string, string>();
        const nameOf = async (id: Id<"users"> | undefined) => {
            if (!id) return undefined;
            if (!names.has(id)) {
                const user = await ctx.db.get(id);
                names.set(id, user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "Physio" : "Physio");
            }
            return names.get(id);
        };
        const bookings = [];
        for (const therapy of therapies) {
            const visits = await visitsOf(ctx, therapy._id);
            bookings.push({
                id: therapy._id,
                therapyId: therapy.therapyId,
                requestId: therapy.requestId,
                env: therapy.env,
                status: therapy.status,
                declineReason: therapy.declineReason,
                mode: therapy.mode,
                patientName: therapy.patientName,
                complaint: therapy.complaint,
                requestedTime: therapy.requestedTime,
                scheduledStart: therapy.scheduledStart,
                priceKobo: therapy.priceKobo,
                paidAt: therapy.paidAt,
                sessionsRemaining: therapy.sessionsRemaining,
                createdAt: therapy.createdAt,
                visits: await Promise.all(
                    visits.map(async (visit) => ({
                        id: visit._id,
                        visitNumber: visit.visitNumber,
                        status: visit.status,
                        scheduledStart: visit.scheduledStart,
                        physioId: visit.physiotherapistId,
                        physioName: await nameOf(visit.physiotherapistId),
                        payoutKobo: visit.payoutKobo,
                        payoutStatus: visit.payoutStatus,
                        summary: visit.summary,
                    }))
                ),
            });
        }
        const owed = await ctx.db.query("awadocVisits").withIndex("by_payout_status", (q) => q.eq("payoutStatus", "owed")).take(500);
        const outboxPending = await ctx.db.query("awadocOutbox").withIndex("by_status_and_next", (q) => q.eq("status", "pending")).take(50);
        const outboxFailed = await ctx.db.query("awadocOutbox").withIndex("by_status_and_next", (q) => q.eq("status", "failed")).take(50);
        const events = await ctx.db.query("awadocEventLog").withIndex("by_processed_at").order("desc").take(30);
        const physioCount = await Promise.all(settings.modes.map(async (mode) => ({ mode, count: (await eligiblePhysios(ctx, mode)).length })));
        return {
            settings,
            offer,
            physioCount,
            services: REHABIFY_SERVICES.filter((s) => s.bookable).map((s) => ({ id: s.id, name: s.name })),
            modes: AWADOC_MODES.map((mode) => ({ mode, label: AWADOC_MODE_LABEL[mode] })),
            bookings,
            owedKobo: owed.reduce((sum, visit) => sum + visit.payoutKobo, 0),
            owedCount: owed.length,
            outbox: [...outboxFailed, ...outboxPending].map((row) => ({
                id: row._id,
                therapyId: row.therapyId,
                eventType: row.eventType,
                env: row.env,
                status: row.status,
                attempts: row.attempts,
                lastError: row.lastError,
                lastHttpStatus: row.lastHttpStatus,
                nextAttemptAt: row.nextAttemptAt,
            })),
            events: events.map((event) => ({
                id: event._id,
                eventId: event.eventId,
                eventType: event.eventType,
                direction: event.direction,
                status: event.status,
                errorMessage: event.errorMessage,
                processedAt: event.processedAt,
                payload: event.payload,
                responsePayload: event.responsePayload,
            })),
        };
    },
});

export const adminSaveSettings = mutation({
    args: {
        enabled: v.boolean(),
        modes: v.array(modeV),
        serviceId: v.string(),
        minLeadMinutes: v.number(),
    },
    handler: async (ctx, args) => {
        const admin = await ensureUserRole(ctx, ["admin"]);
        const modes = [...new Set(args.modes)];
        if (modes.length === 0) throw new ConvexError("Offer at least one visit type.");
        if (!REHABIFY_SERVICES.some((s) => s.id === args.serviceId && s.bookable)) throw new ConvexError("Pick a bookable service.");
        if (!Number.isFinite(args.minLeadMinutes) || args.minLeadMinutes < 0 || args.minLeadMinutes > 7 * 24 * 60) {
            throw new ConvexError("Notice must be between 0 minutes and 7 days.");
        }
        await ctx.db.insert("awadocSettings", {
            enabled: args.enabled,
            modes,
            serviceId: args.serviceId,
            minLeadMinutes: Math.round(args.minLeadMinutes),
            updatedAt: Date.now(),
            updatedBy: admin._id,
        });
    },
});

/** Physios who could take a visit, free-at-that-time first. */
export const adminCandidates = query({
    args: { visitId: v.id("awadocVisits") },
    handler: async (ctx, args) => {
        await ensureUserRole(ctx, ["admin"]);
        const visit = await ctx.db.get(args.visitId);
        const therapy = visit ? await ctx.db.get(visit.therapyDocId) : null;
        if (!visit || !therapy) return [];
        const slot = visit.scheduledStart !== undefined && visit.scheduledEnd !== undefined ? { start: visit.scheduledStart, end: visit.scheduledEnd } : null;
        const out = [];
        for (const candidate of await eligiblePhysios(ctx, therapy.mode)) {
            out.push({
                userId: candidate.user._id,
                name: [candidate.user.firstName, candidate.user.lastName].filter(Boolean).join(" ") || "Physio",
                location: candidate.profile.location,
                free: slot ? await isPhysioFree(ctx, candidate, slot, visit._id) : true,
                current: candidate.user._id === visit.physiotherapistId,
            });
        }
        return out.sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
    },
});

export const adminAssign = mutation({
    args: { visitId: v.id("awadocVisits"), physiotherapistId: v.id("users") },
    handler: async (ctx, args) => {
        await ensureUserRole(ctx, ["admin"]);
        const visit = await ctx.db.get(args.visitId);
        if (!visit || !OPEN_VISIT.has(visit.status) || visit.status === "started") throw new ConvexError("This visit can't be reassigned now.");
        const physio = await ctx.db.get(args.physiotherapistId);
        if (!physio || physio.role !== "physiotherapist") throw new ConvexError("Pick a physiotherapist.");
        if (visit.physiotherapistId === physio._id) return;
        await assignVisit(ctx, visit.therapyDocId, visit._id, physio);
    },
});

export const adminMarkPayoutPaid = mutation({
    args: { visitId: v.id("awadocVisits") },
    handler: async (ctx, args) => {
        const admin = await ensureUserRole(ctx, ["admin"]);
        const visit = await ctx.db.get(args.visitId);
        if (!visit || visit.payoutStatus !== "owed") throw new ConvexError("Nothing is owed for this visit.");
        await ctx.db.patch(visit._id, { payoutStatus: "paid", payoutPaidAt: Date.now(), payoutPaidBy: admin._id, updatedAt: Date.now() });
    },
});

export const adminRetryOutbox = mutation({
    args: {},
    handler: async (ctx): Promise<number> => {
        await ensureUserRole(ctx, ["admin"]);
        const now = Date.now();
        const rows = [
            ...(await ctx.db.query("awadocOutbox").withIndex("by_status_and_next", (q) => q.eq("status", "failed")).take(100)),
            ...(await ctx.db.query("awadocOutbox").withIndex("by_status_and_next", (q) => q.eq("status", "pending")).take(100)),
        ];
        for (const row of rows) await ctx.db.patch(row._id, { status: "pending", nextAttemptAt: now, attempts: row.status === "failed" ? 0 : row.attempts });
        if (rows.length > 0) await ctx.scheduler.runAfter(0, (internal as any).awadoc.kickOutbox, {});
        return rows.length;
    },
});
