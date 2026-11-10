/**
 * What the repeat-booking planner needs (components/appointments/RepeatPlanner.tsx), for the
 * physio booking drawer and the clinic's Book appointment form:
 * - busyTimes: when a clinician is already booked, so clashing dates show before booking.
 *   Times only, never who the visit is with.
 * - carePlanRhythm: the patient's active care plan frequency and how many planned sessions are
 *   left, so the planner can suggest the course.
 * Both return empty or null for anyone who may not see them.
 */
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertPatientInClinic, getClinicMemberOrNull, getClinicStaffUserIds } from "./clinicTools";
import { currentUser } from "./helpers/careAccess";

const DAY = 86_400_000;
const OPEN = new Set(["scheduled", "confirmed"]);

/** May the caller see this clinician's diary? Themselves, or their clinic's team (front desk and owner included). */
async function canSeeDiary(ctx: QueryCtx, caller: Doc<"users">, clinicianId: Id<"users">) {
  if (caller._id === clinicianId || caller.role === "admin") return true;
  const member = await getClinicMemberOrNull(ctx, "appointments").catch(() => null);
  if (!member) return false;
  return (await getClinicStaffUserIds(ctx, member.clinic)).has(clinicianId);
}

export const busyTimes = query({
  args: { physiotherapistId: v.optional(v.id("users")), from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    const caller = await currentUser(ctx);
    if (!caller) return [];
    const clinicianId = args.physiotherapistId ?? caller._id;
    if (!(await canSeeDiary(ctx, caller, clinicianId))) return [];
    const to = Math.min(args.to, args.from + 400 * DAY);
    if (!(to > args.from)) return [];
    const rows = await ctx.db
      .query("appointments")
      .withIndex("by_physiotherapist_id_and_time", (q) =>
        q.eq("physiotherapistId", clinicianId).gte("startTime", args.from - DAY).lt("startTime", to)
      )
      .take(1000);
    return rows
      .filter((a) => !a.isRecordOnly && (OPEN.has(a.status) || a.status === "completed") && a.endTime > args.from)
      .map((a) => ({ start: a.startTime, end: a.endTime }));
  },
});

/** "2 sessions a week" → 2 a week; "Every 2 weeks" → once every 2 weeks. */
function parseFrequency(text: string | undefined): { perWeek: 1 | 2 | 3; everyWeeks: 1 | 2 } | null {
  const s = (text ?? "").toLowerCase();
  if (!s.trim()) return null;
  if (/every\s*(2|two|other)\s*weeks?|fortnight|bi-?weekly/.test(s)) return { perWeek: 1, everyWeeks: 2 };
  const n = /(\d+)\s*(x|×|times|sessions?|visits?)?\s*(a|per|\/)?\s*week/.exec(s)?.[1] ?? (/(once|one)\s*(a|per)?\s*week|weekly/.test(s) ? "1" : /twice/.test(s) ? "2" : null);
  const count = Number(n);
  if (count === 1 || count === 2 || count === 3) return { perWeek: count, everyWeeks: 1 };
  if (count > 3) return { perWeek: 3, everyWeeks: 1 };
  return null;
}

export const carePlanRhythm = query({
  args: { patientId: v.id("users"), physiotherapistId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const caller = await currentUser(ctx);
    if (!caller) return null;
    const clinicianId = args.physiotherapistId ?? caller._id;

    // The clinician themselves (in care with the patient), or the patient's clinic
    const rel = await ctx.db
      .query("patientPhysiotherapistRelationships")
      .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", args.patientId).eq("physiotherapistId", caller._id))
      .first();
    let allowed = rel?.status === "active";
    if (!allowed) {
      const member = await getClinicMemberOrNull(ctx, "appointments").catch(() => null);
      if (member) {
        try {
          await assertPatientInClinic(ctx, member.clinic, args.patientId);
          allowed = true;
        } catch {
          allowed = false;
        }
      }
    }
    if (!allowed) return null;

    const plans = await ctx.db
      .query("treatmentPlans")
      .withIndex("by_patient_and_status", (q) => q.eq("patientId", args.patientId).eq("status", "active"))
      .collect();
    const plan = plans.find((p) => p.physiotherapistId === clinicianId) ?? plans.sort((a, b) => b.startDate - a.startDate)[0];
    if (!plan) return null;
    const rhythm = parseFrequency(plan.sessionFrequency);
    if (!rhythm && !plan.plannedSessions) return null;

    // Sessions already used or booked since the plan started (with anyone in their care)
    const visits = await ctx.db
      .query("appointments")
      .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", args.patientId).gte("startTime", plan.startDate))
      .take(500);
    const used = visits.filter((a) => !a.isRecordOnly && (a.status === "completed" || OPEN.has(a.status))).length;
    const remaining = plan.plannedSessions ? Math.max(0, plan.plannedSessions - used) : null;

    return {
      frequencyLabel: plan.sessionFrequency ?? null,
      perWeek: rhythm?.perWeek ?? null,
      everyWeeks: rhythm?.everyWeeks ?? null,
      plannedSessions: plan.plannedSessions ?? null,
      used,
      remaining,
    };
  },
});
