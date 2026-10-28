/**
 * The questionnaires patients can fill in themselves, item by item, with their published
 * wording and scoring. Only instruments the owner cleared as free to use are here (LEFS, SPADI,
 * KOOS-12, HOOS-12, PSFS, NPRS). Licensed ones (ODI, NDI, QuickDASH, Oxford Knee/Hip, MSK-HQ,
 * STarT Back) must NOT be added: physios score those on the official form and enter the total
 * as a measure in their clinical note (convex/helpers/clinicalMeasures.ts).
 *
 * Wording is the published English wording. The only adaptation for screens is "choose one
 * answer" in place of "tick one box" / "circle the number".
 *
 * Keep item order stable: stored answers are arrays in this order. If wording or scoring has to
 * change, bump the instrument's `version`.
 */
import { NOT_APPLICABLE, type InstrumentDef, type InstrumentKey, type Scale } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Shared scales
// ─────────────────────────────────────────────────────────────────────────────

const choice = (...labels: string[]): Scale => ({ kind: 'choice', options: labels.map((label, value) => ({ value, label })) })

const zeroToTen = (minLabel: string, maxLabel: string): Scale => ({ kind: 'numeric', min: 0, max: 10, minLabel, maxLabel })

// KOOS / HOOS (English LK versions): every item scored 0 (no problems) to 4 (extreme problems)
const KOOS_FREQUENCY = choice('Never', 'Monthly', 'Weekly', 'Daily', 'Always')
const KOOS_SEVERITY = choice('None', 'Mild', 'Moderate', 'Severe', 'Extreme')
const KOOS_AWARE = choice('Never', 'Monthly', 'Weekly', 'Daily', 'Constantly')
const KOOS_MODIFIED = choice('Not at all', 'Mildly', 'Moderately', 'Severely', 'Totally')
const KOOS_CONFIDENCE = choice('Not at all', 'Mildly', 'Moderately', 'Severely', 'Extremely')

// ─────────────────────────────────────────────────────────────────────────────
// LEFS: Lower Extremity Functional Scale
// Binkley JM, Stratford PW, Lott SA, Riddle DL. The Lower Extremity Functional Scale (LEFS):
// scale development, measurement properties, and clinical application. Phys Ther 1999;79:371–83.
// 20 items scored 0–4, total 0–80, higher is better. MCID 9 points (Binkley 1999).
// Missing items: the published scoring is the sum of all 20 items, so all are required.
// ─────────────────────────────────────────────────────────────────────────────

const LEFS_ITEMS = [
  'Any of your usual work, housework or school activities.',
  'Your usual hobbies, recreational or sporting activities.',
  'Getting into or out of the bath.',
  'Walking between rooms.',
  'Putting on your shoes or socks.',
  'Squatting.',
  'Lifting an object, like a bag of groceries from the floor.',
  'Performing light activities around your home.',
  'Performing heavy activities around your home.',
  'Getting into or out of a car.',
  'Walking 2 blocks.',
  'Walking a mile.',
  'Going up or down 10 stairs (about 1 flight of stairs).',
  'Standing for 1 hour.',
  'Sitting for 1 hour.',
  'Running on even ground.',
  'Running on uneven ground.',
  'Making sharp turns while running fast.',
  'Hopping.',
  'Rolling over in bed.',
]

const LEFS: InstrumentDef = {
  key: 'lefs',
  short: 'LEFS',
  name: 'Lower Extremity Functional Scale',
  summary: 'Function for any hip, knee, ankle or foot problem. 20 items, 0–80, higher is better.',
  patientIntro: '20 short questions about everyday activities and your leg.',
  minutes: 4,
  kind: 'items',
  better: 'higher',
  range: { min: 0, max: 80 },
  instructions:
    'We are interested in knowing whether you are having any difficulty at all with the activities listed below because of your lower limb problem for which you are currently seeking attention. Please provide an answer for each activity.',
  sections: [
    {
      id: 'activities',
      title: 'Activities',
      stem: 'Today, do you or would you have any difficulty at all with:',
      scale: {
        kind: 'choice',
        options: [
          { value: 0, label: 'Extreme difficulty or unable to perform activity' },
          { value: 1, label: 'Quite a bit of difficulty' },
          { value: 2, label: 'Moderate difficulty' },
          { value: 3, label: 'A little bit of difficulty' },
          { value: 4, label: 'No difficulty' },
        ],
      },
    },
  ],
  items: LEFS_ITEMS.map((text, i) => ({ id: `lefs${i + 1}`, section: 'activities', text })),
  subscales: [],
  totalLabel: 'Total',
  scoringNote: 'Sum of the 20 items (0–80). Every item must be answered.',
  mcid: { value: 9, source: 'Binkley et al., Phys Ther 1999' },
  source: 'Binkley JM, Stratford PW, Lott SA, Riddle DL. Phys Ther 1999;79(4):371–383.',
  pageSize: 5,
  version: 1,
}

// ─────────────────────────────────────────────────────────────────────────────
// SPADI: Shoulder Pain and Disability Index (numeric rating scale version)
// Roach KE, Budiman-Mak E, Songsiridej N, Lertratanakul Y. Development of a shoulder pain and
// disability index. Arthritis Care Res 1991;4:143–9. Numeric 0–10 version: Williams JW et al.,
// J Rheumatol 1995;22:727–32.
// Pain = sum of 5 items / 50 × 100; Disability = sum of 8 items / 80 × 100; Total = sum of all
// 13 / 130 × 100. Lower is better. "If a person does not answer all questions divide the total
// score by the total possible score" (the published scoring). Rehabify gives no score for a
// subscale with more than 2 items unanswered (and then no total).
// MCID: 8–13 points on the total (Roy JS, MacDermid JC, Woodhouse LJ. Arthritis Rheum
// 2009;61:623–32); we flag change at the conservative 13.
// ─────────────────────────────────────────────────────────────────────────────

const SPADI: InstrumentDef = {
  key: 'spadi',
  short: 'SPADI',
  name: 'Shoulder Pain and Disability Index',
  summary: 'Shoulder pain and disability. 13 items; total, pain and disability scored 0–100, lower is better.',
  patientIntro: '13 questions about your shoulder pain and the everyday things it makes hard.',
  minutes: 4,
  kind: 'items',
  better: 'lower',
  range: { min: 0, max: 100 },
  instructions:
    'Please choose the number that best represents your experience during the last week attributable to your shoulder problem.',
  sections: [
    {
      id: 'pain',
      title: 'Pain scale',
      stem: 'How severe is your pain?',
      scale: zeroToTen('No pain', 'Worst pain imaginable'),
    },
    {
      id: 'disability',
      title: 'Disability scale',
      stem: 'How much difficulty do you have?',
      scale: zeroToTen('No difficulty', 'So difficult it requires help'),
    },
  ],
  items: [
    { id: 'spadi_p1', section: 'pain', text: 'At its worst?' },
    { id: 'spadi_p2', section: 'pain', text: 'When lying on the involved side?' },
    { id: 'spadi_p3', section: 'pain', text: 'Reaching for something on a high shelf?' },
    { id: 'spadi_p4', section: 'pain', text: 'Touching the back of your neck?' },
    { id: 'spadi_p5', section: 'pain', text: 'Pushing with the involved arm?' },
    { id: 'spadi_d1', section: 'disability', text: 'Washing your hair?' },
    { id: 'spadi_d2', section: 'disability', text: 'Washing your back?' },
    { id: 'spadi_d3', section: 'disability', text: 'Putting on an undershirt or jumper?' },
    { id: 'spadi_d4', section: 'disability', text: 'Putting on a shirt that buttons down the front?' },
    { id: 'spadi_d5', section: 'disability', text: 'Putting on your pants?' },
    { id: 'spadi_d6', section: 'disability', text: 'Placing an object on a high shelf?' },
    { id: 'spadi_d7', section: 'disability', text: 'Carrying a heavy object of 10 pounds (4.5 kilograms)?' },
    { id: 'spadi_d8', section: 'disability', text: 'Removing something from your back pocket?' },
  ],
  subscales: [
    { key: 'pain', label: 'Pain', items: [0, 1, 2, 3, 4] },
    { key: 'disability', label: 'Disability', items: [5, 6, 7, 8, 9, 10, 11, 12] },
  ],
  totalLabel: 'Total',
  scoringNote:
    'Pain = sum / 50 × 100, Disability = sum / 80 × 100, Total = sum / 130 × 100. Unanswered items are left out of the maximum; more than 2 unanswered in a subscale gives no score.',
  mcid: { value: 13, source: 'Roy et al., Arthritis Rheum 2009 (MCID 8–13)' },
  source:
    'Roach KE et al. Arthritis Care Res 1991;4(4):143–149. Numeric rating version: Williams JW et al. J Rheumatol 1995;22(4):727–732.',
  allowNotApplicable: true,
  pageSize: 5,
  version: 1,
}

// ─────────────────────────────────────────────────────────────────────────────
// KOOS-12 and HOOS-12
// Gandek B, Roos EM, Franklin PD, Ware JE Jr. Item selection for 12-item short forms of the
// KOOS and HOOS. Osteoarthritis Cartilage 2019;27(5):746–753; KOOS-12: ibid. 762–770; HOOS-12:
// ibid. 754–761.
// Items are taken word for word from the full English forms (KOOS LK1.0, HOOS LK2.0): Pain = the
// pain frequency item + pain walking, on stairs and sitting/lying; Function = rising from
// sitting, standing, getting in/out of a car + twisting/pivoting (KOOS-12) or walking on an
// uneven surface (HOOS-12); QOL = the four QOL items.
// Each item 0 (no problems) to 4 (extreme). Each scale = 100 − (mean item score × 100 / 4), so
// 0 is worst and 100 best. A missing item takes the person's mean of the scale's other items
// when at least half (2 of 4) are answered (Gandek 2019); otherwise the scale has no score.
// Summary (knee/hip impact) = mean of Pain, Function and QOL, only when all three are scored.
// MCID: none is established for the 12-item forms. We flag change of 10 points on the summary,
// borrowed from the KOOS/HOOS user guides (8–10 points; Roos & Lohmander, Health Qual Life
// Outcomes 2003), so it is marked approximate.
//
// LICENCE: koos.nu (checked 28 Oct 2026) asks every user to request permission through
// ePROVIDE (Mapi Research Trust); academic use is free, healthcare/commercial use may carry a
// fee. Off until Rehabify has that permission; then check the wording against the official
// short-form PDF that comes with it and set KOOS_HOOS_ENABLED to true.
// ─────────────────────────────────────────────────────────────────────────────

export const KOOS_HOOS_ENABLED = false

function koosHoos(joint: 'knee' | 'hip'): InstrumentDef {
  const isKnee = joint === 'knee'
  const key: InstrumentKey = isKnee ? 'koos12' : 'hoos12'
  return {
    key,
    short: isKnee ? 'KOOS-12' : 'HOOS-12',
    name: isKnee ? 'Knee injury and Osteoarthritis Outcome Score (12 items)' : 'Hip disability and Osteoarthritis Outcome Score (12 items)',
    summary: `${isKnee ? 'Knee' : 'Hip'} pain, function and quality of life, plus a summary score. 0–100, higher is better.`,
    patientIntro: `12 questions about your ${joint}: pain, everyday activities and how it affects your life.`,
    minutes: 3,
    kind: 'items',
    better: 'higher',
    range: { min: 0, max: 100 },
    instructions: `This survey asks for your view about your ${joint}. This information will help us keep track of how you feel about your ${joint} and how well you are able to ${isKnee ? 'perform' : 'do'} your usual activities. Answer every question by choosing one answer for each question. If you are unsure about how to answer a question, please give the best answer you can.`,
    sections: [
      {
        id: 'pain',
        title: 'Pain',
        stem: `What amount of ${joint} pain have you experienced the last week during the following activities?`,
        scale: KOOS_SEVERITY,
      },
      {
        id: 'function',
        title: 'Function, daily living',
        stem: `The following questions concern your physical function. By this we mean your ability to move around and to look after yourself. For each of the following activities please indicate the degree of difficulty you have experienced in the last week due to your ${joint}.`,
        scale: KOOS_SEVERITY,
      },
      { id: 'qol', title: 'Quality of life' },
    ],
    items: [
      {
        id: `${key}_p1`,
        section: 'pain',
        text: isKnee ? 'How often do you experience knee pain?' : 'How often is your hip painful?',
        scale: KOOS_FREQUENCY,
      },
      { id: `${key}_p2`, section: 'pain', text: isKnee ? 'Walking on flat surface' : 'Walking on a flat surface' },
      { id: `${key}_p3`, section: 'pain', text: 'Going up or down stairs' },
      { id: `${key}_p4`, section: 'pain', text: 'Sitting or lying' },
      { id: `${key}_f1`, section: 'function', text: 'Rising from sitting' },
      { id: `${key}_f2`, section: 'function', text: 'Standing' },
      { id: `${key}_f3`, section: 'function', text: 'Getting in/out of car' },
      {
        id: `${key}_f4`,
        section: 'function',
        text: isKnee ? 'Twisting/pivoting on your injured knee' : 'Walking on uneven surface',
      },
      { id: `${key}_q1`, section: 'qol', text: `How often are you aware of your ${joint} problem?`, scale: KOOS_AWARE },
      {
        id: `${key}_q2`,
        section: 'qol',
        text: isKnee
          ? 'Have you modified your life style to avoid potentially damaging activities to your knee?'
          : 'Have you modified your life style to avoid activities potentially damaging to your hip?',
        scale: KOOS_MODIFIED,
      },
      { id: `${key}_q3`, section: 'qol', text: `How much are you troubled with lack of confidence in your ${joint}?`, scale: KOOS_CONFIDENCE },
      { id: `${key}_q4`, section: 'qol', text: `In general, how much difficulty do you have with your ${joint}?`, scale: KOOS_SEVERITY },
    ],
    subscales: [
      { key: 'pain', label: 'Pain', items: [0, 1, 2, 3] },
      { key: 'function', label: 'Function', items: [4, 5, 6, 7] },
      { key: 'qol', label: 'Quality of life', items: [8, 9, 10, 11] },
    ],
    totalLabel: 'Summary',
    scoringNote:
      'Each scale = 100 − (mean item score × 25); 100 is best. A scale needs at least 2 of its 4 items. Summary = mean of Pain, Function and Quality of life.',
    mcid: { value: 10, source: 'KOOS/HOOS user guides, 8–10 points (not established for the 12-item forms)', approximate: true },
    source: isKnee
      ? 'Gandek B, Roos EM, Franklin PD, Ware JE Jr. Osteoarthritis Cartilage 2019;27(5):762–770. Items from KOOS English LK1.0.'
      : 'Gandek B, Roos EM, Franklin PD, Ware JE Jr. Osteoarthritis Cartilage 2019;27(5):754–761. Items from HOOS English LK2.0.',
    pageSize: 4,
    version: 1,
  }
}

const KOOS12 = koosHoos('knee')
const HOOS12 = koosHoos('hip')

// ─────────────────────────────────────────────────────────────────────────────
// PSFS: Patient-Specific Functional Scale
// Stratford P, Gill C, Westaway M, Binkley J. Assessing disability and change on individual
// patients: a report of a patient specific measure. Physiother Can 1995;47:258–263.
// The patient names up to 5 important activities they can't do or find hard because of their
// problem (3 is usual), and rates each 0 (unable to perform) to 10 (able to perform at the same
// level as before the injury or problem). Score = mean of the rated activities, higher is
// better. At follow-up the same activities are rated again. MCID 2 points for the average
// score (3 for a single activity; Stratford 1995).
// ─────────────────────────────────────────────────────────────────────────────

export const PSFS_MAX_ACTIVITIES = 5
export const PSFS_MAX_ACTIVITY_LENGTH = 80

export const PSFS_SCALE = zeroToTen('Unable to perform activity', 'Able to perform activity at the same level as before injury or problem')

const PSFS: InstrumentDef = {
  key: 'psfs',
  short: 'PSFS',
  name: 'Patient-Specific Functional Scale',
  summary: 'The patient names up to 5 activities their problem makes hard and rates each 0–10. Average, higher is better.',
  patientIntro: 'Name the everyday activities your problem makes hard, then rate how well you can do each one today.',
  minutes: 2,
  kind: 'psfs',
  better: 'higher',
  range: { min: 0, max: 10 },
  instructions:
    'Please identify up to five important activities that you are unable to do or are having difficulty with as a result of your problem. Today, how well can you do each one?',
  sections: [{ id: 'activities', title: 'Your activities', scale: PSFS_SCALE }],
  items: [],
  subscales: [],
  totalLabel: 'Average',
  scoringNote: 'Mean of the activity scores (0–10). Compare the same activities over time.',
  mcid: { value: 2, source: 'Stratford et al., Physiother Can 1995 (2 points for the average)' },
  source: 'Stratford P, Gill C, Westaway M, Binkley J. Physiother Can 1995;47:258–263.',
  version: 1,
}

// ─────────────────────────────────────────────────────────────────────────────
// NPRS: Numeric Pain Rating Scale (11-point, 0–10)
// Current, best and worst pain over the last 24 hours, averaged: Childs JD, Piva SR, Fritz JM.
// Responsiveness of the numeric pain rating scale in patients with low back pain. Spine
// 2005;30(11):1331–1334. Lower is better. MCID 2 points (Childs 2005; Farrar JT et al., Pain
// 2001;94:149–158). All three ratings are needed for the average.
// ─────────────────────────────────────────────────────────────────────────────

const NPRS: InstrumentDef = {
  key: 'nprs',
  short: 'NPRS',
  name: 'Numeric Pain Rating Scale',
  summary: 'Pain now, at best and at worst in the last 24 hours, averaged. 0–10, lower is better.',
  patientIntro: '3 quick questions about how much pain you have.',
  minutes: 1,
  kind: 'items',
  better: 'lower',
  range: { min: 0, max: 10 },
  instructions:
    'Please rate your pain by choosing the number that best describes it, where 0 is no pain and 10 is the worst pain imaginable.',
  sections: [{ id: 'pain', title: 'Your pain', scale: zeroToTen('No pain', 'Worst pain imaginable') }],
  items: [
    { id: 'nprs_now', section: 'pain', text: 'Your pain right now' },
    { id: 'nprs_best', section: 'pain', text: 'Your pain at its best in the last 24 hours' },
    { id: 'nprs_worst', section: 'pain', text: 'Your pain at its worst in the last 24 hours' },
  ],
  subscales: [
    { key: 'now', label: 'Now', items: [0] },
    { key: 'best', label: 'Best (24 h)', items: [1] },
    { key: 'worst', label: 'Worst (24 h)', items: [2] },
  ],
  totalLabel: 'Average',
  scoringNote: 'Mean of current, best and worst pain over the last 24 hours. All three are needed.',
  mcid: { value: 2, source: 'Childs et al., Spine 2005; Farrar et al., Pain 2001' },
  source: 'Childs JD, Piva SR, Fritz JM. Spine 2005;30(11):1331–1334.',
  pageSize: 3,
  version: 1,
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────────────────────

const ALL: InstrumentDef[] = [LEFS, KOOS12, HOOS12, SPADI, PSFS, NPRS]

/** Every instrument with stored results (old responses stay readable even if one is switched off). */
export const ALL_INSTRUMENTS: readonly InstrumentDef[] = ALL

/** Instruments physios can send now. */
export const INSTRUMENTS: readonly InstrumentDef[] = ALL.filter(
  (d) => KOOS_HOOS_ENABLED || (d.key !== 'koos12' && d.key !== 'hoos12')
)

const byKey = new Map<string, InstrumentDef>(ALL.map((d) => [d.key, d]))

export function instrumentDef(key: string): InstrumentDef | undefined {
  return byKey.get(key)
}

export function isInstrumentKey(key: string): key is InstrumentKey {
  return byKey.has(key)
}

/** True if physios can send it (or fill it in) right now. */
export function isAvailable(key: string): key is InstrumentKey {
  return INSTRUMENTS.some((d) => d.key === key)
}

/** The scale an item is answered on (its own, or its section's). */
export function itemScale(def: InstrumentDef, index: number): Scale {
  const item = def.items[index]
  const section = def.sections.find((s) => s.id === item?.section)
  const scale = item?.scale ?? section?.scale
  if (!scale) throw new Error(`No scale for ${def.key} item ${index + 1}`)
  return scale
}

/** Words for one answer, as the patient saw it ("Moderate difficulty", "7 / 10", "Doesn't apply"). */
export function answerLabel(def: InstrumentDef, index: number, value: number | null | undefined): string {
  if (value === NOT_APPLICABLE) return 'Doesn’t apply'
  if (value === null || value === undefined || value < 0) return 'Not answered'
  const scale = itemScale(def, index)
  if (scale.kind === 'numeric') return `${value} / ${scale.max}`
  return scale.options.find((o) => o.value === value)?.label ?? String(value)
}

export type QuestionnairePage = { sectionId: string; title: string; stem?: string; items: number[] }

/** Screens of the patient's form: each section split into a few items per screen. */
export function questionnairePages(def: InstrumentDef): QuestionnairePage[] {
  if (def.kind === 'psfs') return [{ sectionId: 'activities', title: def.sections[0].title, items: [] }]
  const size = def.pageSize ?? 5
  const pages: QuestionnairePage[] = []
  for (const section of def.sections) {
    const indexes = def.items.map((item, i) => (item.section === section.id ? i : -1)).filter((i) => i >= 0)
    for (let start = 0; start < indexes.length; start += size) {
      pages.push({ sectionId: section.id, title: section.title, stem: section.stem, items: indexes.slice(start, start + size) })
    }
  }
  return pages
}
