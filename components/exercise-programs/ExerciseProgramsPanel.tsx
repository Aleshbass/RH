'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Dumbbell,
  Eye,
  Flag,
  Link2,
  ListPlus,
  Loader2,
  MessageCircle,
  Mic,
  Pencil,
  Plus,
  Send,
  TriangleAlert,
} from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, Panel, StatusBadge, primaryButtonClass, softButtonClass } from '@/components/physio/ui'
import { posterUrl } from '@/convex/exerciseLibraryCatalog'
import { CameraSessions } from '@/components/guided-session/CameraSessions'
import { useViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { forPatientRef, type CareTeamSessionRow } from '@/lib/motion/convexRefs'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { programError } from './errors'
import { ProgramPlayer } from './ProgramPlayer'
import { SendProgramDialog, type ProgramDialogMode } from './SendProgramDialog'
import { ShareLinkDialog } from './ShareLinkDialog'
import { itemsSummary, type CareTeamProgram } from './types'

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
  const fail = (fallback: string) => (error: unknown) => {
    playSound('error')
    toast.error(programError(error, fallback))
  }
  return (
    <ul className="space-y-1.5">
      {program.links.map((link) => (
        <li key={link._id} className="flex flex-wrap items-center gap-2 rounded-xl bg-rh-canvas px-3 py-2 text-xs dark:bg-white/[0.03]">
          <Link2 className="h-3.5 w-3.5 text-rh-ink dark:text-rh-lime" />
          <span className="text-neutral-600 dark:text-neutral-300">
            Sent {format(link.createdAt, 'd MMM')} · {link.state === 'active' ? `works until ${format(link.expiresAt, 'd MMM')}` : link.state}
            {link.openCount > 0 && ` · opened ${link.lastOpenedAt ? formatDistanceToNow(link.lastOpenedAt, { addSuffix: true }) : ''}`}
          </span>
          <StatusBadge tone={link.state === 'active' ? 'green' : link.state === 'locked' ? 'red' : 'neutral'}>{link.state}</StatusBadge>
          {canWrite && link.state !== 'revoked' && link.state !== 'locked' && (
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                className="rounded-lg px-2 py-1 font-medium text-rh-ink hover:bg-white dark:text-rh-lime dark:hover:bg-white/10"
                onClick={() => extend({ linkId: link._id, days: 30 }).then(() => toast.success('Link extended by 30 days')).catch(fail('Couldn’t extend the link.'))}
              >
                +30 days
              </button>
              {link.state === 'active' && (
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 font-medium text-rose-600 hover:bg-white dark:text-rose-300 dark:hover:bg-white/10"
                  onClick={() => revoke({ linkId: link._id }).then(() => toast.success('Link turned off')).catch(fail('Couldn’t turn the link off.'))}
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

function ItemThumb({ item }: { item: CareTeamProgram['items'][number] }) {
  return (
    <div className="w-20 shrink-0" title={item.name}>
      <div
        className={cn(
          'relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl',
          item.kind === 'education' ? 'bg-pt-violet-bg' : 'bg-rh-honeydew dark:bg-white/[0.05]'
        )}
      >
        {item.clipId ? (
          <Image src={posterUrl(item.clipId)} alt="" fill sizes="80px" unoptimized className="object-contain" draggable={false} />
        ) : item.kind === 'education' ? (
          <BookOpen className="h-6 w-6 text-pt-violet-fg" />
        ) : (
          <Dumbbell className="h-6 w-6 text-rh-ink/50 dark:text-rh-lime/60" />
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-neutral-600 dark:text-neutral-300">{item.name}</p>
    </div>
  )
}

function ProgramCard({
  program,
  cameraSessions,
  canWrite,
  onPreview,
  onShare,
  onEdit,
  onAdd,
}: {
  program: CareTeamProgram
  /** Camera-coach sessions of this programme, newest first */
  cameraSessions: CareTeamSessionRow[]
  canWrite: boolean
  onPreview: () => void
  onShare: () => void
  onEdit: () => void
  onAdd: () => void
}) {
  const archive = useMutation(api.exercisePrograms.archiveProgram)
  const archived = program.status === 'archived'
  const a = program.adherence
  const edited = program.updatedAt - program.createdAt > 60_000
  const toggleArchive = () =>
    archive({ programId: program._id, archived: !archived })
      .then(() => toast.success(archived ? 'Programme restored' : 'Programme archived'))
      .catch((error) => {
        playSound('error')
        toast.error(programError(error, 'Couldn’t update the programme.'))
      })

  return (
    <li className={cn('space-y-3 px-5 py-4', archived && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-rh-ink dark:text-white">
            {program.title} {archived && <StatusBadge className="ml-1">Archived</StatusBadge>}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {itemsSummary(program.items)} · sent {format(program.createdAt, 'd MMM yyyy')} by {program.senderName}
            {edited && ` · updated ${formatDistanceToNow(program.updatedAt, { addSuffix: true })}`}
            {program.voiceNoteUrl && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-rh-ink dark:text-rh-lime"><Mic className="h-3 w-3" /> voice note</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="rounded-xl" onClick={onPreview}><Eye className="mr-1.5 h-4 w-4" /> Preview</Button>
          {canWrite && !archived && (
            <>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={onAdd}><ListPlus className="mr-1.5 h-4 w-4" /> Add exercises</Button>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={onEdit}><Pencil className="mr-1.5 h-4 w-4" /> Edit</Button>
              <Button size="sm" className="rounded-xl bg-[#25D366] text-white hover:bg-[#1ebe5b]" onClick={onShare}>
                <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
              </Button>
            </>
          )}
          {canWrite && (
            <Button size="sm" variant="ghost" className="rounded-xl" onClick={toggleArchive} aria-label={archived ? 'Restore programme' : 'Archive programme'} title={archived ? 'Restore' : 'Archive'}>
              {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {program.goals.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-neutral-600 dark:text-neutral-300">
          <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#047857] dark:text-emerald-300" />
          <span>{program.goals.join(' · ')}</span>
        </p>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {program.items.map((item) => <ItemThumb key={item.index} item={item} />)}
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <StatusBadge tone={a.activeDaysLast14 >= 7 ? 'green' : a.activeDaysLast14 > 0 ? 'teal' : 'neutral'}>Active {a.activeDaysLast14} of last 14 days</StatusBadge>
        {a.averagePain !== null && <StatusBadge tone={a.averagePain >= 5 ? 'rose' : 'neutral'}>Average pain {a.averagePain}/10</StatusBadge>}
        {a.highPain && (
          <StatusBadge tone="red">
            <TriangleAlert className="mr-1 h-3 w-3" /> Pain 7+ reported
          </StatusBadge>
        )}
        <StatusBadge>{a.lastLoggedAt ? `Last done ${formatDistanceToNow(a.lastLoggedAt, { addSuffix: true })}` : 'Not started yet'}</StatusBadge>
        {/* The patient pressed "Done for today" and sent the session */}
        {a.lastFinish && (
          <StatusBadge tone="green">
            Sent as done {formatDistanceToNow(a.lastFinish.at, { addSuffix: true })}
            {a.lastFinish.doneCount !== null && a.lastFinish.total !== null && ` (${a.lastFinish.doneCount} of ${a.lastFinish.total})`}
            {a.finishedDaysLast14 > 1 && ` · ${a.finishedDaysLast14} days in the last 14`}
          </StatusBadge>
        )}
      </div>

      <CameraSessions sessions={cameraSessions} itemName={(index) => program.items[index]?.name ?? ''} />

      {a.recent.length > 0 && (
        <details className="rounded-xl bg-rh-canvas px-3 py-2 text-xs dark:bg-white/[0.03]">
          <summary className="cursor-pointer font-medium text-rh-ink dark:text-white">Recent logs</summary>
          <ul className="mt-2 space-y-1">
            {a.recent.map((log, i) => (
              <li key={i} className="text-neutral-600 dark:text-neutral-300">
                {format(log.createdAt, 'd MMM, h:mm a')} · {program.items[log.itemIndex]?.name ?? 'A removed exercise'}
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

type DialogState = { mode: ProgramDialogMode; program: CareTeamProgram | null }

/**
 * A patient's home programmes for their physio or clinic. The list comes first; "Send exercises"
 * adds to a programme (or starts one), "New programme" starts one, and each programme can be
 * edited or added to. `children` renders below the list (e.g. older programmes).
 */
export function ExerciseProgramsPanel({
  patientId,
  patientName,
  hasPhone,
  canWrite,
  title = 'Home programmes',
  children,
}: {
  patientId: Id<'users'>
  patientName: string
  hasPhone: boolean
  canWrite: boolean
  title?: string
  children?: ReactNode
}) {
  const programs = useQuery(api.exercisePrograms.listForPatient, { patientId }) as CareTeamProgram[] | null | undefined
  const cameraSessions = useQuery(forPatientRef, { patientId })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialog, setDialog] = useState<DialogState>({ mode: 'send', program: null })
  const [preview, setPreview] = useState<CareTeamProgram | null>(null)
  const [shareFor, setShareFor] = useState<Id<'exercisePrograms'> | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const all = programs ?? []
  const active = all.filter((p) => p.status === 'active')
  const visible = all.filter((p) => showArchived || p.status === 'active')
  const archivedCount = all.length - active.length

  const openDialog = (mode: ProgramDialogMode, program: CareTeamProgram | null = null) => {
    setDialog({ mode, program })
    setDialogOpen(true)
  }

  return (
    <>
      <Panel
        title={title}
        description="Exercises and education in the patient's app, and on WhatsApp"
        actions={
          canWrite && (
            <>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openDialog('new')}>
                <Plus className="mr-1 h-4 w-4" /> New programme
              </Button>
              <Button size="sm" className={primaryButtonClass} onClick={() => openDialog('send')}>
                <Send className="mr-1.5 h-4 w-4" /> Send exercises
              </Button>
            </>
          )
        }
      >
        {programs === undefined ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-rh-ink" /></div>
        ) : programs === null ? (
          <p className="px-5 pb-5 text-sm text-neutral-500">You can&apos;t see this patient&apos;s programmes.</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Dumbbell />}
            title={archivedCount > 0 ? 'No active programmes' : 'No home programme yet'}
            description="Pick exercises from the 3D library or add your own, add education, set the dose and send. They'll see it in their app, or on WhatsApp with a PIN."
            action={
              canWrite && (
                <Button className={primaryButtonClass} onClick={() => openDialog('new')}>
                  <Plus className="mr-1 h-4 w-4" /> New programme
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
            {visible.map((program) => (
              <ProgramCard
                key={program._id}
                program={program}
                cameraSessions={(cameraSessions ?? []).filter((s) => s.programId === program._id)}
                canWrite={canWrite}
                onPreview={() => setPreview(program)}
                onShare={() => setShareFor(program._id)}
                onEdit={() => openDialog('edit', program)}
                onAdd={() => openDialog('send', program)}
              />
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
        {children}
      </Panel>

      <SendProgramDialog
        patientId={patientId}
        patientName={patientName}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialog.mode}
        program={dialog.program}
        onSent={(programId) => setShareFor(programId)}
      />
      <ShareLinkDialog programId={shareFor} patientName={patientName} hasPhone={hasPhone} open={Boolean(shareFor)} onOpenChange={(o) => !o && setShareFor(null)} />
      <PreviewDialog program={preview} onOpenChange={(o) => !o && setPreview(null)} />
    </>
  )
}
