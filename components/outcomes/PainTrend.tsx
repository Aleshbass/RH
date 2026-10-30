'use client'

import { cn } from '@/lib/utils'
import type { WeeklyPoint } from './refs'

/**
 * "Pain by week": the last score of each week, 0–10, the latest point marked in Rehabify green.
 * Plain SVG that scales with its box; flat, no glow.
 */
export function PainTrend({ points, className }: { points: WeeklyPoint[]; className?: string }) {
  const W = 320
  const H = 132
  const pad = { top: 10, right: 12, bottom: 22, left: 22 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom
  const lastWeek = Math.max(2, points[points.length - 1]?.week ?? 2)
  const x = (week: number) => pad.left + ((week - 1) / (lastWeek - 1)) * innerW
  const y = (pain: number) => pad.top + (1 - pain / 10) * innerH
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.week).toFixed(1)},${y(p.pain).toFixed(1)}`).join(' ')
  const ticks = [...new Set([1, Math.ceil(lastWeek / 2), lastWeek])]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn('h-auto w-full overflow-visible text-pt-ink', className)}
      role="img"
      aria-label={`Pain by week: ${points.map((p) => `week ${p.week} ${p.pain}`).join(', ')}`}
    >
      {[0, 5, 10].map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} className="stroke-pt-line" strokeWidth={1} />
          <text x={pad.left - 8} y={y(v) + 3.5} textAnchor="end" className="fill-pt-faint text-[10px]">
            {v}
          </text>
        </g>
      ))}
      {ticks.map((w) => (
        <text key={w} x={x(w)} y={H - 6} textAnchor="middle" className="fill-pt-faint text-[10px]">
          W{w}
        </text>
      ))}
      {points.length > 1 && <path d={path} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) => {
        const last = i === points.length - 1
        return (
          <circle
            key={p.week}
            cx={x(p.week)}
            cy={y(p.pain)}
            r={last ? 5.5 : 3.5}
            className={last ? 'fill-pt-accent stroke-pt-ink' : 'fill-pt-ink'}
            strokeWidth={last ? 1.75 : 0}
          />
        )
      })}
    </svg>
  )
}
