'use client'

import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ArrowUpRight, FileText, Loader2, Mail, Phone } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { cardClass, inputClass, primaryButtonClass, StatusBadge } from '@/components/admin/ui'
import { APPLICATION_STATUS_LABEL, careersApi, type AdminApplication, type ApplicationStatus } from '@/lib/careers'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

export const APPLICATION_TONE: Record<ApplicationStatus, 'amber' | 'teal' | 'green' | 'red' | 'neutral'> = {
  new: 'amber',
  reviewing: 'teal',
  interview: 'teal',
  accepted: 'green',
  rejected: 'neutral',
}

const linkClass = 'inline-flex items-center gap-1.5 text-sm font-medium text-rh-ink underline-offset-4 hover:underline dark:text-white'

export function ApplicationSheet({ application, onClose }: { application: AdminApplication | null; onClose: () => void }) {
  const update = useMutation(careersApi.adminUpdateApplication)
  const [status, setStatus] = useState<ApplicationStatus>('new')
  const [notes, setNotes] = useState('')
  const [notify, setNotify] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (application) {
      setStatus(application.status)
      setNotes(application.adminNotes ?? '')
      setNotify(false)
    }
  }, [application])

  if (!application) return <Sheet open={false} onOpenChange={() => onClose()} />

  const firstName = application.fullName.split(/\s+/)[0]
  const changed = status !== application.status
  const willAccept = changed && status === 'accepted'
  const willReject = changed && status === 'rejected'

  const save = async () => {
    setSaving(true)
    try {
      const result = await update({ id: application._id, status, adminNotes: notes, notifyApplicant: willReject ? notify : undefined })
      playSound(status === 'accepted' && changed ? 'approve' : 'success')
      toast.success(result.emailed ? `Saved, and we've emailed ${firstName}` : 'Saved')
      onClose()
    } catch (error) {
      playSound('error')
      toast.error(error instanceof Error ? error.message.replace(/^.*ConvexError: /, '').split('\n')[0] : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-black/[0.06] bg-rh-canvas p-0 dark:border-white/[0.08] dark:bg-rh-ink sm:max-w-xl">
        <div className="flex min-h-full flex-col">
          <SheetHeader className="space-y-2 border-b border-black/[0.05] bg-white px-5 py-4 text-left dark:border-white/[0.06] dark:bg-rh-ink-2">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <StatusBadge tone={APPLICATION_TONE[application.status]}>{APPLICATION_STATUS_LABEL[application.status]}</StatusBadge>
            </div>
            <SheetTitle className="text-lg text-rh-ink dark:text-white">{application.fullName}</SheetTitle>
            <SheetDescription className="text-xs">
              {application.jobTitle} · applied {format(application.createdAt, "d MMM yyyy 'at' HH:mm")}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 p-5">
            <div className={cn(cardClass, 'space-y-3 p-4')}>
              <a href={`mailto:${application.email}`} className={linkClass}>
                <Mail className="h-3.5 w-3.5" /> {application.email}
              </a>
              {application.phone && (
                <a href={`tel:${application.phone}`} className={cn(linkClass, 'flex')}>
                  <Phone className="h-3.5 w-3.5" /> {application.phone}
                </a>
              )}
              {application.location && <p className="text-sm text-neutral-600 dark:text-neutral-300">{application.location}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                {application.linkedinUrl && (
                  <a href={application.linkedinUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    LinkedIn <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
                {application.portfolioUrl && (
                  <a href={application.portfolioUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    Website <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {application.cvUrl ? (
              <a
                href={application.cvUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(cardClass, 'flex items-center gap-3 p-4 transition-colors hover:bg-white/70')}
              >
                <FileText className="h-5 w-5 shrink-0 text-rh-ink dark:text-white" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-rh-ink dark:text-white">{application.cvFileName || 'CV.pdf'}</span>
                  <span className="block text-xs text-neutral-500">Open CV</span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-neutral-400" />
              </a>
            ) : (
              <p className="text-sm text-neutral-500">The CV file is no longer available.</p>
            )}

            {application.coverNote && (
              <div className={cn(cardClass, 'p-4')}>
                <p className="text-xs font-medium text-neutral-500">Why this role</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-rh-ink dark:text-neutral-200">{application.coverNote}</p>
              </div>
            )}

            <div className={cn(cardClass, 'space-y-4 p-4')}>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-rh-ink dark:text-white">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ApplicationStatus)}>
                  <SelectTrigger className={inputClass} aria-label="Application status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(APPLICATION_STATUS_LABEL) as ApplicationStatus[]).map((k) => (
                      <SelectItem key={k} value={k}>{APPLICATION_STATUS_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {willAccept && (
                <p className="rounded-xl bg-rh-honeydew px-3.5 py-3 text-sm text-rh-ink">
                  Saving sends {firstName} an email to say their application has been accepted and that we&apos;ll be in touch.
                </p>
              )}
              {willReject && (
                <label className="flex items-start gap-2.5 text-sm text-rh-ink dark:text-neutral-200">
                  <Checkbox checked={notify} onCheckedChange={(v) => setNotify(v === true)} className="mt-0.5" />
                  <span>Email {firstName} a kind note to say we&apos;re not moving forward</span>
                </label>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="application-notes" className="text-sm font-medium text-rh-ink dark:text-white">Notes</Label>
                <Textarea
                  id="application-notes"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Only admins see these"
                  className={cn(inputClass, 'resize-y')}
                />
              </div>

              {application.decisionEmailSentAt && (
                <p className="text-xs text-neutral-500">Decision email sent {format(application.decisionEmailSentAt, 'd MMM yyyy, HH:mm')}</p>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 flex justify-end border-t border-black/[0.05] bg-white p-4 dark:border-white/[0.06] dark:bg-rh-ink-2">
            <Button onClick={save} disabled={saving} className={cn(primaryButtonClass, 'w-full sm:w-auto')}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {willAccept ? 'Accept and email' : 'Save'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
