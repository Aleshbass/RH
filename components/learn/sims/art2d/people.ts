/**
 * More people and places for the 2D simulations (owner 2026-11-16: "change the 3D cases to this 2D,
 * it's beautiful and lightweight"). Same style as clinicScene.ts (Mrs Okonkwo): flat shapes, soft
 * shadows, the same moving parts (data-breathe, data-eyes, data-mouth). Heads are drawn around
 * (760, 250) and moved into place per pose, so the lip shapes always sit on the mouth.
 *
 *   funmi  Mrs Funmilayo Adebayo, 42 (clinic): standing · plinth · worried
 *   tunde  Tunde Bakare, 22 (sports clinic):   couch
 *   emeka  Mr Emeka Okafor, 64 (ward):         tripod
 */

const SHADOW = 'rgba(40,24,10,0.16)'
const LIP = '#4a2418'

const limb = (pts: [number, number][], color: string, width: number) =>
  `<path d="M${pts.map((p) => p.join(' ')).join(' L')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`

// ── Heads ─────────────────────────────────────────────────────────────────────

type Skin = { base: string; shade: string; light: string }
type Expression = 'calm' | 'uneasy' | 'worried' | 'pain' | 'breathless'
type HeadSpec = {
  skin: Skin
  hair: 'bun' | 'fade' | 'grey'
  male?: boolean
  earrings?: boolean
  expression: Expression
  sweat?: boolean
  grey?: boolean
}

const BROWS: Record<Expression, string> = {
  calm: 'M716 224 Q730 214 748 220 M772 220 Q790 214 804 224',
  uneasy: 'M716 222 Q730 218 748 224 M772 224 Q790 218 804 222',
  worried: 'M716 226 Q730 214 748 218 M772 218 Q790 214 804 226',
  pain: 'M716 226 Q728 214 748 222 M772 222 Q792 214 804 226',
  breathless: 'M716 226 Q728 216 748 222 M772 222 Q792 216 804 226',
}

const CLOSED: Record<Expression, string> = {
  calm: 'M744 293 Q760 299 776 293',
  uneasy: 'M744 295 Q760 296 776 294',
  worried: 'M745 296 Q760 291 775 296',
  pain: 'M742 296 Q760 288 778 296',
  breathless: '',
}

/** Lip shapes around (760, 292): rest, ee, ah, oh (same as Mrs Okonkwo's). Breathless rests slightly open. */
function mouths(expression: Expression) {
  const rest =
    expression === 'breathless'
      ? `<path d="M748 290 Q760 286 772 290 Q772 302 760 304 Q748 302 748 290 Z" fill="#3a1610"/>`
      : `<path d="${CLOSED[expression]}" fill="none" stroke="${LIP}" stroke-width="5" stroke-linecap="round"/>`
  return `
  <g data-mouth="x">${rest}</g>
  <g data-mouth="m" style="display:none">${rest}</g>
  <g data-mouth="e" style="display:none"><path d="M740 288 Q760 284 780 288 Q776 302 760 304 Q744 302 740 288 Z" fill="#3a1610"/><rect x="746" y="288" width="28" height="6" rx="2" fill="#f4ede2"/></g>
  <g data-mouth="a" style="display:none"><path d="M745 286 Q760 280 775 286 Q778 310 760 314 Q742 310 745 286 Z" fill="#3a1610"/><path d="M750 304 Q760 298 770 304 Q766 312 760 312 Q754 312 750 304 Z" fill="#b04b4b"/><rect x="749" y="286" width="22" height="5" rx="2" fill="#f4ede2"/></g>
  <g data-mouth="o" style="display:none"><ellipse cx="760" cy="295" rx="10" ry="12" fill="#3a1610"/><ellipse cx="760" cy="295" rx="10" ry="12" fill="none" stroke="${LIP}" stroke-width="3.5"/></g>`
}

function eyes(h: HeadSpec) {
  const ink = '#1d1513'
  const half = h.expression === 'pain' || h.expression === 'breathless'
  const open = half
    ? `<ellipse cx="732" cy="248" rx="11" ry="6" fill="#f6f1ea"/><ellipse cx="788" cy="248" rx="11" ry="6" fill="#f6f1ea"/>
       <circle cx="733" cy="249" r="5" fill="${ink}"/><circle cx="787" cy="249" r="5" fill="${ink}"/>
       <path d="M720 245 Q732 238 744 245" fill="${h.skin.base}" stroke="${h.skin.shade}" stroke-width="2.5"/><path d="M776 245 Q788 238 800 245" fill="${h.skin.base}" stroke="${h.skin.shade}" stroke-width="2.5"/>`
    : `<ellipse cx="732" cy="248" rx="11" ry="${h.expression === 'worried' ? 9 : 8}" fill="#f6f1ea"/><ellipse cx="788" cy="248" rx="11" ry="${h.expression === 'worried' ? 9 : 8}" fill="#f6f1ea"/>
       <circle cx="734" cy="249" r="5.5" fill="${ink}"/><circle cx="786" cy="249" r="5.5" fill="${ink}"/>
       <circle cx="736" cy="247" r="1.6" fill="#ffffff"/><circle cx="788" cy="247" r="1.6" fill="#ffffff"/>
       <path d="M720 244 Q732 236 744 244" fill="none" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/><path d="M776 244 Q788 236 800 244" fill="none" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/>`
  const closed = `<path d="M721 249 Q732 255 743 249" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/><path d="M777 249 Q788 255 799 249" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`
  return `<g data-eyes="open">${open}</g><g data-eyes="closed" style="display:none">${closed}</g>`
}

function hair(h: HeadSpec) {
  if (h.hair === 'bun') {
    // Braids pulled back into a bun
    return `
    <circle cx="760" cy="150" r="34" fill="#1f1714"/>
    ${Array.from({ length: 5 }, (_, i) => `<path d="M${734 + i * 13} 126 Q${738 + i * 12} 150 ${736 + i * 13} 176" fill="none" stroke="#3a2c26" stroke-width="3"/>`).join('')}
    <path d="M698 240 Q694 172 760 166 Q826 172 822 240 Q812 204 784 196 Q760 190 736 196 Q708 204 698 240 Z" fill="#1f1714"/>
    ${Array.from({ length: 7 }, (_, i) => `<path d="M${712 + i * 16} ${200 - (i === 3 ? 12 : Math.abs(3 - i) * -2 + 6)} Q${716 + i * 15} 182 ${728 + i * 11} 170" fill="none" stroke="#3a2c26" stroke-width="2.5" opacity="0.8"/>`).join('')}`
  }
  if (h.hair === 'fade') {
    return `
    <path d="M700 226 Q700 170 760 166 Q820 170 820 226 Q812 198 790 192 Q760 186 730 192 Q708 198 700 226 Z" fill="#18110f"/>
    <path d="M700 226 Q702 214 708 206 L708 236 Z M820 226 Q818 214 812 206 L812 236 Z" fill="#2a1d18"/>`
  }
  // Short grey hair, thinning on top
  return `
    <path d="M700 232 Q700 186 726 176 Q760 166 794 176 Q820 186 820 232 Q814 206 800 198 Q786 190 772 196 Q760 186 748 196 Q734 190 720 198 Q706 206 700 232 Z" fill="#cfc9c1"/>
    ${Array.from({ length: 14 }, (_, i) => `<circle cx="${708 + ((i * 37) % 104)}" cy="${190 + ((i * 13) % 26)}" r="1.6" fill="#8f877e"/>`).join('')}`
}

/** A head centred on (760, 250); `at` moves it into place for the pose. */
function headSvg(h: HeadSpec, at = '') {
  const s = h.skin
  const face = h.male
    ? 'M698 228 Q698 174 760 172 Q822 174 822 228 L822 266 Q818 314 760 324 Q702 314 698 266 Z'
    : 'M700 230 Q700 178 760 176 Q820 178 820 230 L820 262 Q818 306 760 318 Q702 306 700 262 Z'
  const stubble =
    h.hair === 'grey'
      ? `<path d="M706 278 Q716 314 760 322 Q804 314 814 278 Q804 304 760 312 Q716 304 706 278 Z" fill="#9c958c" opacity="0.55"/>
         <path d="M740 284 Q760 279 780 284 Q772 288 760 288 Q748 288 740 284 Z" fill="#9c958c" opacity="0.6"/>`
      : ''
  return `<g transform="${at}">
  <path d="M732 300 L732 348 Q760 360 788 348 L788 300 Z" fill="${s.shade}"/>
  <ellipse cx="${h.male ? 694 : 696}" cy="256" rx="10" ry="16" fill="${s.shade}"/><ellipse cx="${h.male ? 826 : 824}" cy="256" rx="10" ry="16" fill="${s.shade}"/>
  ${h.earrings ? `<circle cx="696" cy="276" r="5" fill="#e1b04a"/><circle cx="824" cy="276" r="5" fill="#e1b04a"/>` : ''}
  <path d="${face}" fill="${s.base}"/>
  <path d="M790 186 Q820 196 820 236 L820 262 Q818 300 784 314 Q808 286 806 240 Q804 204 790 186 Z" fill="${s.shade}" opacity="0.45"/>
  <ellipse cx="722" cy="276" rx="16" ry="10" fill="url(#cheekG)"/><ellipse cx="798" cy="276" rx="16" ry="10" fill="url(#cheekG)"/>
  ${stubble}
  ${hair(h)}
  <path d="${BROWS[h.expression]}" fill="none" stroke="${h.hair === 'grey' ? '#6f675f' : '#1d1513'}" stroke-width="6" stroke-linecap="round"/>
  ${eyes(h)}
  <path d="M754 254 Q750 272 746 276 Q760 284 774 276 Q770 272 766 254" fill="${s.shade}" opacity="0.55"/>
  <path d="M748 276 Q760 282 772 276" fill="none" stroke="${s.shade}" stroke-width="3" stroke-linecap="round"/>
  ${mouths(h.expression)}
  ${h.grey ? `<path d="${face}" fill="#8e9a9c" opacity="0.18"/>` : ''}
  ${h.sweat ? `<g fill="#dff3ff" stroke="#9cc9e2" stroke-width="1.5"><path d="M716 214 q-7 12 0 18 q7 -6 0 -18 z"/><path d="M806 206 q-6 10 0 15 q6 -5 0 -15 z"/><path d="M742 286 q-5 8 0 12 q5 -4 0 -12 z"/></g>` : ''}
</g>`
}

// ── Places ────────────────────────────────────────────────────────────────────

/** The hospital ward: pale walls, window with blinds, oxygen panel, monitor, IV pole, cabinet, curtain. */
export function wardRoom() {
  return `
  <rect width="1440" height="960" fill="#e2ecea"/>
  <rect y="430" width="1440" height="250" fill="#d4e3e1"/>
  <rect y="676" width="1440" height="20" fill="#bfd1cf"/>
  <rect y="696" width="1440" height="264" fill="#cdd3d4"/>
  ${Array.from({ length: 8 }, (_, i) => `<line x1="${i * 210 - 60}" y1="696" x2="${i * 250 - 300}" y2="960" stroke="#bcc3c5" stroke-width="2"/>`).join('')}
  <path d="M380 740 L1100 740 L1180 960 L300 960 Z" fill="#ffffff" opacity="0.18"/>
  <!-- window with blinds -->
  <rect x="80" y="110" width="330" height="380" rx="12" fill="#f8fbfa"/>
  <rect x="96" y="126" width="298" height="348" rx="6" fill="#bfe3f2"/>
  <path d="M96 400 Q170 330 250 380 Q320 420 394 360 L394 474 L96 474 Z" fill="#9cc3cf"/>
  ${Array.from({ length: 14 }, (_, i) => `<rect x="96" y="${132 + i * 24}" width="298" height="9" rx="3" fill="#f2f6f5" opacity="0.92"/>`).join('')}
  <rect x="70" y="480" width="350" height="18" rx="7" fill="#f8fbfa"/>
  <!-- curtain rail and curtain -->
  <rect x="980" y="60" width="460" height="10" rx="5" fill="#b9c6c4"/>
  <path d="M1190 70 Q1210 380 1180 676 L1440 676 L1440 70 Z" fill="#cfe8de"/>
  ${Array.from({ length: 6 }, (_, i) => `<path d="M${1230 + i * 36} 70 Q${1222 + i * 36} 380 ${1226 + i * 36} 676" fill="none" stroke="#b6d6c9" stroke-width="10"/>`).join('')}
  <!-- oxygen and suction panel above the bed -->
  <rect x="560" y="132" width="320" height="64" rx="12" fill="#f6f8f7"/>
  <rect x="580" y="148" width="46" height="34" rx="6" fill="#2f9a63"/><circle cx="603" cy="165" r="9" fill="#ffffff"/>
  <rect x="644" y="148" width="46" height="34" rx="6" fill="#e6e9e8"/><circle cx="667" cy="165" r="9" fill="#9aa5a3"/>
  <rect x="706" y="152" width="150" height="10" rx="5" fill="#d6dcda"/><rect x="706" y="168" width="96" height="10" rx="5" fill="#d6dcda"/>
  <circle cx="846" cy="173" r="8" fill="#e05252"/>
  <!-- bedside monitor on a stand -->
  <rect x="455" y="300" width="10" height="390" fill="#9aa5a3"/>
  <rect x="380" y="232" width="160" height="112" rx="12" fill="#2a3436"/>
  <rect x="392" y="244" width="136" height="88" rx="6" fill="#0d1a19"/>
  <path d="M398 290 L420 290 L428 266 L438 314 L446 290 L476 290 L484 270 L492 306 L500 290 L522 290" fill="none" stroke="#3ce36b" stroke-width="3"/>
  <path d="M398 318 Q430 304 460 318 T522 318" fill="none" stroke="#7dd3fc" stroke-width="2.5" opacity="0.8"/>
  <!-- IV pole with a bag -->
  <rect x="1046" y="200" width="8" height="590" fill="#a9b4bb"/>
  <path d="M1010 200 L1090 200" stroke="#a9b4bb" stroke-width="6" stroke-linecap="round"/>
  <path d="M1016 206 L1016 230 Q1004 236 1004 270 L1004 320 Q1004 340 1026 340 Q1048 340 1048 320 L1048 270 Q1048 236 1036 230 L1036 206 Z" fill="#eef8ff" stroke="#c4dbe6" stroke-width="3"/>
  <rect x="1012" y="270" width="28" height="44" rx="4" fill="#d6ecfa"/>
  <ellipse cx="1050" cy="796" rx="56" ry="10" fill="${SHADOW}"/>
  <path d="M1010 790 L1090 790 M1050 790 L1050 780" stroke="#8f9aa0" stroke-width="7" stroke-linecap="round"/>
  <!-- bedside cabinet with water -->
  <ellipse cx="1180" cy="836" rx="96" ry="14" fill="${SHADOW}"/>
  <rect x="1100" y="590" width="170" height="240" rx="12" fill="#f3f1ec"/>
  <rect x="1116" y="640" width="138" height="80" rx="8" fill="#e8e5de"/><circle cx="1185" cy="680" r="6" fill="#b9b3a8"/>
  <rect x="1116" y="732" width="138" height="80" rx="8" fill="#e8e5de"/><circle cx="1185" cy="772" r="6" fill="#b9b3a8"/>
  <path d="M1126 590 L1130 540 Q1140 520 1150 540 L1156 590 Z" fill="#d8eef7" stroke="#b9d6e3" stroke-width="2"/>
  <rect x="1180" y="556" width="36" height="34" rx="6" fill="#ffffff"/>`
}

/** A hospital bed seen side-on (behind the patient): white sheet, pillow, rail, wheels. */
function wardBed() {
  return `
  <ellipse cx="740" cy="856" rx="420" ry="24" fill="${SHADOW}"/>
  <rect x="360" y="600" width="18" height="230" rx="6" fill="#8f9aa0"/><rect x="1110" y="600" width="18" height="230" rx="6" fill="#8f9aa0"/>
  <circle cx="369" cy="838" r="16" fill="#3a4448"/><circle cx="1119" cy="838" r="16" fill="#3a4448"/>
  <rect x="360" y="760" width="768" height="14" rx="6" fill="#a9b4bb"/>
  <path d="M340 400 Q340 370 368 370 L384 370 L384 600 L340 600 Z" fill="#b8c4c9"/>
  <rect x="350" y="540" width="790" height="70" rx="22" fill="#f7f8f6"/>
  <rect x="350" y="586" width="790" height="34" rx="14" fill="#e3e7e5"/>
  <path d="M384 470 Q384 440 420 440 L560 440 Q596 440 590 476 L584 540 L392 540 Z" fill="#ffffff"/>
  <path d="M400 520 L584 520 L584 540 L392 540 Z" fill="#e9ecea"/>
  <rect x="930" y="470" width="190" height="14" rx="7" fill="#a9b4bb"/><rect x="930" y="512" width="190" height="14" rx="7" fill="#a9b4bb"/>
  <rect x="936" y="470" width="10" height="72" rx="5" fill="#a9b4bb"/><rect x="1104" y="470" width="10" height="72" rx="5" fill="#a9b4bb"/>`
}

/** Clinic couch (as in Mrs Okonkwo's room), optionally with a pillow at the far end. */
function couch(pillowAt: 'none' | 'feet' = 'none') {
  return `
  <ellipse cx="760" cy="842" rx="430" ry="26" fill="${SHADOW}"/>
  <rect x="404" y="610" width="16" height="230" rx="5" fill="#7f8b92"/>
  <rect x="1100" y="610" width="16" height="230" rx="5" fill="#7f8b92"/>
  <rect x="428" y="610" width="12" height="214" rx="4" fill="#a9b4bb"/>
  <rect x="1080" y="610" width="12" height="214" rx="4" fill="#a9b4bb"/>
  <rect x="404" y="760" width="712" height="12" rx="5" fill="#a9b4bb"/>
  <rect x="380" y="548" width="760" height="56" rx="18" fill="url(#couchG)"/>
  <rect x="380" y="590" width="760" height="26" rx="12" fill="#334857"/>
  <rect x="470" y="540" width="580" height="18" rx="6" fill="#f7f5f0"/>
  <rect x="470" y="554" width="580" height="6" fill="#e2ddd2"/>
  ${pillowAt === 'feet' ? `<path d="M968 512 Q964 494 990 492 L1084 492 Q1108 494 1104 514 L1100 544 L972 544 Z" fill="#f2efe9"/><path d="M972 532 L1100 532 L1100 544 L972 544 Z" fill="#ddd7cc"/>` : ''}`
}

// ── People ────────────────────────────────────────────────────────────────────

const FUNMI_SKIN: Skin = { base: '#7a4a30', shade: '#633a24', light: '#8d573b' }
const TUNDE_SKIN: Skin = { base: '#5e3725', shade: '#4b2b1b', light: '#704330' }
const EMEKA_SKIN: Skin = { base: '#6a3e28', shade: '#56311f', light: '#7c4b33' }

const BLOUSE = '#1f8a5b'
const BLOUSE_SHADE = '#18704a'
const SKIRT = '#1e1f26'

/** Mrs Adebayo's seated body (on the couch edge), hands placed per pose. */
function funmiSeated(pose: 'plinth' | 'worried') {
  const arms =
    pose === 'plinth'
      ? // Both hands gripping the couch edge, holding herself still
        `${limb([[676, 360], [640, 450], [624, 540]], BLOUSE, 46)}${limb([[624, 536], [612, 572]], FUNMI_SKIN.base, 32)}<ellipse cx="610" cy="576" rx="20" ry="16" fill="${FUNMI_SKIN.light}"/>
         ${limb([[844, 360], [880, 450], [896, 540]], BLOUSE_SHADE, 46)}${limb([[896, 536], [908, 572]], FUNMI_SKIN.base, 32)}<ellipse cx="910" cy="576" rx="20" ry="16" fill="${FUNMI_SKIN.light}"/>`
      : // Hands clasped near her chest
        `${limb([[676, 360], [648, 452], [690, 474]], BLOUSE, 46)}${limb([[690, 476], [744, 430]], FUNMI_SKIN.base, 32)}
         ${limb([[844, 360], [872, 452], [830, 474]], BLOUSE_SHADE, 46)}${limb([[830, 476], [776, 430]], FUNMI_SKIN.base, 32)}
         <ellipse cx="760" cy="420" rx="30" ry="24" fill="${FUNMI_SKIN.light}"/><path d="M742 412 Q760 404 778 412 M742 424 Q760 416 778 424" fill="none" stroke="${FUNMI_SKIN.shade}" stroke-width="3" stroke-linecap="round"/>`
  return `
  <ellipse cx="760" cy="840" rx="170" ry="16" fill="${SHADOW}"/>
  <!-- skirt to the knee, shins, flat shoes -->
  <path d="M650 552 Q760 572 870 552 L884 690 L636 690 Z" fill="${SKIRT}"/>
  <path d="M846 560 Q876 610 884 690 L852 690 Q858 610 846 560 Z" fill="#000" opacity="0.18"/>
  ${limb([[700, 690], [702, 812]], FUNMI_SKIN.shade, 44)}${limb([[820, 690], [818, 812]], FUNMI_SKIN.shade, 44)}
  <ellipse cx="696" cy="828" rx="36" ry="13" fill="#1a1a1f"/><ellipse cx="824" cy="828" rx="36" ry="13" fill="#1a1a1f"/>
  <g data-breathe="">
    <path d="M676 352 Q700 334 760 332 Q820 334 844 352 L860 560 Q760 578 660 560 Z" fill="${BLOUSE}"/>
    <path d="M820 340 Q846 350 852 400 L860 560 Q836 566 814 568 Q830 460 820 340 Z" fill="#000" opacity="0.14"/>
    <path d="M728 338 L760 372 L792 338" fill="#f4f1ea"/><path d="M738 340 L760 362 L782 340" fill="${FUNMI_SKIN.shade}"/>
    ${headSvg({ skin: FUNMI_SKIN, hair: 'bun', earrings: true, expression: pose === 'plinth' ? 'uneasy' : 'worried' })}
    ${arms}
  </g>`
}

/** Mrs Adebayo standing stiffly beside the couch, a hand pressed to her lower back. */
function funmiStanding() {
  // Raised and slightly bent forward: the whole upper body sits 60px higher than when seated
  return `
  <ellipse cx="760" cy="902" rx="150" ry="16" fill="${SHADOW}"/>
  <path d="M664 500 Q760 520 856 500 L874 720 L646 720 Z" fill="${SKIRT}"/>
  <path d="M836 506 Q866 600 874 720 L842 720 Q850 600 836 506 Z" fill="#000" opacity="0.18"/>
  ${limb([[712, 718], [710, 880]], FUNMI_SKIN.shade, 42)}${limb([[808, 718], [812, 880]], FUNMI_SKIN.shade, 42)}
  <ellipse cx="704" cy="894" rx="38" ry="13" fill="#1a1a1f"/><ellipse cx="818" cy="894" rx="38" ry="13" fill="#1a1a1f"/>
  <g transform="rotate(4 760 500)">
    <g data-breathe="">
      <path d="M676 296 Q700 278 760 276 Q820 278 844 296 L858 508 Q760 526 662 508 Z" fill="${BLOUSE}"/>
      <path d="M820 284 Q846 294 852 344 L858 508 Q836 514 814 516 Q830 404 820 284 Z" fill="#000" opacity="0.14"/>
      <path d="M728 282 L760 316 L792 282" fill="#f4f1ea"/><path d="M738 284 L760 306 L782 284" fill="${FUNMI_SKIN.shade}"/>
      ${headSvg({ skin: FUNMI_SKIN, hair: 'bun', earrings: true, expression: 'pain' }, 'translate(0 -56)')}
      <!-- her right hand pressed to her lower back (elbow out behind) -->
      ${limb([[676, 304], [628, 400], [664, 470]], BLOUSE, 46)}
      ${limb([[664, 468], [700, 484]], FUNMI_SKIN.base, 30)}
      <!-- her left arm steadying on the couch -->
      ${limb([[844, 304], [884, 396], [912, 470]], BLOUSE_SHADE, 46)}
      ${limb([[912, 466], [940, 536]], FUNMI_SKIN.base, 32)}
      <ellipse cx="944" cy="544" rx="22" ry="15" fill="${FUNMI_SKIN.light}"/>
    </g>
  </g>`
}

/** Tunde in his football kit, sitting up on the couch with his legs out, left ankle swollen on a pillow. */
function tundeCouch() {
  const jersey = '#1f8f4e'
  const jerseyShade = '#177442'
  return `
  <!-- legs along the couch (his left nearer us), ankle on the pillow -->
  ${limb([[668, 536], [860, 528]], '#14181d', 52)}
  ${limb([[856, 528], [1010, 520]], TUNDE_SKIN.shade, 40)}
  <path d="M1002 504 Q1024 498 1034 504 L1052 470 Q1062 456 1074 466 Q1080 476 1070 492 L1050 530 Q1040 542 1012 538 Z" fill="${TUNDE_SKIN.shade}"/>
  ${limb([[668, 560], [860, 556]], '#1b2027', 54)}
  ${limb([[856, 556], [1002, 548]], TUNDE_SKIN.base, 42)}
  <!-- the swollen, bruised ankle -->
  <ellipse cx="1016" cy="546" rx="34" ry="28" fill="${TUNDE_SKIN.base}"/>
  <ellipse cx="1020" cy="552" rx="22" ry="16" fill="#5b3f78" opacity="0.55"/>
  <ellipse cx="1008" cy="544" rx="12" ry="9" fill="#3f6c8f" opacity="0.4"/>
  <path d="M1040 534 L1064 494 Q1074 480 1088 490 Q1096 500 1086 516 L1066 556 Q1056 568 1040 562 Z" fill="${TUNDE_SKIN.base}"/>
  <path d="M1072 492 Q1080 486 1088 492" fill="none" stroke="${TUNDE_SKIN.shade}" stroke-width="3" stroke-linecap="round"/>
  <path d="M842 548 L842 566" stroke="#ffffff" stroke-width="5"/>
  <g data-breathe="">
    <!-- jersey with a white collar and number -->
    <path d="M598 352 Q622 334 682 332 Q742 334 766 352 L776 556 Q682 574 588 556 Z" fill="${jersey}"/>
    <path d="M742 340 Q768 350 772 400 L776 556 Q754 562 736 564 Q750 460 742 340 Z" fill="${jerseyShade}"/>
    <path d="M652 334 L682 360 L712 334" fill="none" stroke="#ffffff" stroke-width="8" stroke-linejoin="round"/>
    <text x="682" y="470" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" font-weight="800" fill="#ffffff">9</text>
    ${headSvg({ skin: TUNDE_SKIN, hair: 'fade', male: true, expression: 'uneasy' }, 'translate(-78 0)')}
    <!-- arms: short sleeves, hands resting on his thighs -->
    ${limb([[598, 360], [580, 440]], jersey, 50)}${limb([[580, 436], [604, 500], [666, 524]], TUNDE_SKIN.base, 34)}
    <ellipse cx="676" cy="526" rx="22" ry="15" fill="${TUNDE_SKIN.light}"/>
    ${limb([[766, 360], [786, 440]], jerseyShade, 50)}${limb([[786, 436], [774, 502], [734, 528]], TUNDE_SKIN.base, 34)}
    <ellipse cx="724" cy="530" rx="22" ry="15" fill="${TUNDE_SKIN.light}"/>
  </g>`
}

/** Mr Okafor on the edge of his bed, leaning forward on his knees, breathing fast (tripod position). */
function emekaTripod() {
  const gown = '#bcd6e8'
  const gownShade = '#a2c1d6'
  return `
  <!-- gown over the thighs, shins, hospital socks; dressing on his right knee -->
  <path d="M640 560 Q760 584 880 560 L896 642 L624 642 Z" fill="url(#gown)"/>
  ${limb([[690, 636], [694, 806]], EMEKA_SKIN.shade, 42)}${limb([[830, 636], [826, 806]], EMEKA_SKIN.shade, 42)}
  <rect x="664" y="606" width="58" height="52" rx="16" fill="#fbfbf8" stroke="#e1e3de" stroke-width="3"/>
  <path d="M672 622 L714 622 M672 636 L714 636" stroke="#e3e6e1" stroke-width="3"/>
  <ellipse cx="692" cy="818" rx="34" ry="14" fill="#8d9599"/><ellipse cx="828" cy="818" rx="34" ry="14" fill="#8d9599"/>
  <ellipse cx="760" cy="836" rx="160" ry="14" fill="${SHADOW}"/>
  <g transform="translate(0 34)">
    <g data-breathe="">
      <!-- hunched: shoulders up, leaning on straight arms -->
      <path d="M668 362 Q700 338 760 336 Q820 338 852 362 L860 546 Q760 566 660 546 Z" fill="url(#gown)"/>
      <path d="M824 346 Q852 356 856 404 L860 546 Q838 552 818 554 Q834 450 824 346 Z" fill="${gownShade}" opacity="0.7"/>
      <path d="M730 342 Q760 360 790 342" fill="none" stroke="#9cb7ca" stroke-width="6" stroke-linecap="round"/>
      ${headSvg({ skin: EMEKA_SKIN, hair: 'grey', male: true, expression: 'breathless', sweat: true, grey: true }, 'translate(0 28)')}
      ${limb([[668, 372], [662, 470]], gown, 48)}${limb([[662, 466], [690, 560]], EMEKA_SKIN.base, 34)}
      <ellipse cx="692" cy="570" rx="26" ry="16" fill="${EMEKA_SKIN.light}"/>
      ${limb([[852, 372], [858, 470]], gownShade, 48)}${limb([[858, 466], [830, 560]], EMEKA_SKIN.base, 34)}
      <ellipse cx="828" cy="570" rx="26" ry="16" fill="${EMEKA_SKIN.light}"/>
      <!-- drip in the back of his left hand -->
      <rect x="818" y="556" width="20" height="12" rx="3" fill="#ffffff"/>
      <path d="M836 560 Q930 520 1000 360 Q1020 330 1026 342" fill="none" stroke="#cfe3ee" stroke-width="3"/>
    </g>
  </g>`
}

// ── Scenes ────────────────────────────────────────────────────────────────────

export type PeopleArt = { character: 'funmi' | 'tunde' | 'emeka'; pose: string }

/** Extra defs these people need (on top of clinicScene's). */
export const PEOPLE_DEFS = `
  <pattern id="gown" width="26" height="26" patternUnits="userSpaceOnUse">
    <rect width="26" height="26" fill="#bcd6e8"/>
    <path d="M13 6 L16 13 L13 20 L10 13 Z" fill="#9fc0d8"/>
    <circle cx="2" cy="2" r="1.6" fill="#a8c7dc"/>
  </pattern>`

/**
 * The room and person for one of these scenes. `room` is the clinic markup from clinicScene.ts
 * (passed in, so the two files don't import each other); the ward is drawn here.
 */
export function peopleScene(art: PeopleArt, clinicRoom: (variant: 'clinic' | 'sports') => string): string {
  if (art.character === 'emeka') return `${wardRoom()}${wardBed()}${emekaTripod()}`
  if (art.character === 'tunde') return `${clinicRoom('sports')}${couch('feet')}${tundeCouch()}`
  if (art.pose === 'standing') return `${clinicRoom('clinic')}${couch()}${funmiStanding()}`
  return `${clinicRoom('clinic')}${couch()}${funmiSeated(art.pose === 'worried' ? 'worried' : 'plinth')}`
}
