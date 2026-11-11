import { cn } from '@/lib/utils'
import type { JoinStatus, PatientJoinState } from './refs'

export const JOIN_STATUS_LABELS: Record<JoinStatus, string> = {
  not_invited: 'Not invited',
  invited: 'Invited',
  joined: 'Joined',
  programme_started: 'Programme started',
}

const TONES: Record<JoinStatus, string> = {
  not_invited: 'bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300',
  invited: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  joined: 'bg-rh-honeydew text-rh-ink dark:bg-rh-lime/15 dark:text-rh-lime',
  programme_started: 'bg-rh-lime text-rh-ink',
}

/** Not invited · Invited · Joined · Programme started, on the patient lists and records. */
export function JoinStatusChip({ join, className }: { join: PatientJoinState | null | undefined; className?: string }) {
  if (!join) return null
  const opened = join.status === 'invited' && join.openedAt
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5',
        TONES[join.status],
        className
      )}
      title={opened ? 'They opened the link but haven’t finished joining' : undefined}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {JOIN_STATUS_LABELS[join.status]}
      {opened ? ' · opened' : ''}
    </span>
  )
}

/** Still needs their link (or a reminder). */
export const needsInvite = (join: PatientJoinState | null | undefined) =>
  Boolean(join && join.canSendLink && (join.status === 'not_invited' || join.status === 'invited'))
