'use client'

/**
 * The top of the new phone layout: the patient (an animated stand-in until the 3D patient lands),
 * breathing at the real breathing rate, a ring while someone speaks, and a slim monitor strip.
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { vitalsFromTimeline, type SimScene, type Vitals, type VitalsTimeline } from '@/lib/learn/simulation/engine'
import { heartBeep, monitorAlarm, vibrate } from '../simAudio'
import { alarmFor, ecgAt } from '../VitalsMonitor'

function MonitorStrip({ timeline, on, getClock, live }: { timeline: VitalsTimeline | null; on: boolean; getClock: () => number; live: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [v, setV] = useState<Vitals | null>(null)
  const vRef = useRef<Vitals | null>(null)
  const liveRef = useRef(live && on)
  liveRef.current = live && on

  useEffect(() => {
    if (!on || !timeline) {
      vRef.current = null
      setV(null)
      return
    }
    const update = () => {
      const next = vitalsFromTimeline(timeline, getClock())
      vRef.current = next
      setV({ ...next, hr: next.hr + Math.round((Math.random() - 0.5) * 2) })
    }
    update()
    const id = window.setInterval(update, 500)
    return () => window.clearInterval(id)
  }, [on, timeline, getClock])

  const alarms = v ? alarmFor(v) : null
  const alarming = Boolean(live && alarms && (alarms.hr || alarms.spo2 || alarms.rr || alarms.bp))
  useEffect(() => {
    if (!alarming) return
    vibrate([120, 80, 120])
    monitorAlarm()
    const id = window.setInterval(monitorAlarm, 5000)
    return () => window.clearInterval(id)
  }, [alarming])

  // Mini ECG sweep with a beep per beat
  useEffect(() => {
    const el = canvas.current
    const c2d = el?.getContext('2d')
    if (!el || !c2d) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = el.clientWidth
    const h = el.clientHeight
    el.width = w * dpr
    el.height = h * dpr
    c2d.setTransform(dpr, 0, 0, dpr, 0, 0)
    let frame = 0
    let last = performance.now()
    let x = 0
    let phase = 0
    let prevY: number | null = null
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const vit = vRef.current
      const before = phase
      phase = (phase + dt * ((vit?.hr ?? 0) / 60)) % 1
      if (vit && liveRef.current && before < 0.3 && (phase >= 0.3 || phase < before)) heartBeep(vit.spo2)
      const y = vit ? h * 0.62 - ecgAt(phase) * h * 0.5 : h * 0.62
      const nx = x + dt * 70
      c2d.clearRect(nx, 0, 10, h)
      if (prevY !== null) {
        c2d.strokeStyle = vit ? '#22e36b' : 'rgba(34,227,107,0.3)'
        c2d.lineWidth = 1.6
        c2d.beginPath()
        c2d.moveTo(x, prevY)
        c2d.lineTo(nx, y)
        c2d.stroke()
      }
      prevY = y
      x = nx
      if (x > w) {
        x = 0
        prevY = null
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  const num = (label: string, value: string, color: string, alarm: boolean) => (
    <span className={cn('flex min-w-0 flex-col rounded-lg px-1.5 py-0.5', alarm && 'animate-pulse bg-[rgb(127_29_29/0.6)]')}>
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[rgb(255_255_255/0.45)]">{label}</span>
      <span className="whitespace-nowrap font-mono text-[15px] font-semibold leading-tight tabular-nums" style={{ color }}>
        {value}
      </span>
    </span>
  )

  return (
    <div className="flex items-center gap-2 rounded-2xl bg-[rgb(3_8_8/0.82)] px-2.5 py-1.5 ring-1 ring-[rgb(255_255_255/0.07)] backdrop-blur">
      <canvas ref={canvas} className="h-7 w-16 shrink-0 sm:w-24" aria-hidden />
      {on ? (
        <div className="grid flex-1 grid-cols-4 gap-1">
          {num('HR', v ? String(v.hr) : '--', '#22e36b', Boolean(alarms?.hr))}
          {num('SpO₂', v ? `${v.spo2}` : '--', '#7dd3fc', Boolean(alarms?.spo2))}
          {num('BP', v ? `${v.bpSys}/${v.bpDia}` : '--', '#f1f5f9', Boolean(alarms?.bp))}
          {num('RR', v ? String(v.rr) : '--', '#fde68a', Boolean(alarms?.rr))}
        </div>
      ) : (
        <span className="flex-1 text-[11px] font-semibold text-[rgb(255_255_255/0.6)]">Monitor not connected</span>
      )}
    </div>
  )
}

/**
 * The patient on video: a silent looping clip per state (the voices play separately), crossfading
 * when the state changes. The still shows until the video can play, and stays if a phone blocks it.
 */
function PatientVideo({ scene }: { scene: SimScene }) {
  const [playing, setPlaying] = useState(false)
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={scene.video ?? scene.src}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <Image src={scene.src} alt={scene.alt} fill sizes="460px" className="object-cover" priority />
        {scene.video && (
          <video
            src={scene.video}
            className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-300', playing ? 'opacity-100' : 'opacity-0')}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onPlaying={() => setPlaying(true)}
            aria-hidden
          />
        )}
      </motion.div>
    </AnimatePresence>
  )
}

export function PatientStage({
  pain,
  breathsPerMin,
  speaking,
  scene = null,
}: {
  pain: number
  breathsPerMin: number
  speaking: boolean
  scene?: SimScene | null
}) {
  const reduce = useReducedMotion()
  const breath = Math.max(1.2, 60 / Math.max(6, breathsPerMin))
  const distress = Math.min(1, pain / 10)
  return (
    <div className="learn-fixed-dark relative h-full overflow-hidden bg-[radial-gradient(120%_100%_at_50%_0%,rgb(32_56_52)_0%,rgb(8_16_15)_72%)]">
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgb(255_255_255)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255)_1px,transparent_1px)] [background-size:26px_26px]" />
      {scene && <PatientVideo scene={scene} />}
      {/* Stand-in patient (cases without video yet): shoulders breathe, a ring while speaking */}
      <svg style={scene ? { display: 'none' } : undefined} viewBox="0 0 200 150" className="absolute inset-x-0 bottom-10 mx-auto h-[78%] w-auto" aria-hidden>
        <motion.g
          style={{ transformOrigin: '100px 150px' }}
          animate={reduce ? undefined : { scaleY: [1, 1.035, 1], scaleX: [1, 1.012, 1] }}
          transition={{ duration: breath, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path d="M30 150 C 34 112, 62 98, 100 98 C 138 98, 166 112, 170 150 Z" fill="rgb(150 186 207)" opacity="0.9" />
          <path d="M84 98 L100 116 L116 98" stroke="rgb(98 134 156)" strokeWidth="3" fill="none" />
        </motion.g>
        <motion.g animate={reduce ? undefined : { y: [0, -0.8, 0] }} transition={{ duration: breath, repeat: Infinity, ease: 'easeInOut' }}>
          <rect x="88" y="78" width="24" height="24" rx="8" fill="rgb(96 58 34)" />
          <ellipse cx="100" cy="58" rx="27" ry="31" fill="rgb(96 58 34)" />
          <path d="M73 50 C 76 28, 124 28, 127 50 C 118 40, 82 40, 73 50 Z" fill="rgb(126 52 40)" />
          <path d={distress > 0.5 ? 'M86 57 L95 59 M105 59 L114 57' : 'M86 58 L95 58 M105 58 L114 58'} stroke="rgb(40 22 14)" strokeWidth="2.4" strokeLinecap="round" />
          <path d={distress > 0.5 ? 'M92 74 Q100 70 108 74' : 'M92 73 Q100 76 108 73'} stroke="rgb(40 22 14)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </motion.g>
        {speaking && (
          <motion.ellipse
            cx="100"
            cy="58"
            rx="34"
            ry="38"
            fill="none"
            stroke="#00cd0f"
            strokeWidth="2.5"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: [0.9, 0.35, 0.9], scale: [1, 1.06, 1] }}
            transition={{ duration: 0.9, repeat: Infinity }}
            style={{ transformOrigin: '100px 58px' }}
          />
        )}
      </svg>
      {/* Nothing sits over the patient: name and timer are in the top bar, the monitor below */}
      {scene && speaking && (
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[rgb(3_8_7/0.6)] px-2.5 py-1 text-[10px] font-semibold text-white/80 backdrop-blur-sm">
          Speaking…
        </span>
      )}
    </div>
  )
}

/** The monitor as its own slim row under the patient (never on top of him). */
export function MonitorRow(props: { timeline: VitalsTimeline | null; on: boolean; getClock: () => number; live: boolean }) {
  return (
    <div className="learn-fixed-dark shrink-0 bg-[rgb(8_16_15)] px-2 pb-2 pt-1">
      <MonitorStrip {...props} />
    </div>
  )
}
