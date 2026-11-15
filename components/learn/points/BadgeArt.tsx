'use client'

/**
 * Premium badge artwork for Learn (owner 2026-11-14: "hope the badges are so clean"): each badge has
 * its own medallion shape and colours, an inner ring, a highlight, ribbons for the big ones and a
 * light that sweeps across now and then. Locked badges show the same medallion in grey with a lock.
 * Pure SVG + the badge's icon, so it's crisp at any size and costs nothing.
 */

import { useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Lock } from '@/components/icons'
import { cn } from '@/lib/utils'
import { BADGE_ICON, DefaultBadgeIcon } from './pointsApi'

type Shape = 'circle' | 'hexagon' | 'shield' | 'diamond' | 'burst8' | 'burst12'
const ART: Record<string, { shape: Shape; from: string; to: string; ribbon?: string }> = {
  'first-step': { shape: 'circle', from: '#34d399', to: '#047857' },
  'course-finisher': { shape: 'shield', from: '#2dd4bf', to: '#0f766e', ribbon: '#0d9488' },
  'case-cracker': { shape: 'hexagon', from: '#fb7185', to: '#be123c' },
  'red-flag-hunter': { shape: 'diamond', from: '#fb923c', to: '#b91c1c' },
  'ice-breaker': { shape: 'circle', from: '#38bdf8', to: '#4338ca' },
  'helping-hand': { shape: 'shield', from: '#fcd34d', to: '#ea580c' },
  'on-stage': { shape: 'burst8', from: '#e879f9', to: '#6d28d9' },
  'streak-7': { shape: 'hexagon', from: '#fdba74', to: '#dc2626' },
  certified: { shape: 'shield', from: '#818cf8', to: '#1e3a8a', ribbon: '#3730a3' },
  'club-1000': { shape: 'burst12', from: '#fde68a', to: '#d97706' },
  'top-10': { shape: 'circle', from: '#fde047', to: '#b45309', ribbon: '#b91c1c' },
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

/** The medallion outline at a given scale (1 = full). */
function ShapePath({ shape, scale = 1, ...rest }: { shape: Shape; scale?: number } & React.SVGProps<SVGPathElement & SVGPolygonElement & SVGCircleElement>) {
  const t = `translate(${50 - 50 * scale} ${50 - 50 * scale}) scale(${scale})`
  if (shape === 'circle') return <circle cx={50} cy={50} r={45} transform={t} {...rest} />
  if (shape === 'hexagon') return <polygon points="50,4 91,27 91,73 50,96 9,73 9,27" transform={t} strokeLinejoin="round" {...rest} />
  if (shape === 'shield') return <path d="M50 4 L88 15 V47 C88 71 71 87 50 96 C29 87 12 71 12 47 V15 Z" transform={t} strokeLinejoin="round" {...rest} />
  if (shape === 'diamond') return <polygon points="50,3 97,50 50,97 3,50" transform={t} strokeLinejoin="round" {...rest} />
  if (shape === 'burst8') return <polygon points={star(8, 47, 39)} transform={t} strokeLinejoin="round" {...rest} />
  return <polygon points={star(12, 47, 41)} transform={t} strokeLinejoin="round" {...rest} />
}

export function BadgeArt({ id, earned, size = 72, shine = true, className }: { id: string; earned: boolean; size?: number; shine?: boolean; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const reduce = useReducedMotion()
  const art = ART[id] ?? { shape: 'circle' as Shape, from: '#9ca3af', to: '#4b5563' }
  const Icon = BADGE_ICON[id] ?? DefaultBadgeIcon
  const from = earned ? art.from : '#e5e7eb'
  const to = earned ? art.to : '#9ca3af'
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 100 100" width={size} height={size} className={cn('overflow-visible', earned ? 'drop-shadow-[0_6px_10px_rgba(10,20,18,0.25)]' : 'opacity-70')}>
        <defs>
          <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
          <linearGradient id={`s${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`c${uid}`}>
            <ShapePath shape={art.shape} />
          </clipPath>
        </defs>
        {/* Ribbon tails for the big achievements */}
        {art.ribbon && earned && (
          <g>
            <polygon points="27,62 14,106 27,99 38,108 45,68" fill={art.ribbon} />
            <polygon points="73,62 86,106 73,99 62,108 55,68" fill={art.ribbon} />
          </g>
        )}
        <ShapePath shape={art.shape} fill={`url(#g${uid})`} stroke={earned ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.8)'} strokeWidth={2} />
        <ShapePath shape={art.shape} scale={0.8} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={1.6} strokeDasharray={earned ? undefined : '3 3'} />
        {/* Soft highlight, top left */}
        <ellipse cx={38} cy={28} rx={22} ry={11} fill="#fff" opacity={earned ? 0.22 : 0.3} transform="rotate(-20 38 28)" clipPath={`url(#c${uid})`} />
        {/* A light that sweeps across every few seconds */}
        {earned && shine && !reduce && (
          <g clipPath={`url(#c${uid})`}>
            <motion.rect
              y={-20}
              width={34}
              height={140}
              fill={`url(#s${uid})`}
              transform="rotate(20 50 50)"
              initial={{ x: -70 }}
              animate={{ x: 140 }}
              transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 4.5 + (uid.length % 3) }}
            />
          </g>
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <Icon className={cn(earned ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]' : 'text-white/90')} style={{ width: size * 0.34, height: size * 0.34 }} />
      </span>
      {!earned && (
        <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-rh-ink text-white ring-2 ring-white" style={{ width: size * 0.3, height: size * 0.3 }}>
          <Lock style={{ width: size * 0.14, height: size * 0.14 }} />
        </span>
      )}
    </div>
  )
}
