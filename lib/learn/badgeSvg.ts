/**
 * A Learn badge medallion as standalone SVG markup (same shapes, colours and icons as
 * components/learn/points/BadgeArt.tsx), for places that need an image rather than a component:
 * the badge preview card (/api/og/learn/badge/...) and the story image drawn in the browser.
 */

import {
  faBookOpen,
  faBullseye,
  faComment,
  faCrown,
  faFire,
  faGraduationCap,
  faHeartPulse,
  faMicrophone,
  faShieldHalved,
  faStar,
  faThumbsUp,
  faUserPlus,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'

type Shape = 'circle' | 'hexagon' | 'shield' | 'diamond' | 'burst8' | 'burst12'

export const BADGE_SVG_ART: Record<string, { shape: Shape; from: string; to: string; ribbon?: string; icon: IconDefinition }> = {
  'first-step': { shape: 'circle', from: '#34d399', to: '#047857', icon: faBookOpen },
  'course-finisher': { shape: 'shield', from: '#2dd4bf', to: '#0f766e', ribbon: '#0d9488', icon: faGraduationCap },
  'case-cracker': { shape: 'hexagon', from: '#fb7185', to: '#be123c', icon: faHeartPulse },
  'red-flag-hunter': { shape: 'diamond', from: '#fb923c', to: '#b91c1c', icon: faBullseye },
  'ice-breaker': { shape: 'circle', from: '#38bdf8', to: '#4338ca', icon: faComment },
  'helping-hand': { shape: 'shield', from: '#fcd34d', to: '#ea580c', icon: faThumbsUp },
  'on-stage': { shape: 'burst8', from: '#e879f9', to: '#6d28d9', icon: faMicrophone },
  'streak-7': { shape: 'hexagon', from: '#fdba74', to: '#dc2626', icon: faFire },
  certified: { shape: 'shield', from: '#818cf8', to: '#1e3a8a', ribbon: '#3730a3', icon: faShieldHalved },
  'club-1000': { shape: 'burst12', from: '#fde68a', to: '#d97706', icon: faStar },
  ambassador: { shape: 'shield', from: '#67e8f9', to: '#0e7490', ribbon: '#155e75', icon: faUserPlus },
  'top-10': { shape: 'circle', from: '#fde047', to: '#b45309', ribbon: '#b91c1c', icon: faCrown },
}

function star(points: number, outer: number, inner: number) {
  const pts: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer
    const a = (Math.PI * i) / points - Math.PI / 2
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

function shape(s: Shape, scale: number, attrs: string) {
  const t = `transform="translate(${50 - 50 * scale} ${50 - 50 * scale}) scale(${scale})"`
  if (s === 'circle') return `<circle cx="50" cy="50" r="45" ${t} ${attrs}/>`
  if (s === 'hexagon') return `<polygon points="50,4 91,27 91,73 50,96 9,73 9,27" ${t} stroke-linejoin="round" ${attrs}/>`
  if (s === 'shield') return `<path d="M50 4 L88 15 V47 C88 71 71 87 50 96 C29 87 12 71 12 47 V15 Z" ${t} stroke-linejoin="round" ${attrs}/>`
  if (s === 'diamond') return `<polygon points="50,3 97,50 50,97 3,50" ${t} stroke-linejoin="round" ${attrs}/>`
  return `<polygon points="${s === 'burst8' ? star(8, 47, 39) : star(12, 47, 41)}" ${t} stroke-linejoin="round" ${attrs}/>`
}

/** The earned medallion, `size` pixels square (ribbons included). */
export function badgeSvg(id: string, size = 512): string {
  const art = BADGE_SVG_ART[id] ?? { shape: 'circle' as Shape, from: '#9ca3af', to: '#4b5563', icon: faStar }
  const [w, h, , , d] = art.icon.icon
  const path = Array.isArray(d) ? d.join(' ') : d
  const iconSize = 34
  // Ids unique per badge, so several on one page keep their own colours
  const uid = id.replace(/[^a-z0-9]/gi, '')
  const ribbon = art.ribbon
    ? `<polygon points="27,62 14,106 27,99 38,108 45,68" fill="${art.ribbon}"/><polygon points="73,62 86,106 73,99 62,108 55,68" fill="${art.ribbon}"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 112 118" width="${size}" height="${Math.round((size * 118) / 112)}">
<defs><linearGradient id="g${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${art.from}"/><stop offset="1" stop-color="${art.to}"/></linearGradient>
<clipPath id="c${uid}">${shape(art.shape, 1, '')}</clipPath></defs>
${ribbon}
${shape(art.shape, 1, `fill="url(#g${uid})" stroke="rgba(255,255,255,0.65)" stroke-width="2"`)}
${shape(art.shape, 0.8, 'fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.6"')}
<ellipse cx="38" cy="28" rx="22" ry="11" fill="#ffffff" opacity="0.22" transform="rotate(-20 38 28)" clip-path="url(#c${uid})"/>
<svg x="${50 - iconSize / 2}" y="${50 - iconSize / 2}" width="${iconSize}" height="${iconSize}" viewBox="0 0 ${w} ${h}"><path fill="#ffffff" d="${path}"/></svg>
</svg>`
}
