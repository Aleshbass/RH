'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { Archive, ArchiveRestore, Dumbbell, Eye, Link2, Loader2, MessageCircle, Mic, Plus, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, Panel, StatusBadge, primaryButtonClass, softButtonClass } from '@/components/physio/ui'
import { posterUrl } from '@/convex/exerciseLibraryCatalog'
import { useViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { cn } from '@/lib/utils'
import { ProgramPlayer } from './ProgramPlayer'
import { SendProgramDialog } from './SendProgramDialog'
import { ShareLinkDialog } from './ShareLinkDialog'
import type { CareTeamProgram } from './types'

function errorText(error: unknown, fallback: string) {
  return (error as Error)?.message?.replace(/^.*ConvexError: /, '') || fallback
}

function PreviewDialog({ program, onOpenChange }: { program: CareTeamProgram | null; onOpenChange: (open: boolean) => void }) {
  const requestGrant = useViewerGrant({ kind: 'staff' })
  return (
    <Dialog open={Boolean(program)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto rounded-3xl sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>What your patient sees</DialogTitle>
          <DialogDescription>A preview of the programme in the patient&apos;s app.</DialogDescription>
        </DialogHeader>
        {program && <ProgramPlayer program={program} doneToday={[]} requestGrant={requestGrant} readOnly />}
      </DialogContent>
    </Dialog>
  )
}

function LinksList({ program, canWrite }: { program: CareTeamProgram; canWrite: boolean }) {
  const revoke = useMutation(api.exerciseShareLinks.revokeShareLink)
  const extend = useMutation(api.exerciseShareLinks.extendShareLink)
  if (program.links.length === 0) return null
  return (
    <ul className="space-y-1.5">
      {program.links.map((link) => (
        <li key={link._id} className="flex flex-wrap items-center gap-2 rounded-xl bg-rh-canvas px-3 py-2 text-xs dark:bg-white/[0.03]">
          <Link2 className="h-3.5 w-3.5 text-rh-teal" />
          <span className="text-neutral-600 dark:text-neutral-300">
            Sent {format(link.createdAt, 'd MMM')} · {link.state === 'active' ? `works until ${format(link.expiresAt, 'd MMM')}` : link.state}
            {link.openCount > 0 && ` · opened ${link.lastOpenedAt ? formatDistanceToNow(link.lastOpenedAt, { addSuffix: true }) : ''}`}
          </span>
          <StatusBadge tone={link.state === 'active' ? 'green' : link.state === 'locked' ? 'red' : 'neutral'}>{link.state}</StatusBadge>
          {canWrite && link.state !== 'revoked' && link.state !== 'locked' && (
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                className="rounded-lg px-2 py-1 font-medium text-rh-teal hover:bg-white dark:text-rh-aqua dark:hover:bg-white/10"
                onClick={() => extend({ linkId: link._id, days: 30 }).then(() => toast.success('Link extended by 30 days')).catch((e) => toast.error(errorText(e, 'Couldn’t extend')))}
              >
                +30 days
              </button>
              {link.state === 'active' && (
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 font-medium text-rose-600 hover:bg-white dark:hover:bg-white/10"
                  onClick={() => revoke({ linkId: link._id }).then(() => toast.success('Link turned off')).catch((e) => toast.error(errorText(e, 'Couldn’t turn it off')))}
                >
                  Turn off
                </button>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function ProgramCard({
  program,
  canWrite,
  onPreview,
  onShare,
}: {
  program: CareTeamProgram
  canWrite: boolean
  onPreview: () => void
  onShare: () => void
}) {
  const archive = useMutation(api.exercisePrograms.archiveProgram)
  const archived = program.status === 'archived'
  const a = program.adherence
  return (
    <li className={cn('space-y-3 px-5 py-4', archived && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-rh-night dark:text-white">
            {program.title} {archived && <StatusBadge className="ml-1">Archived</StatusBadge>}
          </p>
          <p className="text-xs text-neutral-500">
            {program.items.length} exercises · sent {format(program.createdAt, 'd MMM yyyy')} by {program.senderName}
            {program.voiceNoteUrl && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-rh-teal"><Mic className="h-3 w-3" /> voice note</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="rounded-xl" onClick={onPreview}><Eye className="mr-1.5 h-4 w-4" /> Preview</Button>
          {canWrite && !archived && (
            <Button size="sm" className="rounded-xl bg-[#25D366] text-white hover:bg-[#1ebe5b]" onClick={onShare}>
              <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
            </Button>
          )}
          {canWrite && (
            <Button
              size="sm"
              variant="ghost"
              className="rounded-xl"
              onClick={() => archive({ programId: program._id, archived: !archived }).catch((e) => toast.error(errorText(e, 'Couldn’t update')))}
              aria-label={archived ? 'Restore programme' : 'Archive programme'}
            >
              {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {program.items.map((item) => (
          <div key={item.index} className="w-20 shrink-0" title={item.exercise?.name ?? ''}>
            <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-rh-mist dark:bg-white/[0.05]">
              {item.clipId ? (
                <Image src={posterUrl(item.clipId)} alt="" fill sizes="80px" className="object-contain" draggable={false} />
              ) : (
                <Dumbbell className="m-7 h-6 w-6 text-rh-teal/50" />
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-neutral-600 dark:text-neutral-300">{item.exercise?.name}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <StatusBadge tone={a.activeDaysLast14 >= 7 ? 'green' : a.activeDaysLast14 > 0 ? 'teal' : 'neutral'}>Active {a.activeDaysLast14} of last 14 days</StatusBadge>
        {a.averagePain !== null && <StatusBadge tone={a.averagePain >= 5 ? 'amber' : 'neutral'}>Average pain {a.averagePain}/10</StatusBadge>}
        {a.highPain && (
          <StatusBadge tone="red">
            <TriangleAlert className="mr-1 h-3 w-3" /> Pain 7+ reported
          </StatusBadge>
        )}
        <StatusBadge>{a.lastLoggedAt ? `Last done ${formatDistanceToNow(a.lastLoggedAt, { addSuffix: true })}` : 'Not started yet'}</StatusBadge>
      </div>

      {a.recent.length > 0 && (
        <details className="rounded-xl bg-rh-canvas px-3 py-2 text-xs dark:bg-white/[0.03]">
          <summary className="cursor-pointer font-medium text-rh-night dark:text-white">Recent logs</summary>
          <ul className="mt-2 space-y-1">
            {a.recent.map((log, i) => (
              <li key={i} className="text-neutral-600 dark:text-neutral-300">
                {format(log.createdAt, 'd MMM, h:mm a')} · {program.items[log.itemIndex]?.exercise?.name ?? 'Exercise'}
                {log.painScore !== null && ` · pain ${log.painScore}/10`}
                {log.difficulty && ` · ${log.difficulty === 'ok' ? 'just right' : log.difficulty}`}
                {log.source === 'link' && ' · via WhatsApp link'}
                {log.note && <span className="block pl-3 italic">“{log.note}”</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <LinksList program={program} canWrite={canWrite} />
    </li>
  )
}

/** Home exercise programmes for one patient, for their physio or clinic. */
export function ExerciseProgramsPanel({
  patientId,
  patientName,
  hasPhone,
  canWrite,
}: {
  patientId: Id<'users'>
  patientName: string
  hasPhone: boolean
  canWrite: boolean
}) {
  const programs = useQuery(api.exercisePrograms.listForPatient, { patientId }) as CareTeamProgram[] | null | undefined
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState<CareTeamProgram | null>(null)
  const [shareFor, setShareFor] = useState<Id<'exercisePrograms'> | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const visible = (programs ?? []).filter((p) => showArchived || p.status === 'active')
  const archivedCount = (programs ?? []).filter((p) => p.status === 'archived').length

  return (
    <>
      <Panel
        title="Home exercise programmes"
        description="3D exercises with your notes, in the patient's app and on WhatsApp"
        actions={
          canWrite && (
            <Button size="sm" className={primaryButtonClass} onClick={() => setSending(true)}>
              <Plus className="mr-1 h-4 w-4" /> Send exercises
            </Button>
          )
        }
      >
        {programs === undefined ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-rh-teal" /></div>
        ) : programs === null ? (
          <p className="px-5 pb-5 text-sm text-neutral-500">You can&apos;t see this patient&apos;s exercises.</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Dumbbell />}
            title="No exercises sent yet"
            description="Pick exercises from the 3D library, set the dose, add a voice note, and send. They'll see them in their app, or on WhatsApp with a PIN."
            action={canWrite && <Button className={primaryButtonClass} onClick={() => setSending(true)}>Send exercises</Button>}
          />
        ) : (
          <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
            {visible.map((program) => (
              <ProgramCard key={program._id} program={program} canWrite={canWrite} onPreview={() => setPreview(program)} onShare={() => setShareFor(program._id)} />
            ))}
          </ul>
        )}
        {archivedCount > 0 && (
          <div className="border-t border-black/[0.04] px-5 py-3 dark:border-white/[0.06]">
            <Button variant="ghost" size="sm" className={softButtonClass} onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Hide archived' : `Show ${archivedCount} archived`}
            </Button>
          </div>
        )}
      </Panel>

      <SendProgramDialog
        patientId={patientId}
        patientName={patientName}
        open={sending}
        onOpenChange={setSending}
        onSent={(programId) => setShareFor(programId)}
      />
      <ShareLinkDialog programId={shareFor} patientName={patientName} hasPhone={hasPhone} open={Boolean(shareFor)} onOpenChange={(o) => !o && setShareFor(null)} />
      <PreviewDialog program={preview} onOpenChange={(o) => !o && setPreview(null)} />
    </>
  )
}
