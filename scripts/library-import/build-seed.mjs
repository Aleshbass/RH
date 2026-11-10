// Turn the Rehabify Library seed (from the prototype) into a Convex data module.
//
//   node scripts/library-import/build-seed.mjs
//
// Inputs (scripts/library-import/data/): library.json (216 items with their written guides) and
// seed.sql (for the red-flag lists, which library.json doesn't carry).
// Output: convex/libraryResourcesSeed.ts, read by convex/libraryResources.ts (syncSeed).
//
// Each item that we have built as a 3D animation gets `animationSlug`, so the library can offer
// the animation instead of the third-party video.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const OUT_FILE = path.join(ROOT, 'convex', 'libraryResourcesSeed.ts')

const items = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'library.json'), 'utf8'))
const sql = fs.readFileSync(path.join(HERE, 'data', 'seed.sql'), 'utf8')

// Library item -> our 3D exercise slug (convex/exerciseLibraryContent.ts).
const ANIMATIONS = {
  'kn-calf-st': 'calf-stretch',
  'kn-decline': 'single-leg-decline-squat',
  'kn-ham-wall': 'hamstring-doorway-stretch',
  'kn-menisc-ham': 'seated-hamstring-stretch',
  'kn-minisquat': 'mini-squat',
  'kn-quad-st': 'quad-stretch',
  'kn-quadset': 'static-quads',
  'kn-stepup': 'forward-step-up',
  'kn-sts': 'sit-to-stand',
  'kn-wallsit': 'wall-sit',
  'kn-wallsquat': 'wall-squat',
  'an-ach-ecc': 'eccentric-heel-drop',
  'an-ach-iso': 'seated-calf-hold',
  'an-ach-raise': 'calf-raise',
  'an-ach-towel': 'calf-towel-stretch',
  'an-calf-nuh': 'calf-towel-stretch',
  'an-heelraise': 'calf-raise',
  'an-iso-pf': 'static-push-down',
  'an-pf-load': 'plantar-fascia-loading',
  'an-pf-towel': 'plantar-fascia-towel-stretch',
  'an-pf-wall': 'plantar-fascia-wall-stretch',
  'an-rot': 'ankle-circles',
  'an-slb': 'single-leg-balance',
  'an-tandem-walk': 'heel-to-toe-walking',
  'lb-bridge': 'glute-bridge',
  'lb-sts': 'sit-to-stand',
  'lb-child': 'childs-pose',
  'lb-femoral': 'femoral-nerve-glide',
  'lb-fwd-sit': 'forward-bend-sitting',
  'lb-knee-roll': 'knee-rolling',
  'lb-pelvic-rock': 'pelvic-rocking',
  'lb-sciatic-glide': 'sciatic-nerve-glide',
  'lb-sit-rock': 'sitting-pelvic-rocking',
  'hp-bridge': 'glute-bridge',
  'hp-chairsquat': 'chair-squat',
  'hp-iso-lying': 'static-hip-pushout',
  'hp-pelvic-dip': 'pelvic-dips',
  'hp-sideabd': 'side-lying-hip-lift',
  'hp-squeeze': 'buttock-squeeze',
  'hp-swing': 'pendulum-leg-swing',
  'th-birddog': 'bird-dog',
  'sh-wallpress': 'wall-push-up',
  'nk-chin-sit': 'chin-tuck',
  'st-calf': 'calf-raise',
  'st-sts30': 'sit-to-stand',
  'st-slb': 'single-leg-balance',
  // Shoulder and upper back pack (Nov 2026)
  'sh-scap-set': 'shoulder-blade-setting',
  'sh-crossbody': 'cross-body-stretch',
  'sh-scaption': 'scaption',
  'sh-ass-ext-rot': 'assisted-external-rotation',
  'sh-ass-abd': 'assisted-abduction',
  'sh-iso-abd': 'static-shoulder-abduction',
  'sh-iso-er': 'static-external-rotation',
  'th-angels': 'wall-angels',
  'sh-pendular': 'pendulum',
  'sh-row': 'band-row',
  'th-rhom-door': 'rhomboid-doorway-stretch',
  'th-sidelying': 'open-book',
  'th-towel': 'rolled-towel-extension',
  'th-wallrot': 'wall-rotation',
  'sh-doorway': 'doorway-chest-stretch',
  'th-ball': 'tennis-ball-upper-back',
  // Neck pack
  'nk-chin-lying': 'chin-tuck-lying',
  'nk-flex-ext': 'neck-flexion-extension',
  'nk-side': 'neck-side-bending',
  'nk-trap-st': 'upper-trap-stretch',
  'nk-trap-st2': 'upper-trap-stretch',
  'nk-band-ext': 'neck-band-push-back',
  'nk-median': 'median-nerve-glide',
  'nk-trap-ball': 'tennis-ball-neck',
  // Elbow, wrist and hand pack
  'el-iso': 'static-wrist-extension',
  'el-ecc': 'eccentric-wrist-extension',
  'el-ecc-band': 'eccentric-wrist-extension',
  'el-golf-bb': 'wrist-flexor-curl',
  'el-golf-band': 'wrist-flexor-curl',
  'el-golf-air': 'wrist-flexor-stretch',
  'el-towel': 'towel-twist',
  'wr-fracture-uhn': 'wrist-range-of-movement',
  'wr-pip': 'finger-pip-bend',
  'wr-hand-ot': 'hand-band-open',
  'wr-bands': 'hand-band-open',
}

const LANGS = ['en', 'yo', 'ig', 'ha']
const resources = items.map((it) => {
  const guides = LANGS.filter((l) => it.guide?.[l]).map((l) => {
    const g = it.guide[l]
    return { lang: l, steps: g.steps, ...(g.stop ? { stop: g.stop } : {}), status: g.status === 'reviewed' ? 'reviewed' : 'draft' }
  })
  return {
    key: it.id,
    kind: it.kind,
    title: it.title,
    source: it.source,
    ...(it.url ? { url: it.url } : {}),
    ...(it.yt ? { youtubeId: it.yt } : {}),
    region: it.region,
    condition: it.condition,
    type: it.type,
    tags: it.tags ?? [],
    guides,
    ...(ANIMATIONS[it.id] ? { animationSlug: ANIMATIONS[it.id] } : {}),
  }
})
for (const key of Object.keys(ANIMATIONS)) {
  if (!items.some((it) => it.id === key)) throw new Error(`Animation mapping for unknown item ${key}`)
}

// Red flags: `insert into public.red_flags (region, lang, items, status) values ('neck', 'en', array['...', ...]::text[], 'reviewed')`
const unquote = (s) => s.replace(/''/g, "'")
const redFlags = []
for (const m of sql.matchAll(/insert into public\.red_flags \(region, lang, items, status\) values \('([^']+)', '([^']+)', array\[(.*?)\]::text\[\], '([^']+)'\)/g)) {
  const list = [...m[3].matchAll(/'((?:[^']|'')*)'/g)].map((x) => unquote(x[1]))
  redFlags.push({ region: m[1], lang: m[2], items: list, status: m[4] === 'reviewed' ? 'reviewed' : 'draft' })
}
if (redFlags.length !== 40) throw new Error(`Expected 40 red-flag lists, found ${redFlags.length}`)

const version = crypto.createHash('sha256').update(JSON.stringify({ resources, redFlags })).digest('hex').slice(0, 12)
const lines = (arr) => arr.map((x) => `  ${JSON.stringify(x)},`).join('\n')

const ts = `/* eslint-disable */
// Generated by scripts/library-import/build-seed.mjs from the Rehabify Library seed. Do not edit by hand.
// ${resources.length} items (links, videos and written guides) and ${redFlags.length} red-flag lists.

export type SeedGuide = { lang: "en" | "yo" | "ig" | "ha"; steps: string[]; stop?: string; status: "reviewed" | "draft" };

export type SeedResource = {
  key: string;
  kind: "link" | "youtube" | "guide";
  title: string;
  source: string;
  url?: string;
  youtubeId?: string;
  region: string;
  condition: string;
  type: "Exercise programme" | "Stretch" | "Self-test" | "Education";
  tags: string[];
  guides: SeedGuide[];
  /** Our 3D version of this exercise, when we have built one. */
  animationSlug?: string;
};

export type SeedRedFlags = { region: string; lang: "en" | "yo" | "ig" | "ha"; items: string[]; status: "reviewed" | "draft" };

export const LIBRARY_SEED_VERSION = "${version}";

export const LIBRARY_RESOURCES: SeedResource[] = [
${lines(resources)}
];

export const RED_FLAGS: SeedRedFlags[] = [
${lines(redFlags)}
];
`
fs.writeFileSync(OUT_FILE, ts)
console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}: ${resources.length} resources (${Object.keys(ANIMATIONS).length} with 3D), ${redFlags.length} red-flag lists, version ${version}`)
