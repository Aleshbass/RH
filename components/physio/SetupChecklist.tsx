'use client'

import Link from 'next/link'
import { Check, ChevronRight } from '@/components/icons'
import { cn } from '@/lib/utils'

export type SetupItem = {
  id: string
  title: string
  description: string
  href: string
  done: boolean
  required: boolean
}

export type SetupStatus = {
  items: SetupItem[]
  requiredRemaining: number
  isComplete: boolean
  approvalStatus: 'pending_review' | 'approved' | 'declined' | null
  approvalComments?: string | null
  isListed: boolean
  isBookable: boolean
}

/** Progress across the required items only; optional ones never hold anyone back. */
export function setupProgress(setup: Pick<SetupStatus, 'items'>) {
  const required = setup.items.filter((item) => item.required)
  const done = required.filter((item) => item.done).length
  return { done, total: required.length }
}

export function SetupProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={`${done} of ${total} setup steps done`}
    >
      <div
        className="h-full rounded-full bg-[#005b57] transition-[width] duration-500 ease-out dark:bg-[#2dd4bf]"
        style={{ width: `${total === 0 ? 100 : (done / total) * 100}%` }}
      />
    </div>
  )
}

/**
 * Rows for each setup item. Done items stay visible (ticked) so progress is obvious;
 * every open item links straight to the page that finishes it.
 */
export function SetupChecklistRows({
  items,
  onNavigate,
  showOptional = true,
}: {
  items: SetupItem[]
  onNavigate?: () => void
  showOptional?: boolean
}) {
  const visible = showOptional ? items : items.filter((item) => item.required)
  return (
    <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {visible.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            onClick={onNavigate}
            className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 sm:px-5"
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                item.done
                  ? 'border-[#005b57] bg-[#005b57] text-white dark:border-[#2dd4bf] dark:bg-[#2dd4bf] dark:text-neutral-950'
                  : 'border-neutral-300 dark:border-neutral-600'
              )}
              aria-hidden="true"
            >
              {item.done && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block text-sm font-medium',
                  item.done
                    ? 'text-neutral-400 line-through decoration-neutral-300 dark:text-neutral-500 dark:decoration-neutral-600'
                    : 'text-neutral-900 dark:text-white'
                )}
              >
                {item.title}
                {!item.required && (
                  <span className="ml-2 text-xs font-normal text-neutral-400 no-underline dark:text-neutral-500">
                    Optional
                  </span>
                )}
              </span>
              {!item.done && (
                <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">{item.description}</span>
              )}
            </span>
            {!item.done && (
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 dark:text-neutral-600" />
            )}
            <span className="sr-only">{item.done ? 'Done' : 'Not done yet'}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** The Home-page card. Hidden once the required items are done. */
export function SetupChecklistCard({ setup }: { setup: SetupStatus }) {
  if (setup.isComplete) return null
  const { done, total } = setupProgress(setup)
  const underReview = setup.approvalStatus === 'pending_review'

  return (
    <section
      data-tour="setup"
      className="overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-soft dark:border-white/[0.06] dark:bg-rh-ink-2 dark:shadow-none"
    >
      <div className="px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Finish setting up</h2>
          <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
            {done} of {total} done
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {underReview
            ? 'Do these while we review your application, so you can start the day you’re approved.'
            : 'Patients can find and book you once these are done.'}
        </p>
        <SetupProgressBar done={done} total={total} className="mt-3" />
      </div>
      <div className="border-t border-neutral-100 dark:border-white/[0.07]">
        <SetupChecklistRows items={setup.items} />
      </div>
    </section>
  )
}
