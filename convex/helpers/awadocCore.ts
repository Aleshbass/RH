/**
 * AwaDoc integration core (Convex side): offer settings, physio matching, the callback payloads
 * from AwaDoc's Therapy Provider Guide, and the outbox they are queued in.
 *
 * Flow (guide §6): availability.query → request (we confirm, decline or propose a time) →
 * AwaDoc takes payment → confirmed → we assign a physio (doctor_assigned) and fix the time
 * (scheduled) → session.started → session.completed (AwaDoc pays out) → optional
 * followup.required → AwaDoc's session.assigned for each follow-up → plan.completed.
 *
 * Callbacks are queued in awadocOutbox and sent by the Next.js server, which holds the
 * AwaDoc secret (app/api/awadoc/outbox/flush).
 */
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getService, isBookableServiceId } from "../../lib/rehabify-services";
import { isWithinWorkingHours } from "../calendar/availability";
import { publicAppUrl } from "./appUrl";
import { isJoyProviderEligible } from "./joyPricing";
import { insertNotification } from "./pushNotify";
import { lagosDateTime } from "./lagosTime";
import { loadTariffs } from "./rehabifyPricing";
import { findSlotClash, isGoogleBusy, overlaps } from "./slotHolds";

export type AwadocMode = "virtual" | "home_visit" | "office_visit";

export const AWADOC_MODES: AwadocMode[] = ["virtual", "home_visit", "office_visit"];

export const DEFAULT_AWADOC_SETTINGS = {
    enabled: true,
    modes: ["virtual"] as AwadocMode[],
    serviceId: "recovery_consultation", // the initial consultation tariff
    minLeadMinutes: 60,
};

export const AWADOC_MODE_LABEL: Record<AwadocMode, string> = {
    virtual: "Video call",
    home_visit: "Home visit",
    office_visit: "Office visit",
};

export async function loadAwadocSettings(ctx: QueryCtx) {
    const saved = await ctx.db.query("awadocSettings").order("desc").first();
    return {
        enabled: saved?.enabled ?? DEFAULT_AWADOC_SETTINGS.enabled,
        modes: saved?.modes?.length ? saved.modes : DEFAULT_AWADOC_SETTINGS.modes,
        serviceId: saved?.serviceId ?? DEFAULT_AWADOC_SETTINGS.serviceId,
        minLeadMinutes: saved?.minLeadMinutes ?? DEFAULT_AWADOC_SETTINGS.minLeadMinutes,
    };
}

/** Price, payout and length of what we sell on AwaDoc, from the tariff in force. */
export async function loadAwadocOffer(ctx: QueryCtx, serviceId: string) {
    const id = isBookableServiceId(serviceId) ? serviceId : DEFAULT_AWADOC_SETTINGS.serviceId;
    const { tariffs } = await loadTariffs(ctx);
    const tariff = tariffs[id as keyof typeof tariffs];
    const service = getService(id);
    return {
        serviceId: id,
        serviceName: service?.name ?? "Physiotherapy consultation",
        priceKobo: tariff?.priceKobo ?? 0,
        payoutKobo: tariff?.payoutKobo ?? 0,
        durationMinutes: service?.durationMinutes ?? 30,
    };
}

/** AwaDoc's preferred_mode → ours. "any"/"both"/blank → "any"; unknown → null. */
export function normalizeMode(raw: unknown): AwadocMode | "any" | null {
    const value = typeof raw === "string" ? raw.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
    if (!value || value === "any" || value === "both" || value === "all" || value === "string") return "any";
    if (["virtual", "online", "telehealth", "video", "video_call", "remote"].includes(value)) return "virtual";
    if (["home_visit", "home", "physical", "in_person_home"].includes(value)) return "home_visit";
    if (["office_visit", "office", "clinic", "in_person", "clinic_visit"].includes(value)) return "office_visit";
    return null;
}

/** Only physiotherapy is offered; AwaDoc's other slugs are occupational-therapist and speech-therapist. */
export function isPhysioSpecialist(raw: unknown): boolean {
    const value = typeof raw === "string" ? raw.trim().toLowerCase().replace(/[_\s]+/g, "-") : "";
    return !value || value === "string" || ["physiotherapist", "physiotherapy", "physical-therapist", "physical-therapy"].includes(value);
}

// ── Physio matching ─────────────────────────────────────

type Candidate = { profile: Doc<"physiotherapistProfiles">; user: Doc<"users"> };

/** Approved Rehabify network physios listed on the marketplace who offer this kind of visit. */
export async function eligiblePhysios(ctx: QueryCtx, mode: AwadocMode): Promise<Candidate[]> {
    const profiles = await ctx.db
        .query("physiotherapistProfiles")
        .withIndex("by_marketplace_availability", (q) => q.eq("isAvailableOnMarketplace", true))
        .collect();
    const out: Candidate[] = [];
    for (const profile of profiles) {
        if (mode === "virtual" && profile.offersOnlineSessions === false) continue;
        if (mode !== "virtual" && profile.offersInPersonSessions === false) continue;
        if (!(await isJoyProviderEligible(ctx, profile))) continue;
        const user = await ctx.db.get(profile.userId);
        if (!user || user.role !== "physiotherapist") continue;
        out.push({ profile, user });
    }
    return out;
}

/** AwaDoc visits already holding this physio's time. */
async function awadocVisitClash(
    ctx: QueryCtx,
    physioId: Id<"users">,
    slot: { start: number; end: number },
    excludeVisitId?: Id<"awadocVisits">
): Promise<boolean> {
    const nearby = await ctx.db
        .query("awadocVisits")
        .withIndex("by_physio_and_start", (q) =>
            q.eq("physiotherapistId", physioId).gt("scheduledStart", slot.start - 4 * 3600_000).lt("scheduledStart", slot.end)
        )
        .take(20);
    return nearby.some(
        (visit) =>
            visit._id !== excludeVisitId &&
            visit.status !== "cancelled" &&
            visit.scheduledStart !== undefined &&
            visit.scheduledEnd !== undefined &&
            overlaps({ start: visit.scheduledStart, end: visit.scheduledEnd }, slot)
    );
}

/** Working then, and nothing else (appointment, booking hold, Google Calendar, AwaDoc) at that time. */
export async function isPhysioFree(
    ctx: QueryCtx,
    candidate: Candidate,
    slot: { start: number; end: number },
    excludeVisitId?: Id<"awadocVisits">
): Promise<boolean> {
    if (!isWithinWorkingHours(candidate.profile.availabilitySchedule, slot.start, slot.end)) return false;
    if (await findSlotClash(ctx, candidate.user._id, slot)) return false;
    if (await isGoogleBusy(ctx, candidate.user._id, slot)) return false;
    return !(await awadocVisitClash(ctx, candidate.user._id, slot, excludeVisitId));
}

/** Whether at least one eligible physio is free for the slot (stops at the first). */
export async function hasFreePhysio(ctx: QueryCtx, mode: AwadocMode, slot: { start: number; end: number }): Promise<boolean> {
    for (const candidate of await eligiblePhysios(ctx, mode)) {
        if (await isPhysioFree(ctx, candidate, slot)) return true;
    }
    return false;
}

/** Best free physio for the slot: lightest recent AwaDoc load, then rating, then experience. */
export async function pickPhysio(
    ctx: QueryCtx,
    mode: AwadocMode,
    slot: { start: number; end: number },
    options: { exclude?: Id<"users">[]; excludeVisitId?: Id<"awadocVisits"> } = {}
): Promise<Candidate | null> {
    const exclude = new Set(options.exclude ?? []);
    const free: Array<{ candidate: Candidate; load: number }> = [];
    for (const candidate of await eligiblePhysios(ctx, mode)) {
        if (exclude.has(candidate.user._id)) continue;
        if (!(await isPhysioFree(ctx, candidate, slot, options.excludeVisitId))) continue;
        const recent = await ctx.db
            .query("awadocVisits")
            .withIndex("by_physio_and_start", (q) =>
                q.eq("physiotherapistId", candidate.user._id).gt("scheduledStart", Date.now() - 30 * 86400_000)
            )
            .take(50);
        free.push({ candidate, load: recent.filter((v) => v.status !== "cancelled").length });
    }
    if (free.length === 0) return null;
    const maxLoad = Math.max(1, ...free.map((f) => f.load));
    const maxExp = Math.max(1, ...free.map((f) => f.candidate.profile.yearsOfExperience ?? 0));
    const score = (f: (typeof free)[number]) =>
        (1 - f.load / maxLoad) * 0.4 +
        ((f.candidate.profile.averageRating ?? 0) / 5) * 0.4 +
        ((f.candidate.profile.yearsOfExperience ?? 0) / maxExp) * 0.2;
    free.sort((a, b) => score(b) - score(a));
    return free[0].candidate;
}

const SLOT_STEP_MS = 30 * 60_000;
const SEARCH_DAYS = 7;

/**
 * Earliest start at or after `from` (on the half hour) when some eligible physio is free,
 * within a week. Working hours are checked first (no reads), so few calendar reads happen.
 */
export async function findEarliestSlot(ctx: QueryCtx, mode: AwadocMode, from: number, durationMs: number): Promise<number | null> {
    const candidates = await eligiblePhysios(ctx, mode);
    if (candidates.length === 0) return null;
    let start = Math.ceil(from / SLOT_STEP_MS) * SLOT_STEP_MS;
    const stop = from + SEARCH_DAYS * 86400_000;
    let calendarChecks = 0;
    for (; start < stop; start += SLOT_STEP_MS) {
        const slot = { start, end: start + durationMs };
        for (const candidate of candidates) {
            if (!isWithinWorkingHours(candidate.profile.availabilitySchedule, slot.start, slot.end)) continue;
            if (++calendarChecks > 150) return null;
            if (await isPhysioFree(ctx, candidate, slot)) return start;
        }
    }
    return null;
}

// ── Payloads (AwaDoc Therapy Provider Guide) ───────────

const naira = (kobo: number) => Math.round(kobo) / 100;
const iso = (ms: number | undefined) => (ms === undefined ? undefined : new Date(ms).toISOString());

function hhmmss(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

// Therapy ids and guest tokens come from the Next.js route (real randomness); mutation
// randomness is only good enough for event ids.
export function newEventId() {
    return `evt-rh-${crypto.randomUUID()}`;
}

/** The `therapy` object AwaDoc expects in request answers and callbacks. */
export function therapyObject(therapy: Doc<"awadocTherapies">, visit?: Pick<Doc<"awadocVisits">, "scheduledStart">) {
    return {
        id: therapy.therapyId,
        schedule: {
            preferred_mode: therapy.mode,
            preferred_time: iso(visit?.scheduledStart ?? therapy.scheduledStart),
            ...(therapy.preferredLang ? { preferred_lang: therapy.preferredLang } : {}),
        },
        pricing: { amount: naira(therapy.priceKobo), currency: therapy.currency },
    };
}

/** Our physio's id as AwaDoc sees it: their permanent Rehabify ID when they have one. */
export function doctorIdFor(user: Doc<"users">) {
    return user.staffNumber ?? user._id;
}

export function guestLink(therapy: Doc<"awadocTherapies">, visit: Doc<"awadocVisits">) {
    return therapy.guestToken ? `${publicAppUrl()}/video-call/${visit.callId}/guest?guest=${therapy.guestToken}` : undefined;
}

/** Every event we send is in the therapy.* namespace (owner decision, Nov 2026). */
const eventName = (action: string) => `therapy.${action}`;

/** Envelope for events 4 and 5. */
function envelope(action: string, context: Record<string, unknown>) {
    return {
        event_id: newEventId(),
        event_type: eventName(action),
        timestamp: new Date().toISOString(),
        context,
    };
}

export function doctorAssignedBody(therapy: Doc<"awadocTherapies">, visit: Doc<"awadocVisits">, physio: Doc<"users">) {
    const name = [physio.firstName, physio.lastName].filter(Boolean).join(" ").trim() || "Rehabify physiotherapist";
    return envelope("doctor_assigned", {
        therapy: therapyObject(therapy, visit),
        doctor: {
            id: doctorIdFor(physio),
            name,
            ...(physio.email ? { email: physio.email } : {}),
            ...(physio.phoneNumber ? { contact: physio.phoneNumber } : {}),
            ...(physio.imageUrl ? { avatar_url: physio.imageUrl } : {}),
        },
    });
}

export function scheduledBody(therapy: Doc<"awadocTherapies">, visit: Doc<"awadocVisits">) {
    const start = visit.scheduledStart ?? therapy.scheduledStart;
    const end = visit.scheduledEnd ?? therapy.scheduledEnd;
    const link = therapy.mode === "virtual" ? guestLink(therapy, visit) : undefined;
    return envelope("scheduled", {
        therapy: therapyObject(therapy, visit),
        meeting: {
            mode: therapy.mode,
            start_time: iso(start),
            end_time: iso(end),
            duration: hhmmss((end - start) / 60_000),
            ...(link ? { link } : {}),
            ...(therapy.mode === "home_visit" && therapy.address ? { address: therapy.address } : {}),
        },
    });
}

/** Events 6, 7, 8 and 10 use AwaDoc's flat shape. */
export function flatBody(therapy: Doc<"awadocTherapies">, action: string, fields: Record<string, unknown>) {
    return {
        request_id: therapy.requestId,
        therapy_id: therapy.therapyId,
        event: eventName(action),
        ...fields,
    };
}

// ── Outbox ──────────────────────────────────────────────

/** Queue a callback. Same dedupeKey twice → queued once (AwaDoc callbacks must be idempotent). */
export async function enqueueCallback(
    ctx: MutationCtx,
    therapy: Doc<"awadocTherapies">,
    dedupeKey: string,
    body: Record<string, unknown>
) {
    const existing = await ctx.db.query("awadocOutbox").withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey)).first();
    if (existing) return existing._id;
    const now = Date.now();
    const id = await ctx.db.insert("awadocOutbox", {
        therapyId: therapy.therapyId,
        env: therapy.env,
        eventType: String(body.event_type ?? body.event ?? "unknown"),
        body,
        dedupeKey,
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
    });
    // Send right after this mutation commits (claims are leased, so extra kicks are harmless)
    await ctx.scheduler.runAfter(0, (internal as any).awadoc.kickOutbox, {});
    return id;
}

// ── Assignment ──────────────────────────────────────────

/** Video room for a virtual visit, limited to the assigned physio (the patient joins as a guest). */
export async function ensureVideoRoom(ctx: MutationCtx, therapy: Doc<"awadocTherapies">, visit: Doc<"awadocVisits">, physioId: Id<"users">) {
    if (therapy.mode !== "virtual") return;
    const now = Date.now();
    const existing = await ctx.db.query("videoCalls").withIndex("by_room_id", (q) => q.eq("roomId", visit.callId)).first();
    if (existing) {
        await ctx.db.patch(existing._id, {
            initiatorId: physioId,
            participants: [physioId],
            physiotherapistId: physioId,
            scheduledAt: visit.scheduledStart,
            updatedAt: now,
        });
        return;
    }
    const start = visit.scheduledStart ?? now;
    await ctx.db.insert("videoCalls", {
        roomId: visit.callId,
        streamCallId: visit.callId,
        streamCallType: "default",
        title: `AwaDoc consultation: ${therapy.patientName}`,
        callType: "consultation",
        status: "scheduled",
        platform: "stream",
        initiatorId: physioId,
        participants: [physioId],
        physiotherapistId: physioId,
        scheduledAt: start,
        startTime: start,
        plannedDuration: visit.scheduledEnd ? Math.round((visit.scheduledEnd - start) / 60_000) : undefined,
        createdAt: now,
        updatedAt: now,
    });
}

/**
 * Put a physio on a visit: video room, doctor_assigned (+ scheduled once the time is set) to
 * AwaDoc, and a push to the physio.
 */
export async function assignVisit(ctx: MutationCtx, therapyDocId: Id<"awadocTherapies">, visitId: Id<"awadocVisits">, physio: Doc<"users">) {
    const now = Date.now();
    await ctx.db.patch(visitId, { physiotherapistId: physio._id, updatedAt: now });
    await ctx.db.patch(therapyDocId, {
        physiotherapistId: physio._id,
        status: "active",
        updatedAt: now,
    });
    const therapy = (await ctx.db.get(therapyDocId))!;
    const visit = (await ctx.db.get(visitId))!;
    await ensureVideoRoom(ctx, therapy, visit, physio._id);

    await enqueueCallback(ctx, therapy, `${therapy.therapyId}:${visit.visitNumber}:doctor_assigned:${physio._id}`, doctorAssignedBody(therapy, visit, physio));
    if (visit.scheduledStart !== undefined) {
        await enqueueCallback(
            ctx,
            therapy,
            `${therapy.therapyId}:${visit.visitNumber}:scheduled:${visit.scheduledStart}:${physio._id}`,
            scheduledBody(therapy, visit)
        );
    }

    const when = visit.scheduledStart ? lagosDateTime(visit.scheduledStart) : "time to be set by you";
    await insertNotification(ctx, {
        userId: physio._id,
        type: "referral_assigned",
        priority: "high",
        status: "pending",
        payload: {
            title: visit.visitNumber > 1 ? "AwaDoc follow-up confirmed" : "New AwaDoc consultation",
            body: `${therapy.patientName} · ${AWADOC_MODE_LABEL[therapy.mode]} · ${when}`,
            link: `/dashboard/physiotherapist?awadoc=${visit._id}`,
            data: { actionUrl: `/dashboard/physiotherapist?awadoc=${visit._id}`, pushTag: `awadoc-${visit._id}` },
        },
        createdAt: now,
    });
}

/** Tell every admin (bell + push). */
export async function notifyAdmins(ctx: MutationCtx, title: string, body: string) {
    const admins = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).take(25);
    const now = Date.now();
    for (const admin of admins) {
        await insertNotification(ctx, {
            userId: admin._id,
            type: "awadoc_needs_attention",
            priority: "high",
            status: "pending",
            payload: { title, body, link: "/dashboard/admin/awadoc", data: { actionUrl: "/dashboard/admin/awadoc" } },
            createdAt: now,
        });
    }
}

/**
 * Auto-assign the best free physio to a visit with a time. Nobody free → needs_physio and the
 * admins are told. Returns the physio, or null.
 */
export async function autoAssignVisit(
    ctx: MutationCtx,
    therapyDocId: Id<"awadocTherapies">,
    visitId: Id<"awadocVisits">,
    exclude: Id<"users">[] = []
): Promise<Doc<"users"> | null> {
    const therapy = (await ctx.db.get(therapyDocId))!;
    const visit = (await ctx.db.get(visitId))!;
    if (visit.scheduledStart === undefined || visit.scheduledEnd === undefined) return null;
    const picked = await pickPhysio(ctx, therapy.mode, { start: visit.scheduledStart, end: visit.scheduledEnd }, { exclude, excludeVisitId: visit._id });
    if (picked) {
        await assignVisit(ctx, therapyDocId, visitId, picked.user);
        return picked.user;
    }
    await ctx.db.patch(visitId, { physiotherapistId: undefined, updatedAt: Date.now() });
    await ctx.db.patch(therapyDocId, { status: "needs_physio", physiotherapistId: undefined, updatedAt: Date.now() });
    await notifyAdmins(
        ctx,
        "AwaDoc booking needs a physio",
        `${therapy.patientName}, ${lagosDateTime(visit.scheduledStart)}: no network physio is free. Assign one in Admin › AwaDoc.`
    );
    return null;
}
