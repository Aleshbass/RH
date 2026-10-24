'use client'

import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { Loader2, Rotate3d, Search, Send } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ExercisePreviewDialog } from '@/components/exercise-programs/ExercisePreviewDialog'
import { LibraryPicker } from '@/components/exercise-programs/LibraryPicker'
import { SendProgramDialog } from '@/components/exercise-programs/SendProgramDialog'
import { ShareLinkDialog } from '@/components/exercise-programs/ShareLinkDialog'
import type { LibraryData, LibraryEntry } from '@/components/exercise-programs/types'
import { PageContainer, PageHeader, Panel, primaryButtonClass } from '@/components/physio/ui'

type PatientOption = { _id: Id<'users'>; firstName?: string; lastName?: string; email?: string; phoneNumber?: string }

function PatientChooser({ open, onOpenChange, onChoose }: { open: boolean; onOpenChange: (open: boolean) => void; onChoose: (p: PatientOption) => void }) {
  const patients = useQuery(api.patientInvitations.getMyPatients, open ? { status: 'active' } : 'skip') as PatientOption[] | undefined
  const [search, setSearch] = useState('')
  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (patients ?? []).filter((p) => !q || `${p.firstName ?? ''} ${p.lastName ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q))
  }, [patients, search])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send to which patient?</DialogTitle>
          <DialogDescription>Patients you&apos;re currently treating.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patients" className="rounded-xl pl-9" />
        </div>
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {patients === undefined ? (
            <li className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-rh-ink" /></li>
          ) : list.length === 0 ? (
            <li className="py-8 text-center text-sm text-neutral-500">No active patients found.</li>
          ) : (
            list.map((p) => (
              <li key={p._id}>
                <button
                  type="button"
                  onClick={() => onChoose(p)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-rh-honeydew dark:hover:bg-white/[0.05]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rh-lime text-sm font-semibold text-rh-ink">
                    {(p.firstName?.[0] ?? 'P').toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Patient'}</span>
                    {p.email && <span className="block truncate text-xs text-neutral-500">{p.email}</span>}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

export default function ExerciseLibraryPage() {
  const library = useQuery(api.exerciseLibrary.listLibrary) as LibraryData | null | undefined
  const [preview, setPreview] = useState<LibraryEntry | null>(null)
  const [choosing, setChoosing] = useState<LibraryEntry | null>(null)
  const [target, setTarget] = useState<{ patient: PatientOption; entry: LibraryEntry } | null>(null)
  const [shareFor, setShareFor] = useState<{ programId: Id<'exercisePrograms'>; patient: PatientOption } | null>(null)
  const count3d = library?.items.filter((i) => i.animation).length ?? 0

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Exercise library"
        title="3D exercise library"
        description="Every exercise is demonstrated in 3D by a Rehabify clinician. Preview it, then send it to a patient with your own dose and voice note."
        info="Patients watch the exercises on their dashboard or through a private WhatsApp link, follow along with the 3D model and the voice guide, and log how it went. You see their progress on their page."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rh-honeydew px-3 py-1.5 text-sm font-medium text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime">
            <Rotate3d className="h-4 w-4" /> {count3d} in 3D
          </span>
        }
      />

      <Panel bodyClassName="p-5">
        {library === undefined ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-rh-ink" /></div>
        ) : !library ? (
          <p className="py-10 text-center text-sm text-neutral-500">The library opens once your account is approved.</p>
        ) : (
          <LibraryPicker items={library.items} onPreview={setPreview} />
        )}
      </Panel>

      <ExercisePreviewDialog
        entry={preview}
        onOpenChange={(o) => !o && setPreview(null)}
        action={
          preview && (
            <Button
              className={primaryButtonClass}
              onClick={() => {
                setChoosing(preview)
                setPreview(null)
              }}
            >
              <Send className="mr-2 h-4 w-4" /> Send to a patient
            </Button>
          )
        }
      />
      <PatientChooser
        open={Boolean(choosing)}
        onOpenChange={(o) => !o && setChoosing(null)}
        onChoose={(patient) => {
          if (choosing) setTarget({ patient, entry: choosing })
          setChoosing(null)
        }}
      />
      {target && (
        <SendProgramDialog
          patientId={target.patient._id}
          patientName={target.patient.firstName || 'your patient'}
          open
          initial={[target.entry]}
          onOpenChange={(o) => !o && setTarget(null)}
          onSent={(programId) => setShareFor({ programId, patient: target.patient })}
        />
      )}
      <ShareLinkDialog
        programId={shareFor?.programId ?? null}
        patientName={shareFor?.patient.firstName || 'your patient'}
        hasPhone={Boolean(shareFor?.patient.phoneNumber)}
        open={Boolean(shareFor)}
        onOpenChange={(o) => !o && setShareFor(null)}
      />
    </PageContainer>
  )
}
