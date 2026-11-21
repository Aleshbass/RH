'use client'

/**
 * Community cards and how they're laid out (owner 2026-11-21: "if many community groups are added
 * they all stack vertically… let users choose grid, vertical list or horizontal scroll", cards in
 * the spirit of Circle). Rooms and groups get a cover banner in their colour (or the group's
 * picture), an icon overlapping the banner, counts and a "new" dot. The Grid · List · Scroll choice
 * is remembered in this browser; without one, phones scroll sideways and bigger screens get a grid.
 */

import { useEffect, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight, GalleryHorizontal, GraduationCap, HelpCircle, LayoutDashboard, List, MessageCircle, Users } from '@/components/icons'
import { cn } from '@/lib/utils'
import { groupTone } from '@/lib/learnAdminsApi'

export type IconType = ComponentType<{ className?: string; style?: CSSProperties }>

// ── Colours and icons ─────────────────────────────────────────────────────────

/** The standard rooms keep one colour each, so people learn to spot them. */
const ROOM_COLORS: Record<string, string> = { 'ask-a-physio': 'lime', 'student-lounge': 'sky', 'study-group': 'amber', 'msk-program': 'violet' }
const PICKED_COLORS = ['sky', 'amber', 'rose', 'violet', 'lime']

/** A room's colour: a group's own colour, the fixed one for a standard room, else one picked from its slug. */
export function roomColor(room: { slug: string; kind?: string; color?: string | null }) {
  if (room.color) return room.color
  if (ROOM_COLORS[room.slug]) return ROOM_COLORS[room.slug]
  if (room.kind === 'course' || room.slug.startsWith('course-')) return 'violet'
  let hash = 0
  for (const ch of room.slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return PICKED_COLORS[hash % PICKED_COLORS.length]
}

export function roomIcon(room: { kind: string; slug: string }): IconType {
  if (room.kind === 'group' || room.kind === 'program') return Users
  if (room.kind === 'course') return GraduationCap
  if (room.slug === 'ask-a-physio') return HelpCircle
  return MessageCircle
}

const rgbOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/** A soft diagonal wash of the colour for cover banners (literal colours: right in light and dark). */
export function coverStyle(color: string | null | undefined): CSSProperties {
  const c = rgbOf(groupTone(color).dot)
  return { backgroundImage: `linear-gradient(135deg, rgb(${c} / 0.42) 0%, rgb(${c} / 0.18) 55%, rgb(${c} / 0.06) 100%)` }
}

export const colorDot = (color: string | null | undefined) => groupTone(color).dot

/** The square icon of a room or group: its picture, or its colour with dark ink on top. */
export function CommunityIcon({
  color,
  imageUrl,
  icon: Icon,
  size = 40,
  className,
}: {
  color: string | null | undefined
  imageUrl?: string | null
  icon: IconType
  size?: number
  className?: string
}) {
  const radius = size >= 56 ? 'rounded-2xl' : 'rounded-xl'
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        className={cn('shrink-0 bg-white object-cover', radius, className)}
        style={{ width: size, height: size }}
      />
    )
  }
  const glyph = Math.round(size * 0.42)
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center', radius, className)}
      style={{ width: size, height: size, background: colorDot(color), color: '#0b1312' }}
    >
      <Icon style={{ width: glyph, height: glyph }} />
    </span>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

/** "just now", "5m ago", "3h ago", "2d ago", "3w ago", then the date: short enough for card lines. */
export function shortAgo(at: number, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - at) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  if (days < 35) return `${Math.round(days / 7)}w ago`
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const PHONE = '(max-width: 639px)'

function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** True on phones, false on bigger screens, null while the page is still the server's copy. */
export function usePhone(): boolean | null {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE).matches,
    () => null
  )
}

// ── "New" dots ────────────────────────────────────────────────────────────────

/**
 * When this browser last opened each room. There's no read tracking on the server, so the "new" dot
 * means "activity since you last opened it here" (or in the last three days, if never opened).
 */
const SEEN_KEY = 'rh-learn-room-seen'
const NEW_WINDOW = 3 * 24 * 60 * 60 * 1000

function readSeen(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function markRoomSeen(slug: string) {
  try {
    const all = { ...readSeen(), [slug]: Date.now() }
    // Only the 60 most recent rooms, so the entry never grows without end
    const kept = Object.fromEntries(
      Object.entries(all)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 60)
    )
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(kept))
  } catch {
    // Storage blocked (private window): the dots just won't clear
  }
}

/** The rooms this browser has opened, read after the first paint (null until then). */
export function useSeenRooms() {
  const [seen, setSeen] = useState<Record<string, number> | null>(null)
  useEffect(() => setSeen(readSeen()), [])
  return seen
}

export function hasNewActivity(slug: string, lastActivityAt: number | null | undefined, seen: Record<string, number> | null) {
  if (!seen || !lastActivityAt) return false
  const opened = seen[slug]
  return opened ? lastActivityAt > opened : Date.now() - lastActivityAt < NEW_WINDOW
}

// ── Grid · List · Scroll ──────────────────────────────────────────────────────

export type CardLayout = 'grid' | 'list' | 'scroll'
const LAYOUT_KEY = 'rh-learn-community-layout'
const layoutListeners = new Set<() => void>()
// Holds the choice for this visit when the browser blocks storage
let chosenThisVisit: CardLayout | null = null

function readLayout(): CardLayout | null {
  if (chosenThisVisit) return chosenThisVisit
  try {
    const value = window.localStorage.getItem(LAYOUT_KEY)
    return value === 'grid' || value === 'list' || value === 'scroll' ? value : null
  } catch {
    return null
  }
}

function subscribeLayout(onChange: () => void) {
  layoutListeners.add(onChange)
  const onStorage = (e: StorageEvent) => e.key === LAYOUT_KEY && onChange()
  window.addEventListener('storage', onStorage)
  return () => {
    layoutListeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * The chosen layout, shared by every card list on the page. Null on the server's copy: the lists
 * then use their default (scroll on phones, grid above) in CSS alone, so nothing jumps on load.
 */
export function useCardLayout(): [CardLayout | null, (layout: CardLayout) => void] {
  const stored = useSyncExternalStore(subscribeLayout, readLayout, () => null)
  const phone = usePhone()
  const layout = stored ?? (phone === null ? null : phone ? 'scroll' : 'grid')
  const set = (next: CardLayout) => {
    chosenThisVisit = next
    try {
      window.localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // Private window: the choice lasts for this visit only
    }
    layoutListeners.forEach((fn) => fn())
  }
  return [layout, set]
}

const LAYOUTS: { id: CardLayout; label: string; icon: IconType }[] = [
  { id: 'grid', label: 'Grid', icon: LayoutDashboard },
  { id: 'list', label: 'List', icon: List },
  { id: 'scroll', label: 'Scroll', icon: GalleryHorizontal },
]

export function LayoutSwitch({ value, onChange, className }: { value: CardLayout | null; onChange: (layout: CardLayout) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Show as" className={cn('inline-flex shrink-0 rounded-full bg-rh-ink/[0.05] p-1', className)}>
      {LAYOUTS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          title={option.label}
          onClick={() => onChange(option.id)}
          className={cn(
            'flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition sm:px-3',
            value === option.id ? 'bg-white text-rh-ink shadow-sm' : 'text-rh-ink/55 hover:text-rh-ink'
          )}
        >
          <option.icon className="h-3.5 w-3.5" />
          {/* Icons only on phones, so the heading beside it stays on one line */}
          <span className="max-sm:sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  )
}

const LIST_CLASS: Record<CardLayout | 'auto', string> = {
  grid: 'grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-4',
  list: 'grid gap-2 md:grid-cols-2',
  // Bleeds to the screen edge so the next card peeks in; snaps card by card
  scroll:
    '-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-2 [scroll-padding-inline:1rem] [scrollbar-width:none] sm:-mx-6 sm:gap-3 sm:px-6 sm:[scroll-padding-inline:1.5rem] [&::-webkit-scrollbar]:hidden',
  auto: '-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-2 [scroll-padding-inline:1rem] [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 md:grid-cols-3 xl:grid-cols-4 [&::-webkit-scrollbar]:hidden',
}

const ITEM_CLASS: Record<CardLayout | 'auto', string> = {
  grid: 'min-w-0',
  list: 'min-w-0',
  scroll: 'w-[68vw] max-w-[264px] shrink-0 snap-start sm:w-[250px]',
  auto: 'w-[68vw] max-w-[264px] shrink-0 snap-start sm:w-auto sm:max-w-none',
}

export function CardList({ layout, label, children }: { layout: CardLayout | null; label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className={LIST_CLASS[layout ?? 'auto']}>
      {children}
    </ul>
  )
}

// ── The card ──────────────────────────────────────────────────────────────────

export type CommunityCardData = {
  key: string
  href: string
  name: string
  description: string | null
  color: string | null
  imageUrl?: string | null
  icon: IconType
  /** Short facts: "12 people", "8 posts", "active 2h ago". */
  meta: string[]
  /** Small labels on the banner: "Private", "Course". */
  chips?: { label: string; icon?: IconType }[]
  /** Beside the name, e.g. the Champion badge. */
  badge?: ReactNode
  isNew?: boolean
}

function Chips({ chips, className }: { chips: CommunityCardData['chips']; className?: string }) {
  if (!chips?.length) return null
  return (
    <span className={cn('flex gap-1', className)}>
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex items-center gap-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[10.5px] font-semibold leading-4 text-rh-ink backdrop-blur-sm"
        >
          {chip.icon && <chip.icon className="h-2.5 w-2.5" />}
          {chip.label}
        </span>
      ))}
    </span>
  )
}

function NewDot({ className }: { className?: string }) {
  return (
    <span className={cn('block h-2.5 w-2.5 rounded-full bg-rh-lime ring-2 ring-white', className)} title="New activity">
      <span className="sr-only">New activity</span>
    </span>
  )
}

export function CommunityCard({ card, layout }: { card: CommunityCardData; layout: CardLayout | null }) {
  const row = layout === 'list'
  const Icon = card.icon
  return (
    <li className={ITEM_CLASS[layout ?? 'auto']}>
      <Link
        href={card.href}
        className={cn(
          'group relative flex h-full overflow-hidden rounded-2xl border border-rh-ink/[0.07] bg-white transition hover:border-rh-ink/20 hover:shadow-soft active:scale-[0.99]',
          row ? 'min-h-[76px] items-center gap-3 p-2.5 sm:p-3' : 'flex-col'
        )}
      >
        {row ? (
          <>
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={coverStyle(card.color)}>
              <CommunityIcon color={card.color} imageUrl={card.imageUrl} icon={Icon} size={card.imageUrl ? 56 : 34} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[14px] font-semibold leading-5 text-rh-ink sm:text-[15px]">{card.name}</span>
                {card.badge}
                {card.isNew && <NewDot className="shrink-0" />}
              </span>
              {card.description && <span className="mt-0.5 block truncate text-[12.5px] leading-5 text-rh-ink/55 sm:text-[13px]">{card.description}</span>}
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] font-medium text-rh-ink/50 sm:text-xs">
                {card.chips?.map((chip) => (
                  <span key={chip.label} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rh-ink/[0.05] px-1.5 py-px text-[10.5px] font-semibold text-rh-ink/70">
                    {chip.icon && <chip.icon className="h-2.5 w-2.5" />}
                    {chip.label}
                  </span>
                ))}
                <span className="truncate">{card.meta.join(' · ')}</span>
              </span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-rh-ink/30 transition group-hover:translate-x-0.5 group-hover:text-rh-ink" />
          </>
        ) : (
          <>
            <span aria-hidden className="relative block h-14 shrink-0 overflow-hidden sm:h-16" style={card.imageUrl ? undefined : coverStyle(card.color)}>
              {card.imageUrl ? (
                <Image src={card.imageUrl} alt="" fill unoptimized sizes="(max-width: 640px) 70vw, 300px" className="object-cover" />
              ) : (
                <Icon className="absolute -bottom-3 right-2 h-16 w-16 opacity-20" style={{ color: colorDot(card.color) }} />
              )}
            </span>
            {card.isNew && <NewDot className="absolute left-2.5 top-2.5" />}
            <Chips chips={card.chips} className="absolute right-2 top-2" />
            <span className="relative flex flex-1 flex-col px-3 pb-3 sm:px-3.5 sm:pb-3.5">
              <CommunityIcon color={card.color} imageUrl={card.imageUrl} icon={Icon} size={40} className="-mt-5 ring-[3px] ring-white" />
              <span className="mt-2 flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[14px] font-semibold leading-5 text-rh-ink sm:text-[15px]">{card.name}</span>
                {card.badge}
              </span>
              <span className="mt-0.5 line-clamp-2 min-h-10 text-[12.5px] leading-5 text-rh-ink/55 sm:text-[13px]">{card.description ?? ''}</span>
              <span className="mt-auto truncate pt-2 text-[11.5px] font-medium text-rh-ink/50 sm:text-xs">{card.meta.join(' · ')}</span>
            </span>
          </>
        )}
      </Link>
    </li>
  )
}
