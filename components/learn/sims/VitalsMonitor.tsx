'use client'

/**
 * The bedside monitor: an ECG trace and an SpO₂ pleth wave sweeping across a canvas like a real
 * monitor, one beep per beat (pitch falls with saturation), and an alarm when values are out of
 * range. Numbers come from the server's vitals timeline, so they keep drifting as the patient
 * worsens until the physio escalates. Colours are fixed (not theme tokens): a monitor is dark in
 * both light and dark mode.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellRing, HeartPulse } from '@/components/icons'
import { cn } from '@/lib/utils'
import { vitalsFromTimeline, type Vitals, type VitalsTimeline } from '@/lib/learn/simulation/engine'
import { heartBeep, monitorAlarm, vibrate } from './simAudio'

const ECG = '#22e36b'
const PLETH = '#7dd3fc'
const SWEEP_PX_PER_SEC = 110

function alarmFor(v: Vitals) {
  return {
    hr: v.hr > 120 || v.hr < 50,
    spo2: v.spo2 < 92,
    rr: v.rr > 25 || v.rr < 8,
    bp: v.bpSys < 90 || v.bpSys > 180,
  }
}

/** One heartbeat of ECG, phase 0..1 → -1..1 (P wave, QRS, T wave). */
function ecgAt(p: number) {
  const bump = (c: number, w: number, h: number) => h * Math.exp(-(((p - c) / w) ** 2))
  return bump(0.12, 0.025, 0.12) + bump(0.285, 0.008, -0.12) + bump(0.3, 0.01, 1) + bump(0.318, 0.01, -0.25) + bump(0.55, 0.05, 0.22)
}

/** One pulse of the pleth wave, phase 0..1 → 0..1 (upstroke after the QRS, dicrotic notch). */
function plethAt(p: number) {
  const q = (p + 0.62) % 1
  const rise = Math.exp(-(((q - 0.18) / 0.09) ** 2))
  const notch = 0.35 * Math.exp(-(((q - 0.42) / 0.07) ** 2))
  return Math.min(1, rise + notch)
}

export function VitalsMonitor({
  timeline,
  on,
  getClock,
  live,
}: {
  timeline: VitalsTimeline | null
  on: boolean
  /** Current case time in seconds (drives the drift). */
  getClock: () => number
  /** Beeps and alarms only while the case is running. */
  live: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [vitals, setVitals] = useState<Vitals | null>(null)
  const [silenced, setSilenced] = useState(false)
  const vitalsRef = useRef<Vitals | null>(null)
  const liveRef = useRef(live && on)
  liveRef.current = live && on
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline

  // Numbers: recomputed twice a second from the timeline (with a little natural jitter)
  useEffect(() => {
    if (!on || !timeline) {
      setVitals(null)
      vitalsRef.current = null
      return
    }
    const update = () => {
      const t = timelineRef.current
      if (!t) return
      const v = vitalsFromTimeline(t, getClock())
      const jitter = Math.round((Math.random() - 0.5) * 2)
      const shown = { ...v, hr: v.hr + jitter }
      vitalsRef.current = v
      setVitals(shown)
    }
    update()
    const id = window.setInterval(update, 500)
    return () => window.clearInterval(id)
  }, [on, timeline, getClock])

  const alarms = vitals ? alarmFor(vitals) : null
  const alarming = Boolean(alarms && (alarms.hr || alarms.spo2 || alarms.rr || alarms.bp))

  // Alarm sound every 4 s while out of range (unless silenced); one buzz when it starts
  const wasAlarming = useRef(false)
  useEffect(() => {
    if (!alarming || !live) {
      wasAlarming.current = false
      return
    }
    if (!wasAlarming.current) vibrate([120, 80, 120])
    wasAlarming.current = true
    if (silenced) return
    monitorAlarm()
    const id = window.setInterval(monitorAlarm, 4000)
    return () => window.clearInterval(id)
  }, [alarming, live, silenced])

  // The sweeping traces
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const c2d = el.getContext('2d')
    if (!c2d) return
    let width = 0
    let height = 0
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = el.clientWidth
      height = el.clientHeight
      el.width = Math.round(width * dpr)
      el.height = Math.round(height * dpr)
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0)
      c2d.clearRect(0, 0, width, height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    let frame = 0
    let last = performance.now()
    let x = 0
    let phase = 0
    let prev: { e: number; p: number } | null = null
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const v = vitalsRef.current
      const hr = v?.hr ?? 0
      const beatsPerSec = hr > 0 ? hr / 60 : 0
      const before = phase
      phase = (phase + dt * beatsPerSec) % 1
      if (v && liveRef.current && before < 0.3 && (phase >= 0.3 || phase < before)) heartBeep(v.spo2)

      const half = height / 2
      const ecgY = v ? half * 0.55 - ecgAt(phase) * half * 0.42 : half * 0.55
      const plethY = v ? height - 8 - plethAt(phase) * half * 0.62 : height - 8
      const nx = x + dt * SWEEP_PX_PER_SEC
      // Erase just ahead of the pen
      c2d.clearRect(nx, 0, 14, height)
      if (prev && nx > x) {
        c2d.lineWidth = 2
        c2d.lineJoin = 'round'
        c2d.strokeStyle = v ? ECG : 'rgba(34,227,107,0.35)'
        c2d.beginPath()
        c2d.moveTo(x, prev.e)
        c2d.lineTo(nx, ecgY)
        c2d.stroke()
        c2d.strokeStyle = v ? PLETH : 'rgba(125,211,252,0.3)'
        c2d.beginPath()
        c2d.moveTo(x, prev.p)
        c2d.lineTo(nx, plethY)
        c2d.stroke()
      }
      prev = { e: ecgY, p: plethY }
      x = nx
      if (x > width) {
        x = 0
        prev = null
        c2d.clearRect(0, 0, 14, height)
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [])

  const cell = (label: string, value: string, unit: string, color: string, alarm: boolean, small = false) => (
    <div className={cn('min-w-0 rounded-2xl px-2.5 py-2 transition-colors sm:px-3', alarm ? 'animate-pulse bg-[rgb(127_29_29/0.55)]' : 'bg-[rgb(255_255_255/0.04)]')}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[rgb(255_255_255/0.45)]">{label}</p>
      <p
        className={cn('mt-1 whitespace-nowrap font-mono font-semibold leading-none tabular-nums', small ? 'text-[15px] sm:text-[20px]' : 'text-[22px] sm:text-[26px]')}
        style={{ color }}
      >
        {value}
        {unit && <span className="ml-0.5 hidden text-[11px] font-medium text-[rgb(255_255_255/0.4)] sm:inline">{unit}</span>}
      </p>
    </div>
  )

  return (
    <div className="relative overflow-hidden rounded-[24px] bg-[rgb(4_9_9)] p-3 ring-1 ring-[rgb(255_255_255/0.06)] sm:p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[rgb(255_255_255/0.5)]">
          <HeartPulse className="h-3.5 w-3.5 text-[#22e36b]" /> Monitor
        </span>
        {on && alarming && live && (
          <button
            type="button"
            onClick={() => setSilenced((s) => !s)}
            className="flex items-center gap-1.5 rounded-full bg-[rgb(255_255_255/0.08)] px-2.5 py-1 text-[11px] font-semibold text-[rgb(255_255_255/0.8)]"
            aria-pressed={silenced}
          >
            {silenced ? <Bell className="h-3 w-3" /> : <BellRing className="h-3 w-3 text-[#fca5a5]" />}
            {silenced ? 'Alarm silenced' : 'Silence alarm'}
          </button>
        )}
      </div>
      <div className="relative">
        <canvas ref={canvas} className="block h-[118px] w-full" aria-hidden />
        <AnimatePresence>
          {!on && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="rounded-full bg-[rgb(255_255_255/0.07)] px-3 py-1.5 text-xs font-semibold text-[rgb(255_255_255/0.7)]">
                Not connected · check the vital signs to see them
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Vital signs">
        {cell('HR', vitals ? String(vitals.hr) : '--', 'bpm', ECG, Boolean(alarms?.hr))}
        {cell('SpO₂', vitals ? String(vitals.spo2) : '--', '%', PLETH, Boolean(alarms?.spo2))}
        {cell('BP', vitals ? `${vitals.bpSys}/${vitals.bpDia}` : '--', '', '#f1f5f9', Boolean(alarms?.bp), true)}
        {cell('RR', vitals ? String(vitals.rr) : '--', '/min', '#fde68a', Boolean(alarms?.rr))}
      </div>
    </div>
  )
}
