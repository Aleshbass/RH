/**
 * Relationship moments. For every patient on the platform: birthdays, care anniversaries ("a year
 * since your first visit") and a check-in 3 months after discharge. For the people who work on
 * it (physios, clinic owners and clinic teams): their birthdays.
 *
 * Each moment has an owner: the clinic for a clinic's patients (and its team's birthdays), the
 * physio for their own patients, and Rehabify for patients with no care team yet and for every
 * physio, clinic owner and team member's own birthday. Every morning the planner (06:00 WAT) writes
 * the next two weeks into careMoments. At 08:00 WAT birthday wishes go out on their own where the
 * owner left that on (one automatic wish per person per day, clinic first), and each care team
 * gets a heads-up. Everything else waits on Home: send the message, WhatsApp, or mark it called.
 * Patients can turn the messages off in Settings.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { insertNotification } from "./helpers/pushNotify";
import { canUseArea, getClinicMember, getClinicMemberOrNull, getOwnerClinic } from "./clinicTools";
import { currentUser, requirePhysio } from "./helpers/careAccess";
import { liveCareGrantsFor } from "./helpers/careCircleAccess";
import { personName } from "./helpers/displayIdentity";
import { zonedDateKey } from "./helpers/lagosTime";
import { normalizePhone } from "./helpers/partnerShared";
import { publicAppUrl } from "./helpers/appUrl";
import { isJoyLoginEmail } from "../lib/auth/joyLoginEmail";
import {
  DISCHARGE_CHECKIN_DAYS,
  MOMENT_WINDOW_DAYS,
  addDays,
  birthYear,
  birthdayMonthDay,
  dayInYear,
  momentMessage,
  momentTitle,
  nextYearly,
  toMonthDay,
  type CareMomentKind,
  type MomentRecipient,
} from "./helpers/careMoments";

type Ctx = QueryCtx | MutationCtx;
type Moment = Doc<"careMoments">;

const REHABIFY = "rehabify";
const clinicKey = (id: Id<"clinics">) => `clinic:${id}`;
const physioKey = (id: Id<"users">) => `physio:${id}`;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const RELATIONSHIP_PAGE = 50;
const PROFILE_PAGE = 200;
const TEAM_PAGE = 200;

/** People who work on the platform: Rehabify wishes them on their birthday. */
const TEAM_ROLES = ["physiotherapist", "clinic_owner", "clinic_staff"] as const;
type TeamRole = (typeof TEAM_ROLES)[number];
const isTeamRole = (role: Doc<"users">["role"]): role is TeamRole => (TEAM_ROLES as readonly string[]).includes(role ?? "");

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Plain references: the generated api types sit at TypeScript's depth limit
const ref = {
  planRelationshipsPage: makeFunctionReference<
    "mutation",
    { cursor: string | null; today: string },
    { cursor: string; isDone: boolean; seen: { ownerKey: string; personId: string; hasBirthday: boolean }[] }
  >("careMoments:planRelationshipsPage"),
  planUnattachedPage: makeFunctionReference<"mutation", { cursor: string | null; today: string }, { cursor: string; isDone: boolean }>(
    "careMoments:planUnattachedPage"
  ),
  planTeamPage: makeFunctionReference<
    "mutation",
    { cursor: string | null; today: string; role: TeamRole },
    { cursor: string; isDone: boolean }
  >("careMoments:planTeamPage"),
  saveOwnerStats: makeFunctionReference<
    "mutation",
    { stats: { ownerKey: string; patientCount: number; missingBirthdayCount: number }[] },
    null
  >("careMoments:saveOwnerStats"),
  sendPatientCareEmail: makeFunctionReference<
    "action",
    {
      to: string;
      subject: string;
      heading: string;
      paragraphs: string[];
      greetingName?: string;
      skipGreeting?: boolean;
      fromName?: string;
      buttonLabel?: string;
      buttonUrl?: string;
      footnote?: string;
    },
    unknown
  >("actions/emails/sendPatientCareEmail:sendPatientCareEmail"),
};

// ── Settings ──────────────────────────────────────────────────────────────────

type Settings = {
  autoBirthday: boolean;
  birthdayMessage: string | null;
  includePastPatients: boolean;
  anniversaries: boolean;
  dischargeCheckins: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  autoBirthday: true,
  birthdayMessage: null,
  includePastPatients: true,
  anniversaries: true,
  dischargeCheckins: true,
};

async function settingsRow(ctx: Ctx, ownerKey: string) {
  return await ctx.db
    .query("careMomentSettings")
    .withIndex("by_owner", (q) => q.eq("ownerKey", ownerKey))
    .first();
}

async function settingsFor(ctx: Ctx, ownerKey: string): Promise<Settings> {
  const row = await settingsRow(ctx, ownerKey);
  if (!row) return DEFAULT_SETTINGS;
  return {
    autoBirthday: row.autoBirthday,
    birthdayMessage: row.birthdayMessage ?? null,
    includePastPatients: row.includePastPatients,
    anniversaries: row.anniversaries,
    dischargeCheckins: row.dischargeCheckins,
  };
}

// ── People and birthdays ──────────────────────────────────────────────────────

async function profileOf(ctx: Ctx, patient: Doc<"users">) {
  return (
    (patient.patientProfileId ? await ctx.db.get(patient.patientProfileId) : null) ??
    (await ctx.db
      .query("patientProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", patient._id))
      .first())
  );
}

const isLive = (user: Doc<"users"> | null): user is Doc<"users"> => !!user && !user.deletedAt;
const isLivePatient = (user: Doc<"users"> | null): user is Doc<"users"> => isLive(user) && user.role === "patient";

type PersonBirthday = { monthDay: string | null; year: number | null; optedOut: boolean };

/** A patient's birthday lives on their profile; everyone else's on their account. */
async function birthdayOf(ctx: Ctx, user: Doc<"users">): Promise<PersonBirthday> {
  if (user.role === "patient") {
    const profile = await profileOf(ctx, user);
    return { monthDay: birthdayMonthDay(profile), year: birthYear(profile), optedOut: !!profile?.celebrationsOptOut };
  }
  const monthDay = user.birthdayMonthDay && MONTH_DAY.test(user.birthdayMonthDay) ? user.birthdayMonthDay : null;
  return { monthDay, year: monthDay ? user.birthYear ?? null : null, optedOut: false };
}

// ── Planning ──────────────────────────────────────────────────────────────────

type Owner = { ownerKey: string; clinicId?: Id<"clinics">; physiotherapistId?: Id<"users"> };

function ownerOf(rel: Doc<"patientPhysiotherapistRelationships">): Owner {
  return rel.clinicId
    ? { ownerKey: clinicKey(rel.clinicId), clinicId: rel.clinicId }
    : { ownerKey: physioKey(rel.physiotherapistId), physiotherapistId: rel.physiotherapistId };
}

async function upsertMoment(
  ctx: MutationCtx,
  moment: Owner & { personId: Id<"users">; kind: CareMomentKind; date: string; occurrence: string; years?: number }
) {
  const rows = await ctx.db
    .query("careMoments")
    .withIndex("by_person_and_occurrence", (q) =>
      q.eq("personId", moment.personId).eq("kind", moment.kind).eq("occurrence", moment.occurrence)
    )
    .collect();
  const existing = rows.find((row) => row.ownerKey === moment.ownerKey);
  const now = Date.now();
  if (!existing) {
    await ctx.db.insert("careMoments", { ...moment, status: "upcoming", createdAt: now, updatedAt: now });
  } else if (existing.status === "upcoming" && (existing.date !== moment.date || existing.years !== moment.years)) {
    await ctx.db.patch(existing._id, { date: moment.date, years: moment.years, updatedAt: now });
  }
}

/** The next birthday in the planning window, as a moment's date, occurrence and age. */
function upcomingBirthday(birthday: PersonBirthday, today: string) {
  if (!birthday.monthDay || birthday.optedOut) return null;
  const next = nextYearly(birthday.monthDay, today);
  if (next.date > addDays(today, MOMENT_WINDOW_DAYS)) return null;
  return { date: next.date, occurrence: String(next.year), years: birthday.year ? next.year - birthday.year : undefined };
}

type PlanCache = { settings: Map<string, Settings> };

/**
 * Plans the moments one care relationship owns in the next two weeks. Returns what it saw, for the
 * "patients without a birthday" count, or null when the relationship is out of scope.
 */
async function planRelationship(
  ctx: MutationCtx,
  rel: Doc<"patientPhysiotherapistRelationships">,
  today: string,
  cache: PlanCache
): Promise<{ ownerKey: string; personId: string; hasBirthday: boolean } | null> {
  const owner = ownerOf(rel);
  let settings = cache.settings.get(owner.ownerKey);
  if (!settings) {
    settings = await settingsFor(ctx, owner.ownerKey);
    cache.settings.set(owner.ownerKey, settings);
  }
  // Past patients stay in touch for a year after their care ended, if the team wants that
  if (rel.status !== "active" && (!settings.includePastPatients || Date.now() - (rel.endDate ?? rel.startDate) > YEAR_MS)) {
    return null;
  }

  const patient = await ctx.db.get(rel.patientId);
  if (!isLivePatient(patient)) return null;
  const birthday = await birthdayOf(ctx, patient);
  const seen = { ownerKey: owner.ownerKey, personId: patient._id as string, hasBirthday: !!birthday.monthDay };
  if (birthday.optedOut) return seen;

  const party = upcomingBirthday(birthday, today);
  if (party) await upsertMoment(ctx, { ...owner, personId: patient._id, kind: "birthday", ...party });

  if (!settings.anniversaries && !settings.dischargeCheckins) return seen;

  // Visits with this care team: the whole clinic for a clinic patient, else this physio
  const until = addDays(today, MOMENT_WINDOW_DAYS);
  const visits = (
    await ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patient._id))
      .take(100)
  ).filter((a) => (rel.clinicId ? a.clinicId === rel.clinicId || a.physiotherapistId === rel.physiotherapistId : a.physiotherapistId === rel.physiotherapistId));

  if (settings.anniversaries) {
    const first = visits.find((a) => a.status === "completed");
    if (first) {
      const firstDay = zonedDateKey(first.startTime);
      const next = nextYearly(firstDay.slice(5), today);
      const years = next.year - Number(firstDay.slice(0, 4));
      if (years >= 1 && next.date <= until) {
        await upsertMoment(ctx, { ...owner, personId: patient._id, kind: "care_anniversary", date: next.date, occurrence: String(next.year), years });
      }
    }
  }

  if (settings.dischargeCheckins) {
    const episodes = await ctx.db
      .query("careEpisodes")
      .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", patient._id).eq("physiotherapistId", rel.physiotherapistId))
      .collect();
    // Back in care, or already booked again: no need to ask how they're doing
    const backInCare = episodes.some((e) => e.status === "active") || visits.some((a) => a.startTime > Date.now() && !a.status.startsWith("cancelled"));
    if (!backInCare) {
      for (const episode of episodes) {
        if (episode.status !== "completed" || !episode.completedAt) continue;
        const due = addDays(zonedDateKey(episode.completedAt), DISCHARGE_CHECKIN_DAYS);
        if (due >= today && due <= until) {
          await upsertMoment(ctx, { ...owner, personId: patient._id, kind: "discharge_checkin", date: due, occurrence: episode._id });
        }
      }
    }
  }
  return seen;
}

/** Birthdays of patients with no care team at all: Rehabify sends those. */
async function planUnattached(ctx: MutationCtx, profile: Doc<"patientProfiles">, today: string) {
  const monthDay = birthdayMonthDay(profile);
  if (!monthDay || profile.celebrationsOptOut) return;
  const party = upcomingBirthday({ monthDay, year: birthYear(profile), optedOut: false }, today);
  if (!party) return;
  const anyCare = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient", (q) => q.eq("patientId", profile.userId))
    .first();
  if (anyCare) return;
  const patient = await ctx.db.get(profile.userId);
  if (!isLivePatient(patient)) return;
  await upsertMoment(ctx, { ownerKey: REHABIFY, personId: patient._id, kind: "birthday", ...party });
}

/**
 * A physio's, clinic owner's or team member's birthday: Rehabify wishes them, and a clinic's
 * clinicians and front desk also show up for their clinic owner to wish.
 */
async function planTeamMember(ctx: MutationCtx, user: Doc<"users">, today: string) {
  if (!isLive(user) || !isTeamRole(user.role)) return;
  const party = upcomingBirthday(await birthdayOf(ctx, user), today);
  if (!party) return;
  await upsertMoment(ctx, { ownerKey: REHABIFY, personId: user._id, kind: "birthday", ...party });
  if (user.clinicId && user.role !== "clinic_owner") {
    await upsertMoment(ctx, { ownerKey: clinicKey(user.clinicId), clinicId: user.clinicId, personId: user._id, kind: "team_birthday", ...party });
  }
}

/** Plans one patient straight away, e.g. right after they tell us their birthday. */
async function planPatient(ctx: MutationCtx, patientId: Id<"users">) {
  const today = zonedDateKey(Date.now());
  const relationships = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .take(20);
  const cache: PlanCache = { settings: new Map() };
  for (const rel of relationships) await planRelationship(ctx, rel, today, cache);
  if (relationships.length === 0) {
    const patient = await ctx.db.get(patientId);
    const profile = patient ? await profileOf(ctx, patient) : null;
    if (profile) await planUnattached(ctx, profile, today);
  }
}

export const planRelationshipsPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), today: v.string() },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .paginate({ cursor: args.cursor, numItems: RELATIONSHIP_PAGE });
    const cache: PlanCache = { settings: new Map() };
    const seen: { ownerKey: string; personId: string; hasBirthday: boolean }[] = [];
    for (const rel of page.page) {
      const result = await planRelationship(ctx, rel, args.today, cache);
      if (result) seen.push(result);
    }
    return { cursor: page.continueCursor, isDone: page.isDone, seen };
  },
});

export const planUnattachedPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), today: v.string() },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("patientProfiles").paginate({ cursor: args.cursor, numItems: PROFILE_PAGE });
    for (const profile of page.page) await planUnattached(ctx, profile, args.today);
    return { cursor: page.continueCursor, isDone: page.isDone };
  },
});

export const planTeamPage = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    today: v.string(),
    role: v.union(v.literal("physiotherapist"), v.literal("clinic_owner"), v.literal("clinic_staff")),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .paginate({ cursor: args.cursor, numItems: TEAM_PAGE });
    for (const user of page.page) await planTeamMember(ctx, user, args.today);
    return { cursor: page.continueCursor, isDone: page.isDone };
  },
});

export const saveOwnerStats = internalMutation({
  args: { stats: v.array(v.object({ ownerKey: v.string(), patientCount: v.number(), missingBirthdayCount: v.number() })) },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const stat of args.stats) {
      const row = await settingsRow(ctx, stat.ownerKey);
      const fields = { patientCount: stat.patientCount, missingBirthdayCount: stat.missingBirthdayCount, statsAt: now };
      if (row) await ctx.db.patch(row._id, fields);
      else await ctx.db.insert("careMomentSettings", { ownerKey: stat.ownerKey, ...DEFAULT_SETTINGS, birthdayMessage: undefined, ...fields, updatedAt: now });
    }
    return null;
  },
});

/** The morning planner (crons.ts): the next two weeks of moments, for everyone. */
export const planDaily = internalAction({
  args: {},
  handler: async (ctx) => {
    const today = zonedDateKey(Date.now());
    const owners = new Map<string, { patients: Set<string>; withBirthday: Set<string> }>();

    let cursor: string | null = null;
    do {
      const page: { cursor: string; isDone: boolean; seen: { ownerKey: string; personId: string; hasBirthday: boolean }[] } =
        await ctx.runMutation(ref.planRelationshipsPage, { cursor, today });
      for (const s of page.seen) {
        const owner = owners.get(s.ownerKey) ?? { patients: new Set<string>(), withBirthday: new Set<string>() };
        owner.patients.add(s.personId);
        if (s.hasBirthday) owner.withBirthday.add(s.personId);
        owners.set(s.ownerKey, owner);
      }
      cursor = page.isDone ? null : page.cursor;
    } while (cursor);

    cursor = null;
    do {
      const page: { cursor: string; isDone: boolean } = await ctx.runMutation(ref.planUnattachedPage, { cursor, today });
      cursor = page.isDone ? null : page.cursor;
    } while (cursor);

    for (const role of TEAM_ROLES) {
      cursor = null;
      do {
        const page: { cursor: string; isDone: boolean } = await ctx.runMutation(ref.planTeamPage, { cursor, today, role });
        cursor = page.isDone ? null : page.cursor;
      } while (cursor);
    }

    const stats = [...owners].map(([ownerKey, s]) => ({
      ownerKey,
      patientCount: s.patients.size,
      missingBirthdayCount: s.patients.size - s.withBirthday.size,
    }));
    for (let i = 0; i < stats.length; i += 100) {
      await ctx.runMutation(ref.saveOwnerStats, { stats: stats.slice(i, i + 100) });
    }
  },
});

// ── Sending ───────────────────────────────────────────────────────────────────

type MomentContext = { person: Doc<"users">; sender: string; settings: Settings };

/** Who signs the message: the clinic, the physio, or Rehabify. */
async function senderName(ctx: Ctx, moment: Moment) {
  if (moment.clinicId) return (await ctx.db.get(moment.clinicId))?.name ?? "your clinic";
  if (moment.physiotherapistId) return personName(await ctx.db.get(moment.physiotherapistId), "your physiotherapist");
  return "Rehabify Health";
}

/**
 * Everything needed to act on a moment, or null when it no longer applies: the person left (or
 * left the clinic), turned these messages off, or changed their birthday since it was planned.
 */
async function momentContext(ctx: Ctx, moment: Moment): Promise<MomentContext | null> {
  const person = await ctx.db.get(moment.personId);
  if (!isLive(person)) return null;
  if (moment.kind === "team_birthday" && (person.clinicId !== moment.clinicId || !isTeamRole(person.role))) return null;
  if (moment.kind !== "team_birthday" && moment.ownerKey !== REHABIFY && person.role !== "patient") return null;
  const birthday = await birthdayOf(ctx, person);
  if (birthday.optedOut) return null;
  if (moment.kind === "birthday" || moment.kind === "team_birthday") {
    if (!birthday.monthDay || dayInYear(birthday.monthDay, Number(moment.occurrence)) !== moment.date) return null;
  }
  return { person, sender: await senderName(ctx, moment), settings: await settingsFor(ctx, moment.ownerKey) };
}

function recipientOf(person: Doc<"users">): MomentRecipient {
  return isTeamRole(person.role) ? person.role : "patient";
}

function defaultMessage(moment: Moment, context: MomentContext) {
  const recipient = recipientOf(context.person);
  return momentMessage(
    moment.kind,
    { firstName: context.person.firstName, sender: context.sender, years: moment.years, recipient },
    // A care team's own birthday message is for their patients
    recipient === "patient" ? context.settings.birthdayMessage : null
  );
}

/** Where the person's Home is, for the notification and the email button. */
function homeOf(person: Doc<"users">) {
  if (person.role === "physiotherapist") return "/dashboard/physiotherapist";
  if (person.role === "clinic_owner" || person.role === "clinic_staff") return "/dashboard/clinic";
  return "/dashboard/patient";
}

const usableEmail = (user: Doc<"users"> | null) => {
  const email = user?.email?.trim();
  return email && !isJoyLoginEmail(email) ? email : null;
};

const PATIENT_NOTE =
  "You're receiving this because you're a patient on Rehabify Health. To stop birthday and milestone messages, turn them off in Settings.";
const TEAM_NOTE = "You're receiving this because you work with patients on Rehabify Health.";

/** Sends the message in the app (and so to their phone) and by email, tells the family who manage their care, and records it. */
async function deliver(ctx: MutationCtx, moment: Moment, context: MomentContext, message: string, by: Doc<"users"> | null) {
  const { person, sender } = context;
  const title = momentTitle(moment.kind, person.firstName, moment.years);
  const home = homeOf(person);
  const now = Date.now();

  await insertNotification(ctx, {
    userId: person._id,
    type: "care_moment",
    priority: "low",
    status: "pending",
    createdAt: now,
    payload: {
      title,
      body: `${sender}: ${message}`,
      data: { entityId: moment._id, entityType: "care_moment", actionUrl: home },
    },
  });

  const email = usableEmail(person);
  const emailFor = (to: string, heading: string, paragraphs: string[], button: string, footnote: string) =>
    ctx.scheduler.runAfter(0, ref.sendPatientCareEmail, {
      to,
      subject: heading,
      heading,
      paragraphs,
      skipGreeting: true,
      fromName: sender,
      buttonLabel: "Open Rehabify",
      buttonUrl: `${publicAppUrl()}${button}`,
      footnote,
    });
  const isPatient = person.role === "patient";
  if (email) await emailFor(email, title, [message, `With warm wishes from ${sender}.`], home, isPatient ? PATIENT_NOTE : TEAM_NOTE);

  // Family who manage a patient's care (e.g. an elderly parent) hear about it too
  if (isPatient) {
    const first = person.firstName?.trim() || "your family member";
    for (const grant of await liveCareGrantsFor(ctx, person._id)) {
      if (!grant.managed) continue;
      const heading = moment.kind === "birthday" ? `It's ${first}'s birthday` : `A message for ${first}`;
      await insertNotification(ctx, {
        userId: grant.familyMemberUserId,
        type: "care_moment",
        priority: "low",
        status: "pending",
        createdAt: now,
        payload: {
          title: heading,
          body: `${sender}: ${message}`,
          data: { entityId: moment._id, entityType: "care_moment", actionUrl: "/dashboard/family" },
        },
      });
      const familyEmail = email ? null : usableEmail(await ctx.db.get(grant.familyMemberUserId));
      if (familyEmail) await emailFor(familyEmail, heading, [`${sender} sent ${first} this message:`, message], "/dashboard/family", PATIENT_NOTE);
    }
  }

  await ctx.db.patch(moment._id, { status: "sent", autoSent: by === null, handledBy: by?._id, handledAt: now, updatedAt: now });
}

const OWNER_RANK = (key: string) => (key.startsWith("clinic:") ? 0 : key.startsWith("physio:") ? 1 : 2);

/** 08:00 WAT (crons.ts): automatic birthday wishes, then each care team's heads-up for the day. */
export const sendDueToday = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = zonedDateKey(Date.now());
    const due = await ctx.db
      .query("careMoments")
      .withIndex("by_date_and_status", (q) => q.eq("date", today).eq("status", "upcoming"))
      .take(500);

    // One automatic wish per person: their clinic first, then their physio, then Rehabify.
    // Team birthdays wait for the clinic owner: a wish from your own clinic should be personal.
    const wished = new Set<string>();
    const birthdays = due.filter((m) => m.kind === "birthday").sort((a, b) => OWNER_RANK(a.ownerKey) - OWNER_RANK(b.ownerKey));
    for (const moment of birthdays) {
      if (wished.has(moment.personId)) continue;
      const context = await momentContext(ctx, moment);
      if (!context) {
        await ctx.db.delete(moment._id);
        continue;
      }
      if (!context.settings.autoBirthday) continue;
      // Someone on the care team may already have sent one by hand
      const already = await ctx.db
        .query("careMoments")
        .withIndex("by_person_and_occurrence", (q) => q.eq("personId", moment.personId).eq("kind", "birthday").eq("occurrence", moment.occurrence))
        .collect();
      if (already.some((m) => m.status === "sent")) {
        wished.add(moment.personId);
        continue;
      }
      await deliver(ctx, moment, context, defaultMessage(moment, context), null);
      wished.add(moment.personId);
    }

    // Heads-up: the clinic owner and the patient's clinicians, or the physio
    const todays = await Promise.all(
      (["upcoming", "sent"] as const).map((status) =>
        ctx.db
          .query("careMoments")
          .withIndex("by_date_and_status", (q) => q.eq("date", today).eq("status", status))
          .take(500)
      )
    );
    const lines = new Map<string, { href: string; items: string[] }>();
    const add = (userId: Id<"users">, href: string, item: string) => {
      const entry = lines.get(userId) ?? { href, items: [] };
      if (!entry.items.includes(item)) entry.items.push(item);
      lines.set(userId, entry);
    };
    for (const moment of todays.flat()) {
      if (moment.ownerKey === REHABIFY) continue;
      const person = await ctx.db.get(moment.personId);
      if (!isLive(person)) continue;
      const name = personName(person, "Someone");
      const item =
        moment.kind === "team_birthday"
          ? `${name}'s birthday (on your team)`
          : moment.kind === "birthday"
            ? `${name}'s birthday${moment.status === "sent" && moment.autoSent ? " (wished automatically)" : ""}`
            : moment.kind === "care_anniversary"
              ? `${moment.years && moment.years > 1 ? `${moment.years} years` : "A year"} since ${name}'s first visit`
              : `${name}: 3 months since discharge`;
      if (moment.clinicId) {
        const clinic = await ctx.db.get(moment.clinicId);
        if (clinic) add(clinic.ownerId, "/dashboard/clinic", item);
        if (moment.kind === "team_birthday") continue;
        const team = await ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_patient", (q) => q.eq("patientId", moment.personId))
          .take(20);
        for (const rel of team) {
          if (rel.clinicId === moment.clinicId && rel.status === "active") add(rel.physiotherapistId, "/dashboard/physiotherapist", item);
        }
      } else if (moment.physiotherapistId) {
        add(moment.physiotherapistId, "/dashboard/physiotherapist", item);
      }
    }
    for (const [userId, { href, items }] of lines) {
      const shown = items.slice(0, 3).join(" · ");
      await insertNotification(ctx, {
        userId: userId as Id<"users">,
        type: "care_moment_digest",
        priority: "low",
        status: "pending",
        createdAt: Date.now(),
        payload: {
          title: items.length === 1 ? "A moment to celebrate today" : `${items.length} moments to celebrate today`,
          body: items.length > 3 ? `${shown} and ${items.length - 3} more` : shown,
          data: { entityType: "care_moment", actionUrl: href },
        },
      });
    }
    return null;
  },
});

// ── Care team (Home) ──────────────────────────────────────────────────────────

/** The signed-in person may act on this moment: its clinic's team, its physio, or Rehabify admins. */
async function requireMomentAccess(ctx: MutationCtx, moment: Moment): Promise<Doc<"users">> {
  if (moment.clinicId) {
    const member = await getClinicMember(ctx);
    if (member.clinic._id !== moment.clinicId) throw new ConvexError("This person isn't with your clinic.");
    if (moment.kind === "team_birthday") {
      if (!member.isOwner && !canUseArea(member, "team")) throw new ConvexError("Only the clinic owner can do this.");
      return member.user;
    }
    if (!canUseArea(member, "patients")) {
      const mine = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", moment.personId).eq("physiotherapistId", member.user._id))
        .first();
      if (!mine) throw new ConvexError("Your role doesn't include Patients. Ask the clinic owner for access.");
    }
    return member.user;
  }
  const user = await currentUser(ctx);
  if (!user) throw new ConvexError("Please sign in to continue.");
  if (moment.physiotherapistId ? user._id !== moment.physiotherapistId : user.role !== "admin") {
    throw new ConvexError("This patient isn't in your care.");
  }
  return user;
}

type MomentItem = {
  _id: Id<"careMoments">;
  kind: CareMomentKind;
  date: string;
  years: number | null;
  status: Moment["status"];
  autoSent: boolean;
  personId: Id<"users">;
  name: string;
  firstName: string | null;
  imageUrl: string | null;
  whatsappPhone: string | null;
  clinicianName: string | null;
  sender: string;
  message: string;
};

/**
 * Home's "Birthdays and milestones": the next two weeks. scope "clinic" is the clinic's Home (owner
 * and front desk), with the team's birthdays; "physio" is a physio's Home: their own patients,
 * plus their clinic patients.
 */
export const getMyMoments = query({
  args: { scope: v.union(v.literal("clinic"), v.literal("physio")) },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    const today = zonedDateKey(Date.now());
    const until = addDays(today, MOMENT_WINDOW_DAYS);

    let keys: string[];
    let settingsKey: string;
    let canEditSettings: boolean;
    let seesTeam = false;
    let myClinicPatients: Set<string> | null = null;
    if (args.scope === "clinic") {
      const member = await getClinicMemberOrNull(ctx, "patients");
      if (!member) return null;
      keys = [clinicKey(member.clinic._id)];
      settingsKey = keys[0];
      canEditSettings = member.isOwner;
      seesTeam = member.isOwner || canUseArea(member, "team");
    } else {
      if (user.role !== "physiotherapist") return null;
      keys = [physioKey(user._id)];
      settingsKey = keys[0];
      // A clinic's clinician sees their clinic patients; the clinic owner sets how wishes work
      canEditSettings = !user.clinicId;
      if (user.clinicId) {
        keys.push(clinicKey(user.clinicId));
        const rels = await ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_physiotherapist", (q) => q.eq("physiotherapistId", user._id))
          .collect();
        myClinicPatients = new Set(rels.filter((r) => r.clinicId === user.clinicId).map((r) => r.patientId as string));
      }
    }

    const rows = (
      await Promise.all(
        keys.map((key) =>
          ctx.db
            .query("careMoments")
            .withIndex("by_owner_and_date", (q) => q.eq("ownerKey", key).gte("date", today).lte("date", until))
            .take(200)
        )
      )
    )
      .flat()
      .filter((m) => (m.kind === "team_birthday" ? seesTeam : !(m.clinicId && myClinicPatients && !myClinicPatients.has(m.personId))));

    const items: MomentItem[] = [];
    for (const moment of rows) {
      const context = await momentContext(ctx, moment);
      if (!context) continue;
      const { person } = context;
      let clinicianName: string | null = null;
      if (args.scope === "clinic" && moment.kind !== "team_birthday") {
        const rel = await ctx.db
          .query("patientPhysiotherapistRelationships")
          .withIndex("by_patient", (q) => q.eq("patientId", person._id))
          .filter((q) => q.and(q.eq(q.field("clinicId"), moment.clinicId), q.eq(q.field("status"), "active")))
          .first();
        clinicianName = rel ? personName(await ctx.db.get(rel.physiotherapistId), "") || null : null;
      }
      items.push({
        _id: moment._id,
        kind: moment.kind,
        date: moment.date,
        years: moment.years ?? null,
        status: moment.status,
        autoSent: !!moment.autoSent,
        personId: person._id,
        name: personName(person, moment.kind === "team_birthday" ? "Team member" : "Patient"),
        firstName: person.firstName ?? null,
        imageUrl: person.imageUrl ?? null,
        whatsappPhone: normalizePhone(person.phoneNumber),
        clinicianName,
        sender: context.sender,
        message: defaultMessage(moment, context),
      });
    }
    items.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date < b.date ? -1 : 1));

    const settings = await settingsRow(ctx, settingsKey);
    return {
      today,
      items,
      settings: await settingsFor(ctx, settingsKey),
      canEditSettings,
      patientCount: settings?.patientCount ?? null,
      missingBirthdayCount: settings?.missingBirthdayCount ?? null,
    };
  },
});

export const sendCareMoment = mutation({
  args: { momentId: v.id("careMoments"), message: v.string() },
  handler: async (ctx, args) => {
    const moment = await ctx.db.get(args.momentId);
    if (!moment) throw new ConvexError("This moment has passed.");
    const by = await requireMomentAccess(ctx, moment);
    const message = args.message.trim();
    if (!message) throw new ConvexError("Write a message first.");
    if (message.length > 1000) throw new ConvexError("Keep the message under 1,000 characters.");
    if (moment.status === "sent") throw new ConvexError("This has already been sent.");
    const context = await momentContext(ctx, moment);
    if (!context) throw new ConvexError("This no longer applies: they may have turned these messages off.");
    await deliver(ctx, moment, context, message, by);
    return { success: true };
  },
});

export const markCareMoment = mutation({
  args: { momentId: v.id("careMoments"), status: v.union(v.literal("called"), v.literal("skipped"), v.literal("upcoming")) },
  handler: async (ctx, args) => {
    const moment = await ctx.db.get(args.momentId);
    if (!moment) throw new ConvexError("This moment has passed.");
    const by = await requireMomentAccess(ctx, moment);
    if (moment.status === "sent") throw new ConvexError("This has already been sent.");
    const now = Date.now();
    await ctx.db.patch(moment._id, { status: args.status, handledBy: by._id, handledAt: now, updatedAt: now });
    return { success: true };
  },
});

export const saveCareMomentSettings = mutation({
  args: {
    scope: v.union(v.literal("clinic"), v.literal("physio")),
    autoBirthday: v.boolean(),
    birthdayMessage: v.optional(v.string()),
    includePastPatients: v.boolean(),
    anniversaries: v.boolean(),
    dischargeCheckins: v.boolean(),
  },
  handler: async (ctx, args) => {
    let ownerKey: string;
    let userId: Id<"users">;
    if (args.scope === "clinic") {
      const member = await getOwnerClinic(ctx);
      ownerKey = clinicKey(member.clinic._id);
      userId = member.user._id;
    } else {
      const physio = await requirePhysio(ctx);
      ownerKey = physioKey(physio._id);
      userId = physio._id;
    }
    const birthdayMessage = args.birthdayMessage?.trim() || undefined;
    if (birthdayMessage && birthdayMessage.length > 600) throw new ConvexError("Keep the birthday message under 600 characters.");

    const fields = {
      autoBirthday: args.autoBirthday,
      birthdayMessage,
      includePastPatients: args.includePastPatients,
      anniversaries: args.anniversaries,
      dischargeCheckins: args.dischargeCheckins,
      updatedBy: userId,
      updatedAt: Date.now(),
    };
    const row = await settingsRow(ctx, ownerKey);
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("careMomentSettings", { ownerKey, ...fields });
    return { success: true };
  },
});

// ── Everyone's own birthday ───────────────────────────────────────────────────

const CELEBRATES = new Set<Doc<"users">["role"]>(["patient", ...TEAM_ROLES]);

/** Your birthday as we hold it, and who would celebrate it (for the Home prompt). */
export const getMyBirthday = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || !CELEBRATES.has(user.role)) return null;
    const birthday = await birthdayOf(ctx, user);

    let celebratedBy: string | null = null;
    if (user.role === "patient") {
      const rel = await ctx.db
        .query("patientPhysiotherapistRelationships")
        .withIndex("by_patient", (q) => q.eq("patientId", user._id))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();
      celebratedBy = rel?.clinicId
        ? (await ctx.db.get(rel.clinicId))?.name ?? null
        : rel
          ? personName(await ctx.db.get(rel.physiotherapistId), "") || null
          : null;
    } else if (user.clinicId && user.role !== "clinic_owner") {
      celebratedBy = (await ctx.db.get(user.clinicId))?.name ?? null;
    }

    return {
      audience: user.role === "patient" ? ("patient" as const) : ("team" as const),
      monthDay: birthday.monthDay,
      birthYear: birthday.year,
      optedOut: birthday.optedOut,
      celebratedBy,
    };
  },
});

export const setMyBirthday = mutation({
  args: { month: v.number(), day: v.number(), year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user || !CELEBRATES.has(user.role)) throw new ConvexError("Please sign in to continue.");
    const thisYear = new Date().getUTCFullYear();
    if (args.year !== undefined && (!Number.isInteger(args.year) || args.year < thisYear - 120 || args.year > thisYear)) {
      throw new ConvexError("Please enter a valid year.");
    }
    const monthDay = toMonthDay(args.month, args.day, args.year);
    if (!monthDay) throw new ConvexError("Please choose a real date.");

    if (user.role !== "patient") {
      const fields = { birthdayMonthDay: monthDay, birthYear: args.year };
      await ctx.db.patch(user._id, fields);
      await planTeamMember(ctx, { ...user, ...fields }, zonedDateKey(Date.now()));
      return { success: true };
    }

    const profile = await profileOf(ctx, user);
    // With a year it becomes the date of birth; without one, the date of birth is left alone
    const fields = { birthdayMonthDay: monthDay, ...(args.year ? { dateOfBirth: `${args.year}-${monthDay}` } : {}) };
    if (profile) {
      await ctx.db.patch(profile._id, fields);
      if (user.patientProfileId !== profile._id) await ctx.db.patch(user._id, { patientProfileId: profile._id });
    } else {
      const profileId = await ctx.db.insert("patientProfiles", { userId: user._id, ...fields });
      await ctx.db.patch(user._id, { patientProfileId: profileId });
    }
    await planPatient(ctx, user._id);
    return { success: true };
  },
});

export const setMyCelebrationsOptOut = mutation({
  args: { optOut: v.boolean() },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "patient") throw new ConvexError("Only patients can do this.");
    const profile = await profileOf(ctx, user);
    if (profile) await ctx.db.patch(profile._id, { celebrationsOptOut: args.optOut || undefined });
    else if (args.optOut) {
      const profileId = await ctx.db.insert("patientProfiles", { userId: user._id, celebrationsOptOut: true });
      await ctx.db.patch(user._id, { patientProfileId: profileId });
    }
    if (!args.optOut) await planPatient(ctx, user._id);
    return { success: true };
  },
});
