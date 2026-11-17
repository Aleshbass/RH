'use client'

/**
 * The 2D patient on the stage (owner 2026-11-16): the clinic scene from clinicScene.ts, alive —
 * she breathes at her breathing rate, blinks, and her lips follow her voice (the same lips.json
 * timings as the 3D cases, but swapping drawn mouth shapes, so it's crisp on any phone).
 * Fills the stage like a cover image (the SVG slices to fit).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { voiceClock } from '../simAudio'
import { audioIdOf, shapeAt, type LipTimings } from '../talkingFace'
import { sceneSvg, type Art2dSpec } from './clinicScene'

const lipsCache = new Map<string, Promise<LipTimings | null>>()
function loadLips(url: string) {
  if (!lipsCache.has(url)) {
    lipsCache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? (r.json() as Promise<LipTimings>) : null))
        .catch(() => null)
    )
  }
  return lipsCache.get(url)!
}

export function Clinic2D({
  art,
  talking,
  lipsUrl,
  breathsPerMin,
  className,
}: {
  art: Art2dSpec
  /** The patient's own voice is playing (a relative's line doesn't move her lips). */
  talking: boolean
  lipsUrl: string | null
  breathsPerMin: number
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [lips, setLips] = useState<LipTimings | null>(null)
  const talkingRef = useRef(talking)
  talkingRef.current = talking
  const markup = useMemo(() => sceneSvg(art), [art.character, art.pose]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lipsUrl) return
    let live = true
    void loadLips(lipsUrl).then((l) => live && setLips(l))
    return () => {
      live = false
    }
  }, [lipsUrl])

  // Phones: frame a little closer so she's bigger (the whole room on wider stages). Not a face zoom.
  useEffect(() => {
    const el = box.current
    const svg = el?.querySelector('svg')
    if (!el || !svg || typeof ResizeObserver === 'undefined') return
    const fit = () => svg.setAttribute('viewBox', el.clientWidth < 560 ? '250 20 1010 673' : '0 0 1440 960')
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [markup])

  // Blinks every few seconds (closed for a moment)
  useEffect(() => {
    const el = box.current
    if (!el) return
    let timer = 0
    const setEyes = (closed: boolean) => {
      el.querySelectorAll<SVGGElement>('[data-eyes]').forEach((g) => {
        g.style.display = (g.dataset.eyes === 'closed') === closed ? '' : 'none'
      })
    }
    const next = () => {
      timer = window.setTimeout(() => {
        setEyes(true)
        window.setTimeout(() => setEyes(false), 130)
        next()
      }, 2600 + Math.random() * 3200)
    }
    next()
    return () => window.clearTimeout(timer)
  }, [markup])

  // Lips: the shape for the voice's current moment, only touching the page when it changes
  useEffect(() => {
    const el = box.current
    if (!el) return
    const groups = Array.from(el.querySelectorAll<SVGGElement>('[data-mouth]'))
    let shown = 'x'
    let frame = 0
    const show = (shape: string) => {
      const target = shape === 'm' ? 'm' : shape
      if (target === shown) return
      shown = target
      for (const g of groups) g.style.display = g.dataset.mouth === target ? '' : 'none'
    }
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const clock = talkingRef.current ? voiceClock() : null
      show(clock ? shapeAt(lips, audioIdOf(clock.url), clock.t) : 'x')
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [markup, lips])

  const breath = Math.max(1.4, 60 / Math.max(6, breathsPerMin))
  return (
    <div
      ref={box}
      className={cn('breathing absolute inset-0 [&>svg]:h-full [&>svg]:w-full', className)}
      style={{ ['--breath' as string]: `${breath.toFixed(2)}s` }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
