'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BookOpen, Loader2, Rotate3d, Search, Send } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { EducationBrowser } from '@/components/exercise-programs/EducationLibrary'
import { ExercisePreviewDialog } from '@/components/exercise-programs/ExercisePreviewDialog'
import { LibraryPicker } from '@/components/exercise-programs/LibraryPicker'
import { SendProgramDialog } from '@/components/exercise-programs/SendProgramDialog'
import { ShareLinkDialog } from '@/components/exercise-programs/ShareLinkDialog'
import type { LibraryData, LibraryEntry, LibraryResourceRow } from '@/components/exercise-programs/types'
import { fieldClass, PageContainer, PageHeader, Panel, primaryButtonClass } from '@/components/physio/ui'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { cn } from '@/lib/utils'

/** The generated api types sit at TypeScript's depth limit, so this page reads its functions untyped. */
const root = api as unknown as Record<string, Record<string, unknown>>

type PatientOption = { _id: Id<'users'>; firstName?: string; lastName?: string; email?: string; phoneNumber?: string }

/** What's being sent: a 3D exercise or a piece of education. */
type Choice = { entry?: LibraryEntry; resource?: LibraryResourceRow }

type Tab = '3d' | 'education'

function PatientChooser({ open, onOpenChange, onChoose }: { open: boolean; onOpenChange: (open: boolean) => void; onChoose: (p: PatientOption) => void }) {
  const patients = useQueryUntyped(root.patientInvitations.getMyPatients, open ? { status: 'active' } : 'skip') as PatientOption[] | undefined
  const [search, setSearch] = useState('')
  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (patients ?? []).filter((p) => !q || `${p.firstName ?? ''} ${p.lastName ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q))
  }, [patients, search])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-pt-line bg-pt-surface text-pt-ink sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send to which patient?</DialogTitle>
          <DialogDescription>Patients you&apos;re currently treating.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patients" className={cn(fieldClass, 'pl-9')} />
        </div>
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {patients === undefined ? (
            <li className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-pt-muted" />
            </li>
          ) : list.length === 0 ? (
            <li className="py-8 text-center text-sm text-pt-muted">No active patients found.</li>
          ) : (
            list.map((p) => (
              <li key={p._id}>
                <button type="button" onClick={() => onChoose(p)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-pt-hover">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pt-sunken text-sm font-semibold text-pt-ink">{(p.firstName?.[0] ?? 'P').toUpperCase()}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-pt-ink">{`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Patient'}</span>
                    {p.email && <span className="block truncate text-xs text-pt-muted">{p.email}</span>}
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
  const searchParams = useSearchParams()
  const library = useQueryUntyped(root.exerciseLibrary.listLibrary, {}) as LibraryData | null | undefined
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'education' ? 'education' : '3d')
  const [preview, setPreview] = useState<LibraryEntry | null>(null)
  const [choosing, setChoosing] = useState<Choice | null>(null)
  const [target, setTarget] = useState<{ patient: PatientOption; pick: Choice } | null>(null)
  const [shareFor, setShareFor] = useState<{ programId: Id<'exercisePrograms'>; patient: PatientOption } | null>(null)
  const count3d = library?.items.filter((i) => i.animation).length ?? 0

  useEffect(() => {
    const fromUrl = searchParams.get('tab')
    if (fromUrl === 'education' || fromUrl === '3d') setTab(fromUrl)
  }, [searchParams])

  const go = (next: Tab) => {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(null, '', url.toString())
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Library"
        title="Exercises and education"
        description="3D exercises demonstrated by a Rehabify clinician, and videos, leaflets and guides to teach your patients. Preview anything, then send it with your own dose and notes."
        info="Patients see everything you send in their app, or through a private WhatsApp link: they follow the 3D model with a voice guide, watch the videos, read the leaflets and log how it went."
      />

      <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-pt-sunken p-1 sm:w-fit" role="tablist">
        {(
          [
            { key: '3d', label: '3D exercises', icon: Rotate3d, count: count3d },
            { key: 'education', label: 'Education', icon: BookOpen, count: null },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => go(t.key)}
            className={cn(
              'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition',
              tab === t.key ? 'bg-pt-surface text-pt-ink shadow-pt dark:shadow-none' : 'text-pt-muted hover:text-pt-ink'
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.count ? <span className="text-xs tabular-nums text-pt-faint">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === '3d' ? (
        <Panel bodyClassName="p-5">
          {library === undefined ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-pt-muted" />
            </div>
          ) : !library ? (
            <p className="py-10 text-center text-sm text-pt-muted">The library opens once your account is approved.</p>
          ) : (
            <LibraryPicker items={library.items} onPreview={setPreview} />
          )}
        </Panel>
      ) : (
        <Panel bodyClassName="p-4 sm:p-5">
          <EducationBrowser mode="browse" onSend={(resource) => setChoosing({ resource })} />
        </Panel>
      )}

      <ExercisePreviewDialog
        entry={preview}
        onOpenChange={(o) => !o && setPreview(null)}
        action={
          preview && (
            <Button
              className={primaryButtonClass}
              onClick={() => {
                setChoosing({ entry: preview })
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
          if (choosing) setTarget({ patient, pick: choosing })
          setChoosing(null)
        }}
      />
      {target && (
        <SendProgramDialog
          patientId={target.patient._id}
          patientName={target.patient.firstName || 'your patient'}
          open
          initial={target.pick.entry ? [target.pick.entry] : undefined}
          initialResources={target.pick.resource ? [target.pick.resource] : undefined}
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
