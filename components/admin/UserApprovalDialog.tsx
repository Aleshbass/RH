'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Calendar, Check, ExternalLink, FileText, Languages, Loader2, Mail, MapPin, Phone, X } from '@/components/icons'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  EmptyState,
  IconChip,
  StatusBadge,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  softButtonClass,
  tabsListClass,
} from '@/components/admin/ui'
import { RoleBadge, UserAvatar, displayName } from '@/components/dashboard/admin/UserManagement'
import { cn } from '@/lib/utils'

interface PhysiotherapistProfile {
  licenseNumber?: string
  yearsOfExperience?: number
  specializations?: string[]
  languagesSpoken?: string[]
  bio?: string
  referralSource?: string
  location?: string
  gender?: string
  dateOfBirth?: string
  certificationBoard?: string
  certificationYear?: number
  licenseExpiryDate?: string
}

interface ClinicProfile {
  name: string
  address?: string
  city?: string
  country?: string
  contactEmail?: string
  contactPhone?: string
  referralSource?: string
}

type ApprovalDocument = {
  _id: string
  fileName?: string
  documentType?: string
  fileSize?: number
  uploadedAt?: number
  downloadUrl?: string | null
}

type ApprovalDetails = {
  user: {
    _id: string
    role: string
    firstName?: string
    lastName?: string
    email?: string
    phoneNumber?: string
    imageUrl?: string
    _creationTime: number
  }
  approvalStatus: { status: string; submittedAt?: number } | null
  profileDetails: PhysiotherapistProfile | ClinicProfile | null
  documents: ApprovalDocument[]
}

interface UserApprovalDialogProps {
  userId: Id<'users'> | null
  isOpen: boolean
  onClose: () => void
  /** Should toast/play sounds itself and throw on failure (the dialog then stays open). */
  onApprove: (userId: Id<'users'>, comments?: string) => Promise<void>
  onDecline: (userId: Id<'users'>, comments: string) => Promise<void>
}

const DOCUMENT_LABELS: Record<string, string> = {
  licenseDocument: 'Licence',
  additionalCertificate: 'Certificate',
  degreeCertificate: 'Degree certificate',
  nyscCertificate: 'NYSC certificate',
  transcript: 'Transcript',
  mrtbLicense: 'MRTB licence',
  npaMembership: 'NPA membership',
  practicingLicense: 'Practising licence',
  nationalId: 'National ID',
  passportPhoto: 'Passport photo',
  proofOfAddress: 'Proof of address',
}

export function documentLabel(type?: string) {
  if (!type) return 'Document'
  return DOCUMENT_LABELS[type] ?? type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
}

function formatFileSize(bytes: number) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function Detail({ label, children, icon: Icon }: { label: string; children: ReactNode; icon?: typeof Mail }) {
  return (
    <div className="rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.04]">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 break-words text-sm font-semibold text-rh-night dark:text-white">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-rh-teal dark:text-rh-aqua" />}
        {children}
      </p>
    </div>
  )
}

export function UserApprovalDialog({ userId, isOpen, onClose, onApprove, onDecline }: UserApprovalDialogProps) {
  const [action, setAction] = useState<'approve' | 'decline' | null>(null)
  const [comments, setComments] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Reset the form whenever a different applicant is opened
  useEffect(() => {
    setAction(null)
    setComments('')
  }, [userId, isOpen])

  const approvalDetails = useQuery(api.accountApproval.getApprovalDetails, userId && isOpen ? { userId } : 'skip') as
    | ApprovalDetails
    | null
    | undefined

  const handleAction = async () => {
    if (!action || !userId) return
    if (action === 'decline' && !comments.trim()) return
    setIsLoading(true)
    try {
      if (action === 'approve') await onApprove(userId, comments.trim() || undefined)
      else await onDecline(userId, comments.trim())
      setAction(null)
      setComments('')
      onClose()
    } catch {
      // The caller already showed the error; keep the dialog open so the admin can retry.
    } finally {
      setIsLoading(false)
    }
  }

  const user = approvalDetails?.user
  const profileDetails = approvalDetails?.profileDetails ?? null
  const documents = approvalDetails?.documents ?? []

  const renderProfile = () => {
    if (!user || !profileDetails) {
      return <EmptyState title="No profile details" description="The applicant has not filled in their professional details yet." />
    }
    if (user.role === 'physiotherapist') {
      const p = profileDetails as PhysiotherapistProfile
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {p.licenseNumber && <Detail label="Licence number">{p.licenseNumber}</Detail>}
            {p.licenseExpiryDate && <Detail label="Licence expiry">{p.licenseExpiryDate}</Detail>}
            {p.certificationBoard && <Detail label="Certification board">{p.certificationBoard}</Detail>}
            {p.certificationYear && <Detail label="Certification year">{p.certificationYear}</Detail>}
            {p.yearsOfExperience !== undefined && <Detail label="Experience">{p.yearsOfExperience} years</Detail>}
            {p.location && (
              <Detail label="Location" icon={MapPin}>
                {p.location}
              </Detail>
            )}
            {p.gender && (
              <Detail label="Gender">
                <span className="capitalize">{p.gender}</span>
              </Detail>
            )}
            {p.dateOfBirth && <Detail label="Date of birth">{p.dateOfBirth}</Detail>}
          </div>
          {p.specializations && p.specializations.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Specialisations</p>
              <div className="flex flex-wrap gap-1.5">
                {p.specializations.map((s, i) => (
                  <StatusBadge key={`${s}-${i}`} tone="teal">
                    {s}
                  </StatusBadge>
                ))}
              </div>
            </div>
          )}
          {p.languagesSpoken && p.languagesSpoken.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Languages</p>
              <div className="flex flex-wrap gap-1.5">
                {p.languagesSpoken.map((l, i) => (
                  <StatusBadge key={`${l}-${i}`} className="gap-1">
                    <Languages className="h-3 w-3" />
                    {l}
                  </StatusBadge>
                ))}
              </div>
            </div>
          )}
          {p.bio && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Bio</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">{p.bio}</p>
            </div>
          )}
          {p.referralSource && <Detail label="How they heard about us">{p.referralSource}</Detail>}
        </div>
      )
    }
    if (user.role === 'clinic_owner') {
      const c = profileDetails as ClinicProfile
      const address = [c.address, c.city, c.country].filter(Boolean).join(', ')
      return (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Detail label="Clinic name">{c.name || '—'}</Detail>
          {address && (
            <Detail label="Address" icon={MapPin}>
              {address}
            </Detail>
          )}
          {c.contactEmail && (
            <Detail label="Clinic email" icon={Mail}>
              {c.contactEmail}
            </Detail>
          )}
          {c.contactPhone && (
            <Detail label="Clinic phone" icon={Phone}>
              {c.contactPhone}
            </Detail>
          )}
          {c.referralSource && <Detail label="How they heard about us">{c.referralSource}</Detail>}
        </div>
      )
    }
    return <EmptyState title="No profile details" description="This role has no professional profile to review." />
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl p-0 dark:border-white/10 dark:bg-rh-ink-2">
        <DialogHeader className="space-y-0 border-b border-black/[0.05] p-5 text-left dark:border-white/[0.06]">
          <DialogTitle className="sr-only">Review application</DialogTitle>
          <DialogDescription className="sr-only">Applicant details and documents for the approval decision</DialogDescription>
          {user ? (
            <div className="flex items-center gap-3 pr-6">
              <UserAvatar user={user} className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-rh-night dark:text-white">{displayName(user)}</p>
                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{user.email}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <RoleBadge role={user.role} />
                  <StatusBadge tone="amber">
                    Submitted {format(new Date(approvalDetails?.approvalStatus?.submittedAt ?? user._creationTime), 'd MMM yyyy')}
                  </StatusBadge>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full dark:bg-white/[0.06]" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40 dark:bg-white/[0.06]" />
                <Skeleton className="h-3 w-56 dark:bg-white/[0.06]" />
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {approvalDetails === undefined ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-xl dark:bg-white/[0.06]" />
              <Skeleton className="h-40 w-full rounded-xl dark:bg-white/[0.06]" />
            </div>
          ) : approvalDetails === null || !user ? (
            <EmptyState title="Application not found" description="This applicant may have been deleted." />
          ) : (
            <Tabs defaultValue="profile" className="space-y-4">
              <TabsList className={tabsListClass}>
                <TabsTrigger value="profile" className="text-xs font-semibold">
                  Profile
                </TabsTrigger>
                <TabsTrigger value="documents" className="text-xs font-semibold">
                  Documents ({documents.length})
                </TabsTrigger>
                <TabsTrigger value="contact" className="text-xs font-semibold">
                  Contact
                </TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="mt-0">
                {renderProfile()}
              </TabsContent>

              <TabsContent value="documents" className="mt-0">
                {documents.length === 0 ? (
                  <EmptyState icon={<FileText />} title="No documents uploaded" description="Ask the applicant to upload their licence and ID before approving." />
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc._id} className="flex items-center justify-between gap-3 rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.04]">
                        <div className="flex min-w-0 items-center gap-3">
                          <IconChip icon={FileText} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-rh-night dark:text-white">{doc.fileName || 'Untitled file'}</p>
                            <p className="flex flex-wrap items-center gap-x-2 text-xs text-neutral-500 dark:text-neutral-400">
                              <span>{documentLabel(doc.documentType)}</span>
                              {doc.fileSize ? <span>{formatFileSize(doc.fileSize)}</span> : null}
                              {doc.uploadedAt ? <span>{format(new Date(doc.uploadedAt), 'd MMM yyyy')}</span> : null}
                            </p>
                          </div>
                        </div>
                        {doc.downloadUrl ? (
                          <Button asChild size="sm" className={softButtonClass}>
                            <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                              View
                            </a>
                          </Button>
                        ) : (
                          <StatusBadge tone="red">File missing</StatusBadge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="contact" className="mt-0">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Detail label="Email" icon={Mail}>
                    {user.email || '—'}
                  </Detail>
                  <Detail label="Phone" icon={Phone}>
                    {user.phoneNumber || '—'}
                  </Detail>
                  <Detail label="Member since" icon={Calendar}>
                    {format(new Date(user._creationTime), 'd MMM yyyy')}
                  </Detail>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {action && user && (
            <div
              className={cn(
                'mt-5 rounded-xl p-4',
                action === 'approve' ? 'bg-rh-mint dark:bg-emerald-400/10' : 'bg-rh-blush dark:bg-rose-400/10'
              )}
            >
              <label htmlFor="approval-comments" className="text-sm font-semibold text-rh-night dark:text-white">
                {action === 'approve' ? 'Note for the applicant (optional)' : 'Reason for declining (required)'}
              </label>
              <p className="mb-2 text-xs text-neutral-600 dark:text-neutral-300">
                {action === 'approve'
                  ? 'Included in their approval email.'
                  : 'They will see this in the decline email, so say what to fix before reapplying.'}
              </p>
              <Textarea
                id="approval-comments"
                autoFocus
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={action === 'approve' ? 'Welcome aboard…' : 'For example: the licence uploaded has expired.'}
                className={inputClass}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-black/[0.05] p-4 dark:border-white/[0.06] sm:justify-between">
          {!action ? (
            <>
              <Button variant="ghost" onClick={onClose} className="rounded-xl dark:text-white dark:hover:bg-white/[0.06]">
                Close
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  onClick={() => setAction('decline')}
                  disabled={!user}
                  className="rounded-xl bg-rh-blush text-[#be123c] hover:bg-rose-100 dark:bg-rose-400/10 dark:text-rose-300 dark:hover:bg-rose-400/20"
                >
                  <X className="mr-2 h-4 w-4" />
                  Decline
                </Button>
                <Button onClick={() => setAction('approve')} disabled={!user} className={primaryButtonClass}>
                  <Check className="mr-2 h-4 w-4" />
                  Approve
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setAction(null)
                  setComments('')
                }}
                disabled={isLoading}
                className="rounded-xl dark:text-white dark:hover:bg-white/[0.06]"
              >
                Back
              </Button>
              <Button
                onClick={handleAction}
                disabled={isLoading || (action === 'decline' && !comments.trim())}
                className={action === 'approve' ? primaryButtonClass : dangerButtonClass}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {action === 'approve' ? 'Confirm approval' : 'Decline application'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
