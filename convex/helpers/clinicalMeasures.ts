/**
 * Structured measures in a clinical note's Objective section, shared by Convex and the app:
 * range of motion, strength, functional tests, pain (NPRS), outcome measures (PSFS, MSK-HQ,
 * Berg, Modified Ashworth, or the physio's own) and special tests. Each measure is stored on its
 * note (sessionLogs.measures), so it is saved, edited and kept in the note's history with it.
 * Measures with a number line up across visits by seriesKey(), which is how the workspace shows
 * progress.
 *
 * The tests and outcome measures follow Rehabify’s clinical list ("Rehabify Clinical notes
 * tools", curated by Mary). How to do each one lives with the note UI
 * (components/physio/notes/guides.ts). Keep keys stable; saved notes refer to them.
 */
import { ConvexError, v, type Infer } from "convex/values";

export const measureValidator = v.object({
  /** Client-made id, unique within the note */
  id: v.string(),
  kind: v.union(
    v.literal("rom"),
    v.literal("strength"),
    v.literal("functional"),
    v.literal("pain"),
    v.literal("psfs"),
    v.literal("outcome"),
    v.literal("special_test")
  ),
  /** Catalogue key: a movement, muscle group, test, outcome measure, or "nprs" / "psfs" */
  key: v.string(),
  side: v.optional(v.union(v.literal("left"), v.literal("right"))),
  /** ROM: "arom" | "prom"; strength: "mmt" | "dynamometer" */
  method: v.optional(v.string()),
  value: v.optional(v.number()),
  result: v.optional(v.union(v.literal("positive"), v.literal("negative"), v.literal("inconclusive"))),
  /** Pain: where it hurts (PAIN_AREAS). Modified Ashworth: the muscle tested. */
  location: v.optional(v.string()),
  /** Pain: when (PAIN_CONTEXTS). Functional tests: the test condition (arm use, rests, assistance). */
  context: v.optional(v.string()),
  /** Functional tests: walking aid (DEVICES) */
  device: v.optional(v.string()),
  /** PSFS: the activities the patient chose, each scored 0 (unable) to 10 (as before) */
  items: v.optional(v.array(v.object({ activity: v.string(), score: v.number() }))),
  /** Custom outcome measure: its name, unit and which way is better */
  label: v.optional(v.string()),
  unit: v.optional(v.string()),
  better: v.optional(v.union(v.literal("higher"), v.literal("lower"))),
  notes: v.optional(v.string()),
});

export type ClinicalMeasure = Infer<typeof measureValidator>;
export type MeasureKind = ClinicalMeasure["kind"];
export type Side = "left" | "right";
export type Better = "higher" | "lower";

export const MAX_MEASURES_PER_NOTE = 40;
const MAX_NOTES_LENGTH = 300;
const MAX_ACTIVITY_LENGTH = 80;
const MAX_LABEL_LENGTH = 60;
const MAX_UNIT_LENGTH = 16;
const MAX_ID_LENGTH = 64;
const MAX_KEY_LENGTH = 40;
const MAX_CONTEXT_LENGTH = 40;
export const MAX_PSFS_ITEMS = 5;


// ─────────────────────────────────────────────────────────────────────────────
// Body regions
// ─────────────────────────────────────────────────────────────────────────────

export type Region =
  | "cervical"
  | "thoracic"
  | "lumbar"
  | "shoulder"
  | "elbow"
  | "wrist_hand"
  | "hip"
  | "knee"
  | "ankle_foot"
  | "vestibular";

export const REGIONS: { key: Region; label: string; words: string[] }[] = [
  { key: "cervical", label: "Neck", words: ["neck", "cervical", "whiplash"] },
  { key: "thoracic", label: "Upper back", words: ["thoracic", "upper back", "mid back"] },
  { key: "lumbar", label: "Lower back", words: ["lumbar", "lower back", "low back", "back pain", "sciatica", "lbp"] },
  { key: "shoulder", label: "Shoulder", words: ["shoulder", "rotator", "frozen", "subacromial"] },
  { key: "elbow", label: "Elbow", words: ["elbow", "epicondyl", "tennis", "golfer"] },
  { key: "wrist_hand", label: "Wrist & hand", words: ["wrist", "hand", "carpal", "finger", "thumb"] },
  { key: "hip", label: "Hip & pelvis", words: ["hip", "groin", "glute", "pelvi"] },
  { key: "knee", label: "Knee", words: ["knee", "acl", "menisc", "patell", "tkr", "tka"] },
  { key: "ankle_foot", label: "Ankle & foot", words: ["ankle", "foot", "achilles", "plantar", "heel"] },
  { key: "vestibular", label: "Dizziness", words: ["dizz", "vertigo", "bppv", "vestibular"] },
];

export const regionLabel = (region: Region) => REGIONS.find((r) => r.key === region)?.label ?? region;

/** The body region a free-text condition talks about ("Right knee OA" is the knee), if any. */
export function regionFromText(text?: string | null): Region | null {
  const lower = text?.toLowerCase() ?? "";
  if (!lower) return null;
  return REGIONS.find((r) => r.words.some((word) => lower.includes(word)))?.key ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Range of motion
// ─────────────────────────────────────────────────────────────────────────────

type Range = { min: number; max: number };

export type RomDef = {
  key: string;
  region: Region;
  /** As listed under its region: "Flexion" */
  label: string;
  /** On its own: "Knee flexion" */
  title: string;
  unit: "°" | "cm";
  sided: boolean;
  better: Better;
  /** Typical adult range, shown as a hint */
  normal?: string;
  range: Range;
};

const ROM_PREFIX: Record<Region, string> = {
  cervical: "Neck",
  thoracic: "Thoracic",
  lumbar: "Lumbar",
  shoulder: "Shoulder",
  elbow: "Elbow",
  wrist_hand: "Wrist",
  hip: "Hip",
  knee: "Knee",
  ankle_foot: "Ankle",
  vestibular: "",
};

const rom = (region: Region, key: string, label: string, normal: string | undefined, extra: Partial<RomDef> = {}): RomDef => ({
  key: `${region}_${key}`,
  region,
  label,
  title: `${ROM_PREFIX[region]} ${label.toLowerCase()}`,
  unit: "°",
  sided: !["cervical", "thoracic", "lumbar"].includes(region),
  better: "higher",
  normal,
  range: { min: 0, max: 200 },
  ...extra,
});

export const ROM: RomDef[] = [
  rom("cervical", "flexion", "Flexion", "0–50°"),
  rom("cervical", "extension", "Extension", "0–60°"),
  rom("cervical", "rotation", "Rotation", "0–80°", { sided: true }),
  rom("cervical", "lateral_flexion", "Side bending", "0–45°", { sided: true }),
  rom("thoracic", "rotation", "Rotation", "0–35°", { sided: true }),
  rom("lumbar", "flexion", "Flexion", "0–60°"),
  rom("lumbar", "extension", "Extension", "0–25°"),
  rom("lumbar", "lateral_flexion", "Side bending", "0–25°", { sided: true }),
  rom("lumbar", "fingertip_floor", "Fingertip to floor", "0 cm (touches the floor)", { title: "Fingertip to floor", unit: "cm", better: "lower", range: { min: 0, max: 100 } }),
  rom("shoulder", "flexion", "Flexion", "0–180°"),
  rom("shoulder", "extension", "Extension", "0–60°"),
  rom("shoulder", "abduction", "Abduction", "0–180°"),
  rom("shoulder", "external_rotation", "External rotation", "0–90°"),
  rom("shoulder", "internal_rotation", "Internal rotation", "0–70°"),
  rom("elbow", "flexion", "Flexion", "0–150°"),
  // Extension deficits go below 0 for hyperextension (−10 = 10° past straight), common at the elbow and knee
  rom("elbow", "extension_deficit", "Extension deficit", "0° (straightens fully); minus = hyperextension", { better: "lower", range: { min: -30, max: 90 } }),
  rom("elbow", "supination", "Supination", "0–80°", { title: "Forearm supination" }),
  rom("elbow", "pronation", "Pronation", "0–80°", { title: "Forearm pronation" }),
  rom("wrist_hand", "flexion", "Flexion", "0–80°"),
  rom("wrist_hand", "extension", "Extension", "0–70°"),
  rom("wrist_hand", "radial_deviation", "Radial deviation", "0–20°"),
  rom("wrist_hand", "ulnar_deviation", "Ulnar deviation", "0–30°"),
  rom("hip", "flexion", "Flexion", "0–120°"),
  rom("hip", "extension", "Extension", "0–30°"),
  rom("hip", "abduction", "Abduction", "0–45°"),
  rom("hip", "adduction", "Adduction", "0–30°"),
  rom("hip", "external_rotation", "External rotation", "0–45°"),
  rom("hip", "internal_rotation", "Internal rotation", "0–45°"),
  rom("knee", "flexion", "Flexion", "0–135°"),
  rom("knee", "extension_deficit", "Extension deficit", "0° (straightens fully); minus = hyperextension", { better: "lower", range: { min: -30, max: 90 } }),
  rom("ankle_foot", "dorsiflexion", "Dorsiflexion", "0–20°"),
  rom("ankle_foot", "plantarflexion", "Plantarflexion", "0–50°"),
  rom("ankle_foot", "inversion", "Inversion", "0–35°"),
  rom("ankle_foot", "eversion", "Eversion", "0–15°"),
  rom("ankle_foot", "knee_to_wall", "Knee to wall", "about 10 cm or more", { title: "Knee to wall", unit: "cm", range: { min: 0, max: 30 } }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Strength
// ─────────────────────────────────────────────────────────────────────────────

export type StrengthMethod = "mmt" | "dynamometer";

export type StrengthDef = { key: string; region: Region; label: string; sided: boolean; methods: StrengthMethod[] };

const strength = (region: Region, key: string, label: string, methods: StrengthMethod[] = ["mmt", "dynamometer"]): StrengthDef => ({
  key: `${region}_${key}`,
  region,
  label,
  sided: region !== "cervical",
  methods,
});

export const STRENGTH: StrengthDef[] = [
  strength("cervical", "flexion", "Neck flexion", ["mmt"]),
  strength("cervical", "extension", "Neck extension", ["mmt"]),
  strength("shoulder", "flexion", "Shoulder flexion"),
  strength("shoulder", "abduction", "Shoulder abduction"),
  strength("shoulder", "external_rotation", "External rotation"),
  strength("shoulder", "internal_rotation", "Internal rotation"),
  strength("elbow", "flexion", "Elbow flexion"),
  strength("elbow", "extension", "Elbow extension"),
  strength("wrist_hand", "wrist_flexion", "Wrist flexion"),
  strength("wrist_hand", "wrist_extension", "Wrist extension"),
  strength("wrist_hand", "grip", "Grip strength", ["dynamometer"]),
  strength("hip", "flexion", "Hip flexion"),
  strength("hip", "extension", "Hip extension"),
  strength("hip", "abduction", "Hip abduction"),
  strength("hip", "adduction", "Hip adduction"),
  strength("knee", "extension", "Knee extension"),
  strength("knee", "flexion", "Knee flexion"),
  strength("ankle_foot", "dorsiflexion", "Dorsiflexion"),
  strength("ankle_foot", "plantarflexion", "Plantarflexion"),
  strength("ankle_foot", "inversion", "Inversion"),
  strength("ankle_foot", "eversion", "Eversion"),
];

export const STRENGTH_METHOD_LABELS: Record<StrengthMethod, string> = { mmt: "MMT (0–5)", dynamometer: "Dynamometer (kg)" };

/** Oxford scale grades. 4- and 4+ sit between whole grades so they still chart in order. */
export const MMT_GRADES: { label: string; value: number }[] = [
  { label: "0", value: 0 },
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4-", value: 3.75 },
  { label: "4", value: 4 },
  { label: "4+", value: 4.25 },
  { label: "5", value: 5 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Functional tests
// ─────────────────────────────────────────────────────────────────────────────

export type FunctionalDef = {
  key: string;
  label: string;
  short: string;
  unit: string;
  better: Better;
  /** Recorded for each side (or hand) */
  sided: boolean;
  /** Asks which walking aid was used */
  device: boolean;
  /** A test condition worth recording with the result, stored in `context` */
  condition?: { label: string; options: string[] };
  /** How finely the result is entered (1, 0.1, 0.01) */
  step: number;
  hint?: string;
  range: Range;
  /**
   * Entered as a time over a distance and stored as a speed (m/s), so nobody has to divide in
   * their head. The distance defaults to `defaultDistance` metres and can be changed.
   */
  timed?: { defaultDistance: number; distanceRange: Range; timeRange: Range };
};

/** Walking speed in m/s from the distance timed and the time taken, to 2 decimal places. */
export function walkSpeed(metres: number, seconds: number): number | undefined {
  if (!Number.isFinite(metres) || !Number.isFinite(seconds) || metres <= 0 || seconds <= 0) return undefined;
  return Math.round((metres / seconds) * 100) / 100;
}

export const FUNCTIONAL: FunctionalDef[] = [
  {
    key: "tug",
    label: "Timed Up and Go",
    short: "TUG",
    unit: "s",
    better: "lower",
    sided: false,
    device: true,
    condition: { label: "Assistance", options: ["None", "Stand-by", "Hands-on"] },
    step: 0.1,
    hint: "Over 13.5 s suggests a higher risk of falls in older adults.",
    range: { min: 0, max: 300 },
  },
  {
    key: "sit_to_stand_5x",
    label: "Five Times Sit-to-Stand",
    short: "5xSTS",
    unit: "s",
    better: "lower",
    sided: false,
    device: false,
    condition: { label: "Arms", options: ["Arms folded", "Used arms"] },
    step: 0.1,
    range: { min: 0, max: 300 },
  },
  {
    key: "chair_stand_30s",
    label: "30-Second Chair Stand",
    short: "30s chair stand",
    unit: "reps",
    better: "higher",
    sided: false,
    device: false,
    step: 1,
    range: { min: 0, max: 100 },
  },
  {
    key: "ten_metre_walk",
    label: "10-Metre Walk Test",
    short: "10MWT",
    unit: "m/s",
    better: "higher",
    sided: false,
    device: true,
    condition: { label: "Pace", options: ["Comfortable", "Fast"] },
    step: 0.01,
    hint: "Enter the time for the middle 6 m; the speed is worked out for you.",
    // Stored as m/s. Adult gait speed runs from about 0.1 m/s (very frail) to about 2.5 m/s (fast
    // healthy adults; Bohannon & Andrews 2011, Physiotherapy 97:182), so anything outside
    // 0.05–3 m/s is a typing slip, usually seconds entered as a speed.
    range: { min: 0.05, max: 3 },
    timed: { defaultDistance: 6, distanceRange: { min: 2, max: 30 }, timeRange: { min: 0.5, max: 600 } },
  },
  {
    key: "six_minute_walk",
    label: "Six-Minute Walk Test",
    short: "6MWT",
    unit: "m",
    better: "higher",
    sided: false,
    device: true,
    condition: { label: "Rests", options: ["No rests", "Took rests"] },
    step: 1,
    range: { min: 0, max: 1500 },
  },
  {
    key: "single_leg_stance",
    label: "Single-Leg Stance",
    short: "Single-leg stance",
    unit: "s",
    better: "higher",
    sided: true,
    device: false,
    step: 0.1,
    range: { min: 0, max: 300 },
  },
  {
    key: "functional_reach",
    label: "Functional Reach Test",
    short: "Functional reach",
    unit: "cm",
    better: "higher",
    sided: false,
    device: false,
    step: 0.5,
    range: { min: 0, max: 80 },
  },
  {
    key: "nine_hole_peg",
    label: "Nine-Hole Peg Test",
    short: "9HPT",
    unit: "s",
    better: "lower",
    sided: true,
    device: false,
    step: 0.1,
    range: { min: 0, max: 300 },
  },
];

export const DEVICES = ["None", "Walking stick", "Crutches", "Walking frame", "Other"];

// ─────────────────────────────────────────────────────────────────────────────
// Pain and outcome measures
// ─────────────────────────────────────────────────────────────────────────────

export const PAIN_AREAS = ["Neck", "Upper back", "Lower back", "Shoulder", "Elbow", "Wrist & hand", "Hip", "Knee", "Ankle & foot", "Other"];

export const PAIN_CONTEXTS: { key: string; label: string }[] = [
  { key: "now", label: "Right now" },
  { key: "rest", label: "At rest" },
  { key: "movement", label: "On movement" },
  { key: "worst_24h", label: "Worst in 24 h" },
];


export type OutcomeKey = "mskhq" | "lefs" | "spadi" | "dhi" | "berg" | "mas" | "custom";

export type OutcomeDef = {
  key: OutcomeKey;
  label: string;
  short: string;
  better: Better;
  range: Range;
  hint: string;
  /** The total is a whole number */
  whole?: boolean;
};

/** Scored on the official form; the physio enters the total, so no questionnaire text lives here. */
export const OUTCOMES: OutcomeDef[] = [
  {
    key: "mskhq",
    label: "Musculoskeletal Health Questionnaire",
    short: "MSK-HQ",
    better: "higher",
    range: { min: 0, max: 56 },
    hint: "Score the official questionnaire, then enter the total (0–56). Higher is better.",
    whole: true,
  },
  {
    key: "lefs",
    label: "Lower Extremity Functional Scale",
    short: "LEFS",
    better: "higher",
    range: { min: 0, max: 80 },
    hint: "20 activities scored 0–4 on the form; enter the total (0–80). Higher is better.",
    whole: true,
  },
  {
    key: "spadi",
    label: "Shoulder Pain and Disability Index",
    short: "SPADI",
    better: "lower",
    range: { min: 0, max: 100 },
    hint: "Enter the total score as a percentage (0–100). Lower is better.",
  },
  {
    key: "dhi",
    label: "Dizziness Handicap Inventory",
    short: "DHI",
    better: "lower",
    range: { min: 0, max: 100 },
    hint: "25 questions scored 0, 2 or 4; enter the total (0–100). Lower is better.",
    whole: true,
  },
  {
    key: "berg",
    label: "Berg Balance Scale",
    short: "Berg",
    better: "higher",
    range: { min: 0, max: 56 },
    hint: "Total of the 14 items (0–56). Under 45 suggests a higher risk of falls.",
    whole: true,
  },
  {
    key: "mas",
    label: "Modified Ashworth Scale",
    short: "Modified Ashworth",
    better: "lower",
    range: { min: 0, max: 4 },
    hint: "Resistance to passive movement, per muscle: 0, 1, 1+, 2, 3 or 4.",
  },
  {
    key: "custom",
    label: "Your own measure",
    short: "Custom",
    better: "higher",
    range: { min: -100000, max: 100000 },
    hint: "Name it the same way each visit so it charts as one measure.",
  },
];

/** Modified Ashworth grades. 1+ sits between 1 and 2 so it still charts in order. */
export const MAS_GRADES: { label: string; value: number }[] = [
  { label: "0", value: 0 },
  { label: "1", value: 1 },
  { label: "1+", value: 1.5 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Special tests
// ─────────────────────────────────────────────────────────────────────────────

export type SpecialTestDef = {
  key: string;
  region: Region;
  label: string;
  sided: boolean;
  /** What a positive test points to */
  checks: string;
  /** Can record the angle reached (SLR: hip flexion when symptoms come on), which then charts */
  angle?: Range;
};

const test = (region: Region, key: string, label: string, checks: string, extra: Partial<SpecialTestDef> = {}): SpecialTestDef => ({
  key,
  region,
  label,
  checks,
  sided: true,
  ...extra,
});

export const SPECIAL_TESTS: SpecialTestDef[] = [
  test("cervical", "spurling", "Spurling test", "Cervical radiculopathy"),
  test("cervical", "cervical_distraction", "Cervical distraction test", "Cervical radiculopathy", { sided: false }),
  test("cervical", "ulnt1", "ULNT1 (median nerve)", "Neural sensitivity"),
  test("lumbar", "slr", "Straight leg raise (SLR)", "Lumbar nerve root", { angle: { min: 0, max: 120 } }),
  test("lumbar", "slump", "Slump test", "Neural sensitivity"),
  test("lumbar", "femoral_nerve_stretch", "Femoral nerve stretch test", "Upper lumbar nerve root"),
  test("shoulder", "hawkins_kennedy", "Hawkins–Kennedy test", "Subacromial pain"),
  test("shoulder", "neer", "Neer test", "Subacromial pain"),
  test("shoulder", "empty_can", "Jobe / empty can test", "Supraspinatus"),
  test("shoulder", "er_lag", "External rotation lag sign", "Infraspinatus / supraspinatus tear"),
  test("shoulder", "apprehension_relocation", "Apprehension and relocation", "Anterior instability"),
  test("elbow", "cozens", "Cozen’s test", "Lateral elbow tendinopathy"),
  test("elbow", "mills", "Mill’s test", "Lateral elbow tendinopathy"),
  test("wrist_hand", "phalen", "Phalen’s test", "Carpal tunnel syndrome"),
  test("wrist_hand", "tinel_wrist", "Tinel’s sign at the wrist", "Carpal tunnel syndrome"),
  test("wrist_hand", "finkelstein", "Finkelstein test", "De Quervain’s"),
  test("hip", "faber", "FABER test", "Hip or sacroiliac joint"),
  test("hip", "fadir", "FADIR test", "Hip impingement"),
  test("hip", "thomas", "Thomas test", "Hip flexor length"),
  test("hip", "trendelenburg", "Trendelenburg test", "Hip abductor weakness"),
  test("knee", "lachman", "Lachman test", "ACL"),
  test("knee", "anterior_drawer_knee", "Anterior drawer (knee)", "ACL"),
  test("knee", "posterior_drawer_knee", "Posterior drawer (knee)", "PCL"),
  test("knee", "mcmurray", "McMurray test", "Meniscus"),
  test("knee", "thessaly", "Thessaly test", "Meniscus"),
  test("knee", "valgus_stress", "Valgus stress test", "MCL"),
  test("knee", "varus_stress", "Varus stress test", "LCL"),
  test("knee", "patellar_apprehension", "Patellar apprehension test", "Patellar instability"),
  test("ankle_foot", "anterior_drawer_ankle", "Anterior drawer (ankle)", "ATFL"),
  test("ankle_foot", "talar_tilt", "Talar tilt test", "CFL"),
  test("ankle_foot", "thompson", "Thompson / Simmonds calf squeeze", "Achilles rupture"),
  test("ankle_foot", "windlass", "Windlass test", "Plantar heel pain"),
  test("vestibular", "dix_hallpike", "Dix–Hallpike test", "Posterior canal BPPV"),
  test("vestibular", "supine_roll", "Supine roll test", "Horizontal canal BPPV"),
];


// ─────────────────────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────────────────────

const romByKey = new Map(ROM.map((d) => [d.key, d]));
const strengthByKey = new Map(STRENGTH.map((d) => [d.key, d]));
const functionalByKey = new Map(FUNCTIONAL.map((d) => [d.key, d]));
const outcomeByKey = new Map(OUTCOMES.map((d) => [d.key as string, d]));
const testByKey = new Map(SPECIAL_TESTS.map((d) => [d.key, d]));

export const romDef = (key: string) => romByKey.get(key);
export const strengthDef = (key: string) => strengthByKey.get(key);
export const functionalDef = (key: string) => functionalByKey.get(key);
export const outcomeDef = (key: string) => outcomeByKey.get(key);
export const specialTestDef = (key: string) => testByKey.get(key);

/** The body region a measure belongs to, when it has one. */
export function measureRegion(m: ClinicalMeasure): Region | null {
  if (m.kind === "rom") return romDef(m.key)?.region ?? null;
  if (m.kind === "strength") return strengthDef(m.key)?.region ?? null;
  if (m.kind === "special_test") return specialTestDef(m.key)?.region ?? null;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading a measure
// ─────────────────────────────────────────────────────────────────────────────

const SIDE_LABELS: Record<Side, string> = { left: "Left", right: "Right" };
const RESULT_LABELS = { positive: "Positive", negative: "Negative", inconclusive: "Inconclusive" } as const;

export const psfsAverage = (items: { score: number }[]) =>
  items.length ? Math.round((items.reduce((sum, item) => sum + item.score, 0) / items.length) * 10) / 10 : 0;

const trim = (n: number) => String(Math.round(n * 100) / 100);

/** What was measured: "Knee flexion", "Timed Up and Go", "Lachman test". */
export function measureTitle(m: ClinicalMeasure): string {
  switch (m.kind) {
    case "rom":
      return romDef(m.key)?.title ?? m.key;
    case "strength":
      return strengthDef(m.key)?.label ?? m.key;
    case "functional":
      return functionalDef(m.key)?.label ?? m.key;
    case "pain":
      return "Pain (NPRS)";
    case "psfs":
      return "Patient-Specific Functional Scale";
    case "outcome":
      return m.key === "custom" ? m.label || "Custom measure" : outcomeDef(m.key)?.label ?? m.key;
    case "special_test":
      return specialTestDef(m.key)?.label ?? m.key;
  }
}

/** How and where: "AROM · Right", "Lower back · On movement", "Walking stick · Stand-by". */
export function measureDetail(m: ClinicalMeasure): string {
  const side = m.side ? SIDE_LABELS[m.side] : null;
  switch (m.kind) {
    case "rom":
      return [m.method === "prom" ? "PROM" : "AROM", side].filter(Boolean).join(" · ");
    case "strength":
      return [m.method === "dynamometer" ? "Dynamometer" : "MMT", side].filter(Boolean).join(" · ");
    case "functional":
      return [side, m.device && m.device !== "None" ? m.device : null, m.context].filter(Boolean).join(" · ");
    case "pain":
      return [m.location, side, PAIN_CONTEXTS.find((c) => c.key === m.context)?.label].filter(Boolean).join(" · ");
    case "psfs":
      return (m.items ?? []).map((item) => `${item.activity} ${item.score}`).join(" · ");
    case "outcome":
      // Ashworth names the muscle; your own measure can be per side (a single-leg hop)
      return [m.key === "mas" ? m.location : null, side].filter(Boolean).join(" · ");
    case "special_test":
      return [side, specialTestDef(m.key)?.checks].filter(Boolean).join(" · ");
  }
}

/** The result as people write it: "110°", "4+/5", "16.8 s", "6/10", "42/56", "Positive". */
export function measureResult(m: ClinicalMeasure): string {
  if (m.kind === "special_test") {
    const result = m.result ? RESULT_LABELS[m.result] : "—";
    return m.value !== undefined && specialTestDef(m.key)?.angle ? `${result} · ${trim(m.value)}°` : result;
  }
  if (m.kind === "psfs") return `${trim(psfsAverage(m.items ?? []))}/10`;
  if (m.value === undefined) return "—";
  switch (m.kind) {
    case "rom":
      return romDef(m.key)?.unit === "cm" ? `${trim(m.value)} cm` : `${trim(m.value)}°`;
    case "strength":
      return m.method === "dynamometer"
        ? `${trim(m.value)} kg`
        : `${MMT_GRADES.find((g) => g.value === m.value)?.label ?? trim(m.value)}/5`;
    case "functional":
      return `${trim(m.value)} ${functionalDef(m.key)?.unit ?? ""}`.trim();
    case "pain":
      return `${trim(m.value)}/10`;
    case "outcome":
      if (m.key === "mas") return MAS_GRADES.find((g) => g.value === m.value)?.label ?? trim(m.value);
      if (m.key === "custom") return `${trim(m.value)}${m.unit ? ` ${m.unit}` : ""}`;
      return `${trim(m.value)}/${outcomeDef(m.key)?.range.max ?? ""}`;
  }
}

/** The number to chart, or null for measures without one (special tests). */
export function measureNumber(m: ClinicalMeasure): number | null {
  // Special tests have no number, except an angle where the test has one (SLR)
  if (m.kind === "special_test") return specialTestDef(m.key)?.angle ? m.value ?? null : null;
  if (m.kind === "psfs") return m.items?.length ? psfsAverage(m.items) : null;
  return m.value ?? null;
}

export function measureBetter(m: ClinicalMeasure): Better {
  if (m.kind === "rom") return romDef(m.key)?.better ?? "higher";
  if (m.kind === "functional") return functionalDef(m.key)?.better ?? "higher";
  if (m.kind === "pain") return "lower";
  if (m.kind === "outcome") return m.key === "custom" ? m.better ?? "higher" : outcomeDef(m.key)?.better ?? "higher";
  return "higher";
}

/** The unit a change is shown in: "°", " cm", " s", " kg", "" (scores). */
export function measureUnit(m: ClinicalMeasure): string {
  if (m.kind === "rom") return romDef(m.key)?.unit === "cm" ? " cm" : "°";
  if (m.kind === "strength") return m.method === "dynamometer" ? " kg" : "";
  if (m.kind === "functional") {
    const unit = functionalDef(m.key)?.unit ?? "";
    return unit ? ` ${unit}` : "";
  }
  if (m.kind === "outcome" && m.key === "custom" && m.unit) return ` ${m.unit}`;
  if (m.kind === "special_test" && specialTestDef(m.key)?.angle) return "°";
  return "";
}

/**
 * Measures that are the same thing measured the same way share a key, so a visit's value can
 * be compared with the last one (knee flexion, AROM, right). Special tests have no number,
 * except the SLR angle.
 */
export function seriesKey(m: ClinicalMeasure): string | null {
  if (m.kind === "special_test" && measureNumber(m) === null) return null;
  if (m.kind === "psfs") return "psfs";
  const label = m.kind === "outcome" && m.key === "custom" ? (m.label ?? "").trim().toLowerCase() : "";
  const location = (m.location ?? "").trim().toLowerCase();
  return [m.kind, m.key, m.side ?? "", m.method ?? "", location, m.context ?? "", label].join("|");
}

// ─────────────────────────────────────────────────────────────────────────────
// How much change is real
// ─────────────────────────────────────────────────────────────────────────────

export type ChangeThreshold = {
  /** In the measure's own units (whole grades for MMT and Ashworth) */
  amount: number;
  /**
   * MDC: the smallest change beyond measurement error. MCID: the smallest change patients
   * notice (always at least the error for these measures). Either way, smaller changes are noise.
   */
  basis: "MDC" | "MCID";
};

/**
 * The smallest change worth calling better or worse for a measure that started at `baseline`.
 * Anything smaller shows as "within measurement error". null: no agreed figure (your own measure).
 *
 * Figures come from the studies named beside each. Where studies differ the more cautious
 * (larger) common value is used, and pragmatic figures say so. To be checked by Rehabify's
 * clinical lead (Mary) before it's relied on.
 */
export function changeThreshold(m: ClinicalMeasure, baseline: number): ChangeThreshold | null {
  switch (m.kind) {
    case "pain":
      // NPRS: 2 points (Farrar et al. 2001, Pain; Childs et al. 2005, Spine)
      return { amount: 2, basis: "MCID" };
    case "psfs":
      // PSFS average: 2 points (Stratford et al. 1995, Physiotherapy Canada; later studies 1.3–2.3)
      return { amount: 2, basis: "MCID" };
    case "rom": {
      const def = romDef(m.key);
      if (!def) return null;
      // Fingertip to floor: pragmatic 5 cm (very reliable test; Perret et al. 2001, Arch Phys Med Rehabil)
      if (m.key === "lumbar_fingertip_floor") return { amount: 5, basis: "MDC" };
      // Knee to wall: 1.5 cm (test–retest error about 1–2 cm; Bennell et al. 1998, Aust J Physiother)
      if (m.key === "ankle_foot_knee_to_wall") return { amount: 1.5, basis: "MDC" };
      // Spinal range by inclinometer or by eye varies more between sessions: cautious 10°
      // (reported MDCs for cervical and lumbar range run roughly 5–12°)
      if (def.region === "cervical" || def.region === "thoracic" || def.region === "lumbar") return { amount: 10, basis: "MDC" };
      // Goniometry of the limbs: 5° (Gajdosik & Bohannon 1987, Phys Ther; Norkin & White)
      return { amount: 5, basis: "MDC" };
    }
    case "strength":
      // Oxford grades: plus and minus are unreliable between testers, so only a whole grade counts
      // (Cuthbert & Goodheart 2007, Chiropr Osteopat). Compared by whole grade in isRealChange.
      if (m.method !== "dynamometer") return { amount: 1, basis: "MDC" };
      // Grip: about 6 kg (Lang et al. 2008, J Hand Ther: MCID 5–6 kg)
      if (m.key === "wrist_hand_grip") return { amount: 6, basis: "MCID" };
      // Hand-held dynamometry: MDC is typically 10–20% of the force (e.g. Kelln et al. 2008,
      // J Sport Rehabil); 15% of the starting force, at least 2 kg
      return { amount: Math.max(2, Math.round(Math.abs(baseline) * 0.15 * 10) / 10), basis: "MDC" };
    case "functional":
      switch (m.key) {
        case "tug":
          // About 1 s in fitter groups to 2.5 s after hip or knee replacement (Kennedy et al. 2005,
          // BMC Musculoskelet Disord); 2 s as a middle figure
          return { amount: 2, basis: "MDC" };
        case "sit_to_stand_5x":
          // 2.3 s MCID (Meretta et al. 2006, Otol Neurotol); 2.5 s MDC in older adults (Goldberg et al. 2012)
          return { amount: 2.5, basis: "MDC" };
        case "chair_stand_30s":
          // About 2 stands in hip OA (Wright et al. 2011, JOSPT)
          return { amount: 2, basis: "MCID" };
        case "ten_metre_walk":
          // 0.1 m/s is a substantial change (Perera et al. 2006, J Am Geriatr Soc)
          return { amount: 0.1, basis: "MCID" };
        case "six_minute_walk":
          // 50 m (Perera et al. 2006 substantial change; MDC90 about 61 m after joint replacement,
          // Kennedy et al. 2005; 30 m in lung disease, Holland et al. 2014)
          return { amount: 50, basis: "MCID" };
        case "single_leg_stance":
          // Pragmatic: times vary a lot between tries; 5 s or a quarter of the starting time
          return { amount: Math.max(5, Math.round(Math.abs(baseline) * 0.25 * 10) / 10), basis: "MDC" };
        case "functional_reach":
          // Pragmatic 7 cm (reported MDCs about 4–9 cm in older and neurological groups)
          return { amount: 7, basis: "MDC" };
        case "nine_hole_peg":
          // A 20% change (Feys et al. 2017, Mult Scler)
          return { amount: Math.max(1, Math.round(Math.abs(baseline) * 0.2 * 10) / 10), basis: "MCID" };
        default:
          return null;
      }
    case "outcome":
      switch (m.key) {
        case "mskhq":
          // About 5 points (Price et al. 2019, BMJ Open)
          return { amount: 5, basis: "MCID" };
        case "lefs":
          // 9 points (Binkley et al. 1999, Phys Ther)
          return { amount: 9, basis: "MCID" };
        case "spadi":
          // 8–13 points; the upper figure (Roy et al. 2009, Arthritis Rheum)
          return { amount: 13, basis: "MCID" };
        case "dhi":
          // 18 points for a true change (Jacobson & Newman 1990, Arch Otolaryngol Head Neck Surg)
          return { amount: 18, basis: "MDC" };
        case "berg":
          // Depends on where the patient starts (Donoghue & Stokes 2009, J Rehabil Med)
          return { amount: baseline >= 45 ? 4 : baseline >= 35 ? 5 : baseline >= 25 ? 7 : 5, basis: "MDC" };
        case "mas":
          // A whole grade (1+ counts as half); reliability is only moderate (Pandyan et al. 1999, Clin Rehabil)
          return { amount: 1, basis: "MDC" };
        default:
          return null;
      }
    case "special_test":
      // SLR angle: pragmatic 10°, as the angle where symptoms start varies more than goniometry
      return specialTestDef(m.key)?.angle ? { amount: 10, basis: "MDC" } : null;
  }
}

/** Whether going from `from` to `to` is more than the threshold; null when there's none. */
export function isRealChange(m: ClinicalMeasure, from: number, to: number): boolean | null {
  // Oxford grades by whole grade: 4- and 4+ are both a 4
  if (m.kind === "strength" && m.method !== "dynamometer") return Math.round(from) !== Math.round(to);
  const threshold = changeThreshold(m, from);
  if (!threshold) return null;
  return Math.abs(to - from) >= threshold.amount - 1e-9;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checking a measure
// ─────────────────────────────────────────────────────────────────────────────

const inRange = (value: number | undefined, range: Range) =>
  value !== undefined && Number.isFinite(value) && value >= range.min && value <= range.max;

/** Why a measure can't be saved, in words for the physio, or null when it's fine. */
export function measureProblem(m: ClinicalMeasure): string | null {
  if (m.notes && m.notes.length > MAX_NOTES_LENGTH) return `Keep measure notes under ${MAX_NOTES_LENGTH} characters.`;
  switch (m.kind) {
    case "rom": {
      const def = romDef(m.key);
      if (!def) return "Pick a movement.";
      if (m.method !== "arom" && m.method !== "prom") return "Choose active or passive.";
      if (def.sided && !m.side) return "Choose left or right.";
      if (!inRange(m.value, def.range)) return `Enter a value from ${def.range.min} to ${def.range.max}${def.unit === "°" ? "°" : " cm"}.`;
      return null;
    }
    case "strength": {
      const def = strengthDef(m.key);
      if (!def) return "Pick a muscle group.";
      if (!def.methods.includes(m.method as StrengthMethod)) return "Choose how you tested it.";
      if (def.sided && !m.side) return "Choose left or right.";
      if (m.method === "mmt" && !MMT_GRADES.some((g) => g.value === m.value)) return "Pick a grade from 0 to 5.";
      if (m.method === "dynamometer" && !inRange(m.value, { min: 0, max: 300 })) return "Enter the force in kg (0–300).";
      return null;
    }
    case "functional": {
      const def = functionalDef(m.key);
      if (!def) return "Pick a test.";
      if (def.sided && !m.side) return "Choose left or right.";
      if (def.timed && m.value !== undefined && Number.isFinite(m.value) && !inRange(m.value, def.range)) {
        return `That works out at ${trim(m.value)} m/s, outside ${def.range.min}–${def.range.max} m/s. Check the time and distance.`;
      }
      if (!inRange(m.value, def.range)) return def.timed ? "Enter the time in seconds." : `Enter the result in ${def.unit} (${def.range.min}–${def.range.max}).`;
      if (m.device && (!def.device || !DEVICES.includes(m.device))) return "Pick a walking aid from the list.";
      if (m.context && !def.condition?.options.includes(m.context)) return "Pick a test condition from the list.";
      return null;
    }
    case "pain":
      if (m.key !== "nprs") return "Unknown pain scale.";
      if (!inRange(m.value, { min: 0, max: 10 }) || !Number.isInteger(m.value)) return "Pick a pain score from 0 to 10.";
      if (m.location && !PAIN_AREAS.includes(m.location)) return "Pick where it hurts from the list.";
      if (m.context && !PAIN_CONTEXTS.some((c) => c.key === m.context)) return "Pick when the pain is.";
      return null;
    case "psfs": {
      if (m.key !== "psfs") return "Unknown scale.";
      const items = m.items ?? [];
      if (items.length === 0) return "Add at least one activity.";
      if (items.length > MAX_PSFS_ITEMS) return `The scale has up to ${MAX_PSFS_ITEMS} activities.`;
      for (const item of items) {
        if (!item.activity.trim()) return "Name each activity.";
        if (item.activity.length > MAX_ACTIVITY_LENGTH) return `Keep each activity under ${MAX_ACTIVITY_LENGTH} characters.`;
        if (!inRange(item.score, { min: 0, max: 10 }) || !Number.isInteger(item.score)) return "Score each activity from 0 to 10.";
      }
      return null;
    }
    case "outcome": {
      const def = outcomeDef(m.key);
      if (!def) return "Pick an outcome measure.";
      if (m.key === "mas") {
        if (!m.location?.trim()) return "Name the muscle you tested.";
        if (m.location.length > MAX_LABEL_LENGTH) return `Keep the muscle name under ${MAX_LABEL_LENGTH} characters.`;
        if (!MAS_GRADES.some((g) => g.value === m.value)) return "Pick a grade: 0, 1, 1+, 2, 3 or 4.";
        return null;
      }
      if (m.key === "custom") {
        if (!m.label?.trim()) return "Name your measure.";
        if (m.label.length > MAX_LABEL_LENGTH) return `Keep the name under ${MAX_LABEL_LENGTH} characters.`;
        if (m.unit && m.unit.length > MAX_UNIT_LENGTH) return `Keep the unit under ${MAX_UNIT_LENGTH} characters.`;
        if (!m.better) return "Say whether higher or lower is better.";
      }
      if (!inRange(m.value, def.range)) return `Enter a score from ${def.range.min} to ${def.range.max}.`;
      if (def.whole && !Number.isInteger(m.value)) return "Enter the total as a whole number.";
      return null;
    }
    case "special_test": {
      const def = specialTestDef(m.key);
      if (!def) return "Pick a test.";
      if (!m.result) return "Choose positive, negative or inconclusive.";
      if (m.value !== undefined) {
        if (!def.angle) return "This test has no angle to record.";
        if (!inRange(m.value, def.angle)) return `Enter the angle from ${def.angle.min} to ${def.angle.max}°.`;
      }
      return null;
    }
  }
}

type MeasureField = keyof ClinicalMeasure;

/** The fields each kind of measure keeps; anything else sent with it is dropped before saving. */
function fieldsFor(m: ClinicalMeasure): Set<MeasureField> {
  const common: MeasureField[] = ["id", "kind", "key", "notes"];
  const extra = ((): MeasureField[] => {
    switch (m.kind) {
      case "rom":
      case "strength":
        return ["side", "method", "value"];
      case "functional":
        return ["side", "value", "context", "device"];
      case "pain":
        return ["side", "value", "location", "context"];
      case "psfs":
        return ["items"];
      case "outcome":
        if (m.key === "mas") return ["value", "location", "side"];
        if (m.key === "custom") return ["value", "label", "unit", "better", "side"];
        return ["value"];
      case "special_test":
        return specialTestDef(m.key)?.angle ? ["side", "result", "value"] : ["side", "result"];
    }
  })();
  return new Set([...common, ...extra]);
}

/** Whether this measure's movement or test is done per side (no side for neck flexion). */
function takesSide(m: ClinicalMeasure): boolean {
  if (m.kind === "rom") return romDef(m.key)?.sided ?? false;
  if (m.kind === "strength") return strengthDef(m.key)?.sided ?? false;
  if (m.kind === "functional") return functionalDef(m.key)?.sided ?? false;
  if (m.kind === "special_test") return specialTestDef(m.key)?.sided ?? false;
  return true;
}

/** The note's measures, checked and tidied for saving. Throws a ConvexError the physio can read. */
export function cleanMeasures(measures: ClinicalMeasure[]): ClinicalMeasure[] {
  if (measures.length > MAX_MEASURES_PER_NOTE) {
    throw new ConvexError(`A note can hold up to ${MAX_MEASURES_PER_NOTE} measures.`);
  }
  const ids = new Set<string>();
  return measures.map((m) => {
    if (m.id.length > MAX_ID_LENGTH || m.key.length > MAX_KEY_LENGTH || (m.context?.length ?? 0) > MAX_CONTEXT_LENGTH) {
      throw new ConvexError("A measure couldn’t be read. Remove it and add it again.");
    }
    const allowed = fieldsFor(m);
    const tidy = Object.fromEntries(Object.entries(m).filter(([field]) => allowed.has(field as MeasureField))) as ClinicalMeasure;
    if (!takesSide(tidy)) delete tidy.side;
    for (const key of ["notes", "label", "unit", "location"] as const) {
      const text = tidy[key]?.trim();
      if (text) tidy[key] = text;
      else delete tidy[key];
    }
    if (tidy.items) tidy.items = tidy.items.map((item) => ({ activity: item.activity.trim(), score: item.score }));
    for (const key of Object.keys(tidy) as (keyof ClinicalMeasure)[]) {
      if (tidy[key] === undefined) delete tidy[key];
    }
    const problem = measureProblem(tidy);
    if (problem) throw new ConvexError(`${measureTitle(tidy)}: ${problem}`);
    if (!tidy.id || ids.has(tidy.id)) throw new ConvexError("Two measures share an id. Reopen the note and try again.");
    ids.add(tidy.id);
    return tidy;
  });
}

/** Whether two lists hold the same measures, whatever order each one's fields are in. */
export function sameMeasures(a: ClinicalMeasure[], b: ClinicalMeasure[]): boolean {
  const canonical = (m: ClinicalMeasure) =>
    JSON.stringify(Object.keys(m).sort().map((key) => [key, m[key as keyof ClinicalMeasure]]));
  return a.length === b.length && a.every((m, i) => canonical(m) === canonical(b[i]));
}
