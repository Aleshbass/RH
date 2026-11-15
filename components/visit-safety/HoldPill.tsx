'use client'

import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Loader2 } from '@/components/icons'
import { buzz } from '@/components/clock/HoldButton'
import { cn } from '@/lib/utils'

/**
 * A pill you press and hold until it fills, so a pocket tap never sends it. Used for the help
 * button and "I'm safe". A keyboard press (Enter or Space) confirms straight away.
 */
export function HoldPill({
  label,
  holdingLabel = 'Keep holding…',
  icon: Icon,
  onConfirm,
  holdMs = 1500,
  tone = 'danger',
  busy = false,
  disabled = false,
  className,
  children,
}: {
  label: string
  holdingLabel?: string
  icon?: ComponentType<{ className?: string }>
  onConfirm: () => void
  holdMs?: number
  tone?: 'danger' | 'ink' | 'soft'
  busy?: boolean
  disabled?: boolean
  className?: string
  children?: ReactNode
}) {
  const [progress, setProgress] = useState(0)
  const [holding, setHolding] = useState(false)
  const startRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    startRef.current = null
  }, [])
  useEffect(() => stop, [stop])

  const tick = useCallback(() => {
    if (startRef.current === null) return
    const p = Math.min(1, (performance.now() - startRef.current) / holdMs)
    setProgress(p)
    if (p >= 1) {
      stop()
      setHolding(false)
      buzz([20, 40, 20])
      onConfirm()
      window.setTimeout(() => setProgress(0), 400)
      return
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [holdMs, onConfirm, stop])

  const begin = () => {
    if (disabled || busy) return
    setHolding(true)
    buzz(10)
    startRef.current = performance.now()
    frameRef.current = requestAnimationFrame(tick)
  }
  const cancel = () => {
    if (startRef.current === null) return
    stop()
    setHolding(false)
    setProgress(0)
  }

  const tones = {
    danger: { base: 'bg-pt-rose-bg text-pt-rose-fg', fill: 'bg-[#d4183d]', fillText: 'text-white' },
    ink: { base: 'bg-pt-primary text-pt-on-primary', fill: 'bg-pt-accent', fillText: 'text-[#06210a]' },
    soft: { base: 'border border-pt-line bg-pt-surface text-pt-ink', fill: 'bg-pt-green-bg', fillText: 'text-pt-green-fg' },
  }[tone]

  return (
    <button
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
        if (e.detail === 0 && !disabled && !busy) onConfirm()
      }}
      style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
      className={cn(
        'relative inline-flex h-11 select-none items-center justify-center overflow-hidden rounded-xl px-4 text-sm font-semibold outline-none transition-transform focus-visible:ring-2 focus-visible:ring-pt-accent/50 disabled:cursor-not-allowed disabled:opacity-50',
        tones.base,
        holding && 'scale-[0.98]',
        className
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0', tones.fill)} style={{ width: `${progress * 100}%` }} />
      <span className={cn('relative flex items-center gap-2', progress > 0.5 && tones.fillText)}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
        {children ?? (holding ? holdingLabel : label)}
      </span>
    </button>
  )
}
