/**
 * The progress report a physio sends to the doctor or partner who referred the patient.
 *
 * What the referrer sees is a snapshot, stored in progressReports when the report is shared:
 * later notes, plan changes or edits never change a report that has been sent. Values are kept
 * as display text ("120°", "4+/5") so the shared page needs no measure catalogue.
 */
import { v, type Infer } from "convex/values";
import { measureBetter, measureResult, measureUnit, type ClinicalMeasure } from "./clinicalMeasures";

/** How long a shared link opens for. */
export const REPORT_LINK_DAYS = 30;
export const MAX_REPORT_MEASURES = 12;
export const REPORT_TEXT_LIMITS = { impression: 1000, summary: 3000, nextSteps: 2000, recipientName: 120 } as const;

export const reportGoalStatus = v.union(v.literal("met"), v.literal("reached"), v.literal("in_progress"));

export const reportSnapshotValidator = v.object({
  generatedAt: v.number(),
  patient: v.object({
    name: v.string(),
    /** Permanent Rehabify ID, RH-P-… */
    rehabifyId: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
  }),
  /** Who referred the patient, when known */
  referrer: v.optional(v.object({ name: v.string(), organisation: v.optional(v.string()) })),
  /** Who the physio addressed it to, when that's someone other than the referrer */
  preparedFor: v.optional(v.string()),
  physio: v.object({
    name: v.string(),
    licenceNumber: v.optional(v.string()),
    clinicName: v.optional(v.string()),
  }),
  care: v.object({
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: v.string(),
    /** Presenting problem, in the physio's words */
    condition: v.optional(v.string()),
  }),
  /** Working impression (the assessment in the latest note), editable before sending */
  impression: v.optional(v.string()),
  plan: v.optional(
    v.object({
      title: v.string(),
      description: v.optional(v.string()),
      sessionFrequency: v.optional(v.string()),
      plannedSessions: v.optional(v.number()),
      reviewDate: v.optional(v.number()),
    })
  ),
  goals: v.array(
    v.object({
      description: v.string(),
      targetValue: v.optional(v.string()),
      timeline: v.optional(v.string()),
      status: reportGoalStatus,
      measure: v.optional(
        v.object({
          name: v.string(),
          baseline: v.optional(v.string()),
          latest: v.optional(v.string()),
          target: v.string(),
          percent: v.optional(v.number()),
        })
      ),
    })
  ),
  measures: v.array(
    v.object({
      seriesKey: v.string(),
      name: v.string(),
      baseline: v.string(),
      baselineAt: v.number(),
      latest: v.string(),
      latestAt: v.number(),
      /** "↑23°", "↓3", "from 3/5"; absent with a single value */
      change: v.optional(v.string()),
      direction: v.union(v.literal("better"), v.literal("worse"), v.literal("same")),
      /**
       * Whether the change is beyond the catalogue's smallest real change (isRealChange in
       * clinicalMeasures.ts); absent with a single value or when the measure has no agreed figure
       */
      beyondMinimal: v.optional(v.boolean()),
      /** The threshold as text, e.g. "5° (MDC)" */
      minimal: v.optional(v.string()),
      visits: v.number(),
    })
  ),
  sessions: v.object({
    attended: v.number(),
    cancelled: v.number(),
    missed: v.number(),
    upcoming: v.number(),
    planned: v.optional(v.number()),
  }),
  summary: v.optional(v.string()),
  nextSteps: v.optional(v.string()),
});

export type ReportSnapshot = Infer<typeof reportSnapshotValidator>;
export type ReportMeasure = ReportSnapshot["measures"][number];
export type ReportGoal = ReportSnapshot["goals"][number];

const round = (n: number) => Math.round(n * 100) / 100;

/** MMT and Modified Ashworth are grades: a change reads "from 3/5", not "↑1". */
export const isGraded = (m: ClinicalMeasure) =>
  (m.kind === "strength" && m.method !== "dynamometer") || (m.kind === "outcome" && m.key === "mas");

/** How a measure moved from the first value to the latest, and whether that's better. */
export function describeChange(first: { value: number; measure: ClinicalMeasure }, latest: { value: number; measure: ClinicalMeasure }) {
  const diff = round(latest.value - first.value);
  if (diff === 0) return { change: "No change", direction: "same" as const, diff };
  const better = measureBetter(latest.measure) === "higher" ? diff > 0 : diff < 0;
  const change = isGraded(latest.measure)
    ? `${diff > 0 ? "↑" : "↓"} from ${measureResult(first.measure)}`
    : `${diff > 0 ? "↑" : "↓"}${Math.abs(diff)}${measureUnit(latest.measure)}`;
  return { change, direction: better ? ("better" as const) : ("worse" as const), diff };
}

/** A smallest-real-change threshold as text in the measure's unit: "10°", "2", "1.5 s", "1 grade". */
export const thresholdText = (m: ClinicalMeasure, threshold: number) =>
  isGraded(m) ? `${round(threshold)} grade${threshold === 1 ? "" : "s"}` : `${round(threshold)}${measureUnit(m)}`;

/** The token in a shared link: base62, as receipts use. */
export const isReportToken = (token: string) => /^[A-Za-z0-9]{24,64}$/.test(token);

export const REPORT_GOAL_STATUS_LABELS: Record<ReportGoal["status"], string> = {
  met: "Met",
  reached: "Target reached",
  in_progress: "In progress",
};
