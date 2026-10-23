'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { ArrowRight, HeartHandshake } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { IconChip, Panel, StatusBadge } from '@/components/patient/ui'
import { formatKobo } from '@/lib/rehabify-services'
import { ACCESS_STATUS_LABELS } from '@/lib/rehabify-access'

/** api.rehabifyAccess.getMyAccess */
type MyAccess = {
  application: { id: string; status: string; createdAt: number; decisionReason: string | null } | null
  award: {
    id: string
    physiotherapistId: string
    physiotherapistName: string
    sessionsGranted: number
    sessionsLeft: number
    expiresAt: number
    services: { id: string; name: string; assistedPriceKobo: number | null; standardPriceKobo: number }[]
  } | null
} | null

const ACCESS_INFO =
  'Rehabify Access is assisted care. Approved patients pay a reduced rate for a set number of sessions with their physio, until the date shown.'

/**
 * Rehabify Access (assisted care): the patient's approved rate and how to book with it, or where
 * their application stands. Renders nothing for everyone else.
 */
export function AccessAwardCard() {
  const access = useQuery(api.rehabifyAccess.getMyAccess) as MyAccess | undefined
  if (!access) return null
  const { application, award } = access

  if (award) {
    const services = award.services.filter((service) => service.assistedPriceKobo !== null)
    const usedUp = award.sessionsLeft <= 0
    const leftShare = award.sessionsGranted > 0 ? Math.min(1, Math.max(0, award.sessionsLeft / award.sessionsGranted)) : 0

    return (
      <Panel
        title={
          <span className="flex items-center gap-2">
            Rehabify Access
            <StatusBadge tone="green">Approved</StatusBadge>
          </span>
        }
        info={ACCESS_INFO}
        description={`Your assisted rate with ${award.physiotherapistName}`}
      >
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-pt-ink">
                {usedUp
                  ? "You've used all the sessions in your arrangement."
                  : `${award.sessionsLeft} of ${award.sessionsGranted} session${award.sessionsGranted === 1 ? '' : 's'} left`}
              </span>
              <span className="text-xs text-pt-muted">Until {format(award.expiresAt, 'd MMMM yyyy')}</span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-pt-sunken"
              role="progressbar"
              aria-label="Sessions left"
              aria-valuemin={0}
              aria-valuemax={award.sessionsGranted}
              aria-valuenow={Math.max(0, award.sessionsLeft)}
            >
              <div className="h-full rounded-full bg-pt-accent transition-all" style={{ width: `${leftShare * 100}%` }} />
            </div>
          </div>

          {services.length > 0 && (
            <ul className="space-y-2">
              {services.map((service) => (
                <li key={service.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-pt-sunken p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-pt-ink">{service.name}</p>
                    <p className="text-sm tabular-nums">
                      <span className="font-semibold text-pt-ink">{formatKobo(service.assistedPriceKobo ?? 0)}</span>
                      {service.standardPriceKobo > (service.assistedPriceKobo ?? 0) && (
                        <s className="ml-2 text-pt-faint">{formatKobo(service.standardPriceKobo)}</s>
                      )}
                    </p>
                  </div>
                  {!usedUp && (
                    <Link
                      href={`/book/${award.physiotherapistId}/${service.id}?access=${award.id}`}
                      className="inline-flex items-center gap-1 rounded-xl bg-pt-primary px-3.5 py-2 text-sm font-medium text-pt-on-primary transition hover:bg-pt-primary-hover active:scale-[0.98]"
                    >
                      Book at this rate
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    )
  }

  if (!application || application.status === 'withdrawn') return null

  return (
    <Panel title="Rehabify Access" info={ACCESS_INFO}>
      <div className="flex items-start gap-3">
        <IconChip icon={HeartHandshake} tone="violet" />
        <div className="min-w-0 space-y-1 text-sm">
          <p className="text-pt-ink">
            Your application: <span className="font-semibold">{ACCESS_STATUS_LABELS[application.status] ?? application.status}</span>
          </p>
          <p className="text-xs text-pt-muted">Sent {format(application.createdAt, 'd MMMM yyyy')}</p>
          {application.status === 'declined' && application.decisionReason && (
            <p className="text-pt-muted">{application.decisionReason}</p>
          )}
        </div>
      </div>
    </Panel>
  )
}
