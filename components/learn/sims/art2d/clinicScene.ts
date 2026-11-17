/**
 * The 2D clinic and Mrs Okonkwo (owner 2026-11-16: a 4th case in clean, flat 2D with soft shadows,
 * a well-built clinic space). One pure function draws the whole scene as SVG markup, so the live
 * stage (Clinic2D.tsx), the still images (scripts/sims/render2d.mjs) and the replay video all use
 * the same art. 1440 × 960 (3:2, like the other cases' scenes).
 *
 * Moving parts are marked for the live stage: data-breathe (the upper body, scaled gently at the
 * breathing rate), data-eyes="open|closed" (blinks), data-mouth="x|e|a|o" (lip shapes while she
 * speaks). Nothing here touches the DOM.
 */

import { PEOPLE_DEFS, peopleScene } from './people'

export type Pose = 'seated' | 'distress' | 'resting'
export type MouthShape = 'x' | 'm' | 'e' | 'a' | 'o'
/** What a case scene asks for: a person (Mrs Okonkwo when unset) and their pose. */
export type Art2dSpec = { pose: string; character?: string }

export type SceneOptions = {
  pose: Pose
  /** The lip shape to show (all are drawn; the others hidden). */
  mouth?: MouthShape
  eyes?: 'open' | 'closed'
}

const C = {
  wall: '#efe7da',
  wallLow: '#e7dccb',
  skirting: '#d9cbb5',
  floorA: '#c8956a',
  floorB: '#bd8a60',
  floorLine: '#b07f57',
  windowFrame: '#fbf8f2',
  sky: '#bfe3f2',
  skyLow: '#e3f2ec',
  city: '#9cc3cf',
  cityFar: '#b4d4dc',
  palm: '#3f8a5a',
  palmDark: '#2f6e47',
  couchTop: '#3e5566',
  couchSide: '#334857',
  paper: '#f7f5f0',
  chrome: '#a9b4bb',
  chromeDark: '#7f8b92',
  ink: '#0b1312',
  lime: '#00cd0f',
  skin: '#6e4129',
  skinLight: '#83503a',
  skinShade: '#5a3320',
  lip: '#4a2418',
  hairDark: '#1d1513',
  white: '#ffffff',
  eyeWhite: '#f6f1ea',
  fabric: '#5a2d82',
  fabricDark: '#45216a',
  fabricOrange: '#f0872b',
  fabricYellow: '#f7c548',
  fabricGreen: '#2f9a63',
  skirt: '#3f1f5e',
  gold: '#e1b04a',
  pillow: '#f2efe9',
  pillowShade: '#ddd7cc',
  blanket: '#e9d9c3',
  shadow: 'rgba(40,24,10,0.16)',
}

/** Thick rounded limb (an arm as one stroke). */
const limb = (pts: [number, number][], color: string, width: number) =>
  `<path d="M${pts.map((p) => p.join(' ')).join(' L')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`

function defs() {
  return `<defs>
  <linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.wall}"/><stop offset="1" stop-color="${C.wallLow}"/></linearGradient>
  <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky}"/><stop offset="1" stop-color="${C.skyLow}"/></linearGradient>
  <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.floorA}"/><stop offset="1" stop-color="${C.floorB}"/></linearGradient>
  <linearGradient id="couchG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a6476"/><stop offset="1" stop-color="${C.couchTop}"/></linearGradient>
  <linearGradient id="lightG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffbe8" stop-opacity="0.55"/><stop offset="1" stop-color="#fffbe8" stop-opacity="0"/></linearGradient>
  <radialGradient id="cheekG" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#a5583f" stop-opacity="0.35"/><stop offset="1" stop-color="#a5583f" stop-opacity="0"/></radialGradient>
  <pattern id="ankara" width="44" height="44" patternUnits="userSpaceOnUse">
    <rect width="44" height="44" fill="${C.fabric}"/>
    <path d="M22 4 L32 14 L22 24 L12 14 Z" fill="${C.fabricOrange}"/>
    <circle cx="22" cy="14" r="4" fill="${C.fabricYellow}"/>
    <path d="M0 34 Q11 26 22 34 T44 34" fill="none" stroke="${C.fabricGreen}" stroke-width="4"/>
    <circle cx="4" cy="4" r="2.4" fill="${C.fabricYellow}"/><circle cx="40" cy="4" r="2.4" fill="${C.fabricYellow}"/>
  </pattern>
  <pattern id="ankaraDark" width="44" height="44" patternUnits="userSpaceOnUse">
    <rect width="44" height="44" fill="${C.fabricDark}"/>
    <path d="M22 4 L32 14 L22 24 L12 14 Z" fill="#c96d22"/>
    <circle cx="22" cy="14" r="4" fill="#d6a83a"/>
    <path d="M0 34 Q11 26 22 34 T44 34" fill="none" stroke="#247a4e" stroke-width="4"/>
  </pattern>
  <pattern id="gele" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
    <rect width="30" height="30" fill="${C.fabricOrange}"/>
    <rect width="30" height="8" y="11" fill="#f39b46"/>
    <circle cx="15" cy="15" r="3" fill="${C.fabricYellow}"/>
  </pattern>
</defs>`
}

/** The room: wall, window with Lagos beyond, poster, clock, shelf, side table with BP machine, plant, floor. */
function room() {
  // Skyline blocks behind the window
  const blocks = [
    [120, 330, 50, 150],
    [168, 300, 40, 180],
    [205, 350, 60, 130],
    [262, 280, 46, 200],
    [305, 340, 52, 140],
    [354, 310, 40, 170],
    [392, 360, 60, 120],
  ]
  const far = blocks.map(([x, y, w, h]) => `<rect x="${x}" y="${y - 30}" width="${w}" height="${h + 30}" fill="${C.cityFar}"/>`).join('')
  const near = blocks
    .map(([x, y, w, h], i) => {
      const windows = Array.from({ length: Math.floor(h / 26) }, (_, r) =>
        Array.from({ length: Math.max(1, Math.floor(w / 16)) }, (_, c) => `<rect x="${x + 5 + c * 15}" y="${y + 10 + r * 26}" width="7" height="10" rx="1.5" fill="#e9f6f8" opacity="${(r + c + i) % 3 === 0 ? 0.9 : 0.55}"/>`).join('')
      ).join('')
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.city}"/>${windows}`
    })
    .join('')
  return `
  <rect width="1440" height="960" fill="url(#wallG)"/>
  <!-- window -->
  <g>
    <rect x="96" y="118" width="384" height="400" rx="14" fill="${C.windowFrame}"/>
    <rect x="114" y="136" width="348" height="364" rx="6" fill="url(#skyG)"/>
    <circle cx="410" cy="190" r="34" fill="#fff6d6" opacity="0.9"/>
    <g clip-path="url(#winClip)">${far}${near}
      <path d="M110 520 Q170 400 240 470 Q205 430 150 455 Z" fill="${C.palm}"/>
      <path d="M96 470 Q160 360 230 400 Q170 395 120 430 Z" fill="${C.palmDark}"/>
    </g>
    <clipPath id="winClip"><rect x="114" y="136" width="348" height="364" rx="6"/></clipPath>
    <rect x="285" y="136" width="8" height="364" fill="${C.windowFrame}"/>
    <rect x="114" y="314" width="348" height="8" fill="${C.windowFrame}"/>
    <rect x="86" y="508" width="404" height="22" rx="8" fill="#fbf8f2"/>
    <rect x="86" y="526" width="404" height="8" rx="4" fill="${C.shadow}"/>
  </g>

  <!-- anatomy poster: the shoulder -->
  <g transform="translate(330 0) scale(0.84) translate(110 30)">
    <rect x="566" y="138" width="200" height="262" rx="10" fill="#ffffff"/>
    <rect x="566" y="392" width="200" height="8" rx="4" fill="${C.shadow}"/>
    <rect x="582" y="154" width="168" height="196" rx="6" fill="#f4efe6"/>
    <path d="M610 236 Q640 196 690 206 Q722 214 730 250 Q714 236 690 238 Q660 242 646 270 Q628 262 610 236 Z" fill="#e7b9a1"/>
    <circle cx="684" cy="232" r="22" fill="#f2d7c6" stroke="#d99b80" stroke-width="3"/>
    <path d="M640 280 Q660 300 676 330" fill="none" stroke="#d99b80" stroke-width="10" stroke-linecap="round"/>
    <path d="M700 252 Q712 290 704 330" fill="none" stroke="#e2a98f" stroke-width="12" stroke-linecap="round"/>
    <rect x="590" y="362" width="120" height="9" rx="4.5" fill="${C.ink}" opacity="0.75"/>
    <rect x="590" y="378" width="80" height="7" rx="3.5" fill="${C.ink}" opacity="0.3"/>
    <circle cx="738" cy="372" r="10" fill="${C.lime}"/>
  </g>
  <!-- wall clock -->
  <g transform="translate(40 -6)">
    <circle cx="1210" cy="176" r="54" fill="#ffffff"/>
    <circle cx="1210" cy="176" r="54" fill="none" stroke="${C.ink}" stroke-width="8"/>
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2
      return `<line x1="${(1210 + Math.sin(a) * 40).toFixed(1)}" y1="${(176 - Math.cos(a) * 40).toFixed(1)}" x2="${(1210 + Math.sin(a) * 46).toFixed(1)}" y2="${(176 - Math.cos(a) * 46).toFixed(1)}" stroke="${C.ink}" stroke-width="${i % 3 === 0 ? 5 : 2.5}" stroke-linecap="round"/>`
    }).join('')}
    <line x1="1210" y1="176" x2="1210" y2="140" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>
    <line x1="1210" y1="176" x2="1236" y2="190" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="1210" cy="176" r="6" fill="${C.lime}"/>
  </g>
  <!-- shelf with exercise bands, towels and a ball -->
  <g transform="translate(100 40) scale(0.92)">
    <rect x="1060" y="330" width="330" height="16" rx="6" fill="#d8c3a5"/>
    <rect x="1060" y="344" width="330" height="8" rx="4" fill="${C.shadow}"/>
    <ellipse cx="1110" cy="306" rx="34" ry="24" fill="${C.lime}"/><ellipse cx="1110" cy="306" rx="16" ry="10" fill="#00a90c"/>
    <ellipse cx="1180" cy="308" rx="30" ry="22" fill="#f0872b"/><ellipse cx="1180" cy="308" rx="14" ry="9" fill="#d26f19"/>
    <rect x="1226" y="278" width="78" height="20" rx="8" fill="#ffffff"/><rect x="1230" y="298" width="72" height="16" rx="7" fill="#e9e3d8"/><rect x="1228" y="312" width="76" height="18" rx="8" fill="#ffffff"/>
    <circle cx="1346" cy="296" r="34" fill="#5a8fd6"/><path d="M1314 290 Q1346 272 1378 292" fill="none" stroke="#7aa8e6" stroke-width="5"/>
  </g>
  <!-- skirting and floor -->
  <rect x="0" y="676" width="1440" height="20" fill="${C.skirting}"/>
  <rect x="0" y="696" width="1440" height="264" fill="url(#floorG)"/>
  <path d="M96 700 L480 700 L560 960 L40 960 Z" fill="#fff6dc" opacity="0.16"/>
  ${Array.from({ length: 9 }, (_, i) => `<line x1="${-120 + i * 210}" y1="696" x2="${-360 + i * 260}" y2="960" stroke="${C.floorLine}" stroke-width="2" opacity="0.5"/>`).join('')}
  <!-- plant -->
  <g>
    <ellipse cx="1330" cy="868" rx="76" ry="14" fill="${C.shadow}"/>
    <path d="M1282 780 L1378 780 L1366 866 L1294 866 Z" fill="#e6dccd"/>
    <rect x="1276" y="770" width="108" height="16" rx="6" fill="#efe7da"/>
    <path d="M1330 772 Q1300 640 1316 560 Q1336 650 1340 772 Z" fill="${C.palm}"/>
    <path d="M1316 774 Q1262 676 1262 600 Q1298 680 1330 774 Z" fill="${C.palmDark}"/>
    <path d="M1342 774 Q1396 690 1402 610 Q1366 690 1330 774 Z" fill="#4b9b67"/>
    <path d="M1336 774 Q1352 660 1370 590 Q1360 690 1346 774 Z" fill="${C.palmDark}"/>
  </g>
  <!-- side table with the BP machine and pulse oximeter -->
  <g>
    <ellipse cx="292" cy="880" rx="120" ry="16" fill="${C.shadow}"/>
    <rect x="186" y="640" width="212" height="18" rx="6" fill="#efe7da"/>
    <rect x="200" y="656" width="10" height="220" fill="${C.chromeDark}"/><rect x="374" y="656" width="10" height="220" fill="${C.chromeDark}"/>
    <rect x="200" y="780" width="184" height="8" fill="${C.chrome}"/>
    <rect x="214" y="566" width="110" height="76" rx="12" fill="#f8f8f6"/>
    <rect x="226" y="578" width="62" height="34" rx="5" fill="#1d2b2a"/>
    <text x="232" y="602" font-family="monospace" font-size="20" font-weight="700" fill="#7ff08a">158</text>
    <circle cx="306" cy="596" r="8" fill="${C.lime}"/>
    <path d="M324 610 Q356 616 352 650" fill="none" stroke="#3c4a52" stroke-width="5"/>
    <rect x="336" y="610" width="52" height="30" rx="10" fill="#3e5566"/>
    <rect x="346" y="602" width="34" height="18" rx="7" fill="#f0f0ee"/>
    <rect x="351" y="606" width="24" height="10" rx="3" fill="#1d2b2a"/>
  </g>`
}

/** The treatment couch (behind her) and its shadow. */
function couch(pose: Pose) {
  const pillow =
    pose === 'resting'
      ? `<path d="M610 330 Q600 300 640 296 L880 296 Q920 300 910 330 L900 520 L620 520 Z" fill="${C.pillow}"/><path d="M620 470 L900 470 L900 520 L620 520 Z" fill="${C.pillowShade}" opacity="0.6"/>`
      : ''
  return `
  <ellipse cx="760" cy="842" rx="430" ry="26" fill="${C.shadow}"/>
  <rect x="404" y="610" width="16" height="230" rx="5" fill="${C.chromeDark}"/>
  <rect x="1100" y="610" width="16" height="230" rx="5" fill="${C.chromeDark}"/>
  <rect x="428" y="610" width="12" height="214" rx="4" fill="${C.chrome}"/>
  <rect x="1080" y="610" width="12" height="214" rx="4" fill="${C.chrome}"/>
  <rect x="404" y="760" width="712" height="12" rx="5" fill="${C.chrome}"/>
  ${pillow}
  <rect x="380" y="548" width="760" height="56" rx="18" fill="url(#couchG)"/>
  <rect x="380" y="590" width="760" height="26" rx="12" fill="${C.couchSide}"/>
  <rect x="470" y="540" width="580" height="18" rx="6" fill="${C.paper}"/>
  <rect x="470" y="554" width="580" height="6" fill="#e2ddd2"/>`
}

const sweat = `<g fill="#dff3ff" stroke="#9cc9e2" stroke-width="1.5">
  <path d="M716 214 q-7 12 0 18 q7 -6 0 -18 z"/><path d="M806 206 q-6 10 0 15 q6 -5 0 -15 z"/><path d="M742 286 q-5 8 0 12 q5 -4 0 -12 z"/>
</g>`

/** Mouth shapes around (760, 292): closed, ee, ah, oh. A grimace replaces "closed" in distress. */
function mouths(pose: Pose) {
  const closed =
    pose === 'distress'
      ? `<path d="M742 296 Q760 288 778 296" fill="none" stroke="${C.lip}" stroke-width="5" stroke-linecap="round"/>`
      : pose === 'resting'
        ? `<path d="M745 294 Q760 296 775 294" fill="none" stroke="${C.lip}" stroke-width="5" stroke-linecap="round"/>`
        : `<path d="M744 295 Q760 297 776 293" fill="none" stroke="${C.lip}" stroke-width="5" stroke-linecap="round"/>`
  return `
  <g data-mouth="x">${closed}</g>
  <g data-mouth="m" style="display:none">${closed}</g>
  <g data-mouth="e" style="display:none"><path d="M740 288 Q760 284 780 288 Q776 302 760 304 Q744 302 740 288 Z" fill="#3a1610"/><rect x="746" y="288" width="28" height="6" rx="2" fill="#f4ede2"/></g>
  <g data-mouth="a" style="display:none"><path d="M745 286 Q760 280 775 286 Q778 310 760 314 Q742 310 745 286 Z" fill="#3a1610"/><path d="M750 304 Q760 298 770 304 Q766 312 760 312 Q754 312 750 304 Z" fill="#b04b4b"/><rect x="749" y="286" width="22" height="5" rx="2" fill="#f4ede2"/></g>
  <g data-mouth="o" style="display:none"><ellipse cx="760" cy="295" rx="10" ry="12" fill="#3a1610"/><ellipse cx="760" cy="295" rx="10" ry="12" fill="none" stroke="${C.lip}" stroke-width="3.5"/></g>`
}

/** Head (face, gele, ears, eyes, brows, nose, mouths), centred on (760, 250). */
function head(pose: Pose) {
  const painBrows = pose === 'distress'
  const brows = painBrows
    ? `<path d="M716 226 Q728 214 748 222" fill="none" stroke="${C.hairDark}" stroke-width="6" stroke-linecap="round"/><path d="M772 222 Q792 214 804 226" fill="none" stroke="${C.hairDark}" stroke-width="6" stroke-linecap="round"/>`
    : pose === 'resting'
      ? `<path d="M716 224 Q730 214 746 218" fill="none" stroke="${C.hairDark}" stroke-width="5.5" stroke-linecap="round"/><path d="M774 218 Q790 214 804 224" fill="none" stroke="${C.hairDark}" stroke-width="5.5" stroke-linecap="round"/>`
      : `<path d="M716 224 Q730 214 748 220" fill="none" stroke="${C.hairDark}" stroke-width="6" stroke-linecap="round"/><path d="M772 220 Q790 214 804 224" fill="none" stroke="${C.hairDark}" stroke-width="6" stroke-linecap="round"/>`
  const halfShut = pose !== 'seated'
  const open = halfShut
    ? `<ellipse cx="732" cy="248" rx="11" ry="6" fill="${C.eyeWhite}"/><ellipse cx="788" cy="248" rx="11" ry="6" fill="${C.eyeWhite}"/>
       <circle cx="733" cy="249" r="5" fill="${C.hairDark}"/><circle cx="787" cy="249" r="5" fill="${C.hairDark}"/>
       <path d="M720 245 Q732 238 744 245" fill="${C.skin}" stroke="${C.skinShade}" stroke-width="2.5"/><path d="M776 245 Q788 238 800 245" fill="${C.skin}" stroke="${C.skinShade}" stroke-width="2.5"/>`
    : `<ellipse cx="732" cy="248" rx="11" ry="8" fill="${C.eyeWhite}"/><ellipse cx="788" cy="248" rx="11" ry="8" fill="${C.eyeWhite}"/>
       <circle cx="734" cy="249" r="5.5" fill="${C.hairDark}"/><circle cx="786" cy="249" r="5.5" fill="${C.hairDark}"/>
       <circle cx="736" cy="247" r="1.6" fill="#ffffff"/><circle cx="788" cy="247" r="1.6" fill="#ffffff"/>
       <path d="M720 244 Q732 236 744 244" fill="none" stroke="${C.hairDark}" stroke-width="2.5" stroke-linecap="round"/><path d="M776 244 Q788 236 800 244" fill="none" stroke="${C.hairDark}" stroke-width="2.5" stroke-linecap="round"/>`
  const closed = `<path d="M721 249 Q732 255 743 249" fill="none" stroke="${C.hairDark}" stroke-width="3" stroke-linecap="round"/><path d="M777 249 Q788 255 799 249" fill="none" stroke="${C.hairDark}" stroke-width="3" stroke-linecap="round"/>`
  return `
  <!-- neck -->
  <path d="M732 300 L732 344 Q760 356 788 344 L788 300 Z" fill="${C.skinShade}"/>
  <!-- ears and earrings -->
  <ellipse cx="696" cy="256" rx="10" ry="16" fill="${C.skinShade}"/><ellipse cx="824" cy="256" rx="10" ry="16" fill="${C.skinShade}"/>
  <circle cx="696" cy="278" r="6" fill="${C.gold}"/><circle cx="824" cy="278" r="6" fill="${C.gold}"/>
  <!-- face -->
  <path d="M700 230 Q700 178 760 176 Q820 178 820 230 L820 262 Q818 306 760 318 Q702 306 700 262 Z" fill="${C.skin}"/>
  <path d="M790 186 Q820 196 820 236 L820 262 Q818 300 784 314 Q808 286 806 240 Q804 204 790 186 Z" fill="${C.skinShade}" opacity="0.45"/>
  <ellipse cx="722" cy="276" rx="16" ry="10" fill="url(#cheekG)"/><ellipse cx="798" cy="276" rx="16" ry="10" fill="url(#cheekG)"/>
  <!-- gele (head-tie) -->
  <path d="M690 214 Q684 150 744 130 Q808 116 836 160 Q846 190 830 214 Q800 188 760 190 Q716 192 690 214 Z" fill="url(#gele)"/>
  <path d="M736 132 Q770 74 834 92 Q870 104 860 140 Q840 120 806 126 Q770 130 752 150 Z" fill="url(#gele)"/>
  <path d="M836 160 Q880 150 884 120 Q890 168 846 188 Z" fill="#d9731f"/>
  <path d="M694 208 Q760 176 832 208" fill="none" stroke="#c9661a" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
  <path d="M752 150 Q790 116 852 128" fill="none" stroke="#c9661a" stroke-width="4" stroke-linecap="round" opacity="0.6"/>
  <path d="M768 112 Q800 96 840 104 M790 96 Q822 86 852 98" fill="none" stroke="#c9661a" stroke-width="3.5" stroke-linecap="round" opacity="0.55"/>
  <path d="M700 196 Q740 170 790 172" fill="none" stroke="#ffb066" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
  ${brows}
  <g data-eyes="open">${open}</g>
  <g data-eyes="closed" style="display:none">${closed}</g>
  <!-- nose -->
  <path d="M754 254 Q750 272 746 276 Q760 284 774 276 Q770 272 766 254" fill="${C.skinShade}" opacity="0.55"/>
  <path d="M748 276 Q760 282 772 276" fill="none" stroke="${C.skinShade}" stroke-width="3" stroke-linecap="round"/>
  ${mouths(pose)}
  ${pose === 'distress' ? `<path d="M700 230 Q700 178 760 176 Q820 178 820 230 L820 262 Q818 306 760 318 Q702 306 700 262 Z" fill="#8e9a9c" opacity="0.2"/>${sweat}` : ''}
  ${pose === 'resting' ? `<path d="M716 214 q-5 9 0 13 q5 -4 0 -13 z" fill="#dff3ff" stroke="#9cc9e2" stroke-width="1.2"/>` : ''}`
}

/** Torso, skirt and feet, then the arms for each pose. */
function body(pose: Pose) {
  const lean = pose === 'distress' ? 'translate(0 14)' : pose === 'resting' ? 'translate(0 -4)' : ''
  const torso = `
  <!-- blouse (Ankara print) -->
  <path d="M676 352 Q700 334 760 332 Q820 334 844 352 L866 560 Q760 580 654 560 Z" fill="url(#ankara)"/>
  <path d="M820 340 Q846 350 852 400 L866 560 Q840 566 814 568 Q830 460 820 340 Z" fill="#000000" opacity="0.12"/>
  <path d="M732 340 Q760 368 788 340" fill="none" stroke="${C.fabricDark}" stroke-width="6" stroke-linecap="round"/>`
  const skirt = `
  <!-- wrapper skirt over the knees, feet in sandals -->
  <path d="M640 552 Q760 574 880 552 L912 610 Q900 700 878 780 L642 780 Q620 700 608 610 Z" fill="${C.skirt}"/>
  <path d="M760 566 L760 780" stroke="#2d1546" stroke-width="5" opacity="0.6"/>
  <path d="M608 610 Q760 640 912 610" fill="none" stroke="${C.fabricOrange}" stroke-width="10" opacity="0.85"/>
  <path d="M846 560 Q890 590 906 640 Q900 700 878 780 L846 780 Q870 690 846 560 Z" fill="#000000" opacity="0.12"/>
  <ellipse cx="704" cy="800" rx="40" ry="14" fill="${C.skinShade}"/><ellipse cx="816" cy="800" rx="40" ry="14" fill="${C.skinShade}"/>
  <path d="M668 800 Q704 786 740 800" fill="none" stroke="${C.gold}" stroke-width="7" stroke-linecap="round"/>
  <path d="M780 800 Q816 786 852 800" fill="none" stroke="${C.gold}" stroke-width="7" stroke-linecap="round"/>`
  // Arms: sleeve (upper arm, fabric) then forearm and hand (skin)
  let arms = ''
  if (pose === 'seated') {
    // Her right hand rubs her left shoulder; her left hand rests on her lap
    arms = `
    ${limb([[846, 360], [872, 450], [862, 520]], 'url(#ankaraDark)', 50)}
    ${limb([[862, 516], [828, 552]], C.skin, 36)}
    <ellipse cx="818" cy="556" rx="24" ry="16" fill="${C.skinLight}"/>
    ${limb([[674, 360], [656, 448], [690, 480]], 'url(#ankara)', 50)}
    ${limb([[690, 482], [780, 424], [826, 372]], C.skin, 36)}
    <ellipse cx="834" cy="364" rx="26" ry="19" transform="rotate(-24 834 364)" fill="${C.skinLight}"/>
    <path d="M816 354 Q832 346 850 352 M818 364 Q834 356 852 362" fill="none" stroke="${C.skinShade}" stroke-width="3" stroke-linecap="round"/>`
  } else if (pose === 'distress') {
    // Her right fist presses her chest; her left hand grips the couch edge
    arms = `
    ${limb([[846, 360], [884, 452], [900, 520]], 'url(#ankaraDark)', 50)}
    ${limb([[900, 516], [918, 566]], C.skin, 36)}
    <ellipse cx="920" cy="570" rx="22" ry="18" fill="${C.skinLight}"/>
    ${limb([[674, 360], [652, 452], [690, 484]], 'url(#ankara)', 50)}
    ${limb([[690, 486], [742, 430]], C.skin, 36)}
    <circle cx="752" cy="420" r="24" fill="${C.skinLight}"/>
    <path d="M738 410 Q752 402 766 410 M738 420 Q752 412 766 420" fill="none" stroke="${C.skinShade}" stroke-width="3" stroke-linecap="round"/>`
  } else {
    // Resting: both hands folded in her lap
    arms = `
    ${limb([[846, 360], [870, 452], [850, 520]], 'url(#ankaraDark)', 50)}
    ${limb([[850, 518], [790, 548]], C.skin, 36)}
    ${limb([[674, 360], [650, 452], [670, 520]], 'url(#ankara)', 50)}
    ${limb([[670, 518], [736, 548]], C.skin, 36)}
    <ellipse cx="764" cy="552" rx="34" ry="18" fill="${C.skinLight}"/>
    <path d="M744 548 Q764 540 784 548" fill="none" stroke="${C.skinShade}" stroke-width="3" stroke-linecap="round"/>`
  }
  return { lean, torso, skirt, arms }
}

/** A university sports clinic's touches for Tunde's room: a football, cones and a team pennant. */
function sportsExtras() {
  return `
  <g>
    <ellipse cx="190" cy="902" rx="54" ry="10" fill="${C.shadow}"/>
    <circle cx="190" cy="862" r="40" fill="#ffffff"/>
    <path d="M190 840 L208 852 L202 872 L178 872 L172 852 Z" fill="${C.ink}"/>
    <path d="M152 860 L172 852 M208 852 L228 858 M178 872 L170 892 M202 872 L210 892 M190 822 L190 840" stroke="${C.ink}" stroke-width="3"/>
    <path d="M300 900 L322 840 L344 900 Z" fill="#f0872b"/><rect x="296" y="896" width="52" height="8" rx="3" fill="#d26f19"/>
    <path d="M318 852 L326 852 L330 864 L314 864 Z" fill="#ffffff"/>
    <path d="M524 176 L524 228 L606 202 Z" fill="#1f8f4e"/><path d="M524 192 L572 202 L524 212 Z" fill="#ffffff" opacity="0.9"/><rect x="518" y="168" width="7" height="70" rx="3" fill="#8f7a5c"/>
  </g>`
}

function frame(inner: string, mouth: MouthShape = 'x', eyes: 'open' | 'closed' = 'open') {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 960" width="1440" height="960" preserveAspectRatio="xMidYMid slice">
${defs()}
<defs>${PEOPLE_DEFS}</defs>
<style>
  [data-breathe]{transform-box:view-box;transform-origin:760px 560px}
  .breathing [data-breathe]{animation:rh-breathe var(--breath,3.6s) ease-in-out infinite}
  @keyframes rh-breathe{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-3px) scale(1.008,1.014)}}
  @media (prefers-reduced-motion: reduce){.breathing [data-breathe]{animation:none}}
</style>
${inner}
</svg>`
  // Static renders pick one mouth and eye state
  if (mouth !== 'x') svg = svg.replace('<g data-mouth="x">', '<g data-mouth="x" style="display:none">').replace(`<g data-mouth="${mouth}" style="display:none">`, `<g data-mouth="${mouth}">`)
  if (eyes === 'closed') svg = svg.replace('<g data-eyes="open">', '<g data-eyes="open" style="display:none">').replace('<g data-eyes="closed" style="display:none">', '<g data-eyes="closed">')
  return svg
}

/** Mrs Okonkwo's scene as an SVG string (1440 × 960). */
export function clinicSceneSvg({ pose, mouth = 'x', eyes = 'open' }: SceneOptions): string {
  const { lean, torso, skirt, arms } = body(pose)
  return frame(
    `${room()}
${couch(pose)}
<ellipse cx="760" cy="812" rx="190" ry="18" fill="${C.shadow}"/>
${skirt}
<g transform="${lean}">
  <g data-breathe="">
    ${torso}
    ${head(pose)}
    ${arms}
  </g>
</g>`,
    mouth,
    eyes
  )
}

/** Any case's scene: Mrs Okonkwo (default), Mrs Adebayo (funmi), Tunde (tunde) or Mr Okafor (emeka). */
export function sceneSvg(art: Art2dSpec, opts: { mouth?: MouthShape; eyes?: 'open' | 'closed' } = {}): string {
  const who = art.character ?? 'ngozi'
  if (who === 'funmi' || who === 'tunde' || who === 'emeka') {
    return frame(
      peopleScene({ character: who, pose: art.pose }, (variant) => room() + (variant === 'sports' ? sportsExtras() : '')),
      opts.mouth,
      opts.eyes
    )
  }
  return clinicSceneSvg({ pose: art.pose as Pose, mouth: opts.mouth, eyes: opts.eyes })
}
