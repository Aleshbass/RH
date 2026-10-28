/**
 * Care-plan goals linked to a measured target, shared by Convex and the app.
 *
 * A goal (treatmentPlans.goals[i]) can carry an optional `measure`: which measure series it
 * tracks (the same seriesKey() clinical notes use, so "knee flexion, AROM, right" lines up across
 * visits), the target value, and the baseline: the first value recorded in this course of care,
 * filled in by the server when the plan is saved. Goals without `measure` work as before.
 *
 * Progress is read from the notes: baseline → latest → target, how far along, and whether the
 * target is reached in the measure's better direction. Reaching it never ticks the goal off on
 * its own; the physio is offered the tick.
 *
 * For charts: goalTargets(plan.goals) gives `Record<seriesKey, number>`.
 */
import { ConvexError, v, type Infer } from "convex/values";
import {
  measureBetter,
  measureDetail,
  measureNumber,
  measureProblem,
  measureResult,
  measureTitle,
  measureValidator,
  seriesKey,
  specialTestDef,
  type Better,
  type ClinicalMeasure,
} from "./clinicalMeasures";

export const goalMeasureValidator = v.object({
  /** seriesKey() of the measure this goal tracks. Worked out again by the server on save. */
  seriesKey: v.string(),
  // The measure, as notes record it (no value): enough to rebuild its series key and to show it
  kind: measureValidator.fields.kind,
  key: v.string(),
  side: v.optional(v.union(v.literal("left"), v.literal("right"))),
  method: v.optional(v.string()),
  location: v.optional(v.string()),
  context: v.optional(v.string()),
  /** Custom outcome measures only: their name, unit and which way is better */
  label: v.optional(v.string()),
  unit: v.optional(v.string()),
  better: v.optional(v.union(v.literal("higher"), v.literal("lower"))),
  /** The value the goal aims for, in the measure's own scale */
  target: v.number(),
  /** First value recorded in this course of care, and when. Set by the server, never by the client. */
  baseline: v.optional(v.number()),
  baselineAt: v.optional(v.number()),
});

export type GoalMeasure = Infer<typeof goalMeasureValidator>;

/** A goal as stored, with the optional link (older goals have none). */
export type GoalWithMeasure = {
  description: string;
  targetValue: string;
  timeline: string;
  measurable: boolean;
  achieved?: boolean;
  measure?: GoalMeasure;
};

/** Anything with dated measures: a note from getClinicalNoteMeasures, or a sessionLogs row. */
export type MeasuredNote = { sessionDate: number; measures?: ClinicalMeasure[] | null };

const IDENTITY_FIELDS = ["side", "method", "location", "context", "label", "unit", "better"] as const;

/** The linked measure without a value, shaped like a note's measure. */
export function goalTemplate(link: Pick<GoalMeasure, "kind" | "key"> & Partial<GoalMeasure>): ClinicalMeasure {
  const template: ClinicalMeasure = { id: "goal", kind: link.kind, key: link.key };
  for (const field of IDENTITY_FIELDS) {
    const value = link[field];
    if (value === undefined || value === "") continue;
    // label, unit and better only mean something on a custom outcome measure
    if ((field === "label" || field === "unit" || field === "better") && !(link.kind === "outcome" && link.key === "custom")) continue;
    (template as Record<string, unknown>)[field] = value;
  }
  return template;
}

/** The measure's identifying fields, without the client-made id. */
function identity(template: ClinicalMeasure) {
  const copy: Partial<ClinicalMeasure> = { ...template };
  delete copy.id;
  return copy as Omit<ClinicalMeasure, "id">;
}

/** The template with a value, so it can be formatted like a recorded measure. */
export function withValue(template: ClinicalMeasure, value: number): ClinicalMeasure {
  return template.kind === "psfs" ? { ...template, items: [{ activity: "Target", score: value }] } : { ...template, value };
}

/**
 * The series a template belongs to. Measured with a value, since a special test only has a
 * series when it records an angle (SLR).
 */
export const templateSeriesKey = (template: ClinicalMeasure, value = 0) => seriesKey(withValue(template, value));

/** A link for a measure recorded in a note, aiming for `target`. Null for measures without a number. */
export function linkFromMeasure(measure: ClinicalMeasure, target: number): GoalMeasure | null {
  const template = goalTemplate(measure);
  const key = templateSeriesKey(template, target);
  if (key === null) return null;
  return { ...identity(template), seriesKey: key, target };
}

/** "Knee flexion" */
export const goalMeasureTitle = (link: GoalMeasure) => measureTitle(goalTemplate(link));
/** "AROM · Right" (empty when there's nothing to add) */
export const goalMeasureDetail = (link: GoalMeasure) => measureDetail(goalTemplate(link));
/** "Knee flexion (AROM · Right)" */
export function goalMeasureName(link: GoalMeasure) {
  const detail = goalMeasureDetail(link);
  return detail ? `${goalMeasureTitle(link)} (${detail})` : goalMeasureTitle(link);
}
/** Which way is better for this measure */
export const goalMeasureBetter = (link: GoalMeasure): Better => measureBetter(goalTemplate(link));
/** A value on this measure's scale as people write it: "120°", "4+/5", "9.5 s", "3/10" */
export function goalValueText(link: Pick<GoalMeasure, "kind" | "key"> & Partial<GoalMeasure>, value: number) {
  // A special test's result reads "Positive · 70°"; a target is just the angle
  if (link.kind === "special_test") return `${Math.round(value * 100) / 100}°`;
  return measureResult(withValue(goalTemplate(link), value));
}

/**
 * The "how you'll measure it" text written for a linked goal left blank: "Knee flexion (AROM ·
 * Right): 120°". The plan editor blanks it again when it still matches, so a new target rewrites it.
 */
export const autoTargetText = (link: GoalMeasure) => `${goalMeasureName(link)}: ${goalValueText(link, link.target)}`;

/**
 * Checks and tidies a link from the client before it's stored. Works out the series key again,
 * so a link can't claim a series it doesn't belong to. Throws a ConvexError the physio can read.
 */
export function cleanGoalMeasure(link: GoalMeasure): Omit<GoalMeasure, "baseline" | "baselineAt"> {
  const template = goalTemplate({
    ...link,
    location: link.location?.trim() || undefined,
    label: link.label?.trim() || undefined,
    unit: link.unit?.trim() || undefined,
  });
  const name = measureTitle(template);
  if (!Number.isFinite(link.target)) throw new ConvexError(`${name}: enter a number for the target.`);
  const key = templateSeriesKey(template, link.target);
  if (key === null) throw new ConvexError(`${name} has no number to aim for. Link a measure with a value.`);
  let problem: string | null;
  if (template.kind === "psfs") {
    problem = link.target < 0 || link.target > 10 ? "Set a target from 0 to 10." : null;
  } else if (template.kind === "special_test") {
    const angle = specialTestDef(template.key)?.angle;
    problem = angle && (link.target < angle.min || link.target > angle.max) ? `Set an angle from ${angle.min} to ${angle.max}°.` : null;
  } else {
    problem = measureProblem(withValue(template, link.target));
  }
  if (problem) throw new ConvexError(`${name} target: ${problem}`);
  return { ...identity(template), seriesKey: key, target: link.target };
}

/** Every value of one series, oldest first. */
export function seriesPoints(notes: readonly MeasuredNote[] | undefined, key: string) {
  const points: { date: number; value: number; measure: ClinicalMeasure }[] = [];
  for (const note of notes ?? []) {
    for (const measure of note.measures ?? []) {
      if (seriesKey(measure) !== key) continue;
      const value = measureNumber(measure);
      if (value !== null) points.push({ date: note.sessionDate, value, measure });
    }
  }
  return points.sort((a, b) => a.date - b.date);
}

/** The first value of a series on or after `since` (the start of this course of care). */
export function firstValueSince(notes: readonly MeasuredNote[] | undefined, key: string, since: number) {
  const point = seriesPoints(notes, key).find((p) => p.date >= since);
  return point ? { value: point.value, date: point.date } : null;
}

export type GoalProgress = {
  baseline: number | null;
  baselineAt: number | null;
  latest: number | null;
  latestAt: number | null;
  target: number;
  better: Better;
  /** 0–100: how much of the way from the baseline to the target. Null until there's a baseline and a later value. */
  percent: number | null;
  /** The latest value meets the target in the better direction */
  reached: boolean;
  /** Values from the baseline on, for a sparkline */
  points: { date: number; value: number }[];
};

/**
 * How a linked goal is going. The baseline is the stored one, or else the first value recorded
 * since `since`; the latest is the most recent value in any note.
 */
export function goalProgress(link: GoalMeasure, notes: readonly MeasuredNote[] | undefined, since = 0): GoalProgress {
  const all = seriesPoints(notes, link.seriesKey);
  const better = goalMeasureBetter(link);
  const first = all.find((p) => p.date >= since) ?? null;
  const baseline = link.baseline ?? first?.value ?? null;
  const baselineAt = link.baseline !== undefined ? link.baselineAt ?? null : first?.date ?? null;
  const last = all[all.length - 1] ?? null;
  const latest = last?.value ?? null;
  const reached = latest !== null && (better === "higher" ? latest >= link.target : latest <= link.target);
  let percent: number | null = null;
  if (latest !== null && baseline !== null) {
    const span = link.target - baseline;
    percent = reached ? 100 : span === 0 ? 0 : Math.max(0, Math.min(100, Math.round(((latest - baseline) / span) * 100)));
  }
  const from = baselineAt ?? first?.date ?? 0;
  return {
    baseline,
    baselineAt,
    latest,
    latestAt: last?.date ?? null,
    target: link.target,
    better,
    percent,
    reached,
    points: all.filter((p) => p.date >= from).map((p) => ({ date: p.date, value: p.value })),
  };
}

/**
 * The plan's measured targets for a progress chart, keyed by seriesKey():
 *   <Chart targets={goalTargets(workspace.plan?.goals ?? [])} />
 * When two goals track the same series, the later goal wins.
 */
export function goalTargets(goals: readonly { measure?: GoalMeasure | null }[] | null | undefined): Record<string, number> {
  const targets: Record<string, number> = {};
  for (const goal of goals ?? []) {
    if (goal.measure) targets[goal.measure.seriesKey] = goal.measure.target;
  }
  return targets;
}
