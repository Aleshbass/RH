'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { ArrowRight, HeartHandshake } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { IconChip, Panel, StatusBadge } from '@/components/physio/ui'
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

    return (
      <Panel
        title={
          <span className="flex items-center gap-2">
            Rehabify Access
            <StatusBadge tone="green">Approved</StatusBadge>
          </span>
        }
        description={`Your assisted rate with ${award.physiotherapistName}`}
      >
        <div className="space-y-4 px-5 pb-5 pt-3">
          <p className="text-sm text-neutral-600">
            {usedUp
              ? "You've used all the sessions in your arrangement."
              : `${award.sessionsLeft} of ${award.sessionsGranted} session${award.sessionsGranted === 1 ? '' : 's'} left`}
            {` · until ${format(award.expiresAt, 'd MMMM yyyy')}`}
          </p>
          {services.length > 0 && (
            <ul className="space-y-2">
              {services.map((service) => (
                <li key={service.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rh-canvas p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-rh-night">{service.name}</p>
                    <p className="text-sm tabular-nums">
                      <span className="font-semibold text-rh-night">{formatKobo(service.assistedPriceKobo ?? 0)}</span>
                      {service.standardPriceKobo > (service.assistedPriceKobo ?? 0) && (
                        <s className="ml-2 text-neutral-400">{formatKobo(service.standardPriceKobo)}</s>
                      )}
                    </p>
                  </div>
                  {!usedUp && (
                    <Link
                      href={`/book/${award.physiotherapistId}/${service.id}?access=${award.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-rh-teal hover:underline"
                    >
                      Book with your Access rate
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
    <Panel title="Rehabify Access">
      <div className="flex items-start gap-3 px-5 pb-5 pt-3">
        <IconChip icon={HeartHandshake} tone="teal" />
        <div className="min-w-0 space-y-1 text-sm">
          <p className="text-rh-night">
            Your application: <span className="font-semibold">{ACCESS_STATUS_LABELS[application.status] ?? application.status}</span>
          </p>
          <p className="text-xs text-neutral-500">Sent {format(application.createdAt, 'd MMMM yyyy')}</p>
          {application.status === 'declined' && application.decisionReason && (
            <p className="text-neutral-600">{application.decisionReason}</p>
          )}
        </div>
      </div>
    </Panel>
  )
}
