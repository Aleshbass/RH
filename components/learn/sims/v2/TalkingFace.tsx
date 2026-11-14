'use client'

/**
 * The patient's talking close-up: a looping video drawn to a canvas, with the mouth moving to the
 * voice that's playing (see ../talkingFace.ts). The still shows until the video can play, and stays
 * if a phone blocks it.
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import type { SimTalk } from '@/lib/learn/simulation/engine'
import { voiceClock } from '../simAudio'
import { audioIdOf, drawTalkingFrame, easeMouth, restMouth, shapeAt, type LipTimings, type MouthGeometry } from '../talkingFace'

const jsonCache = new Map<string, Promise<unknown>>()
function loadJson<T>(url: string): Promise<T | null> {
  if (!jsonCache.has(url)) {
    jsonCache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  }
  return jsonCache.get(url) as Promise<T | null>
}

export function TalkingFace({ talk, lipsUrl, visible }: { talk: SimTalk; lipsUrl: string | null; visible: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [geo, setGeo] = useState<MouthGeometry | null>(null)
  const [lips, setLips] = useState<LipTimings | null>(null)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    let live = true
    void loadJson<MouthGeometry>(talk.mouth).then((g) => live && setGeo(g))
    return () => {
      live = false
    }
  }, [talk.mouth])

  useEffect(() => {
    if (!lipsUrl) return
    let live = true
    void loadJson<LipTimings>(lipsUrl).then((l) => live && setLips(l))
    return () => {
      live = false
    }
  }, [lipsUrl])

  // Draw only while the close-up is on screen
  useEffect(() => {
    const v = video.current
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!visible || !v || !c || !ctx || !geo) return
    c.width = geo.w
    c.height = geo.h
    void v.play().catch(() => undefined)
    let mouth = restMouth()
    let last = performance.now()
    let first = true
    let frame = 0
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const clock = voiceClock()
      mouth = easeMouth(mouth, clock ? shapeAt(lips, audioIdOf(clock.url), clock.t) : 'x', dt)
      if (v.readyState >= 2) {
        drawTalkingFrame(ctx, v, geo, mouth)
        if (first) {
          first = false
          setDrawn(true)
        }
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      v.pause()
    }
  }, [visible, geo, lips])

  return (
    <div className={cn('absolute inset-0 transition-opacity duration-200', visible ? 'opacity-100' : 'pointer-events-none opacity-0')} aria-hidden>
      <Image src={talk.src} alt="" fill sizes="460px" className="object-cover" />
      {/* Kept in the page (not display:none) so phones decode it; only the canvas shows */}
      <video ref={video} src={talk.video} muted loop playsInline preload="auto" className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" />
      <canvas ref={canvas} className={cn('absolute inset-0 h-full w-full object-cover', drawn ? 'opacity-100' : 'opacity-0')} />
    </div>
  )
}
