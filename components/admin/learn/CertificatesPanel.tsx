'use client'

/**
 * Admin › Learn › Certificates: a live preview of this cohort's certificate (the same drawing
 * physios download), who has completed the program, and one-tap issuing.
 *
 * "Completed" = passed the final assessment and joined the required live sessions. Admins can
 * still issue to anyone paid from the Course tab's learner drawer.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Award, CheckCircle2, Clock, ExternalLink, Loader2, Users } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { adminLearnerProgress } from '@/convex/learn'
import { useMutationUntyped, useQueryUntyped, type QueryResult } from '@/lib/convexUntyped'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog, EmptyState, Panel, primaryButtonClass, softButtonClass, StatTile, StatusBadge } from '@/components/admin/ui'
import { Callout, errorMessage, labelClass, LoadingBlock } from '@/components/admin/partners/shared'
import { CertificateActions, CertificatePreview, useCertificate } from '@/components/learn/course/Certificate'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { AdminDrawer, Field } from './drawer'

// The generated api types sit at TypeScript's depth limit, so Learn functions are read untyped
const learnApi = (api as unknown as { learn: Record<string, unknown> }).learn

type ProgressData = QueryResult<typeof adminLearnerProgress>
type Learner = ProgressData['learners'][number]
type Design = NonNullable<ProgressData['design']>

const SAMPLE_NAME = 'Adaeze Okafor'
// Shown on previews before a certificate exists; real numbers are made when it's issued
const PREVIEW_CODE = 'PREVIEW'

function activeCertificate(l: Learner) {
  return l.certificate && !l.certificate.revoked ? l.certificate : null
}

function previewData(design: Design, name: string, learner?: Learner | null) {
  const cert = learner ? activeCertificate(learner) : null
  return {
    ...design,
    name: name.trim() || SAMPLE_NAME,
    code: cert?.code ?? PREVIEW_CODE,
    issuedAt: cert?.issuedAt ?? Date.now(),
  }
}

/** Big live preview at the top of the tab; follows whoever is selected below. */
function PreviewCard({ design, learner }: { design: Design; learner: Learner | null }) {
  const name = learner ? activeCertificate(learner)?.name ?? learner.name : SAMPLE_NAME
  const data = useMemo(() => previewData(design, name, learner), [design, name, learner])
  const { src, failed } = useCertificate(data)
  return (
    <Panel
      title="Certificate preview"
      description={
        learner
          ? `Showing ${name}${activeCertificate(learner) ? `, certificate ${activeCertificate(learner)!.code}` : ' (not issued yet)'}.`
          : 'Exactly what physios download (A4 PDF or image). Pick a person below to see their name on it.'
      }
      bodyClassName="px-5 pb-5 pt-2"
    >
      <CertificatePreview src={src} failed={failed} className="mx-auto max-w-3xl" />
      {!design.signatoryName && (
        <Callout tone="warning" className="mt-4">
          No signatory yet, so the certificate shows “Rehabify Learn”. Add a name and title under Course › Final assessment.
        </Callout>
      )}
    </Panel>
  )
}

/** Confirm step before issuing: their name as it will print, on the real drawing. */
function IssueDrawer({ learner, design, onClose }: { learner: Learner; design: Design; onClose: () => void }) {
  const issue = useMutationUntyped(learnApi.adminIssueCertificate)
  const existing = activeCertificate(learner)
  const [name, setName] = useState(existing?.name ?? learner.name)
  const [busy, setBusy] = useState(false)
  const data = useMemo(() => previewData(design, name, learner), [design, name, learner])
  const { src, svg, failed } = useCertificate(data)

  return (
    <AdminDrawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? `${learner.name}'s certificate` : `Issue certificate to ${learner.name}`}
      description={`${learner.email} · ${learner.track}`}
      footer={
        <>
          <Button
            className={primaryButtonClass}
            disabled={busy || name.trim().length < 3}
            onClick={async () => {
              setBusy(true)
              try {
                await issue({ registrationId: learner.registrationId, name })
                playSound('success')
                toast.success(existing ? 'Name updated on the certificate' : `Certificate issued to ${name.trim()}`)
                onClose()
              } catch (error) {
                toast.error(errorMessage(error, 'Could not issue the certificate'))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Award className="mr-1.5 h-4 w-4" />}
            {existing ? 'Update name' : 'Issue certificate'}
          </Button>
          <Button variant="ghost" className={softButtonClass} onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <CertificatePreview src={src} failed={failed} />
        <Field label="Name on the certificate" htmlFor="issue-cert-name" hint="Check the spelling: this is how it prints.">
          <Input id="issue-cert-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Best score', value: learner.bestScore === null ? '—' : `${learner.bestScore}%` },
            { label: 'Sessions joined', value: learner.attendedSessionIds.length },
            { label: 'Weeks ticked', value: learner.weeksDone },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.04]">
              <p className="text-lg font-semibold text-rh-ink dark:text-white">{s.value}</p>
              <p className="text-[11px] text-neutral-500">{s.label}</p>
            </div>
          ))}
        </div>
        {existing && (
          <div className="space-y-2">
            <p className={labelClass}>Download</p>
            <CertificateActions svg={svg} data={data} />
          </div>
        )}
        {!learner.completed && !existing && (
          <Callout tone="warning">They haven’t met every requirement yet (assessment or live sessions). You can still issue it.</Callout>
        )}
      </div>
    </AdminDrawer>
  )
}

function Row({
  learner,
  minSessions,
  selected,
  onSelect,
  action,
}: {
  learner: Learner
  minSessions: number
  selected: boolean
  onSelect: () => void
  action?: React.ReactNode
}) {
  const cert = activeCertificate(learner)
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 transition',
        selected ? 'bg-rh-canvas ring-1 ring-inset ring-rh-ink/10 dark:bg-white/[0.05]' : 'hover:bg-rh-canvas dark:hover:bg-white/[0.04]'
      )}
    >
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{learner.name}</span>
        <span className="block text-xs text-neutral-500 dark:text-neutral-400">
          {cert
            ? `${cert.code}${cert.issuedAt ? ` · issued ${new Date(cert.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
            : `${learner.bestScore === null ? 'Assessment not taken' : `Best ${learner.bestScore}%${learner.passed ? ' (passed)' : ''}`} · ${learner.attendedSessionIds.length}${minSessions ? `/${minSessions}` : ''} sessions`}
        </span>
      </button>
      {action}
    </li>
  )
}

export function CertificatesPanel({ cohortId }: { cohortId: Id<'learnCohorts'> }) {
  const data = useQueryUntyped(learnApi.adminLearnerProgress, { cohortId }) as ProgressData | undefined
  const issue = useMutationUntyped(learnApi.adminIssueCertificate)
  const revoke = useMutationUntyped(learnApi.adminRevokeCertificate)
  const [selectedId, setSelectedId] = useState<Id<'learnRegistrations'> | null>(null)
  const [issuingId, setIssuingId] = useState<Id<'learnRegistrations'> | null>(null)
  const [revokeId, setRevokeId] = useState<Id<'learnRegistrations'> | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  if (data === undefined) return <LoadingBlock />
  if (!data.design) return <EmptyState icon={<Award />} title="Cohort not found" />
  const design = data.design

  const ready = data.learners.filter((l) => l.completed && !activeCertificate(l))
  const issued = data.learners.filter((l) => activeCertificate(l))
  const inProgress = data.learners.filter((l) => !l.completed && !activeCertificate(l))
  const selected = data.learners.find((l) => l.registrationId === selectedId) ?? null
  const issuing = data.learners.find((l) => l.registrationId === issuingId) ?? null
  const revoking = data.learners.find((l) => l.registrationId === revokeId) ?? null

  const issueAll = async () => {
    setBulkBusy(true)
    let done = 0
    for (const l of ready) {
      try {
        await issue({ registrationId: l.registrationId, name: l.name })
        done += 1
      } catch (error) {
        toast.error(`${l.name}: ${errorMessage(error, 'could not issue')}`)
      }
    }
    setBulkBusy(false)
    if (done) {
      playSound('success')
      toast.success(`${done} ${done === 1 ? 'certificate' : 'certificates'} issued`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Completed, ready to issue" value={ready.length} icon={CheckCircle2} />
        <StatTile label="Certificates issued" value={issued.length} icon={Award} />
        <StatTile label="Still in progress" value={inProgress.length} icon={Clock} />
      </div>

      <PreviewCard design={design} learner={selected} />

      <Panel
        title="Completed the program"
        description={
          data.minSessions
            ? `Passed the final assessment and joined at least ${data.minSessions} live ${data.minSessions === 1 ? 'session' : 'sessions'}.`
            : 'Passed the final assessment.'
        }
        actions={
          ready.length > 1 ? (
            <Button size="sm" className={primaryButtonClass} disabled={bulkBusy} onClick={() => setConfirmAll(true)}>
              {bulkBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Award className="mr-1.5 h-3.5 w-3.5" />}
              Issue all ({ready.length})
            </Button>
          ) : undefined
        }
      >
        {ready.length === 0 ? (
          <EmptyState icon={<CheckCircle2 />} title="No one waiting" description="People who pass and meet the attendance rule appear here." />
        ) : (
          <ul className="px-2 pb-2">
            {ready.map((l) => (
              <Row
                key={l.registrationId}
                learner={l}
                minSessions={data.minSessions}
                selected={selectedId === l.registrationId}
                onSelect={() => setSelectedId(l.registrationId)}
                action={
                  <Button size="sm" className={primaryButtonClass} onClick={() => setIssuingId(l.registrationId)}>
                    <Award className="mr-1.5 h-3.5 w-3.5" /> Issue
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Certificates issued" description={issued.length ? 'Each one can be checked online with its number.' : undefined}>
        {issued.length === 0 ? (
          <EmptyState icon={<Award />} title="None issued yet" />
        ) : (
          <ul className="px-2 pb-2">
            {issued.map((l) => (
              <Row
                key={l.registrationId}
                learner={l}
                minSessions={data.minSessions}
                selected={selectedId === l.registrationId}
                onSelect={() => setSelectedId(l.registrationId)}
                action={
                  <div className="flex items-center gap-1.5">
                    <StatusBadge tone="green">Issued</StatusBadge>
                    <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => setIssuingId(l.registrationId)}>
                      Open
                    </Button>
                    <Link
                      href={`/learn/verify/${activeCertificate(l)!.code}`}
                      target="_blank"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-rh-canvas hover:text-rh-ink"
                      aria-label="Open the public check page"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => setRevokeId(l.registrationId)}>
                      Withdraw
                    </Button>
                  </div>
                }
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Still in progress" description="Not passed yet, or short of live sessions. Mark attendance in the Course tab.">
        {inProgress.length === 0 ? (
          <EmptyState icon={<Users />} title={data.learners.length ? 'Everyone has finished' : 'No paid physios yet'} />
        ) : (
          <ul className="px-2 pb-2">
            {inProgress.map((l) => (
              <Row
                key={l.registrationId}
                learner={l}
                minSessions={data.minSessions}
                selected={selectedId === l.registrationId}
                onSelect={() => setSelectedId(l.registrationId)}
                action={
                  <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => setIssuingId(l.registrationId)}>
                    Issue anyway
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </Panel>

      {issuing && <IssueDrawer key={issuing.registrationId} learner={issuing} design={design} onClose={() => setIssuingId(null)} />}

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={`Issue ${ready.length} certificates?`}
        description="Each person gets a certificate with their registered name. You can correct a name afterwards from Certificates issued."
        confirmLabel="Issue all"
        onConfirm={issueAll}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevokeId(null)}
        title={`Withdraw ${revoking?.name ?? 'this'}’s certificate?`}
        description="The certificate number will show as withdrawn on the public check page. You can issue a new one later."
        confirmLabel="Withdraw"
        destructive
        onConfirm={async () => {
          if (!revoking) return
          await revoke({ registrationId: revoking.registrationId })
          playSound('reject')
          toast.success('Certificate withdrawn')
        }}
      />
    </div>
  )
}
