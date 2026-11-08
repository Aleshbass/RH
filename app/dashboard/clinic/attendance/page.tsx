'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Bell, Clock, History, Loader2, MapPin, Settings, Timer, Users } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EmptyState, LoadingBlocks, PageShell, Panel, StatTile, secondaryButtonClass } from '@/components/clinic/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { formatWorked, workedMs } from '@/convex/helpers/clinicClock'
import { clockError, clockRefs, type ClockBoard } from '@/components/clock/clockApi'
import { ClockSettingsDrawer } from '@/components/clinic/attendance/ClockSettingsDrawer'
import { ShiftDrawer, type ShiftTarget } from '@/components/clinic/attendance/ShiftDrawer'
import { DayTimeline, TeamToday } from '@/components/clinic/attendance/TodayBoard'
import { ClockHistory } from '@/components/clinic/attendance/ClockHistory'
import { useLagosToday, useTicker } from '@/components/clinic/attendance/shared'

type Board = NonNullable<ClockBoard>

const POINTS = [
  { icon: Timer, title: 'Press and hold to clock in', text: 'From their Rehabify dashboard, on their phone. Breaks too.' },
  { icon: MapPin, title: 'Checks they’re at the clinic', text: 'Away from it, they say why, or you can block it.' },
  { icon: Bell, title: 'Reminders if they forget', text: 'To clock in after opening and out after closing.' },
  { icon: Users, title: 'Hours ready for payroll', text: 'Totals per person, late arrivals, export in one tap.' },
]

/** Clock-in is off: what it does, and the one button to set it up. */
function ClockIntro({ canManage, onStart }: { canManage: boolean; onStart: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-rh-ink px-5 py-7 text-white dark:bg-rh-ink-2 sm:px-8 sm:py-9">
      {/* Flat brand shapes: no gradients, no glows */}
      <span aria-hidden className="pointer-events-none absolute right-14 top-10 hidden h-16 w-16 rounded-2xl bg-rh-lime sm:block" style={{ transform: 'rotate(14deg)' }} />
      <span aria-hidden className="pointer-events-none absolute right-36 top-28 hidden h-7 w-7 rounded-full bg-rh-rose sm:block" />
      <div className="relative max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Clock-in for your team</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Know who’s in, without a sign-in sheet.</h2>
        <p className="mt-2 text-[15px] text-white/75">Your clinicians clock in when they arrive and out when they leave. You see it live.</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {POINTS.map(({ icon: PointIcon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.08]">
                <PointIcon className="h-4 w-4 text-rh-lime" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="mt-0.5 block text-[13px] text-white/65">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-7">
          {canManage ? (
            <Button className="h-11 rounded-xl bg-rh-lime px-5 text-rh-ink hover:bg-rh-lime-deep active:scale-[0.98]" onClick={onStart}>
              <Clock className="mr-2 h-4 w-4" />
              Set up clock-in
            </Button>
          ) : (
            <p className="text-sm text-white/75">Only the clinic owner can switch clock-in on.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function WeekTotal({ board, now }: { board: Board; now: number }) {
  return <>{formatWorked(board.weekShifts.reduce((sum, s) => sum + workedMs(s, now), 0))}</>
}

export default function ClinicClockPage() {
  const today = useLagosToday()
  const board = useQuery(clockRefs.getClockBoard, { today })
  const now = useTicker(15_000)
  const save = useMutation(clockRefs.saveClockSettings)
  const [tab, setTab] = useState<'today' | 'history'>('today')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<ShiftTarget | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const [switching, setSwitching] = useState(false)

  if (board === undefined) {
    return (
      <PageShell title="Clock-in">
        <LoadingBlocks rows={4} />
      </PageShell>
    )
  }
  if (board === null) {
    return (
      <PageShell title="Clock-in">
        <Panel>
          <EmptyState icon={<Clock />} title="Clock-in isn’t part of your role" description="Ask the clinic owner if you need it." />
        </Panel>
      </PageShell>
    )
  }

  const s = board.settings
  const expected = board.people.filter((p) => !p.exempt)
  const inNow = board.people.filter((p) => p.status === 'working' || p.status === 'on_break')
  const onBreak = board.people.filter((p) => p.status === 'on_break').length
  const lateToday = board.people.filter((p) => p.shifts.some((x) => x.lateMinutes !== null)).length
  const notIn = expected.filter((p) => p.status === 'not_in')
  const opened = board.hoursToday ? now >= board.hoursToday.openAt : false

  const setEnabled = async (enabled: boolean) => {
    setSwitching(true)
    try {
      await save({ enabled })
      playSound(enabled ? 'approve' : 'reject')
      toast.success(enabled ? 'Clock-in is on. Your team has been told.' : 'Clock-in is off. Past hours are kept.')
      setConfirmOff(false)
    } catch (error) {
      toast.error(clockError(error, 'Could not change clock-in. Try again.'))
    } finally {
      setSwitching(false)
    }
  }

  const onSwitch = (checked: boolean) => {
    if (!checked) return setConfirmOff(true)
    // First time: the setup drawer, so the clinic gets pinned before anyone clocks in
    if (s.enabledAt === null) return setSettingsOpen(true)
    void setEnabled(true)
  }

  return (
    <PageShell
      title="Clock-in"
      description="Who’s in right now, when they arrived and the hours they’ve worked."
      info="Clinicians clock in and out from their Rehabify dashboard. Times are Lagos time. Only you can change the settings or correct hours; every correction keeps the original times and tells the clinician."
      actions={
        board.canManage ? (
          <>
            <label className="flex h-10 cursor-pointer items-center gap-2.5 rounded-xl border border-pt-line bg-pt-surface px-3.5 text-sm font-medium text-pt-ink">
              {switching ? <Loader2 className="h-4 w-4 animate-spin text-pt-muted" /> : null}
              {s.enabled ? 'On' : 'Off'}
              <Switch checked={s.enabled} disabled={switching} onCheckedChange={onSwitch} aria-label="Clock-in for your team" />
            </label>
            {s.enabled && (
              <Button className={cn(secondaryButtonClass, 'h-10')} onClick={() => setSettingsOpen(true)}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {!s.enabled ? (
        <>
          <ClockIntro canManage={board.canManage} onStart={() => setSettingsOpen(true)} />
          {s.enabledAt !== null && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold tracking-tight text-pt-ink">Past hours</h2>
              <ClockHistory today={board.today} canManage={board.canManage} onEdit={setEditing} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="In now"
              value={`${inNow.length}`}
              hint={`of ${expected.length} clinician${expected.length === 1 ? '' : 's'}`}
              icon={Users}
              tone="green"
            />
            <StatTile
              label="Not in yet"
              value={opened ? notIn.length : '–'}
              hint={opened ? (notIn.length ? notIn.slice(0, 2).map((p) => p.name.split(' ')[0]).join(', ') + (notIn.length > 2 ? '…' : '') : 'Everyone’s here') : 'Before opening'}
              icon={Clock}
              tone={opened && notIn.length > 0 ? 'attention' : 'default'}
            />
            <StatTile label="Late today" value={lateToday} hint={onBreak ? `${onBreak} on a break now` : 'After opening + grace'} icon={Timer} tone="blue" />
            <StatTile label="This week" value={<WeekTotal board={board} now={now} />} hint="hours, whole team" icon={History} tone="violet" />
          </div>

          {board.reviewCount > 0 && board.canManage && (
            <div className="flex items-center gap-3 rounded-2xl bg-pt-primary px-4 py-3 text-pt-on-primary">
              <Clock className="h-4 w-4 shrink-0 text-pt-accent" />
              <p className="text-sm">
                <span className="font-semibold">
                  {board.reviewCount} shift{board.reviewCount === 1 ? '' : 's'} this week need{board.reviewCount === 1 ? 's' : ''} a look.
                </span>{' '}
                <span className="opacity-80">Someone didn’t clock out, so Rehabify closed it at closing time. Correct it or mark it as right.</span>
              </p>
            </div>
          )}

          {/* Without a pin there's nothing to compare a phone's location with, so no "At the clinic" */}
          {board.canManage && (!s.locationCheck || !s.site) && (
            <div className="flex flex-col gap-3 rounded-2xl border border-pt-line bg-pt-surface px-4 py-3 sm:flex-row sm:items-center">
              <MapPin className="h-4 w-4 shrink-0 text-pt-muted" />
              <p className="flex-1 text-sm text-pt-muted">
                <span className="font-semibold text-pt-ink">
                  {s.locationCheck ? 'Pin your clinic to see who clocks in there.' : 'Location check is off.'}
                </span>{' '}
                {s.locationCheck
                  ? 'Drop a pin while you’re at the clinic. Each clock-in then shows “At the clinic” or how far away it was.'
                  : 'Turn it on and pin your clinic to see whether each clock-in happened at the clinic.'}
              </p>
              <Button className={cn(secondaryButtonClass, 'h-9 shrink-0')} onClick={() => setSettingsOpen(true)}>
                {s.locationCheck ? 'Pin the clinic' : 'Turn it on'}
              </Button>
            </div>
          )}

          <div role="tablist" aria-label="Clock-in views" className="inline-flex gap-1 rounded-2xl bg-pt-sunken p-1">
            {(['today', 'history'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  'rounded-xl px-4 py-2 text-sm font-medium transition',
                  tab === key ? 'bg-pt-surface text-pt-ink shadow-pt dark:shadow-none' : 'text-pt-muted hover:text-pt-ink'
                )}
              >
                {key === 'today' ? 'Today' : 'Hours & history'}
              </button>
            ))}
          </div>

          {tab === 'today' ? (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
              <div className="xl:col-span-3">
                <TeamToday board={board} now={now} onEdit={setEditing} />
              </div>
              <div className="xl:col-span-2">
                <DayTimeline board={board} now={now} />
              </div>
            </div>
          ) : (
            <ClockHistory today={board.today} canManage={board.canManage} onEdit={setEditing} />
          )}
        </>
      )}

      {board.canManage && (
        <ClockSettingsDrawer
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={s}
          people={board.people}
          hoursToday={board.hoursToday}
        />
      )}
      <ShiftDrawer target={editing} onClose={() => setEditing(null)} />

      <AlertDialog open={confirmOff} onOpenChange={(open) => !open && !switching && setConfirmOff(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch clock-in off?</AlertDialogTitle>
            <AlertDialogDescription>
              {inNow.length > 0
                ? `${inNow.length} clinician${inNow.length === 1 ? ' is' : 's are'} clocked in and will be clocked out now. `
                : ''}
              Reminders stop and the button leaves their dashboard. Past hours are kept, and you can switch it back on any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={switching}>Keep it on</AlertDialogCancel>
            <AlertDialogAction
              disabled={switching}
              onClick={(e) => {
                e.preventDefault()
                void setEnabled(false)
              }}
            >
              {switching && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Switch off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
