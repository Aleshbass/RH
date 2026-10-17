'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useClerk, useUser } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Settings, ShieldCheck, Volume2, VolumeX } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ClinicThemeToggle } from '@/components/clinic/ClinicTheme'
import { PhysioBrand } from '@/components/physio/PhysioSidebar'
import { playSound, setSoundsEnabled, soundsEnabled, SOUND_SETTING_EVENT } from '@/lib/sounds'
import {
  ADMIN_HOME,
  findActiveItem,
  visibleAdminNav,
  type AdminBadgeKey,
  type AdminNavItem,
  type AdminNavSection,
} from './adminNav'

const OPEN_SECTIONS_KEY = 'rehabify:admin-nav-open'
const COLLAPSED_KEY = 'rehabify:admin-nav-collapsed'

type Badges = Partial<Record<AdminBadgeKey, number>> & { cap?: number }

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Preference just won't persist
  }
}

function BadgeCount({ value, cap, collapsed }: { value?: number; cap?: number; collapsed?: boolean }) {
  if (!value) return null
  const label = cap && value >= cap ? `${cap}+` : value > 99 ? '99+' : String(value)
  if (collapsed) {
    return <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rh-amber ring-2 ring-rh-teal dark:ring-rh-night" />
  }
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="ml-auto rounded-full bg-rh-amber px-1.5 py-px text-[10px] font-semibold leading-4 text-rh-night tabular-nums"
    >
      {label}
    </motion.span>
  )
}

function SoundsToggleItem() {
  const [enabled, setEnabled] = useState(true)
  useEffect(() => {
    const sync = () => setEnabled(soundsEnabled())
    sync()
    window.addEventListener(SOUND_SETTING_EVENT, sync)
    return () => window.removeEventListener(SOUND_SETTING_EVENT, sync)
  }, [])
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault()
        setSoundsEnabled(!enabled)
        if (!enabled) playSound('success')
      }}
    >
      {enabled ? <Volume2 className="mr-2 h-4 w-4 text-neutral-500" /> : <VolumeX className="mr-2 h-4 w-4 text-neutral-500" />}
      Sounds {enabled ? 'on' : 'off'}
    </DropdownMenuItem>
  )
}

function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const { isLoaded, user } = useUser()
  const { openUserProfile, signOut } = useClerk()
  if (!isLoaded || !user) return null

  const name = user.fullName || user.primaryEmailAddress?.emailAddress || 'Account'
  const email = user.primaryEmailAddress?.emailAddress

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={collapsed ? name : undefined}
          className={cn(
            'mt-1 flex w-full items-center gap-3 rounded-2xl bg-white/[0.07] px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            collapsed && 'justify-center px-0'
          )}
        >
          <Avatar className="h-8 w-8 shrink-0 ring-2 ring-white/20">
            <AvatarImage src={user.imageUrl} alt="" />
            <AvatarFallback className="bg-rh-mint text-xs font-semibold text-rh-teal">{name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{name}</span>
              <span className="flex items-center gap-1 truncate text-xs text-white/60">
                <ShieldCheck className="h-3 w-3" /> Administrator
              </span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{name}</p>
          {email && <p className="truncate text-xs text-neutral-500">{email}</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openUserProfile()}>
          <Settings className="mr-2 h-4 w-4 text-neutral-500" />
          Login &amp; security
        </DropdownMenuItem>
        <SoundsToggleItem />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ redirectUrl: '/' })}>
          <LogOut className="mr-2 h-4 w-4 text-neutral-500" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AdminSidebar({
  className,
  onNavigate,
  collapsible = true,
  /** Distinguishes the desktop rail from the mobile drawer so their active pills animate independently. */
  instance = 'rail',
}: {
  className?: string
  onNavigate?: () => void
  collapsible?: boolean
  instance?: string
}) {
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const reduceMotion = useReducedMotion()
  const sections = useMemo(() => visibleAdminNav(), [])
  const badges = useQuery(api.adminConsole.getNavBadges) as Badges | undefined

  const active = findActiveItem(pathname, new URLSearchParams(searchParams?.toString() ?? ''))
  const activeHref = active?.item.href
  const activeSection = active?.section.id

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const collapsed = collapsible && isCollapsed

  useEffect(() => {
    setOpen(readJSON<Record<string, boolean>>(OPEN_SECTIONS_KEY, { overview: true }))
    if (collapsible) setIsCollapsed(readJSON<boolean>(COLLAPSED_KEY, false))
  }, [collapsible])

  // The section holding the current page always opens
  useEffect(() => {
    if (!activeSection) return
    setOpen((prev) => (prev[activeSection] ? prev : { ...prev, [activeSection]: true }))
  }, [activeSection])

  const toggleSection = (id: string) => {
    setOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      writeJSON(OPEN_SECTIONS_KEY, next)
      return next
    })
  }

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      writeJSON(COLLAPSED_KEY, !prev)
      return !prev
    })
  }

  const sectionBadge = (section: AdminNavSection) =>
    section.items.reduce((sum, item) => sum + (item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0), 0)

  const renderItem = (item: AdminNavItem) => {
    const isActive = item.href === activeHref
    const Icon = item.icon
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-[7px] text-[13.5px] transition-colors active:scale-[0.98]',
          isActive ? 'font-semibold text-rh-teal dark:text-rh-night' : 'text-white/75 hover:bg-white/10 hover:text-white'
        )}
      >
        {isActive && (
          <motion.span
            layoutId={`admin-nav-pill-${instance}`}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }}
            className="absolute inset-0 rounded-xl bg-white shadow-sm"
          />
        )}
        <Icon className={cn('relative h-4 w-4 shrink-0', isActive ? 'text-rh-teal dark:text-rh-night' : 'text-white/60')} />
        <span className="relative flex-1 truncate">{item.title}</span>
        {item.badgeKey && (
          <span className="relative">
            <BadgeCount value={badges?.[item.badgeKey]} cap={badges?.cap} />
          </span>
        )}
      </Link>
    )
  }

  /** Collapsed rail: one icon per section, opening a menu of its pages. */
  const renderCollapsedSection = (section: AdminNavSection) => {
    const Icon = section.icon
    const isActive = section.id === activeSection
    return (
      <DropdownMenu key={section.id}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={section.label}
            className={cn(
              'relative mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
              isActive ? 'bg-white text-rh-teal dark:text-rh-night' : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            <BadgeCount value={sectionBadge(section)} collapsed />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-56">
          <DropdownMenuLabel className="text-xs uppercase tracking-wider text-neutral-500">{section.label}</DropdownMenuLabel>
          {section.items.map((item) => {
            const ItemIcon = item.icon
            const count = item.badgeKey ? badges?.[item.badgeKey] : undefined
            return (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href} onClick={onNavigate} className={cn(item.href === activeHref && 'font-semibold text-rh-teal')}>
                  <ItemIcon className="mr-2 h-4 w-4 text-neutral-500" />
                  <span className="flex-1">{item.title}</span>
                  {count ? <span className="text-xs tabular-nums text-amber-600">{count}</span> : null}
                </Link>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const renderSection = (section: AdminNavSection) => {
    // Overview is always open and has no header
    if (section.id === 'overview') {
      return (
        <div key={section.id} className="space-y-0.5">
          {section.items.map(renderItem)}
        </div>
      )
    }
    const isOpen = Boolean(open[section.id])
    const Icon = section.icon
    const count = sectionBadge(section)
    return (
      <div key={section.id}>
        <button
          type="button"
          onClick={() => toggleSection(section.id)}
          aria-expanded={isOpen}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
            section.id === activeSection ? 'text-white' : 'text-white/50 hover:text-white/80'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">{section.label}</span>
          {!isOpen && count > 0 && <span className="h-1.5 w-1.5 rounded-full bg-rh-amber" />}
          <motion.span animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: reduceMotion ? 0 : 0.18 }}>
            <ChevronDown className="h-3.5 w-3.5" />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-0.5 space-y-0.5 border-l border-white/10 pb-1 pl-2 ml-[18px]">{section.items.map(renderItem)}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-rh-teal text-white transition-[width] duration-200 dark:bg-rh-night',
        collapsed ? 'w-[72px]' : 'w-[17rem]',
        className
      )}
    >
      <div className={cn('flex h-16 shrink-0 items-center justify-between px-5', collapsed && 'justify-center px-0')}>
        {!collapsed && (
          <Link href={ADMIN_HOME} onClick={onNavigate} aria-label="Admin home" className="flex items-center gap-2">
            <PhysioBrand onBrand />
            <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90">
              Admin
            </span>
          </Link>
        )}
        {collapsible && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className="h-8 w-8 rounded-lg p-0 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 py-1">
        <nav aria-label="Admin" className={cn('px-3', collapsed ? 'space-y-1.5' : 'space-y-2')}>
          {collapsed ? sections.map(renderCollapsedSection) : sections.map(renderSection)}
        </nav>
      </ScrollArea>

      <div className="space-y-0.5 border-t border-white/10 p-3">
        <ClinicThemeToggle
          withLabel={!collapsed}
          className={cn(
            'w-full justify-start rounded-xl text-white/75 hover:bg-white/10 hover:text-white dark:text-white/75 dark:hover:bg-white/10',
            collapsed && 'mx-auto w-10 justify-center'
          )}
        />
        <AccountMenu collapsed={collapsed} />
      </div>
    </aside>
  )
}
