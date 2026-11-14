'use client'

/**
 * Learn › Spaces: what's live, what's coming up (with "Remind me"), and recent Spaces.
 * Admins and approved Rehabify physios can host.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Bell, BellRing, CalendarClock, Headphones, Loader2, Lock, Mic, Plus, Radio, Users } from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { displayFont, fieldClass, pillInk, pillLime, pillOutline } from '../shared'
import { TagBadge } from '../platform/identity'
import { errorText, relativeTime, SPACES_PATH, spacePath, spacesApi, type SpaceCard, type SpacesList } from '../social/socialApi'
import { groupTone } from '@/lib/learnAdminsApi'
import { EmptyState, JoinPrompt, Sheet, Skeleton, SpaceAvatar } from '../social/ui'

export function LiveEq({ className }: { className?: string }) {
  return (
    <span className={cn('space-eq space-live-eq', className)} aria-hidden>
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

const timeFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export function spaceWhen(space: Pick<SpaceCard, 'scheduledFor'>) {
  if (!space.scheduledFor) return 'Soon'
  return space.scheduledFor <= Date.now() ? 'Starting soon' : timeFormat.format(space.scheduledFor)
}

/** A group-only Space: just the group's members see it. */
function GroupPill({ group, dark = false }: { group: SpaceCard['group']; dark?: boolean }) {
  if (!group) return null
  const tone = groupTone(group.color)
  return (
    <span
      className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', dark ? 'bg-[rgb(255_255_255/0.1)] text-[rgb(255_255_255/0.85)]' : '')}
      style={dark ? undefined : { background: tone.soft, color: tone.ink }}
    >
      <Lock className="h-3 w-3 shrink-0" />
      <span className="truncate">{group.name}</span>
    </span>
  )
}

function LiveCard({ space, index }: { space: SpaceCard; index: number }) {
  return (
    <motion.li initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}>
      <Link
        href={spacePath(space.id)}
        className="group flex h-full flex-col justify-between gap-8 overflow-hidden rounded-[28px] bg-rh-ink p-6 text-white transition hover:-translate-y-0.5 hover:bg-black sm:p-7"
      >
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-rh-lime px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-rh-ink">
            <LiveEq className="h-2.5 text-rh-ink" /> Live
          </span>
          {space.group && (
            <span className="ml-2 align-middle">
              <GroupPill group={space.group} dark />
            </span>
          )}
          <h3 className={cn('mt-5 line-clamp-3 text-[24px] leading-tight tracking-tight sm:text-[28px]', displayFont)}>{space.title}</h3>
          {space.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/60">{space.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <SpaceAvatar name={space.host.name} imageUrl={space.host.imageUrl} size={40} className="bg-white/10 text-white/75 ring-2 ring-rh-lime ring-offset-2 ring-offset-rh-ink" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{space.host.name}</p>
            <p className="text-xs text-white/55">Host · started {relativeTime(space.startedAt ?? Date.now())}</p>
          </div>
          <span className={cn(pillLime, 'h-11 shrink-0 px-5')}>
            <Headphones className="h-4 w-4" /> Listen
          </span>
        </div>
      </Link>
    </motion.li>
  )
}

function UpcomingRow({ space, canAct }: { space: SpaceCard; canAct: boolean }) {
  const toggle = useMutation(spacesApi.toggleReminder)
  const [busy, setBusy] = useState(false)
  const remind = async () => {
    setBusy(true)
    try {
      const res = await toggle({ spaceId: space.id })
      if (res.reminded) {
        playSound('success')
        toast.success('We’ll let you know when it starts')
      }
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t set the reminder.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="flex flex-col gap-4 rounded-3xl border border-rh-ink/[0.08] bg-white p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="flex shrink-0 flex-col items-start sm:w-36">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rh-ink/55">
          <CalendarClock className="h-3.5 w-3.5" /> {spaceWhen(space)}
        </span>
      </div>
      <Link href={spacePath(space.id)} className="min-w-0 flex-1">
        {space.group && (
          <div className="mb-1.5">
            <GroupPill group={space.group} />
          </div>
        )}
        <p className="text-[17px] font-semibold leading-snug text-rh-ink hover:underline hover:underline-offset-4">{space.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SpaceAvatar name={space.host.name} imageUrl={space.host.imageUrl} size={22} />
          <span className="text-sm text-rh-ink/70">{space.host.name}</span>
          {space.host.tag && <TagBadge tag={space.host.tag} size="xs" />}
        </div>
      </Link>
      <div className="flex items-center gap-2 sm:justify-end">
        {space.reminderCount > 0 && <span className="mr-1 text-xs text-rh-ink/45">{space.reminderCount} set reminders</span>}
        {space.isHost ? (
          <Link href={spacePath(space.id)} className={cn(pillInk, 'h-10 px-4')}>
            <Mic className="h-4 w-4" /> Open
          </Link>
        ) : canAct ? (
          <button
            type="button"
            onClick={() => void remind()}
            disabled={busy}
            aria-pressed={space.reminded}
            className={cn(space.reminded ? pillInk : pillOutline, 'h-10 px-4')}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={String(space.reminded)}
                initial={{ rotate: -25, scale: 0.6, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                exit={{ rotate: 25, scale: 0.6, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className="flex"
              >
                {space.reminded ? <BellRing className="h-4 w-4 text-rh-lime" /> : <Bell className="h-4 w-4" />}
              </motion.span>
            </AnimatePresence>
            {space.reminded ? 'Reminder set' : 'Remind me'}
          </button>
        ) : null}
      </div>
    </li>
  )
}

type HostGroup = SpacesList['hostGroups'][number]

function HostSheet({ open, onClose, groups, canHostOpen }: { open: boolean; onClose: () => void; groups: HostGroup[]; canHostOpen: boolean }) {
  const router = useRouter()
  const create = useMutation(spacesApi.create)
  // Who it's for: everyone on Learn, or one group (group leads can only hold their groups' Spaces)
  const [audience, setAudience] = useState<string>(canHostOpen ? 'everyone' : (groups[0]?.id ?? 'everyone'))
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [at, setAt] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const scheduledFor = when === 'later' && at ? new Date(at).getTime() : undefined
      if (when === 'later' && !scheduledFor) throw new Error('Choose a date and time.')
      const group = groups.find((g) => g.id === audience)
      const id = await create({ title, description: description || undefined, scheduledFor, groupId: group?.id })
      playSound('success')
      onClose()
      router.push(spacePath(id))
    } catch (err) {
      toast.error(err instanceof Error && !('data' in err) ? err.message : errorText(err, 'Couldn’t set up the Space.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Host a Space"
      footer={
        <button type="button" onClick={() => void submit()} disabled={busy || title.trim().length < 4} className={cn(pillInk, 'h-12 w-full')}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {when === 'now' ? 'Set up and go live' : 'Schedule Space'}
        </button>
      }
    >
      <div className="space-y-5 pt-2">
        {groups.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-rh-ink">Who’s it for?</p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Who the Space is for">
              {canHostOpen && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={audience === 'everyone'}
                  onClick={() => setAudience('everyone')}
                  className={cn(
                    'rounded-full border px-3.5 py-2 text-sm font-semibold transition',
                    audience === 'everyone' ? 'border-rh-ink bg-rh-cream text-rh-ink' : 'border-rh-ink/10 text-rh-ink/70 hover:border-rh-ink/25'
                  )}
                >
                  Everyone on Learn
                </button>
              )}
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={audience === g.id}
                  onClick={() => setAudience(g.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition',
                    audience === g.id ? 'border-rh-ink bg-rh-cream text-rh-ink' : 'border-rh-ink/10 text-rh-ink/70 hover:border-rh-ink/25'
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: groupTone(g.color).dot }} aria-hidden />
                  {g.name}
                </button>
              ))}
            </div>
            {audience !== 'everyone' && <p className="mt-2 text-xs text-rh-ink/50">Only the group’s members see it. They get a notification now and when you go live.</p>}
          </div>
        )}
        <div>
          <label htmlFor="space-title" className="text-sm font-semibold text-rh-ink">
            What’s it about?
          </label>
          <input
            id="space-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="e.g. Ask me anything: starting out in MSK physio"
            className={cn(fieldClass, 'mt-2')}
          />
        </div>
        <div>
          <label htmlFor="space-desc" className="text-sm font-semibold text-rh-ink">
            A line for listeners <span className="font-normal text-rh-ink/45">(optional)</span>
          </label>
          <input
            id="space-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
            placeholder="Who it’s for, what you’ll cover"
            className={cn(fieldClass, 'mt-2')}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['now', 'later'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWhen(w)}
              aria-pressed={when === w}
              className={cn(
                'rounded-2xl border px-4 py-3.5 text-left transition',
                when === w ? 'border-rh-ink bg-rh-cream' : 'border-rh-ink/10 hover:border-rh-ink/25'
              )}
            >
              <span className="block text-sm font-semibold text-rh-ink">{w === 'now' ? 'Start now' : 'Schedule'}</span>
              <span className="mt-0.5 block text-xs text-rh-ink/55">{w === 'now' ? 'Check your mic, then go live' : 'Listeners can set a reminder'}</span>
            </button>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {when === 'later' && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <label htmlFor="space-at" className="text-sm font-semibold text-rh-ink">
                Date and time
              </label>
              <input id="space-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={cn(fieldClass, 'mt-2')} />
            </motion.div>
          )}
        </AnimatePresence>
        <p className="text-xs leading-5 text-rh-ink/50">Spaces aren’t recorded. Remind speakers not to share anything that could identify a patient.</p>
      </div>
    </Sheet>
  )
}

export function SpacesHome() {
  const data = useQuery(spacesApi.list, {})
  const [hosting, setHosting] = useState(false)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={cn('text-[36px] leading-tight tracking-tight text-rh-ink sm:text-[48px]', displayFont)}>Spaces</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-6 text-rh-ink/60">
            Live audio conversations with Rehabify physiotherapists. Listen in, raise your hand and ask your question.
          </p>
        </div>
        {data?.canHost && (
          <button type="button" onClick={() => setHosting(true)} className={cn(pillInk, 'h-12 self-start px-6 sm:self-auto')}>
            <Plus className="h-4 w-4" /> Host a Space
          </button>
        )}
      </div>

      {data === undefined ? (
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 rounded-[28px]" />
          <Skeleton className="h-64 rounded-[28px]" />
        </div>
      ) : (
        <>
          {data.live.length > 0 && (
            <section aria-labelledby="live-heading" className="mt-10">
              <h2 id="live-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-rh-ink/50">
                <Radio className="h-3.5 w-3.5" /> Live now
              </h2>
              <ul className="mt-4 grid gap-4 md:grid-cols-2">
                {data.live.map((space, i) => (
                  <LiveCard key={space.id} space={space} index={i} />
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="upcoming-heading" className="mt-12">
            <h2 id="upcoming-heading" className="text-sm font-semibold uppercase tracking-[0.14em] text-rh-ink/50">
              Coming up
            </h2>
            <div className="mt-4">
              {data.upcoming.length === 0 ? (
                data.live.length === 0 ? (
                  <EmptyState icon={<Radio className="h-5 w-5" />} title="No Spaces scheduled yet">
                    {data.canHost ? 'Host the first one: an AMA, a case discussion or exam tips.' : 'When a Rehabify physio schedules a Space, it shows up here.'}
                  </EmptyState>
                ) : (
                  <p className="text-sm text-rh-ink/55">Nothing else scheduled yet.</p>
                )
              ) : (
                <ul className="space-y-3">
                  {data.upcoming.map((space) => (
                    <UpcomingRow key={space.id} space={space} canAct={Boolean(data.member)} />
                  ))}
                </ul>
              )}
            </div>
          </section>

          {!data.member && (
            <div className="mt-12">
              <JoinPrompt signedIn={data.signedIn} returnTo={SPACES_PATH} />
            </div>
          )}

          {data.recent.length > 0 && (
            <section aria-labelledby="recent-heading" className="mt-12">
              <h2 id="recent-heading" className="text-sm font-semibold uppercase tracking-[0.14em] text-rh-ink/50">
                Recent
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.recent.map((space) => (
                  <li key={space.id} className="rounded-3xl border border-rh-ink/[0.07] p-5">
                    <p className="line-clamp-2 font-semibold leading-snug text-rh-ink">{space.title}</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-rh-ink/55">
                      <SpaceAvatar name={space.host.name} imageUrl={space.host.imageUrl} size={20} />
                      <span className="truncate">{space.host.name}</span>
                      <span>·</span>
                      <span>{relativeTime(space.endedAt ?? space.startedAt ?? Date.now())}</span>
                      {space.peakListeners > 1 && (
                        <span className="ml-auto flex shrink-0 items-center gap-1">
                          <Users className="h-3 w-3" /> {space.peakListeners}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {data?.canHost && (
        <HostSheet open={hosting} onClose={() => setHosting(false)} groups={data.hostGroups} canHostOpen={data.canHostOpen} key={String(hosting)} />
      )}
    </main>
  )
}
