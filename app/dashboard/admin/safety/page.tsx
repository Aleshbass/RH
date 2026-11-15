'use client'

/**
 * Visit safety (convex/homeVisitSafety.ts): help alerts and overdue home visits, newest first,
 * with one-tap calls and the phone's location; then every home visit under way; then recently
 * closed alerts. An alert closes only once someone has spoken to the physio and written what happened.
 */

import { useState } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { Loader2, MapPin, Phone, ShieldAlert, ShieldCheck, TriangleAlert, UserRound } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { AdminPage, EmptyState, PageHeader, Panel, StatusBadge, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { lagosDateTime, lagosTime } from '@/convex/helpers/lagosTime'
import { cn } from '@/lib/utils'
import { mapsHref, safetyApi, telHref, type AlertRow, type LiveVisitRow } from '@/components/visit-safety/safetyApi'

const ago = (ms: number) => `${formatDistanceToNowStrict(ms)} ago`

function errorText(error: unknown) {
  const data = (error as { data?: unknown })?.data
  return typeof data === 'string' && data ? data : 'That didn’t work. Please try again.'
}

function CallLink({ phone, label }: { phone: string | null; label: string }) {
  if (!phone) return <span className="text-sm text-neutral-500">{label}: no phone number</span>
  return (
    <a href={telHref(phone)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink underline-offset-2 hover:underline dark:text-white">
      <Phone className="h-3.5 w-3.5" />
      {label} {phone}
    </a>
  )
}

function AlertCard({ alert }: { alert: AlertRow }) {
  const handle = useMutation(safetyApi.handleAlert)
  const resolve = useMutation(safetyApi.resolveAlert)
  const [closing, setClosing] = useState(false)
  const [note, setNote] = useState('')
  const [falseAlarm, setFalseAlarm] = useState(false)
  const [closeVisit, setCloseVisit] = useState(true)
  const [busy, setBusy] = useState(false)
  const panic = alert.kind === 'panic'
  const where = alert.location ?? alert.lastPing

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await action()
      toast.success(done)
      setClosing(false)
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-3xl border p-5',
        alert.status === 'open' ? 'border-rose-300 bg-rh-blush/60 dark:border-rose-500/40 dark:bg-rose-500/10' : 'border-black/[0.06] bg-white dark:border-white/10 dark:bg-rh-ink-2'
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-rh-canvas dark:bg-rh-ink-3">
          {alert.physioImage ? (
            <Image src={alert.physioImage} alt="" fill sizes="56px" className="object-cover" unoptimized />
          ) : (
            <UserRound className="m-4 h-6 w-6 text-neutral-400" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={alert.status === 'open' ? 'red' : 'amber'}>
              {panic ? 'Help button' : 'No answer after visit'}
            </StatusBadge>
            <span className="text-xs text-neutral-500">{ago(alert.createdAt)} · {lagosDateTime(alert.createdAt)}</span>
            {alert.handledBy && <span className="text-xs text-neutral-500">· {alert.handledBy} is handling it</span>}
          </div>
          <p className="text-base font-semibold">
            {alert.physioName}
            {alert.staffNumber && <span className="font-normal text-neutral-500"> · {alert.staffNumber}</span>}
          </p>
          {alert.patientName && (
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Visiting {alert.patientName}
              {alert.address && <> at {alert.address}</>}
            </p>
          )}
          {alert.physioSafeAt && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-[#047857] dark:text-rh-lime">
              <ShieldCheck className="h-4 w-4" />
              They pressed “I’m safe” at {lagosTime(alert.physioSafeAt)}. Call to confirm.
            </p>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            <CallLink phone={alert.physioPhone} label="Physio" />
            {alert.patientPhone && <CallLink phone={alert.patientPhone} label="Patient" />}
            {where ? (
              <a href={mapsHref(where.lat, where.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-2 hover:underline">
                <MapPin className="h-3.5 w-3.5" />
                Phone location{where.at ? ` (${ago(where.at)})` : ''}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
                <MapPin className="h-3.5 w-3.5" /> No location from the phone
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {alert.status === 'open' && (
            <Button className={cn(primaryButtonClass, 'h-10')} disabled={busy} onClick={() => void run(() => handle({ alertId: alert._id }), 'The team can see you’re on it.')}>
              I’m on it
            </Button>
          )}
          <Button className={cn(softButtonClass, 'h-10')} disabled={busy} onClick={() => setClosing((v) => !v)}>
            Close alert
          </Button>
        </div>
      </div>

      {closing && (
        <div className="mt-4 space-y-3 rounded-2xl bg-white p-4 dark:bg-rh-ink-3">
          <Label htmlFor={`note-${alert._id}`} className="text-sm font-medium">What happened? (after you spoke to them)</Label>
          <Textarea
            id={`note-${alert._id}`}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 1000))}
            placeholder="e.g. Called Ada at 3:42 PM. Pressed by mistake, all fine."
            className={cn(inputClass, 'min-h-[80px]')}
          />
          <div className="flex flex-wrap items-center gap-5 text-sm">
            <label className="flex items-center gap-2">
              <Switch checked={falseAlarm} onCheckedChange={setFalseAlarm} />
              False alarm
            </label>
            {alert.patientName && (
              <label className="flex items-center gap-2">
                <Switch checked={closeVisit} onCheckedChange={setCloseVisit} />
                Close the visit too (they’ve left)
              </label>
            )}
          </div>
          <Button
            className={cn(primaryButtonClass, 'h-10')}
            disabled={busy || note.trim().length < 3}
            onClick={() => void run(() => resolve({ alertId: alert._id, note, falseAlarm, closeVisit }), 'Alert closed. The physio has been told.')}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Close alert
          </Button>
        </div>
      )}
    </div>
  )
}

function VisitRow({ visit }: { visit: LiveVisitRow }) {
  const closeVisit = useMutation(safetyApi.adminCloseVisit)
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {visit.physioName} <span className="font-normal text-neutral-500">→ {visit.patientName}</span>
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {visit.stage === 'on_the_way' ? `On the way since ${lagosTime(visit.onTheWayAt)}` : `Arrived ${visit.arrivedAt ? lagosTime(visit.arrivedAt) : ''}`}
          {' · '}due to finish {lagosTime(visit.expectedEndAt)}
          {visit.address && <> · {visit.address}</>}
        </p>
        {visit.doorCheck === 'skipped' && <p className="mt-1 text-xs font-medium text-[#b4690e]">Went in without the door code: {visit.doorSkipReason}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {visit.check === 'escalated' ? (
          <StatusBadge tone="red">No answer</StatusBadge>
        ) : visit.check === 'check_sent' ? (
          <StatusBadge tone="amber">Asked “Are you OK?”</StatusBadge>
        ) : visit.overdue ? (
          <StatusBadge tone="amber">Running over</StatusBadge>
        ) : visit.doorCheck === 'code' ? (
          <StatusBadge tone="green">Checked in with code</StatusBadge>
        ) : (
          <StatusBadge>{visit.stage === 'on_the_way' ? 'On the way' : 'With patient'}</StatusBadge>
        )}
        {visit.physioPhone && (
          <a href={telHref(visit.physioPhone)} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium hover:bg-rh-canvas dark:hover:bg-white/5">
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        )}
        {visit.lastPing && (
          <a href={mapsHref(visit.lastPing.lat, visit.lastPing.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium hover:bg-rh-canvas dark:hover:bg-white/5">
            <MapPin className="h-3.5 w-3.5" /> {visit.lastPing.at ? ago(visit.lastPing.at) : 'Map'}
          </a>
        )}
        {visit.overdue && (
          <Button
            variant="ghost"
            className="h-9 rounded-xl text-sm"
            onClick={() =>
              void closeVisit({ visitId: visit._id })
                .then(() => toast.success('Visit closed.'))
                .catch((error) => toast.error(errorText(error)))
            }
          >
            Spoke to them: close
          </Button>
        )}
      </div>
    </li>
  )
}

export default function VisitSafetyPage() {
  const board = useQuery(safetyApi.adminBoard, {})

  return (
    <AdminPage>
      <PageHeader
        title="Visit safety"
        description="Help alerts and home visits under way. Physios tap On my way, check in with the patient’s door code, and tap Left safely. Overdue visits get “Are you OK?” after 20 minutes, then come here after 10 more."
      />

      {board === undefined ? (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <Panel
            title={
              <span className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" /> Alerts
              </span>
            }
            description="Call the physio first. Close an alert only after you’ve spoken to them."
          >
            {board.alerts.length === 0 ? (
              <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No open alerts" description="Help alerts and visits with no answer show here, and every admin gets a phone alert." />
            ) : (
              <div className="space-y-3 p-4 sm:p-5">
                {board.alerts.map((alert) => (
                  <AlertCard key={alert._id} alert={alert} />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title={
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Home visits under way ({board.visits.length})
              </span>
            }
          >
            {board.visits.length === 0 ? (
              <EmptyState title="No home visits right now" description="A visit shows here from the moment the physio taps On my way until they tap Left safely." />
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {board.visits.map((visit) => (
                  <VisitRow key={visit._id} visit={visit} />
                ))}
              </ul>
            )}
          </Panel>

          {board.recent.length > 0 && (
            <Panel title="Recently closed">
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {board.recent.map((alert) => (
                  <li key={alert._id} className="px-5 py-3 text-sm sm:px-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{alert.physioName}</span>
                      <StatusBadge tone={alert.falseAlarm ? 'neutral' : 'amber'}>
                        {alert.kind === 'panic' ? 'Help button' : 'No answer'}
                        {alert.falseAlarm ? ' · false alarm' : ''}
                      </StatusBadge>
                      <span className="text-xs text-neutral-500">{lagosDateTime(alert.createdAt)}</span>
                    </div>
                    {alert.resolution && (
                      <p className="mt-1 flex items-start gap-1.5 text-neutral-600 dark:text-neutral-300">
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                        {alert.resolution}
                        {alert.resolvedBy && <span className="text-neutral-500"> ({alert.resolvedBy})</span>}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </AdminPage>
  )
}
