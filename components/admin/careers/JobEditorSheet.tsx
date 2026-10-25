'use client'

import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import {
  careersApi,
  EMPLOYMENT_LABEL,
  WORKPLACE_LABEL,
  type AdminJob,
  type EmploymentType,
  type JobStatus,
  type Workplace,
} from '@/lib/careers'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Form = {
  title: string
  team: string
  location: string
  workplace: Workplace
  employmentType: EmploymentType
  summary: string
  description: string
  responsibilities: string
  requirements: string
  niceToHave: string
  salary: string
  closesOn: string // yyyy-mm-dd
}

const EMPTY: Form = {
  title: '',
  team: '',
  location: '',
  workplace: 'hybrid',
  employmentType: 'full_time',
  summary: '',
  description: '',
  responsibilities: '',
  requirements: '',
  niceToHave: '',
  salary: '',
  closesOn: '',
}

const lines = (value: string) => value.split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
const toDateInput = (ms?: number) => (ms ? new Date(ms).toISOString().slice(0, 10) : '')

function fromJob(job: AdminJob): Form {
  return {
    title: job.title,
    team: job.team,
    location: job.location,
    workplace: job.workplace,
    employmentType: job.employmentType,
    summary: job.summary,
    description: job.description,
    responsibilities: job.responsibilities.join('\n'),
    requirements: job.requirements.join('\n'),
    niceToHave: (job.niceToHave ?? []).join('\n'),
    salary: job.salary ?? '',
    closesOn: toDateInput(job.closesAt),
  }
}

const labelClass = 'text-sm font-medium text-rh-ink dark:text-white'
const hintClass = 'text-xs text-neutral-500 dark:text-neutral-400'

/** Create or edit a role. `job` null means a new role. */
export function JobEditorSheet({
  open,
  onOpenChange,
  job,
  teams,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: AdminJob | null
  teams: string[]
}) {
  const saveJob = useMutation(careersApi.adminSaveJob)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState<JobStatus | null>(null)

  useEffect(() => {
    if (open) setForm(job ? fromJob(job) : EMPTY)
  }, [open, job])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  const save = async (status: JobStatus) => {
    setSaving(status)
    try {
      await saveJob({
        ...(job ? { id: job._id } : {}),
        title: form.title,
        team: form.team,
        location: form.location,
        workplace: form.workplace,
        employmentType: form.employmentType,
        summary: form.summary,
        description: form.description,
        responsibilities: lines(form.responsibilities),
        requirements: lines(form.requirements),
        niceToHave: lines(form.niceToHave),
        salary: form.salary || undefined,
        status,
        // End of the chosen day in Lagos (UTC+1)
        closesAt: form.closesOn ? new Date(`${form.closesOn}T23:59:59+01:00`).getTime() : undefined,
      })
      playSound('success')
      toast.success(status === 'open' ? (job?.status === 'open' ? 'Role updated' : 'Role published') : 'Role saved')
      onOpenChange(false)
    } catch (error) {
      playSound('error')
      toast.error(error instanceof Error ? error.message.replace(/^.*ConvexError: /, '').split('\n')[0] : 'Could not save the role')
    } finally {
      setSaving(null)
    }
  }

  const current = job?.status
  const busy = saving !== null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-black/[0.06] bg-rh-canvas p-0 dark:border-white/[0.08] dark:bg-rh-ink sm:max-w-xl">
        <div className="flex min-h-full flex-col">
          <SheetHeader className="border-b border-black/[0.05] bg-white px-5 py-4 text-left dark:border-white/[0.06] dark:bg-rh-ink-2">
            <SheetTitle className="text-lg text-rh-ink dark:text-white">{job ? 'Edit role' : 'New role'}</SheetTitle>
            <SheetDescription className="text-xs">
              {job?.status === 'open' ? 'Changes show on /careers straight away.' : 'Save a draft, or publish it to /careers.'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="job-title" className={labelClass}>Job title</Label>
              <Input id="job-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Physiotherapist (home visits)" className={inputClass} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="job-team" className={labelClass}>Team</Label>
                <Input id="job-team" list="career-teams" value={form.team} onChange={(e) => set('team', e.target.value)} placeholder="e.g. Clinical" className={inputClass} />
                <datalist id="career-teams">
                  {teams.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-location" className={labelClass}>Location</Label>
                <Input id="job-location" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Lagos" className={inputClass} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className={labelClass}>Workplace</Label>
                <Select value={form.workplace} onValueChange={(v) => set('workplace', v as Workplace)}>
                  <SelectTrigger className={inputClass} aria-label="Workplace">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(WORKPLACE_LABEL) as Workplace[]).map((k) => (
                      <SelectItem key={k} value={k}>{WORKPLACE_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className={labelClass}>Type</Label>
                <Select value={form.employmentType} onValueChange={(v) => set('employmentType', v as EmploymentType)}>
                  <SelectTrigger className={inputClass} aria-label="Employment type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(EMPLOYMENT_LABEL) as EmploymentType[]).map((k) => (
                      <SelectItem key={k} value={k}>{EMPLOYMENT_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="job-summary" className={labelClass}>One-line summary</Label>
              <Input id="job-summary" maxLength={240} value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder="Shown in the roles list" className={inputClass} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="job-description" className={labelClass}>About the role</Label>
              <Textarea id="job-description" rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} className={cn(inputClass, 'resize-y')} />
              <p className={hintClass}>Leave a blank line between paragraphs.</p>
            </div>

            {(
              [
                ['responsibilities', "What you'll do", 'One per line'],
                ['requirements', "What you'll bring", 'One per line'],
                ['niceToHave', 'Nice to have', 'Optional, one per line'],
              ] as const
            ).map(([key, title, hint]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`job-${key}`} className={labelClass}>{title}</Label>
                <Textarea id={`job-${key}`} rows={4} value={form[key]} onChange={(e) => set(key, e.target.value)} className={cn(inputClass, 'resize-y')} />
                <p className={hintClass}>{hint}</p>
              </div>
            ))}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="job-salary" className={labelClass}>Pay (optional)</Label>
                <Input id="job-salary" value={form.salary} onChange={(e) => set('salary', e.target.value)} placeholder="e.g. ₦400,000 – ₦600,000 a month" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-closes" className={labelClass}>Closing date (optional)</Label>
                <Input id="job-closes" type="date" value={form.closesOn} onChange={(e) => set('closesOn', e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-black/[0.05] bg-white p-4 dark:border-white/[0.06] dark:bg-rh-ink-2 sm:flex-row sm:justify-end">
            {current === 'open' ? (
              <Button onClick={() => save('open')} disabled={busy} className={primaryButtonClass}>
                {saving === 'open' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => save(current === 'closed' ? 'closed' : 'draft')} disabled={busy} className={softButtonClass}>
                  {(saving === 'draft' || saving === 'closed') && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {current === 'closed' ? 'Save' : 'Save as draft'}
                </Button>
                <Button onClick={() => save('open')} disabled={busy} className={primaryButtonClass}>
                  {saving === 'open' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {current === 'closed' ? 'Save and reopen' : 'Publish'}
                </Button>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
