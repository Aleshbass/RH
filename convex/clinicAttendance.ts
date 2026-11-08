/**
 * Clock-in for clinic teams. The clinic owner switches it on (and off); the clinic's clinicians
 * then clock in when they arrive, take breaks, and clock out when they leave, from the physio
 * portal. The owner sees who's in right now, the day's timeline, and hours over any period.
 *
 * - Opening hours (Clinic settings) say when people are expected: late = after opening + grace.
 * - Optional location check against a pin the owner drops at the clinic. Away from it, a
 *   clock-in either needs a reason (marked for the owner) or is refused, as the owner chooses.
 *   A browser's location can be faked; this keeps honest people honest, it isn't proof.
 * - Phone reminders to clock in and out, an owner summary of who isn't in yet, and forgotten
 *   shifts closed at closing time and marked for review (cron: runClockChecks).
 * - Only the owner changes settings or corrects hours; every correction keeps the old times.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { canUseArea, getClinicMember, getClinicMemberOrNull, getOwnerClinic, normalizeWorkingHours, type ClinicMember } from "./clinicTools";
import { insertNotification } from "./helpers/pushNotify";
import { personName } from "./helpers/displayIdentity";
import { lagosShortDate, lagosTime, zonedDateKey, zonedDateTimeToUtc } from "./helpers/lagosTime";
import {
  CLOCK_DEFAULTS,
  CLOCK_REASON_MAX,
  OFFSITE_REASON_NEEDED,
  addDays,
  formatDistance,
  formatWorked,
  isOnSite,
  metresBetween,
  mondayOf,
  weekDayOf,
  workedMs,
} from "./helpers/clinicClock";

type Ctx = QueryCtx | MutationCtx;
type Settings = Doc<"clinicAttendanceSettings">;
type Shift = Doc<"clinicShifts">;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const OWNER_PAGE = "/dashboard/clinic/attendance";
const CLINICIAN_PAGE = "/dashboard/physiotherapist?clock=1";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function settingsFor(ctx: Ctx, clinicId: Id<"clinics">): Promise<Settings | null> {
  return await ctx.db
    .query("clinicAttendanceSettings")
    .withIndex("by_clinic", (q) => q.eq("clinicId", clinicId))
    .first();
}

/** The settings as the screens use them, with defaults for a clinic that never opened them. */
function settingsView(s: Settings | null) {
  return {
    enabled: s?.enabled ?? false,
    locationCheck: s?.locationCheck ?? CLOCK_DEFAULTS.locationCheck,
    offsiteRule: s?.offsiteRule ?? CLOCK_DEFAULTS.offsiteRule,
    site: s?.siteLat !== undefined && s?.siteLng !== undefined ? { lat: s.siteLat, lng: s.siteLng, pinnedAt: s.sitePinnedAt ?? null } : null,
    siteRadiusM: s?.siteRadiusM ?? CLOCK_DEFAULTS.siteRadiusM,
    graceMinutes: s?.graceMinutes ?? CLOCK_DEFAULTS.graceMinutes,
    remindClockIn: s?.remindClockIn ?? CLOCK_DEFAULTS.remindClockIn,
    remindClockOut: s?.remindClockOut ?? CLOCK_DEFAULTS.remindClockOut,
    ownerAlerts: s?.ownerAlerts ?? CLOCK_DEFAULTS.ownerAlerts,
    exemptUserIds: (s?.exemptUserIds ?? []) as string[],
    enabledAt: s?.enabledAt ?? null,
  };
}

/** True when clock-ins are checked against a pinned location. */
const checksLocation = (s: Settings | null) => Boolean(s?.locationCheck && s.siteLat !== undefined && s.siteLng !== undefined);

/** Opening hours on a Lagos date, or null when the clinic is closed that day. */
function hoursOn(clinic: Doc<"clinics">, dateKey: string) {
  const day = normalizeWorkingHours(clinic.workingHours)[weekDayOf(dateKey)];
  if (!day?.active || !/^\d{2}:\d{2}$/.test(day.open) || !/^\d{2}:\d{2}$/.test(day.close)) return null;
  const openAt = zonedDateTimeToUtc(dateKey, day.open);
  let closeAt = zonedDateTimeToUtc(dateKey, day.close);
  if (closeAt <= openAt) closeAt += DAY; // open past midnight
  return { open: day.open, close: day.close, openAt, closeAt };
}

/** Clinicians on the clinic's team who can sign in (not the owner, not suspended). */
async function teamClinicians(ctx: Ctx, clinic: Doc<"clinics">): Promise<Doc<"users">[]> {
  const profiles = await ctx.db
    .query("physiotherapistProfiles")
    .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
    .collect();
  const seen = new Set<string>();
  const people: Doc<"users">[] = [];
  for (const profile of profiles) {
    if (seen.has(profile.userId)) continue;
    seen.add(profile.userId);
    const user = await ctx.db.get(profile.userId);
    if (
      user &&
      user._id !== clinic.ownerId &&
      user.clinicId === clinic._id &&
      user.role === "physiotherapist" &&
      (!user.status || user.status === "active")
    ) {
      people.push(user);
    }
  }
  return people.sort((a, b) => personName(a).localeCompare(personName(b)));
}

/** A clinician on the signed-in clinic's team. Clocking keeps working while a Rehabify invoice is overdue. */
async function clockMember(ctx: Ctx): Promise<ClinicMember> {
  const member = await getClinicMember(ctx, undefined, { allowBillingReadOnly: true });
  if (member.kind !== "clinician") throw new ConvexError("Only clinicians on the team clock in.");
  return member;
}

/** Owner, or a team member whose role includes the Team page (they can look, not change). */
async function boardMember(ctx: Ctx): Promise<ClinicMember | null> {
  const member = await getClinicMemberOrNull(ctx);
  if (!member) return null;
  if (!member.isOwner && !canUseArea(member, "team")) return null;
  return member;
}

/** The person's open shift, if any (the newest one is the only one that can be open). */
async function openShiftOf(ctx: Ctx, userId: Id<"users">): Promise<Shift | null> {
  const latest = await ctx.db
    .query("clinicShifts")
    .withIndex("by_user_and_clock_in", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  return latest && latest.clockOutAt === undefined ? latest : null;
}

function cleanText(text: string | undefined, max = CLOCK_REASON_MAX) {
  const value = text?.replace(/\s+/g, " ").trim();
  return value ? value.slice(0, max) : undefined;
}

const position = v.optional(
  v.object({
    lat: v.number(),
    lng: v.number(),
    accuracyM: v.optional(v.number()),
  })
);

function assertPosition(p: { lat: number; lng: number; accuracyM?: number } | undefined) {
  if (!p) return;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) {
    throw new ConvexError("That location doesn't look right. Try again.");
  }
}

/** Where they are compared with the clinic's pin, when the clinic checks location. */
function siteCheck(settings: Settings | null, p: { lat: number; lng: number; accuracyM?: number } | undefined) {
  if (!checksLocation(settings) || !p) return undefined;
  const distanceM = metresBetween(p, { lat: settings!.siteLat!, lng: settings!.siteLng! });
  const accuracyM = Math.max(0, Math.round(p.accuracyM ?? 0));
  return { distanceM: Math.round(distanceM), accuracyM, onSite: isOnSite(distanceM, accuracyM, settings!.siteRadiusM) };
}

type ClockLocation = "clinic" | "away" | "unknown" | "unchecked";

function locationOf(check: Shift["inCheck"], hadReason: boolean): ClockLocation {
  if (check) return check.onSite ? "clinic" : "away";
  return hadReason ? "unknown" : "unchecked";
}

function shiftView(shift: Shift) {
  return {
    _id: shift._id as string,
    userId: shift.userId as string,
    dateKey: shift.dateKey,
    clockInAt: shift.clockInAt,
    clockOutAt: shift.clockOutAt ?? null,
    breaks: shift.breaks,
    onBreak: shift.breaks.some((b) => b.endAt === undefined),
    lateMinutes: shift.lateMinutes ?? null,
    offsite: Boolean(shift.inCheck ? !shift.inCheck.onSite : shift.offsiteReason),
    distanceM: shift.inCheck?.distanceM ?? null,
    offsiteReason: shift.offsiteReason ?? null,
    outOffsite: shift.outCheck ? !shift.outCheck.onSite : false,
    // Where they clocked in and out against the clinic's pin, so owners also see "at the clinic":
    // "unknown" = no location from the phone; "unchecked" = the clinic doesn't check location
    location: locationOf(shift.inCheck, Boolean(shift.offsiteReason)),
    accuracyM: shift.inCheck?.accuracyM ?? null,
    outLocation: shift.clockOutAt === undefined ? null : locationOf(shift.outCheck, false),
    outDistanceM: shift.outCheck?.distanceM ?? null,
    note: shift.note ?? null,
    closedBy: shift.closedBy ?? null,
    needsReview: Boolean(shift.needsReview),
    edited: (shift.edits?.length ?? 0) > 0,
    lastEdit: shift.edits?.length
      ? { at: shift.edits[shift.edits.length - 1].at, reason: shift.edits[shift.edits.length - 1].reason }
      : null,
  };
}

async function notify(
  ctx: MutationCtx,
  userId: Id<"users">,
  type: string,
  title: string,
  body: string,
  link: string,
  options: { tag?: string; priority?: "high" | "medium" | "low" } = {}
) {
  await insertNotification(ctx, {
    userId,
    type,
    priority: options.priority ?? "medium",
    status: "pending",
    createdAt: Date.now(),
    payload: { title, body, link, data: { actionUrl: link, ...(options.tag ? { pushTag: options.tag } : {}) } },
  });
}

/** Close a shift: ends an open break at the same moment. */
function closedFields(shift: Shift, at: number) {
  const end = Math.max(at, shift.clockInAt);
  return {
    clockOutAt: end,
    breaks: shift.breaks.map((b) => (b.endAt === undefined ? { ...b, endAt: Math.max(b.startAt, end) } : b)),
  };
}

const firstName = (user: Doc<"users">) => user.firstName?.trim() || personName(user, "A clinician");

// ─────────────────────────────────────────────────────────────────────────────
// Clinician: my clock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The clock for the signed-in clinician. Null for anyone who isn't on a clinic's team;
 * `enabled: false` while the clinic hasn't switched clock-in on.
 */
export const getMyClock = query({
  args: { today: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const member = await getClinicMemberOrNull(ctx).catch(() => null);
    if (!member || member.kind !== "clinician") return null;
    const settings = await settingsFor(ctx, member.clinic._id);
    const open = await openShiftOf(ctx, member.user._id);
    if (!settings?.enabled && !open) return { enabled: false as const };

    const today = args.today && /^\d{4}-\d{2}-\d{2}$/.test(args.today) ? args.today : zonedDateKey(Date.now());
    const monday = mondayOf(today);
    const since = zonedDateTimeToUtc(monday, "00:00");
    const recent = await ctx.db
      .query("clinicShifts")
      .withIndex("by_user_and_clock_in", (q) => q.eq("userId", member.user._id).gte("clockInAt", since - 7 * DAY))
      .order("desc")
      .take(60);
    const hours = hoursOn(member.clinic, today);
    const view = settingsView(settings);

    return {
      enabled: true as const,
      clinicName: member.clinic.name,
      logoUrl: member.clinic.logoUrl ?? null,
      firstName: member.user.firstName?.trim() || null,
      exempt: view.exemptUserIds.includes(member.user._id),
      locationCheck: checksLocation(settings),
      site: checksLocation(settings) ? { lat: settings!.siteLat!, lng: settings!.siteLng!, radiusM: settings!.siteRadiusM } : null,
      offsiteRule: view.offsiteRule,
      graceMinutes: view.graceMinutes,
      hoursToday: hours,
      today,
      weekStart: monday,
      shift: open && open.clinicId === member.clinic._id ? shiftView(open) : null,
      // This week and last, newest first
      shifts: recent.filter((s) => s.clinicId === member.clinic._id && s.dateKey >= addDays(monday, -7)).map(shiftView),
      readOnly: member.clinic.status === "suspended",
    };
  },
});

export const clockIn = mutation({
  args: { position, reason: v.optional(v.string()), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const member = await clockMember(ctx);
    const { clinic, user } = member;
    const settings = await settingsFor(ctx, clinic._id);
    if (!settings?.enabled) throw new ConvexError("Clock-in isn't switched on at your clinic.");
    assertPosition(args.position);

    const now = Date.now();
    const open = await openShiftOf(ctx, user._id);
    if (open && open.clinicId === clinic._id) return { shiftId: open._id, already: true, lateMinutes: open.lateMinutes ?? null };
    // Left over from a clinic they've since left
    if (open) await ctx.db.patch(open._id, { ...closedFields(open, now), closedBy: "auto", needsReview: true });

    const check = siteCheck(settings, args.position);
    let offsite = false;
    if (checksLocation(settings)) {
      if (!check) {
        if (settings.offsiteRule === "block") {
          throw new ConvexError("Turn on location for Rehabify so it can see you're at the clinic, then try again.");
        }
        offsite = true;
      } else if (!check.onSite) {
        if (settings.offsiteRule === "block") {
          throw new ConvexError(`You're ${formatDistance(check.distanceM)} from ${clinic.name}. Clock in when you get there.`);
        }
        offsite = true;
      }
    }
    const reason = cleanText(args.reason);
    if (offsite && !reason) {
      throw new ConvexError({
        code: OFFSITE_REASON_NEEDED,
        distanceM: check?.distanceM ?? null,
        message: check
          ? `You're ${formatDistance(check.distanceM)} from ${clinic.name}. Say why you're clocking in from here.`
          : "Rehabify couldn't see your location. Say why you're clocking in without it.",
      });
    }

    const dateKey = zonedDateKey(now);
    const earlierToday = await ctx.db
      .query("clinicShifts")
      .withIndex("by_clinic_and_date", (q) => q.eq("clinicId", clinic._id).eq("dateKey", dateKey))
      .filter((q) => q.eq(q.field("userId"), user._id))
      .first();
    const hours = hoursOn(clinic, dateKey);
    const lateMinutes =
      !earlierToday && hours && now > hours.openAt + settings.graceMinutes * MINUTE && now < hours.closeAt
        ? Math.round((now - hours.openAt) / MINUTE)
        : undefined;

    const shiftId = await ctx.db.insert("clinicShifts", {
      clinicId: clinic._id,
      userId: user._id,
      dateKey,
      clockInAt: now,
      breaks: [],
      ...(check ? { inCheck: check } : {}),
      ...(offsite && reason ? { offsiteReason: reason } : {}),
      ...(lateMinutes !== undefined ? { lateMinutes } : {}),
      ...(cleanText(args.note) ? { note: cleanText(args.note) } : {}),
    });

    // What the owner hears
    const exception = lateMinutes !== undefined || offsite;
    if (settings.ownerAlerts === "every" || (settings.ownerAlerts === "exceptions" && exception)) {
      const name = personName(user, "A clinician");
      const parts = [lagosTime(now)];
      if (lateMinutes !== undefined) parts.push(`${formatWorked(lateMinutes * MINUTE)} after opening`);
      if (offsite) parts.push(check ? `${formatDistance(check.distanceM)} from the clinic: “${reason}”` : `no location: “${reason}”`);
      else if (check) parts.push("at the clinic");
      await notify(
        ctx,
        clinic.ownerId,
        exception ? "clinic_clock_exception" : "clinic_clock",
        offsite ? `${name} clocked in away from the clinic` : lateMinutes !== undefined ? `${name} clocked in late` : `${name} clocked in`,
        parts.join(" · "),
        OWNER_PAGE,
        { tag: `clock-${user._id}-${dateKey}` }
      );
    }

    return { shiftId, already: false, lateMinutes: lateMinutes ?? null };
  },
});

export const clockOut = mutation({
  args: { position, note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const member = await clockMember(ctx);
    const { clinic, user } = member;
    assertPosition(args.position);
    const open = await openShiftOf(ctx, user._id);
    if (!open || open.clinicId !== clinic._id) throw new ConvexError("You're not clocked in.");

    const now = Date.now();
    const settings = await settingsFor(ctx, clinic._id);
    const check = siteCheck(settings, args.position);
    const note = cleanText(args.note);
    const closed = closedFields(open, now);
    await ctx.db.patch(open._id, {
      ...closed,
      closedBy: "self",
      ...(check ? { outCheck: check } : {}),
      ...(note ? { note: open.note ? `${open.note} · ${note}`.slice(0, 400) : note } : {}),
    });

    const worked = workedMs({ ...open, ...closed }, now);
    if (settings?.ownerAlerts === "every") {
      await notify(
        ctx,
        clinic.ownerId,
        "clinic_clock",
        `${personName(user, "A clinician")} clocked out`,
        `${lagosTime(now)} · ${formatWorked(worked)} worked`,
        OWNER_PAGE,
        { tag: `clock-${user._id}-${open.dateKey}` }
      );
    }
    return { workedMs: worked, clockInAt: open.clockInAt, clockOutAt: now };
  },
});

export const startBreak = mutation({
  args: {},
  handler: async (ctx) => {
    const member = await clockMember(ctx);
    const open = await openShiftOf(ctx, member.user._id);
    if (!open || open.clinicId !== member.clinic._id) throw new ConvexError("Clock in first.");
    if (open.breaks.some((b) => b.endAt === undefined)) return null;
    if (open.breaks.length >= 20) throw new ConvexError("That's a lot of breaks for one day. Ask your clinic owner to fix your hours.");
    await ctx.db.patch(open._id, { breaks: [...open.breaks, { startAt: Date.now() }] });
    return null;
  },
});

export const endBreak = mutation({
  args: {},
  handler: async (ctx) => {
    const member = await clockMember(ctx);
    const open = await openShiftOf(ctx, member.user._id);
    if (!open || open.clinicId !== member.clinic._id) throw new ConvexError("You're not clocked in.");
    const now = Date.now();
    await ctx.db.patch(open._id, {
      breaks: open.breaks.map((b) => (b.endAt === undefined ? { ...b, endAt: Math.max(b.startAt, now) } : b)),
    });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Owner: the board, history and settings
// ─────────────────────────────────────────────────────────────────────────────

/** Who's in right now, today's shifts and this week's, for the clinic's Clock-in page and Home. */
export const getClockBoard = query({
  args: { today: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const member = await boardMember(ctx);
    if (!member) return null;
    const { clinic } = member;
    const settings = await settingsFor(ctx, clinic._id);
    const view = settingsView(settings);
    const today = args.today && /^\d{4}-\d{2}-\d{2}$/.test(args.today) ? args.today : zonedDateKey(Date.now());
    const monday = mondayOf(today);

    const [team, weekShifts, openShifts] = await Promise.all([
      teamClinicians(ctx, clinic),
      ctx.db
        .query("clinicShifts")
        .withIndex("by_clinic_and_date", (q) => q.eq("clinicId", clinic._id).gte("dateKey", monday).lte("dateKey", today))
        .take(2000),
      ctx.db
        .query("clinicShifts")
        .withIndex("by_clinic_and_out", (q) => q.eq("clinicId", clinic._id).eq("clockOutAt", undefined))
        .take(200),
    ]);

    // Today's shifts, plus anything still open from before today (worked past midnight, or forgotten)
    const todayShifts = weekShifts.filter((s) => s.dateKey === today);
    for (const s of openShifts) if (s.dateKey !== today) todayShifts.push(s);
    const exempt = new Set(view.exemptUserIds);
    const teamIds = new Set(team.map((u) => u._id as string));

    // People who left the team keep their past shifts in History, not on today's board
    const people = team.map((user) => {
      const mine = todayShifts.filter((s) => s.userId === user._id).sort((a, b) => a.clockInAt - b.clockInAt);
      const open = mine.find((s) => s.clockOutAt === undefined) ?? null;
      const status = open
        ? open.breaks.some((b) => b.endAt === undefined)
          ? ("on_break" as const)
          : ("working" as const)
        : mine.length > 0
          ? ("out" as const)
          : exempt.has(user._id)
            ? ("off" as const)
            : ("not_in" as const);
      return {
        userId: user._id as string,
        name: personName(user, "Clinician"),
        imageUrl: user.imageUrl ?? null,
        exempt: exempt.has(user._id),
        status,
        shifts: mine.map(shiftView),
      };
    });

    const weekOf = weekShifts
      .filter((s) => teamIds.has(s.userId))
      .map((s) => ({ userId: s.userId as string, dateKey: s.dateKey, clockInAt: s.clockInAt, clockOutAt: s.clockOutAt ?? null, breaks: s.breaks }));
    const reviewCount = weekShifts.filter((s) => s.needsReview).length;

    return {
      canManage: member.isOwner,
      clinicName: clinic.name,
      settings: view,
      hoursToday: hoursOn(clinic, today),
      today,
      weekStart: monday,
      people,
      weekShifts: weekOf,
      reviewCount,
    };
  },
});

/** Every shift between two Lagos dates (at most about three months), for History and export. */
export const getClockHistory = query({
  args: { from: v.string(), to: v.string(), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const member = await boardMember(ctx);
    if (!member) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.from) || !/^\d{4}-\d{2}-\d{2}$/.test(args.to) || args.from > args.to) {
      throw new ConvexError("Choose a start date before the end date.");
    }
    const from = args.from < addDays(args.to, -93) ? addDays(args.to, -93) : args.from;
    let shifts = await ctx.db
      .query("clinicShifts")
      .withIndex("by_clinic_and_date", (q) => q.eq("clinicId", member.clinic._id).gte("dateKey", from).lte("dateKey", args.to))
      .order("desc")
      .take(3000);
    if (args.userId) shifts = shifts.filter((s) => s.userId === args.userId);

    const names = new Map<string, string>();
    for (const id of new Set(shifts.map((s) => s.userId))) {
      names.set(id, personName(await ctx.db.get(id), "Former clinician"));
    }
    const team = await teamClinicians(ctx, member.clinic);
    return {
      canManage: member.isOwner,
      clinicName: member.clinic.name,
      from,
      to: args.to,
      team: team.map((u) => ({ userId: u._id as string, name: personName(u, "Clinician") })),
      shifts: shifts.map((s) => ({ ...shiftView(s), name: names.get(s.userId) ?? "Clinician" })),
      truncated: shifts.length >= 3000,
    };
  },
});

/** Owner: switch clock-in on or off, and how it works. Only the fields given change. */
export const saveClockSettings = mutation({
  args: {
    enabled: v.optional(v.boolean()),
    locationCheck: v.optional(v.boolean()),
    offsiteRule: v.optional(v.union(v.literal("flag"), v.literal("block"))),
    siteRadiusM: v.optional(v.number()),
    graceMinutes: v.optional(v.number()),
    remindClockIn: v.optional(v.boolean()),
    remindClockOut: v.optional(v.boolean()),
    ownerAlerts: v.optional(v.union(v.literal("exceptions"), v.literal("every"), v.literal("none"))),
    exemptUserIds: v.optional(v.array(v.id("users"))),
    // The owner's phone, standing in the clinic. null removes the pin.
    site: v.optional(v.union(v.null(), v.object({ lat: v.number(), lng: v.number(), accuracyM: v.optional(v.number()) }))),
  },
  handler: async (ctx, args) => {
    const member = await getOwnerClinic(ctx, { allowBillingReadOnly: true });
    const { clinic, user } = member;
    const existing = await settingsFor(ctx, clinic._id);
    const now = Date.now();

    if (args.siteRadiusM !== undefined && (!Number.isFinite(args.siteRadiusM) || args.siteRadiusM < 30 || args.siteRadiusM > 2000)) {
      throw new ConvexError("Choose a distance between 30 m and 2 km.");
    }
    if (args.graceMinutes !== undefined && (!Number.isInteger(args.graceMinutes) || args.graceMinutes < 0 || args.graceMinutes > 120)) {
      throw new ConvexError("Choose between 0 and 120 minutes.");
    }
    if (args.site) {
      assertPosition(args.site);
      if ((args.site.accuracyM ?? 0) > 500) {
        throw new ConvexError("Your location is too rough to pin the clinic (more than 500 m out). Try on a phone, outside or near a window.");
      }
    }
    let exemptUserIds = args.exemptUserIds;
    if (exemptUserIds) {
      const team = new Set((await teamClinicians(ctx, clinic)).map((u) => u._id as string));
      exemptUserIds = [...new Set(exemptUserIds)].filter((id) => team.has(id));
    }

    const patch = {
      ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
      ...(args.locationCheck !== undefined ? { locationCheck: args.locationCheck } : {}),
      ...(args.offsiteRule ? { offsiteRule: args.offsiteRule } : {}),
      ...(args.siteRadiusM !== undefined ? { siteRadiusM: Math.round(args.siteRadiusM) } : {}),
      ...(args.graceMinutes !== undefined ? { graceMinutes: args.graceMinutes } : {}),
      ...(args.remindClockIn !== undefined ? { remindClockIn: args.remindClockIn } : {}),
      ...(args.remindClockOut !== undefined ? { remindClockOut: args.remindClockOut } : {}),
      ...(args.ownerAlerts ? { ownerAlerts: args.ownerAlerts } : {}),
      ...(exemptUserIds ? { exemptUserIds } : {}),
      ...(args.site ? { siteLat: args.site.lat, siteLng: args.site.lng, sitePinnedAt: now } : {}),
      ...(args.site === null ? { siteLat: undefined, siteLng: undefined, sitePinnedAt: undefined } : {}),
      updatedAt: now,
      updatedBy: user._id,
    };

    const wasOn = existing?.enabled === true;
    const turningOn = args.enabled === true && !wasOn;
    const turningOff = args.enabled === false && wasOn;

    if (existing) {
      await ctx.db.patch(existing._id, { ...patch, ...(turningOn ? { enabledAt: now } : {}) });
    } else {
      await ctx.db.insert("clinicAttendanceSettings", {
        clinicId: clinic._id,
        enabled: args.enabled ?? false,
        locationCheck: args.locationCheck ?? CLOCK_DEFAULTS.locationCheck,
        offsiteRule: args.offsiteRule ?? CLOCK_DEFAULTS.offsiteRule,
        siteRadiusM: args.siteRadiusM !== undefined ? Math.round(args.siteRadiusM) : CLOCK_DEFAULTS.siteRadiusM,
        graceMinutes: args.graceMinutes ?? CLOCK_DEFAULTS.graceMinutes,
        remindClockIn: args.remindClockIn ?? CLOCK_DEFAULTS.remindClockIn,
        remindClockOut: args.remindClockOut ?? CLOCK_DEFAULTS.remindClockOut,
        ownerAlerts: args.ownerAlerts ?? CLOCK_DEFAULTS.ownerAlerts,
        exemptUserIds: exemptUserIds ?? [],
        ...(args.site ? { siteLat: args.site.lat, siteLng: args.site.lng, sitePinnedAt: now } : {}),
        ...(turningOn ? { enabledAt: now } : {}),
        updatedAt: now,
        updatedBy: user._id,
      });
    }

    if (turningOn) {
      const exempt = new Set((exemptUserIds ?? existing?.exemptUserIds ?? []) as string[]);
      for (const person of await teamClinicians(ctx, clinic)) {
        if (exempt.has(person._id)) continue;
        await notify(
          ctx,
          person._id,
          "clinic_clock_enabled",
          `Clock-in is on at ${clinic.name}`,
          "Clock in when you arrive and out when you leave, from your Rehabify dashboard. Tap to see it.",
          CLINICIAN_PAGE
        );
      }
    }

    if (turningOff) {
      // Nobody stays clocked in to a switched-off clock
      const open = await ctx.db
        .query("clinicShifts")
        .withIndex("by_clinic_and_out", (q) => q.eq("clinicId", clinic._id).eq("clockOutAt", undefined))
        .take(200);
      for (const shift of open) {
        await ctx.db.patch(shift._id, { ...closedFields(shift, now), closedBy: "owner" });
        await notify(
          ctx,
          shift.userId,
          "clinic_clock_corrected",
          `${clinic.name} switched clock-in off`,
          `You were clocked out at ${lagosTime(now)}.`,
          CLINICIAN_PAGE
        );
      }
    }

    return { enabled: args.enabled ?? existing?.enabled ?? false };
  },
});

async function ownerShift(ctx: MutationCtx, shiftId: Id<"clinicShifts">) {
  const member = await getOwnerClinic(ctx, { allowBillingReadOnly: true });
  const shift = await ctx.db.get(shiftId);
  if (!shift || shift.clinicId !== member.clinic._id) throw new ConvexError("That shift isn't at your clinic.");
  return { member, shift };
}

function assertShiftTimes(clockInAt: number, clockOutAt: number | undefined, now: number) {
  if (!Number.isFinite(clockInAt) || clockInAt < now - 400 * DAY) throw new ConvexError("Choose a clock-in time in the last year.");
  if (clockInAt > now + 5 * MINUTE) throw new ConvexError("The clock-in time can't be in the future.");
  if (clockOutAt !== undefined) {
    if (!Number.isFinite(clockOutAt) || clockOutAt <= clockInAt) throw new ConvexError("Clock-out has to be after clock-in.");
    if (clockOutAt > now + 5 * MINUTE) throw new ConvexError("The clock-out time can't be in the future.");
    if (clockOutAt - clockInAt > DAY) throw new ConvexError("A shift can't be longer than 24 hours.");
  }
}

/** Breaks that still fit inside the corrected shift. */
function fitBreaks(breaks: Shift["breaks"], clockInAt: number, clockOutAt: number | undefined) {
  return breaks
    .filter((b) => b.startAt >= clockInAt && (clockOutAt === undefined || b.startAt < clockOutAt))
    .map((b) => (clockOutAt !== undefined && (b.endAt === undefined || b.endAt > clockOutAt) ? { ...b, endAt: clockOutAt } : b));
}

/** Owner: correct a shift's times. The old times are kept with the reason, and the clinician is told. */
export const correctShift = mutation({
  args: {
    shiftId: v.id("clinicShifts"),
    clockInAt: v.number(),
    clockOutAt: v.optional(v.number()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { member, shift } = await ownerShift(ctx, args.shiftId);
    const reason = cleanText(args.reason);
    if (!reason) throw new ConvexError("Say why you're changing these times.");
    const now = Date.now();
    // A closed shift stays closed
    const clockOutAt = args.clockOutAt ?? shift.clockOutAt;
    assertShiftTimes(args.clockInAt, clockOutAt, now);

    await ctx.db.patch(shift._id, {
      clockInAt: args.clockInAt,
      clockOutAt,
      dateKey: zonedDateKey(args.clockInAt),
      breaks: fitBreaks(shift.breaks, args.clockInAt, clockOutAt),
      ...(clockOutAt !== undefined && shift.clockOutAt === undefined ? { closedBy: "owner" as const } : {}),
      needsReview: false,
      edits: [
        ...(shift.edits ?? []),
        { byUserId: member.user._id, at: now, reason, before: { clockInAt: shift.clockInAt, clockOutAt: shift.clockOutAt } },
      ].slice(-20),
    });

    const span = clockOutAt !== undefined ? `${lagosTime(args.clockInAt)} – ${lagosTime(clockOutAt)}` : `in at ${lagosTime(args.clockInAt)}`;
    await notify(
      ctx,
      shift.userId,
      "clinic_clock_corrected",
      `${member.clinic.name} corrected your hours for ${lagosShortDate(args.clockInAt)}`,
      `${span}. Reason: ${reason}`,
      CLINICIAN_PAGE
    );
    return null;
  },
});

/** Owner: clock someone out now (they forgot, or left without their phone). */
export const clockOutForClinician = mutation({
  args: { shiftId: v.id("clinicShifts"), at: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { member, shift } = await ownerShift(ctx, args.shiftId);
    if (shift.clockOutAt !== undefined) return null;
    const now = Date.now();
    const at = args.at ?? now;
    assertShiftTimes(shift.clockInAt, Math.max(at, shift.clockInAt + MINUTE), now);
    await ctx.db.patch(shift._id, { ...closedFields(shift, Math.max(at, shift.clockInAt + MINUTE)), closedBy: "owner", needsReview: false });
    await notify(
      ctx,
      shift.userId,
      "clinic_clock_corrected",
      `${member.clinic.name} clocked you out`,
      `Clocked out at ${lagosTime(Math.max(at, shift.clockInAt + MINUTE))}.`,
      CLINICIAN_PAGE
    );
    return null;
  },
});

/** Owner: add a shift someone forgot to clock at all. */
export const addMissedShift = mutation({
  args: { userId: v.id("users"), clockInAt: v.number(), clockOutAt: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const member = await getOwnerClinic(ctx, { allowBillingReadOnly: true });
    const team = await teamClinicians(ctx, member.clinic);
    if (!team.some((u) => u._id === args.userId)) throw new ConvexError("Choose someone on your team.");
    const reason = cleanText(args.reason);
    if (!reason) throw new ConvexError("Say why you're adding this shift.");
    const now = Date.now();
    assertShiftTimes(args.clockInAt, args.clockOutAt, now);
    const open = await openShiftOf(ctx, args.userId);
    if (open && args.clockOutAt > open.clockInAt) throw new ConvexError("They're clocked in from before then. Close that shift first.");

    await ctx.db.insert("clinicShifts", {
      clinicId: member.clinic._id,
      userId: args.userId,
      dateKey: zonedDateKey(args.clockInAt),
      clockInAt: args.clockInAt,
      clockOutAt: args.clockOutAt,
      breaks: [],
      closedBy: "owner",
      edits: [{ byUserId: member.user._id, at: now, reason: `Added by the clinic: ${reason}`, before: { clockInAt: args.clockInAt } }],
    });
    await notify(
      ctx,
      args.userId,
      "clinic_clock_corrected",
      `${member.clinic.name} added a shift for ${lagosShortDate(args.clockInAt)}`,
      `${lagosTime(args.clockInAt)} – ${lagosTime(args.clockOutAt)}. Reason: ${reason}`,
      CLINICIAN_PAGE
    );
    return null;
  },
});

/** Owner: the shift looks right (clears "Check this" after an automatic clock-out). */
export const markShiftReviewed = mutation({
  args: { shiftId: v.id("clinicShifts") },
  handler: async (ctx, args) => {
    const { shift } = await ownerShift(ctx, args.shiftId);
    if (shift.needsReview) await ctx.db.patch(shift._id, { needsReview: false });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Every 10 minutes: reminders and forgotten shifts
// ─────────────────────────────────────────────────────────────────────────────

async function nudgedAlready(ctx: MutationCtx, userId: Id<"users">, dateKey: string, kind: Doc<"clinicClockNudges">["kind"]) {
  const row = await ctx.db
    .query("clinicClockNudges")
    .withIndex("by_user_date_kind", (q) => q.eq("userId", userId).eq("dateKey", dateKey).eq("kind", kind))
    .first();
  return Boolean(row);
}

export const runClockChecks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = zonedDateKey(now);
    const clinics = new Map<string, Doc<"clinics"> | null>();
    const clinicOf = async (id: Id<"clinics">) => {
      if (!clinics.has(id)) clinics.set(id, await ctx.db.get(id));
      return clinics.get(id) ?? null;
    };
    const settingsCache = new Map<string, Settings | null>();
    const settingsOf = async (id: Id<"clinics">) => {
      if (!settingsCache.has(id)) settingsCache.set(id, await settingsFor(ctx, id));
      return settingsCache.get(id) ?? null;
    };

    // 1. Forgotten clock-outs: three hours after closing time (or 11 hours in, on a day without
    //    hours), close the shift at closing time and mark it for the owner to check.
    const open = await ctx.db
      .query("clinicShifts")
      .withIndex("by_out", (q) => q.eq("clockOutAt", undefined))
      .take(500);
    for (const shift of open) {
      const clinic = await clinicOf(shift.clinicId);
      if (!clinic) continue;
      const hours = hoursOn(clinic, shift.dateKey);
      let closeAt = hours && shift.clockInAt < hours.closeAt ? hours.closeAt : shift.clockInAt + 8 * HOUR;
      const lastBreakStart = Math.max(0, ...shift.breaks.map((b) => b.startAt));
      closeAt = Math.max(closeAt, lastBreakStart, shift.clockInAt + MINUTE);
      if (now < closeAt + 3 * HOUR) continue;

      await ctx.db.patch(shift._id, { ...closedFields(shift, closeAt), closedBy: "auto", needsReview: true });
      await notify(
        ctx,
        shift.userId,
        "clinic_clock_auto_closed",
        `You were clocked out at ${lagosTime(closeAt)}`,
        `You didn't clock out on ${lagosShortDate(shift.clockInAt)}, so Rehabify closed your shift${hours ? " at closing time" : ""}. ${clinic.name} will check it.`,
        CLINICIAN_PAGE
      );
      const settings = await settingsOf(clinic._id);
      if (settings?.ownerAlerts !== "none") {
        const person = await ctx.db.get(shift.userId);
        await notify(
          ctx,
          clinic.ownerId,
          "clinic_clock_exception",
          `${personName(person, "A clinician")} didn't clock out`,
          `Their ${lagosShortDate(shift.clockInAt)} shift was closed at ${lagosTime(closeAt)}. Check it on Clock-in.`,
          OWNER_PAGE,
          { priority: "low" }
        );
      }
    }

    // 2. Reminders at clinics that are open today
    const enabled = await ctx.db
      .query("clinicAttendanceSettings")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .take(500);
    for (const settings of enabled) {
      const clinic = await clinicOf(settings.clinicId);
      if (!clinic || clinic.status === "suspended") continue;
      const hours = hoursOn(clinic, today);
      if (!hours) continue;

      const remindAt = hours.openAt + settings.graceMinutes * MINUTE;
      const inWindow = now >= remindAt && now < Math.min(remindAt + 3 * HOUR, hours.closeAt);
      const outWindow = now >= hours.closeAt + 30 * MINUTE && now < hours.closeAt + 3 * HOUR;
      const ownerWindow = now >= remindAt + 45 * MINUTE && now < Math.min(remindAt + 4 * HOUR, hours.closeAt);
      if (!inWindow && !outWindow && !ownerWindow) continue;

      const exempt = new Set(settings.exemptUserIds as string[]);
      const team = (await teamClinicians(ctx, clinic)).filter((u) => !exempt.has(u._id));
      if (team.length === 0) continue;
      const todays = await ctx.db
        .query("clinicShifts")
        .withIndex("by_clinic_and_date", (q) => q.eq("clinicId", clinic._id).eq("dateKey", today))
        .take(500);
      const cameIn = new Set(todays.map((s) => s.userId as string));
      const missing = team.filter((u) => !cameIn.has(u._id));

      if (inWindow && settings.remindClockIn) {
        for (const person of missing) {
          if (await nudgedAlready(ctx, person._id, today, "clock_in")) continue;
          await ctx.db.insert("clinicClockNudges", { clinicId: clinic._id, userId: person._id, dateKey: today, kind: "clock_in", sentAt: now });
          await notify(
            ctx,
            person._id,
            "clinic_clock_reminder",
            `Clock in at ${clinic.name}`,
            `${firstName(person)}, the clinic opened at ${lagosTime(hours.openAt)}. Tap to clock in when you're there.`,
            CLINICIAN_PAGE,
            { tag: `clock-reminder-${today}`, priority: "high" }
          );
        }
      }

      if (ownerWindow && missing.length > 0 && settings.ownerAlerts !== "none" && !(await nudgedAlready(ctx, clinic.ownerId, today, "owner_missing"))) {
        await ctx.db.insert("clinicClockNudges", { clinicId: clinic._id, userId: clinic.ownerId, dateKey: today, kind: "owner_missing", sentAt: now });
        const names = missing.slice(0, 3).map((u) => personName(u, "Clinician"));
        const more = missing.length > 3 ? ` and ${missing.length - 3} more` : "";
        await notify(
          ctx,
          clinic.ownerId,
          "clinic_clock_missing",
          missing.length === 1 ? `${names[0]} hasn't clocked in` : `${missing.length} clinicians haven't clocked in`,
          `${names.join(", ")}${more} · you opened at ${lagosTime(hours.openAt)}.`,
          OWNER_PAGE,
          { tag: `clock-missing-${today}` }
        );
      }

      if (outWindow && settings.remindClockOut) {
        for (const shift of todays) {
          if (shift.clockOutAt !== undefined || exempt.has(shift.userId)) continue;
          if (await nudgedAlready(ctx, shift.userId, today, "clock_out")) continue;
          await ctx.db.insert("clinicClockNudges", { clinicId: clinic._id, userId: shift.userId, dateKey: today, kind: "clock_out", sentAt: now });
          await notify(
            ctx,
            shift.userId,
            "clinic_clock_out_reminder",
            "Still at work?",
            `${clinic.name} closed at ${lagosTime(hours.closeAt)}. Clock out when you leave · ${formatWorked(workedMs(shift, now))} so far.`,
            CLINICIAN_PAGE,
            { tag: `clock-reminder-${today}` }
          );
        }
      }
    }
    return null;
  },
});

/** Reminder rows older than two weeks aren't needed (daily). */
export const purgeOldNudges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = zonedDateKey(Date.now() - 14 * DAY);
    const rows = await ctx.db.query("clinicClockNudges").take(1000);
    let removed = 0;
    for (const row of rows) {
      if (row.dateKey < cutoff) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }
    return removed;
  },
});
