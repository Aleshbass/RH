'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Loader2, LogIn, LogOut } from '@/components/icons'
import { cn } from '@/lib/utils'

const HOLD_MS = 650

/** A short buzz on phones that support it. */
export function buzz(pattern: number | number[] = 18) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    // Not supported: nothing to do
  }
}

/**
 * The clock button: press and hold until the ring closes, so a pocket tap never clocks anyone
 * in or out. A keyboard press (Enter or Space) confirms straight away.
 */
export function HoldButton({
  mode,
  onConfirm,
  busy = false,
  done = false,
  disabled = false,
  size = 'lg',
  busyLabel,
}: {
  mode: 'in' | 'out'
  onConfirm: () => void
  busy?: boolean
  /** Briefly shows a tick after it worked */
  done?: boolean
  disabled?: boolean
  size?: 'md' | 'lg'
  busyLabel?: ReactNode
}) {
  const [progress, setProgress] = useState(0)
  const [holding, setHolding] = useState(false)
  const [nudge, setNudge] = useState(false)
  const startRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const firedRef = useRef(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    startRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  const tick = useCallback(() => {
    if (startRef.current === null) return
    const p = Math.min(1, (performance.now() - startRef.current) / HOLD_MS)
    setProgress(p)
    if (p >= 1) {
      stop()
      setHolding(false)
      firedRef.current = true
      buzz([12, 30, 12])
      onConfirm()
      return
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [onConfirm, stop])

  const begin = () => {
    if (disabled || busy) return
    firedRef.current = false
    setNudge(false)
    setHolding(true)
    buzz(8)
    startRef.current = performance.now()
    frameRef.current = requestAnimationFrame(tick)
  }

  const cancel = () => {
    if (startRef.current === null) return
    const early = !firedRef.current
    stop()
    setHolding(false)
    setProgress(0)
    if (early) {
      setNudge(true)
      window.setTimeout(() => setNudge(false), 1600)
      // A small shake says "hold it longer" without words
      buttonRef.current?.animate?.(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-5px)' },
          { transform: 'translateX(5px)' },
          { transform: 'translateX(-3px)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 320, easing: 'ease-in-out' }
      )
    }
  }

  // After it fired, let the ring empty again once the action settles
  useEffect(() => {
    if (!busy && !holding) setProgress(0)
  }, [busy, holding])

  const isIn = mode === 'in'
  const dim = size === 'lg' ? 184 : 132
  const stroke = size === 'lg' ? 6 : 5
  const r = dim / 2 - stroke
  const circumference = 2 * Math.PI * r
  const label = isIn ? 'Clock in' : 'Clock out'

  return (
    <div className="flex flex-col items-center gap-2.5">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label} (press and hold)`}
        disabled={disabled}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          begin()
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          // Keyboard (Enter / Space) clicks have no pointer: confirm straight away
          if (e.detail === 0 && !disabled && !busy) onConfirm()
        }}
        style={{ width: dim, height: dim, touchAction: 'none', WebkitTouchCallout: 'none' }}
        className={cn(
          'relative shrink-0 select-none rounded-full outline-none transition-transform duration-200 focus-visible:ring-4 focus-visible:ring-pt-accent/40 disabled:cursor-not-allowed disabled:opacity-50',
          holding && 'scale-[0.97]'
        )}
      >
        <svg width={dim} height={dim} className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-pt-line" />
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - (busy || done ? 1 : progress))}
            className={cn(isIn ? 'stroke-pt-accent' : 'stroke-pt-ink', !holding && 'transition-[stroke-dashoffset] duration-300')}
          />
        </svg>
        <span
          className={cn(
            'absolute flex flex-col items-center justify-center rounded-full transition-colors',
            isIn ? 'bg-pt-primary text-pt-on-primary' : 'border border-pt-line-strong bg-pt-surface text-pt-ink'
          )}
          style={{ inset: stroke * 2 + 2 }}
        >
          {done ? (
            <Check className={size === 'lg' ? 'h-9 w-9 text-pt-accent' : 'h-7 w-7 text-pt-accent'} />
          ) : busy ? (
            <>
              <Loader2 className={cn('animate-spin', size === 'lg' ? 'h-7 w-7' : 'h-6 w-6')} />
              {busyLabel && <span className="mt-2 px-4 text-center text-[11px] font-medium opacity-80">{busyLabel}</span>}
            </>
          ) : (
            <>
              {isIn ? (
                <LogIn className={size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'} />
              ) : (
                <LogOut className={size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'} />
              )}
              <span className={cn('mt-2 font-semibold tracking-tight', size === 'lg' ? 'text-lg' : 'text-[15px]')}>{label}</span>
              <span className={cn('mt-0.5 text-[11px] font-medium', isIn ? 'text-white/60' : 'text-pt-muted')}>
                {holding ? 'Keep holding…' : 'Press and hold'}
              </span>
            </>
          )}
        </span>
      </button>
      <p className={cn('h-4 text-xs font-medium transition-opacity', nudge ? 'text-pt-ink opacity-100' : 'opacity-0')} aria-live="polite">
        {nudge ? 'Hold until the ring closes' : ''}
      </p>
    </div>
  )
}
