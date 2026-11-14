'use client'

/**
 * A scene video drawn to a canvas with the patient's mouth moving to their voice (see
 * ../talkingFace.ts). The still shows until the video can play, and stays if a phone blocks it.
 * `active`: the patient's own voice is playing (a relative's or nurse's line doesn't move it).
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
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

export function TalkingFace({
  video: videoUrl,
  still,
  alt,
  mouthUrl,
  lipsUrl,
  active,
}: {
  video: string
  still: string
  alt: string
  mouthUrl: string
  lipsUrl: string | null
  active: boolean
}) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [geo, setGeo] = useState<MouthGeometry | null>(null)
  const [lips, setLips] = useState<LipTimings | null>(null)
  const [drawn, setDrawn] = useState(false)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    let live = true
    void loadJson<MouthGeometry>(mouthUrl).then((g) => live && setGeo(g))
    return () => {
      live = false
    }
  }, [mouthUrl])

  useEffect(() => {
    if (!lipsUrl) return
    let live = true
    void loadJson<LipTimings>(lipsUrl).then((l) => live && setLips(l))
    return () => {
      live = false
    }
  }, [lipsUrl])

  // Draw each frame (about 30 a second) with the mouth where the voice says it should be
  useEffect(() => {
    const v = video.current
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!v || !c || !ctx || !geo) return
    c.width = geo.w
    c.height = geo.h
    void v.play().catch(() => undefined)
    let mouth = restMouth()
    let last = performance.now()
    let first = true
    let frame = 0
    let lastDraw = 0
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      if (now - lastDraw < 30) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      lastDraw = now
      const clock = activeRef.current ? voiceClock() : null
      mouth = easeMouth(mouth, clock ? shapeAt(lips, audioIdOf(clock.url), clock.t) : 'x', dt)
      if (v.readyState >= 2) {
        drawTalkingFrame(ctx, v, geo, mouth)
        if (first) {
          first = false
          setDrawn(true)
        }
      }
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      v.pause()
    }
  }, [geo, lips])

  return (
    <div className="absolute inset-0">
      <Image src={still} alt={alt} fill sizes="460px" className="object-cover" priority />
      {/* The plain video plays underneath: if the mouth data can't load, the scene still moves */}
      <video ref={video} src={videoUrl} muted loop playsInline autoPlay preload="auto" className="pointer-events-none absolute inset-0 h-full w-full object-cover" aria-hidden />
      <canvas ref={canvas} className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-300', drawn ? 'opacity-100' : 'opacity-0')} aria-hidden />
    </div>
  )
}
