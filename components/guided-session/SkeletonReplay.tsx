'use client'

import { useEffect, useMemo, useState } from 'react'
import { BONES, SKELETON_POINTS } from '@/lib/motion/pose'

/** Index of each MediaPipe landmark inside a snapshot frame (frames hold SKELETON_POINTS only). */
const SLOT = new Map<number, number>(SKELETON_POINTS.map((landmark, slot) => [landmark, slot]))
const LINES = BONES.filter(([a, b]) => SLOT.has(a) && SLOT.has(b)).map(([a, b]) => [SLOT.get(a)!, SLOT.get(b)!] as const)

/**
 * A rep replayed as a stick figure, from the few frames the patient's phone kept (no video is
 * ever stored). Loops at about 6 frames a second.
 */
export function SkeletonReplay({ frames, className }: { frames: number[][]; className?: string }) {
  const [i, setI] = useState(0)

  useEffect(() => {
    if (frames.length < 2) return
    const t = setInterval(() => setI((n) => (n + 1) % frames.length), 160)
    return () => clearInterval(t)
  }, [frames])

  const box = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const f of frames) {
      for (let k = 0; k + 1 < f.length; k += 2) {
        if (f[k] < 0) continue
        minX = Math.min(minX, f[k]); maxX = Math.max(maxX, f[k])
        minY = Math.min(minY, f[k + 1]); maxY = Math.max(maxY, f[k + 1])
      }
    }
    if (!Number.isFinite(minX)) return null
    const pad = Math.max(maxX - minX, maxY - minY) * 0.12 + 0.02
    return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad }
  }, [frames])

  const frame = frames[Math.min(i, frames.length - 1)]
  if (!box || !frame) return <p className="text-xs text-neutral-500">No stick figure was kept for this rep.</p>
  const pt = (slot: number) => (frame[slot * 2] >= 0 ? { x: frame[slot * 2], y: frame[slot * 2 + 1] } : null)
  const stroke = box.h * 0.012

  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className={className} role="img" aria-label="Stick-figure replay of the rep">
      <rect x={box.x} y={box.y + box.h * 0.985} width={box.w} height={box.h * 0.015} fill="currentColor" opacity={0.08} />
      {LINES.map(([a, b], k) => {
        const p = pt(a)
        const q = pt(b)
        if (!p || !q) return null
        return <line key={k} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
      })}
      {SKELETON_POINTS.map((_, slot) => {
        const p = pt(slot)
        return p ? <circle key={slot} cx={p.x} cy={p.y} r={stroke * 1.1} fill="#00cd0f" /> : null
      })}
    </svg>
  )
}
