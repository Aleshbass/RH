'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { ChevronRight } from '@/components/icons'
import { Panel } from '@/components/clinic/ui'
import { lagosTime } from '@/convex/helpers/lagosTime'
import { formatWorked, workedMs } from '@/convex/helpers/clinicClock'
import { clockRefs } from '@/components/clock/clockApi'
import { CLOCK_PAGE, PersonAvatar, STATUS_ORDER, useLagosToday, useTicker } from './shared'

/** Clinic Home: who's clocked in right now. Only while the clinic uses clock-in. */
export function WhosInCard() {
  const today = useLagosToday()
  const board = useQuery(clockRefs.getClockBoard, { today })
  const now = useTicker(30_000)
  if (!board || !board.settings.enabled) return null

  const people = [...board.people].filter((p) => !p.exempt || p.shifts.length > 0).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  const inNow = people.filter((p) => p.status === 'working' || p.status === 'on_break').length
  const opened = board.hoursToday ? now >= board.hoursToday.openAt : false

  return (
    <Panel
      title="Who’s in"
      description={people.length ? `${inNow} of ${people.length} clocked in` : 'No clinicians on the team yet'}
      actions={
        <Link href={CLOCK_PAGE} className="flex items-center gap-0.5 text-sm font-medium text-pt-muted hover:text-pt-ink">
          Clock-in
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      }
      bodyClassName="px-2 pb-2 sm:px-3"
    >
      <ul>
        {people.slice(0, 6).map((person) => {
          const open = person.shifts.find((s) => s.clockOutAt === null)
          const worked = person.shifts.reduce((sum, s) => sum + workedMs(s, now), 0)
          const line =
            person.status === 'working'
              ? `Since ${lagosTime(open!.clockInAt)}`
              : person.status === 'on_break'
                ? 'On a break'
                : person.status === 'out'
                  ? `Left at ${lagosTime(person.shifts[person.shifts.length - 1].clockOutAt ?? now)}`
                  : opened
                    ? 'Not in yet'
                    : 'Not in yet · before opening'
          return (
            <li key={person.userId}>
              <Link href={CLOCK_PAGE} className="flex items-center gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-pt-hover">
                <PersonAvatar name={person.name} imageUrl={person.imageUrl} status={person.status} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-pt-ink">{person.name}</span>
                  <span className="block truncate text-xs text-pt-muted">{line}</span>
                </span>
                {worked > 0 && <span className="shrink-0 text-xs font-semibold tabular-nums text-pt-muted">{formatWorked(worked)}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
      {people.length > 6 && (
        <Link href={CLOCK_PAGE} className="block px-3 pb-2 pt-1 text-xs font-medium text-pt-muted hover:text-pt-ink">
          And {people.length - 6} more
        </Link>
      )}
    </Panel>
  )
}
