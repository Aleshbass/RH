'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { format } from 'date-fns'
import { changeThreshold, measureDetail, measureResult, measureTitle, measureUnit, outcomeDef, type ClinicalMeasure } from '@/convex/helpers/clinicalMeasures'
import { cn } from '@/lib/utils'
import type { Series } from './progress'

const HEIGHT = 190
const PAD = { top: 12, right: 14, bottom: 28, left: 42 }

function useWidth(ref: RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}

const isGraded = (m: ClinicalMeasure) => m.kind === 'strength' && m.method !== 'dynamometer'

/** The fixed ends of the scale a measure lives on (pain 0–10, Berg 0–56), if it has them. */
function scaleBounds(m: ClinicalMeasure): { min: number; max: number } | null {
  if (m.kind === 'pain' || m.kind === 'psfs') return { min: 0, max: 10 }
  if (isGraded(m)) return { min: 0, max: 5 }
  if (m.kind === 'outcome' && m.key !== 'custom') return outcomeDef(m.key)?.range ?? null
  return null
}

/** What the numbers on the axis are. */
export function axisCaption(m: ClinicalMeasure): string {
  const unit = measureUnit(m).trim()
  if (unit === '°') return 'Degrees'
  if (unit === 's') return 'Seconds'
  if (unit === 'm') return 'Metres'
  if (unit === 'reps') return 'Stands in 30 s'
  if (unit) return unit
  if (isGraded(m)) return 'Oxford grade (0–5)'
  if (m.kind === 'pain' || m.kind === 'psfs') return 'Score (0–10)'
  const range = m.kind === 'outcome' && m.key !== 'custom' ? outcomeDef(m.key)?.range : null
  return range ? `Score (${range.min}–${range.max})` : 'Value'
}

function niceStep(span: number, count: number) {
  const raw = span / Math.max(count, 1)
  const power = 10 ** Math.floor(Math.log10(raw))
  const n = raw / power
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * power
}

const short = (n: number) => String(Math.round(n * 100) / 100)

/** The band around the first value that's still within measurement error, if the measure has one. */
function errorBand(m: ClinicalMeasure, baseline: number): { low: number; high: number; text: string } | null {
  // Oxford grades: the same whole grade (4- to 4+) is the same
  if (isGraded(m)) {
    const whole = Math.round(baseline)
    return { low: whole - 0.5, high: whole + 0.5, text: `the same whole grade as the first visit` }
  }
  const threshold = changeThreshold(m, baseline)
  if (!threshold) return null
  return { low: baseline - threshold.amount, high: baseline + threshold.amount, text: `within ±${short(threshold.amount)}${measureUnit(m)} of the first visit` }
}

/**
 * One measure over the patient's visits: dated along the bottom, values up the side, the band
 * around the first value that's still measurement error, and the goal's target when there is
 * one. Hover, tap or use the arrow keys to read each visit; a table carries the same for
 * screen readers.
 */
export function ProgressChart({ series, target, className }: { series: Series; target?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const id = useId()
  const [active, setActive] = useState<number | null>(null)

  const m = series.latest
  const points = series.points
  const baseline = points[0].value
  const band = errorBand(series.first, baseline)
  const bounds = scaleBounds(m)
  const title = `${measureTitle(m)}${measureDetail(m) && m.kind !== 'psfs' ? `, ${measureDetail(m)}` : ''}`

  // Value range: the points, the band and the target, padded, on whole steps
  const values = [...points.map((p) => p.value), ...(band ? [band.low, band.high] : []), ...(target !== undefined ? [target] : [])]
  let low = Math.min(...values)
  let high = Math.max(...values)
  if (bounds) {
    low = Math.max(low, bounds.min)
    high = Math.min(high, bounds.max)
  }
  const spread = high - low || Math.max(1, Math.abs(high) * 0.1)
  low -= spread * 0.1
  high += spread * 0.1
  const step = niceStep(high - low, 4)
  low = Math.floor(low / step) * step
  high = Math.ceil(high / step) * step
  if (bounds) {
    low = Math.max(low, bounds.min)
    high = Math.min(high, bounds.max)
  }
  const ticks: number[] = []
  for (let t = Math.ceil(low / step) * step; t <= high + step / 1000; t += step) ticks.push(Math.round(t * 1000) / 1000)

  const innerW = Math.max(width - PAD.left - PAD.right, 1)
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const first = points[0].date
  const last = points[points.length - 1].date
  const x = (i: number) => PAD.left + (last === first ? (i / Math.max(points.length - 1, 1)) * innerW : ((points[i].date - first) / (last - first)) * innerW)
  const y = (v: number) => PAD.top + (1 - (v - low) / (high - low || 1)) * innerH
  const clampY = (v: number) => y(Math.min(Math.max(v, low), high))

  // Date labels that don't collide: always the first and last, others where there's room
  const labelled: number[] = [0]
  for (let i = 1; i < points.length - 1; i++) {
    if (x(i) - x(labelled[labelled.length - 1]) >= 58 && x(points.length - 1) - x(i) >= 58) labelled.push(i)
  }
  if (points.length > 1) labelled.push(points.length - 1)

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  const onPointer = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!box) return
    const px = event.clientX - box.left
    let nearest = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(nearest) - px)) nearest = i
    setActive(nearest)
  }
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const delta = event.key === 'ArrowRight' ? 1 : -1
      setActive((current) => Math.min(Math.max((current ?? (delta > 0 ? -1 : points.length)) + delta, 0), points.length - 1))
    } else if (event.key === 'Escape') {
      setActive(null)
    }
  }

  const activePoint = active !== null ? points[active] : null
  const titleId = `${id}-title`
  const descId = `${id}-desc`

  return (
    <figure className={cn('space-y-2', className)}>
      <p className="text-[11px] text-pt-faint">{axisCaption(m)}</p>
      <div ref={ref} className="relative" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-labelledby={`${titleId} ${descId}`}
            tabIndex={0}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            className="block overflow-visible rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-pt-ink/30"
          >
            <title id={titleId}>{title}</title>
            <desc id={descId}>
              {`${points.length} visits, from ${measureResult(points[0].measure)} on ${format(first, 'd MMM yyyy')} to ${measureResult(
                points[points.length - 1].measure
              )} on ${format(last, 'd MMM yyyy')}.${target !== undefined ? ` Target ${short(target)}${measureUnit(m)}.` : ''}`}
            </desc>

            {/* Grid and value labels */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} className="stroke-pt-line" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-pt-faint text-[10px] tabular-nums">
                  {short(t)}
                </text>
              </g>
            ))}

            {/* Measurement error around the first visit */}
            {band && (
              <rect
                x={PAD.left}
                width={innerW}
                y={clampY(band.high)}
                height={Math.max(clampY(band.low) - clampY(band.high), 0)}
                className="fill-pt-neutral-bg"
              />
            )}

            {/* The goal's target */}
            {target !== undefined && target >= low && target <= high && (
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(target)} y2={y(target)} className="stroke-pt-accent-ink" strokeWidth={1.5} strokeDasharray="5 4" />
            )}

            {/* Dates */}
            {labelled.map((i) => (
              <text
                key={i}
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor={i === 0 && points.length > 1 ? 'start' : i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}
                className="fill-pt-faint text-[10px]"
              >
                {format(points[i].date, 'd MMM')}
              </text>
            ))}

            {activePoint && active !== null && (
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-pt-line-strong" strokeWidth={1} />
            )}

            <path d={path} fill="none" className="stroke-pt-ink" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, i) => (
              <circle
                key={`${p.noteId}-${i}`}
                cx={x(i)}
                cy={y(p.value)}
                r={active === i ? 5.5 : 4}
                strokeWidth={2}
                className={cn('stroke-pt-ink', i === points.length - 1 ? 'fill-pt-accent' : 'fill-pt-surface')}
              />
            ))}

            {/* Hover and tap anywhere along the line */}
            <rect
              x={PAD.left - 10}
              y={0}
              width={innerW + 20}
              height={HEIGHT}
              fill="transparent"
              onPointerMove={onPointer}
              onPointerDown={onPointer}
              onPointerLeave={(event) => event.pointerType === 'mouse' && setActive(null)}
            />
          </svg>
        )}

        {activePoint && active !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-pt-primary px-2 py-1 text-xs text-pt-on-primary"
            style={{ left: Math.min(Math.max(x(active), 56), Math.max(width - 56, 56)), top: Math.max(y(activePoint.value) - 10, 30) }}
            role="status"
          >
            <span className="font-semibold tabular-nums">{measureResult(activePoint.measure)}</span>
            <span className="ml-1.5 opacity-80">{format(activePoint.date, 'd MMM yyyy')}</span>
          </div>
        )}
      </div>

      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-pt-muted">
        {band && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-pt-neutral-bg ring-1 ring-inset ring-pt-line" aria-hidden />
            Shaded: {band.text} (no real change)
          </span>
        )}
        {target !== undefined && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed border-pt-accent-ink" aria-hidden />
            Target {short(target)}
            {measureUnit(m)}
          </span>
        )}
      </figcaption>

      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={`${p.noteId}-${i}`}>
              <td>{format(p.date, 'd MMM yyyy')}</td>
              <td>{measureResult(p.measure)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
