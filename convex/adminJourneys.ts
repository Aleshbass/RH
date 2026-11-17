/**
 * Admin › Patient journeys (Mary, 17 Nov 2026): every physio's patient, where they are (booked,
 * in treatment, finished), whether the patient paid and the physio was paid, and who needs a nudge.
 * Built by helpers/journeys.ts.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { buildJourneys, sessionTotals, type JourneyStage } from "./helpers/journeys";

const nameOf = (u: Doc<"users"> | null) => [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email || "Unknown";
const contactOf = (u: Doc<"users"> | null) => ({
  phone: u?.phoneNumber ?? u?.whatsappLinkedPhone ?? null,
  email: u?.email && !/@(joy\.rehabify|placeholder\.patient)$|\.invalid$/.test(u.email) ? u.email : null,
});

export const list = query({
  args: {
    stage: v.optional(v.union(v.literal("booked"), v.literal("in_treatment"), v.literal("finished"), v.literal("cancelled"))),
    attentionOnly: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "adminJourneys:list");
    const now = Date.now();
    const all = await buildJourneys(ctx, now);
    const counts: Record<JourneyStage, number> = { booked: 0, in_treatment: 0, finished: 0, cancelled: 0 };
    let attention = 0;
    let unpaid = 0;
    let physioUnpaid = 0;
    for (const j of all) {
      counts[j.stage]++;
      if (j.attention.length) attention++;
      if (j.patientPaid === "unpaid" || j.patientPaid === "part") unpaid++;
      if (j.physioPaid === "pending" || j.physioPaid === "failed" || j.physioPaid === "held") physioUnpaid++;
    }

    // Names are needed for the search, so look people up first (cached per id)
    const people = new Map<string, Doc<"users"> | null>();
    const person = async (id: Id<"users">) => {
      if (!people.has(id)) people.set(id, await ctx.db.get(id));
      return people.get(id) ?? null;
    };
    const term = args.search?.trim().toLowerCase() ?? "";
    const rows = [];
    for (const j of all) {
      if (args.stage && j.stage !== args.stage) continue;
      if (args.attentionOnly && j.attention.length === 0) continue;
      const [patient, physio] = await Promise.all([person(j.patientId), person(j.physioId)]);
      if (term) {
        const hay = [nameOf(patient), nameOf(physio), patient?.patientNumber, physio?.staffNumber, patient?.email, physio?.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) continue;
      }
      const clinic = j.clinicId ? await ctx.db.get(j.clinicId) : null;
      rows.push({
        ...j,
        patient: { id: j.patientId, name: nameOf(patient), rehabifyId: patient?.patientNumber ?? null, ...contactOf(patient) },
        physio: { id: j.physioId, name: nameOf(physio), rehabifyId: physio?.staffNumber ?? null, ...contactOf(physio) },
        clinicName: clinic?.name ?? null,
      });
      if (rows.length >= 200) break;
    }
    return { counts, total: all.length, attention, unpaid, physioUnpaid, sessions: sessionTotals(all), rows, capped: rows.length >= 200 };
  },
});
