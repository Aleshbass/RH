'use client'

/**
 * "Love" on Learn community posts and replies (owner 2026-11-17: like Instagram, very smooth).
 * Tap the heart, or double-tap the post or reply: it fills red with a springy pop and a little
 * burst, the count rolls, and the change is instant (the server catches up behind it). Loves are
 * the old "helpful" marks underneath (learnHelpful), so authors still earn points.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode, type MouseEvent } from 'react'
import { useMutation } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { communityApi, errorText } from './socialApi'

const RED = '#ff3040'
const HEART = 'M12 21.2l-1.3-1.18C5.6 15.4 2.2 12.33 2.2 8.55 2.2 5.47 4.62 3.05 7.7 3.05c1.74 0 3.4.81 4.3 2.08.9-1.27 2.56-2.08 4.3-2.08 3.08 0 5.5 2.42 5.5 5.5 0 3.78-3.4 6.85-8.5 11.48L12 21.2z'
const EASE = [0.22, 1, 0.36, 1] as const

type Target = { type: 'post' | 'reply'; id: string }

/** Love state that changes the instant you tap; the server follows, and errors put it back. */
export function useLove(target: Target, loved: boolean, count: number, own: boolean) {
  const toggle = useMutation(communityApi.toggleHelpful)
  const [state, setState] = useState({ loved, count })
  const inFlight = useRef(0)
  // Follow the server whenever nothing of ours is still on its way
  useEffect(() => {
    if (inFlight.current === 0) setState({ loved, count })
  }, [loved, count])

  const set = useCallback(
    async (want: boolean) => {
      if (own) {
        toast('You can’t love your own post')
        return false
      }
      let changed = false
      setState((s) => {
        if (s.loved === want) return s
        changed = true
        return { loved: want, count: Math.max(0, s.count + (want ? 1 : -1)) }
      })
      if (!changed) return false
      inFlight.current++
      try {
        await toggle({ targetType: target.type, targetId: target.id })
      } catch (err) {
        setState((s) => ({ loved: !want, count: Math.max(0, s.count + (want ? -1 : 1)) }))
        toast.error(errorText(err, 'Couldn’t update. Try again.'))
      } finally {
        inFlight.current--
      }
      return true
    },
    [own, target.id, target.type, toggle]
  )
  return { ...state, set }
}

function feedback() {
  playSound('helpful')
  try {
    navigator.vibrate?.(8)
  } catch {
    // no vibration on this device
  }
}

function Burst() {
  return (
    <span className="pointer-events-none absolute inset-0">
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ border: `2px solid ${RED}` }}
        initial={{ scale: 0.3, opacity: 0.9 }}
        animate={{ scale: 2, opacity: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 h-[5px] w-[5px] rounded-full"
            style={{ background: i % 2 ? RED : '#ff8a3d', marginLeft: -2.5, marginTop: -2.5 }}
            initial={{ x: 0, y: 0, scale: 0.6, opacity: 1 }}
            animate={{ x: Math.cos(a) * 19, y: Math.sin(a) * 19, scale: 0, opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.04 }}
          />
        )
      })}
    </span>
  )
}

/** The count, rolling up when it grows and down when it shrinks. */
function RollingCount({ value }: { value: number }) {
  const prev = useRef(value)
  const dir = value >= prev.current ? 1 : -1
  useEffect(() => {
    prev.current = value
  }, [value])
  return (
    <span className="relative inline-flex h-5 min-w-[0.6rem] items-center overflow-hidden tabular-nums">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={{ y: dir * 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -dir * 14, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
        >
          {value > 0 ? value : ''}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/** The heart button. `size` sm for lists, md under a post or reply. */
export function HeartButton({
  loved,
  count,
  own,
  onToggle,
  size = 'md',
  className,
}: {
  loved: boolean
  count: number
  own?: boolean
  onToggle: (next: boolean) => Promise<boolean> | void
  size?: 'sm' | 'md'
  className?: string
}) {
  const reduce = useReducedMotion()
  const [bursts, setBursts] = useState<number[]>([])
  const px = size === 'sm' ? 16 : 22
  const click = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const next = !loved
    const changed = await onToggle(next)
    if (changed === false) return
    if (next) {
      feedback()
      if (!reduce) {
        const id = Date.now()
        setBursts((b) => [...b, id])
        setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 750)
      }
    }
  }
  return (
    <button
      type="button"
      onClick={(e) => void click(e)}
      aria-pressed={loved}
      aria-label={loved ? `Unlove (${count})` : `Love${count ? ` (${count})` : ''}`}
      title={own ? 'You can’t love your own post' : undefined}
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors',
        size === 'sm' ? 'h-7 px-1.5 text-xs' : 'h-9 px-2.5 text-sm hover:bg-rh-ink/[0.05]',
        loved ? 'text-[#ff3040]' : 'text-rh-ink/60 hover:text-rh-ink',
        className
      )}
    >
      <span className="relative flex items-center justify-center" style={{ width: px + 4, height: px + 4 }}>
        {bursts.map((id) => (
          <Burst key={id} />
        ))}
        <motion.svg
          key={loved ? 'on' : 'off'}
          viewBox="0 0 24 24"
          width={px}
          height={px}
          initial={false}
          animate={reduce ? undefined : loved ? { scale: [0.55, 1.32, 0.9, 1.07, 1] } : { scale: [0.82, 1] }}
          transition={loved ? { duration: 0.55, ease: EASE, times: [0, 0.3, 0.55, 0.8, 1] } : { duration: 0.2, ease: 'easeOut' }}
          className="relative transition-transform group-active:scale-90"
        >
          <path d={HEART} fill={loved ? RED : 'none'} stroke={loved ? RED : 'currentColor'} strokeWidth={loved ? 0 : 1.9} strokeLinejoin="round" />
        </motion.svg>
      </span>
      <RollingCount value={count} />
    </button>
  )
}

/**
 * Double-tap (phones) or double-click (computers) anywhere on a post or reply to love it: a big
 * heart pops where you tapped and floats away. Double-tapping never takes a love back.
 */
export function DoubleTapLove({ onLove, disabled, children, className }: { onLove: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  const box = useRef<HTMLDivElement>(null)
  const last = useRef({ t: 0, x: 0, y: 0 })
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([])

  const fire = (clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    const id = Date.now() + Math.random()
    setHearts((h) => [...h, { id, x: clientX - r.left, y: clientY - r.top }])
    setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 850)
    feedback()
    onLove()
  }
  const interactive = (el: EventTarget | null) => el instanceof Element && Boolean(el.closest('a, button, textarea, input, select, [role="menu"]'))

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.pointerType === 'mouse' || interactive(e.target)) return
    const now = performance.now()
    const near = Math.hypot(e.clientX - last.current.x, e.clientY - last.current.y) < 32
    if (now - last.current.t < 320 && near) {
      last.current.t = 0
      fire(e.clientX, e.clientY)
    } else last.current = { t: now, x: e.clientX, y: e.clientY }
  }
  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (disabled || interactive(e.target)) return
    window.getSelection()?.removeAllRanges()
    fire(e.clientX, e.clientY)
  }

  return (
    <div ref={box} className={cn('relative', className)} onPointerUp={onPointerUp} onDoubleClick={onDoubleClick} style={{ touchAction: 'manipulation' }}>
      {children}
      <AnimatePresence>
        {hearts.map((h) => (
          <motion.svg
            key={h.id}
            viewBox="0 0 24 24"
            width={84}
            height={84}
            className="pointer-events-none absolute z-20"
            style={{ left: h.x - 42, top: h.y - 42 }}
            initial={reduce ? { opacity: 0 } : { scale: 0, opacity: 0, rotate: -14 }}
            animate={reduce ? { opacity: 1 } : { scale: [0, 1.22, 0.94, 1.04], opacity: [0, 1, 1, 1], rotate: [-14, 7, -3, 0] }}
            exit={reduce ? { opacity: 0 } : { scale: 0.9, opacity: 0, y: -46 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <path d={HEART} fill={RED} />
          </motion.svg>
        ))}
      </AnimatePresence>
    </div>
  )
}

/** "Loved by Tijjani and 3 others", "Loved by you and Ada". */
export function LovedBy({ names, count, loved }: { names: string[]; count: number; loved: boolean }) {
  if (count <= 0) return null
  const people = [...(loved ? ['you'] : []), ...names].slice(0, 2)
  const others = Math.max(0, count - people.length)
  const text =
    people.length === 0
      ? `${count} ${count === 1 ? 'love' : 'loves'}`
      : others > 0
        ? `${people.join(', ')} and ${others} ${others === 1 ? 'other' : 'others'}`
        : people.join(' and ')
  return (
    <motion.p key={text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-rh-ink/60">
      {people.length ? (
        <>
          Loved by <span className="font-semibold text-rh-ink">{text}</span>
        </>
      ) : (
        <span className="font-semibold text-rh-ink">{text}</span>
      )}
    </motion.p>
  )
}

/** The small read-only heart + count on post lists. */
export function LoveCount({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden>
        <path d={HEART} fill={RED} />
      </svg>
      {count}
    </span>
  )
}
