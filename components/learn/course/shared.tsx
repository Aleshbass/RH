'use client'

/**
 * Pieces shared by the physio's course page (/learn/course): types read from the Convex
 * queries, the drawer, small cards and time helpers. Ink and cream with lime highlights.
 */

import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsPhone } from '@/components/patient/ui'
import type { getMyCourse } from '@/convex/learn'
import type { LibraryItem } from '@/convex/exerciseLibrary'
import type { listResources } from '@/convex/libraryResources'
import type { QueryResult } from '@/lib/convexUntyped'
import { cn } from '@/lib/utils'

export type MyCourse = QueryResult<typeof getMyCourse>
export type CourseOk = Extract<MyCourse, { state: 'ok' }>
export type CourseSession = CourseOk['sessions'][number]
export type CourseWeek = CourseOk['weeks'][number]
export type CourseLink = CourseOk['links'][number]
export type StudyExercise = LibraryItem
export type StudyResource = NonNullable<QueryResult<typeof listResources>>[number]
export type StudyLibraryData = { version: string; access: string; label: string; items: StudyExercise[] }

/** Join opens this long before a session starts, and stays open until it ends. */
export const JOIN_EARLY_MS = 15 * 60 * 1000

export const cardClass = 'rounded-[1.75rem] bg-white p-5 shadow-soft sm:p-6'
export const eyebrowClass = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-rh-ink/45'

// ─────────────────────────────────────────────────────────────────────────────
// Body regions: the founder's library uses these keys; 3D exercises map from body parts
// ─────────────────────────────────────────────────────────────────────────────

export const REGIONS = [
  { key: 'neck', label: 'Neck' },
  { key: 'shoulder', label: 'Shoulder' },
  { key: 'elbow', label: 'Elbow' },
  { key: 'wrist', label: 'Wrist & hand' },
  { key: 'thoracic', label: 'Upper back' },
  { key: 'lowback', label: 'Low back' },
  { key: 'hip', label: 'Hip' },
  { key: 'knee', label: 'Knee' },
  { key: 'ankle', label: 'Ankle & foot' },
  { key: 'general', label: 'General' },
] as const

export function regionLabel(key: string) {
  return REGIONS.find((r) => r.key === key)?.label ?? key
}

const PART_REGIONS: [RegExp, string][] = [
  [/neck/i, 'neck'],
  [/shoulder/i, 'shoulder'],
  [/elbow|forearm/i, 'elbow'],
  [/wrist|hand/i, 'wrist'],
  [/upper back|thoracic/i, 'thoracic'],
  [/knee/i, 'knee'],
  [/ankle|foot/i, 'ankle'],
  [/hip/i, 'hip'],
  [/lower back|^back$/i, 'lowback'],
]

/** Regions a 3D exercise belongs to, in the order of its body parts ("Legs, Knee, Hip" → knee, hip). */
export function exerciseRegions(item: Pick<StudyExercise, 'bodyParts'>) {
  const found: string[] = []
  for (const part of item.bodyParts) {
    const region = PART_REGIONS.find(([pattern]) => pattern.test(part))?.[1]
    if (region && !found.includes(region)) found.push(region)
  }
  return found.length ? found : ['general']
}

// ─────────────────────────────────────────────────────────────────────────────
// Time (sessions are stored in UTC and shown in Lagos time, like the rest of Learn)
// ─────────────────────────────────────────────────────────────────────────────

const TZ = 'Africa/Lagos'

export function sessionDay(ms: number) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(ms)
}

export function sessionShortDay(ms: number) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(ms)
}

/** Weekday and day of the month, for the little date tiles ("Sun", "26"). */
export function sessionDateTile(ms: number) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric' }).formatToParts(ms)
  return { weekday: parts.find((p) => p.type === 'weekday')?.value ?? '', day: parts.find((p) => p.type === 'day')?.value ?? '' }
}

export function sessionTime(ms: number) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(ms)
    .replace(':00', '')
    .replace(' ', ' ')
    .toUpperCase()
}

export function sessionRange(s: { startsAt: number; endsAt: number }) {
  return `${sessionTime(s.startsAt)} – ${sessionTime(s.endsAt)}`
}

export function dateOnly(ms: number) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(ms)
}

/** "in 3 days", "in 2 h 10 min", "in 8 min". */
export function countdown(ms: number, now: number) {
  const diff = Math.max(0, ms - now)
  const minutes = Math.round(diff / 60_000)
  if (minutes < 60) return `in ${Math.max(1, minutes)} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
  const days = Math.round(hours / 24)
  return days === 1 ? 'tomorrow' : `in ${days} days`
}

export type SessionPhase = 'live' | 'soon' | 'upcoming' | 'past'

export function sessionPhase(s: { startsAt: number; endsAt: number }, now: number): SessionPhase {
  if (now >= s.endsAt) return 'past'
  if (now >= s.startsAt) return 'live'
  if (now >= s.startsAt - JOIN_EARLY_MS) return 'soon'
  return 'upcoming'
}

export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fileKind(contentType: string) {
  if (contentType === 'application/pdf') return 'PDF'
  if (contentType.includes('presentation') || contentType.includes('powerpoint')) return 'Slides'
  if (contentType.includes('word')) return 'Document'
  if (contentType.startsWith('image/')) return 'Image'
  return 'File'
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawer: slides up from the bottom on phones, in from the right on larger screens
// ─────────────────────────────────────────────────────────────────────────────

export function LearnDrawer({
  open,
  onOpenChange,
  eyebrow,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Room for the 3D viewer next to the text on desktop. */
  wide?: boolean
}) {
  const isPhone = useIsPhone()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isPhone ? 'bottom' : 'right'}
        className={cn(
          'gap-0 border-rh-ink/[0.06] bg-rh-cream p-0 text-rh-ink data-[state=open]:duration-300',
          '[&>button:last-child]:right-4 [&>button:last-child]:top-4 [&>button:last-child]:rounded-full [&>button:last-child]:bg-white [&>button:last-child]:p-2 [&>button:last-child]:opacity-100 [&>button:last-child]:shadow-sm',
          isPhone ? 'max-h-[94dvh] rounded-t-[1.75rem]' : cn('w-full', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')
        )}
      >
        {isPhone && <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-rh-ink/15" aria-hidden />}
        <SheetHeader className="shrink-0 gap-1 px-5 pb-3 pt-4 pr-14 text-left sm:px-7 sm:pt-6">
          {eyebrow && <p className={eyebrowClass}>{eyebrow}</p>}
          <SheetTitle className="text-[22px] font-normal leading-tight tracking-tight text-rh-ink font-[family-name:var(--font-cal)]">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="text-sm leading-6 text-rh-ink/60">{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">Details</SheetDescription>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-2 sm:px-7">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-rh-ink/[0.06] bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-7">{footer}</div>
        )}
      </SheetContent>
    </Sheet>
  )
}

const CONFETTI_COLORS = ['#0b1312', '#00cd0f', '#ffe682', '#ffffff']

/** Brand confetti, kept for one moment only: claiming the certificate. Skipped for reduced motion. */
export function celebrate() {
  if (typeof window === 'undefined') return
  void import('canvas-confetti').then(({ default: confetti }) => {
    const base = { colors: CONFETTI_COLORS, disableForReducedMotion: true, zIndex: 9999, ticks: 240 }
    // From both sides, then a burst in the middle
    void confetti({ ...base, particleCount: 90, angle: 60, spread: 65, origin: { x: 0, y: 0.75 } })
    void confetti({ ...base, particleCount: 90, angle: 120, spread: 65, origin: { x: 1, y: 0.75 } })
    setTimeout(() => void confetti({ ...base, particleCount: 80, spread: 110, startVelocity: 34, origin: { y: 0.5 } }), 280)
  })
}

export function EmptyNote({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-inset ring-rh-ink/[0.06]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rh-sand text-rh-ink/70">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-rh-ink">{title}</p>
        {children && <p className="mt-0.5 text-sm leading-6 text-rh-ink/60">{children}</p>}
      </div>
    </div>
  )
}
