'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ChevronRight,
  CreditCard,
  Download,
  ExternalLink,
  File as FileIcon,
  FileHeart,
  FileSignature,
  FileText,
  FolderOpen,
  ImageIcon,
  Loader2,
  Lock,
  Search,
  UploadCloud,
  X,
} from '@/components/icons'
import { usePatientDocuments, type PatientDocument, type PatientDocumentType } from '@/lib/hooks/usePatientDocuments'
import { programError } from '@/components/exercise-programs/errors'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import {
  DetailRow,
  EmptyState,
  IconChip,
  InfoTip,
  LoadingBlocks,
  PageContainer,
  PageHeader,
  PageSkeleton,
  Panel,
  PatientDrawer,
  StatusBadge,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  softButtonClass,
  type Tone,
} from '@/components/patient/ui'

/** Same limits as convex/files.ts savePatientDocument */
const ACCEPTED_TYPES = ['application/pdf', 'application/x-pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const ACCEPT_ATTR = 'application/pdf,image/jpeg,image/png,image/webp'
const ACCEPTED_EXTENSIONS = /\.(pdf|jpe?g|png|webp)$/i
const MAX_BYTES = 10 * 1024 * 1024

const DOCUMENT_TYPES: { value: PatientDocumentType; label: string; icon: typeof FileText; tone: Tone }[] = [
  { value: 'medicalRecord', label: 'Medical record', icon: FileHeart, tone: 'blue' },
  { value: 'referralLetter', label: 'Referral letter', icon: FileSignature, tone: 'violet' },
  { value: 'insuranceCard', label: 'Insurance card', icon: CreditCard, tone: 'green' },
  { value: 'otherDocument', label: 'Other', icon: FileIcon, tone: 'neutral' },
]

function typeInfo(type: string) {
  return DOCUMENT_TYPES.find((t) => t.value === type) ?? DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1]
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Older documents have no sharing flag; the server treats them as shared. */
const isShared = (doc: PatientDocument) => doc.sharedWithPhysiotherapist !== false

const isImage = (doc: PatientDocument) => doc.contentType?.startsWith('image/')

function checkFile(file: File): string | null {
  const typeOk = ACCEPTED_TYPES.includes(file.type) || (!file.type && ACCEPTED_EXTENSIONS.test(file.name))
  if (!typeOk) return 'That file type isn’t supported. Choose a PDF, JPG, PNG or WebP file.'
  if (file.size > MAX_BYTES) return 'That file is bigger than 10 MB. Try a smaller copy or a photo of it.'
  return null
}

export default function PatientRecordsPage() {
  const user = useQuery(api.users.getMyUser) as null | { role?: string; patientProfileId?: Id<'patientProfiles'> } | undefined
  const patientProfileId = user?.patientProfileId

  // Patients who came through a booking or Joy may not have their profile linked yet
  const ensureMyPatientProfile = useMutation(api.patients.ensureMyPatientProfile)
  const profileLinkRequested = useRef(false)
  useEffect(() => {
    if (user?.role !== 'patient' || patientProfileId || profileLinkRequested.current) return
    profileLinkRequested.current = true
    ensureMyPatientProfile({}).catch((e) => console.error('Could not link patient profile', e))
  }, [user?.role, patientProfileId, ensureMyPatientProfile])

  const {
    documents = [],
    isLoadingDocuments,
    documentsError,
    uploadPatientDocument,
    isUploadingPatientDocument,
    uploadProgress,
    toggleSharing,
    isTogglingSharing,
  } = usePatientDocuments({ patientProfileId })

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | PatientDocumentType>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest')
  const [selectedType, setSelectedType] = useState<PatientDocumentType>('medicalRecord')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const allDocs = documents as PatientDocument[]
  const filteredDocs = useMemo(() => {
    let list = allDocs
    if (typeFilter !== 'all') list = list.filter((d) => d.documentType === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((d) => d.fileName.toLowerCase().includes(q))
    }
    if (sortOrder === 'newest') list = [...list].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))
    if (sortOrder === 'oldest') list = [...list].sort((a, b) => (a.uploadedAt || 0) - (b.uploadedAt || 0))
    if (sortOrder === 'name') list = [...list].sort((a, b) => a.fileName.localeCompare(b.fileName))
    return list
  }, [allDocs, typeFilter, search, sortOrder])

  const openDoc = allDocs.find((d) => String(d._id) === openId) ?? null
  const sharedCount = allDocs.filter(isShared).length

  if (user === undefined) return <PageSkeleton />

  const chooseFile = (file: File | null | undefined) => {
    if (!file) return
    const problem = checkFile(file)
    if (problem) {
      playSound('error')
      toast.error(problem)
      return
    }
    setSelectedFile(file)
  }

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    chooseFile(event.dataTransfer.files?.[0])
  }

  const handleUpload = async () => {
    if (!patientProfileId) {
      toast.error('Your patient profile is still being set up. Refresh the page and try again.')
      return
    }
    if (!selectedFile) return
    try {
      await uploadPatientDocument(selectedFile, selectedType, patientProfileId)
      playSound('success')
      toast.success('Uploaded', { description: `${selectedFile.name} is in your records.` })
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e: unknown) {
      playSound('error')
      toast.error(programError(e, 'The upload didn’t finish. Check your connection and try again.'))
    }
  }

  const setSharing = async (doc: PatientDocument, shared: boolean) => {
    try {
      await toggleSharing({ documentId: doc._id, shared })
      toast.success(shared ? 'Shared with your physio' : 'Now private to you')
    } catch {
      toast.error('We couldn’t change who can see this file. Please try again.')
    }
  }

  const filtersActive = Boolean(search.trim()) || typeFilter !== 'all'

  return (
    <PageContainer>
      <PageHeader
        title="Records"
        description="Keep scans, reports and letters in one place, so your physio has what they need."
        info="Upload anything that helps with your care: scan results, a doctor’s letter, discharge notes or an insurance card. You decide which files your physio can open."
      />

      {/* Upload */}
      <Panel
        title="Add a file"
        description="PDF, JPG, PNG or WebP, up to 10 MB"
        info="New files are shared with the physiotherapists treating you. You can make any file private afterwards."
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-pt-ink">What is it?</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type of file">
              {DOCUMENT_TYPES.map((type) => {
                const selected = selectedType === type.value
                const Icon = type.icon
                return (
                  <button
                    key={type.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedType(type.value)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-all active:scale-95',
                      selected
                        ? 'border-pt-primary bg-pt-primary font-medium text-pt-on-primary'
                        : 'border-pt-line-strong bg-pt-surface text-pt-ink hover:bg-pt-hover'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {type.label}
                  </button>
                )
              })}
            </div>
          </div>

          {selectedFile ? (
            <div className="space-y-3 rounded-2xl bg-pt-sunken p-4">
              <div className="flex items-center gap-3">
                <IconChip icon={selectedFile.type.startsWith('image/') ? ImageIcon : FileText} tone={typeInfo(selectedType).tone} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-pt-ink">{selectedFile.name}</p>
                  <p className="text-xs text-pt-muted">
                    {formatBytes(selectedFile.size)} · {typeInfo(selectedType).label}
                  </p>
                </div>
                {!isUploadingPatientDocument && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    aria-label="Remove this file"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-pt-muted hover:bg-pt-hover hover:text-pt-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {isUploadingPatientDocument && (
                <div className="h-1.5 overflow-hidden rounded-full bg-pt-line" aria-hidden>
                  <div
                    className="h-full rounded-full bg-pt-accent transition-[width] duration-300"
                    style={{ width: `${Math.max(6, Math.round(uploadProgress || 0))}%` }}
                  />
                </div>
              )}
              <Button
                onClick={handleUpload}
                disabled={isUploadingPatientDocument}
                className={cn(primaryButtonClass, 'h-11 w-full sm:w-auto sm:px-6')}
              >
                {isUploadingPatientDocument ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading… {Math.round(uploadProgress || 0)}%
                  </>
                ) : (
                  <>
                    <UploadCloud className="mr-2 h-4 w-4" />
                    Upload file
                  </>
                )}
              </Button>
            </div>
          ) : (
            <label
              htmlFor="patient-record-upload"
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
                dragging ? 'border-pt-accent bg-pt-accent-soft' : 'border-pt-line-strong bg-pt-sunken hover:bg-pt-hover'
              )}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pt-surface text-pt-ink">
                <UploadCloud className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-pt-ink">
                <span className="hidden sm:inline">Drop a file here, or </span>
                <span className="underline underline-offset-4 sm:no-underline">choose a file</span>
              </span>
              <span className="text-xs text-pt-muted">PDF, JPG, PNG or WebP · up to 10 MB</span>
            </label>
          )}
          <input
            ref={fileInputRef}
            id="patient-record-upload"
            type="file"
            accept={ACCEPT_ATTR}
            className="sr-only"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
        </div>
      </Panel>

      {/* Documents */}
      <Panel
        title="Your files"
        description={
          allDocs.length === 0
            ? 'Nothing here yet'
            : `${allDocs.length} ${allDocs.length === 1 ? 'file' : 'files'} · ${sharedCount} shared with your physio`
        }
        info="“Shared” files can be opened by the physiotherapists treating you. “Private” files are only visible to you."
      >
        {allDocs.length > 0 && (
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" />
              <Input
                placeholder="Search by file name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(fieldClass, 'h-11 pl-10 dark:bg-pt-sunken')}
                aria-label="Search files"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | PatientDocumentType)}>
                <SelectTrigger className={cn(fieldClass, 'h-11 w-full sm:w-44 dark:bg-pt-sunken')} aria-label="Show type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as 'newest' | 'oldest' | 'name')}>
                <SelectTrigger className={cn(fieldClass, 'h-11 w-full sm:w-36 dark:bg-pt-sunken')} aria-label="Sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="name">A to Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {isLoadingDocuments ? (
          <LoadingBlocks rows={3} />
        ) : documentsError ? (
          <div className="rounded-2xl bg-pt-rose-bg p-5 text-center">
            <p className="text-sm font-semibold text-pt-rose-fg">We couldn’t load your files</p>
            <p className="mt-1 text-sm text-pt-rose-fg/80">Refresh the page, or try again in a minute.</p>
          </div>
        ) : filteredDocs.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={filtersActive ? 'No files match' : 'No files yet'}
            description={
              filtersActive
                ? 'Try a different search or type.'
                : 'Add a scan result, a doctor’s letter or anything else your physio should see.'
            }
            action={
              filtersActive ? (
                <Button
                  className={softButtonClass}
                  onClick={() => {
                    setSearch('')
                    setTypeFilter('all')
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button className={primaryButtonClass} onClick={() => fileInputRef.current?.click()}>
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Choose a file
                </Button>
              )
            }
          />
        ) : (
          <ul className="-mx-2 divide-y divide-pt-line">
            {filteredDocs.map((doc) => {
              const info = typeInfo(doc.documentType)
              const shared = isShared(doc)
              return (
                <li key={String(doc._id)} className="flex flex-col gap-2 py-1 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => setOpenId(String(doc._id))}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50"
                  >
                    <IconChip icon={isImage(doc) ? ImageIcon : info.icon} tone={info.tone} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-pt-ink">{doc.fileName}</span>
                      <span className="block truncate text-xs text-pt-muted">
                        {info.label} · {format(new Date(doc.uploadedAt), 'd MMM yyyy')} · {formatBytes(doc.fileSize)}
                      </span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-pt-faint sm:hidden" />
                  </button>
                  <div className="flex items-center justify-between gap-2 px-2 pb-2 sm:justify-end sm:pb-0">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-pt-sunken px-3 py-1.5">
                      <Switch
                        checked={shared}
                        disabled={isTogglingSharing}
                        onCheckedChange={(checked) => setSharing(doc, checked)}
                        aria-label={`Share ${doc.fileName} with my physio`}
                        className="data-[state=checked]:bg-pt-accent"
                      />
                      <span className={cn('w-14 text-xs font-semibold', shared ? 'text-pt-accent-ink' : 'text-pt-muted')}>
                        {shared ? 'Shared' : 'Private'}
                      </span>
                    </label>
                    <Button asChild variant="ghost" size="sm" className="h-9 w-9 rounded-xl p-0 text-pt-muted hover:bg-pt-hover hover:text-pt-ink">
                      <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${doc.fileName}`}>
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <div className="flex items-start gap-3 rounded-3xl bg-pt-sunken p-4 sm:p-5">
        <IconChip icon={Lock} tone="neutral" size="sm" className="bg-pt-surface" />
        <p className="text-sm text-pt-muted">
          Your files are stored securely. Shared files can be opened by the physiotherapists treating you; private files only by
          you.
        </p>
      </div>

      <PatientDrawer
        open={!!openDoc}
        onOpenChange={(open) => !open && setOpenId(null)}
        title={openDoc?.fileName ?? 'File'}
        description={openDoc ? typeInfo(openDoc.documentType).label : undefined}
        footer={
          openDoc ? (
            <div className="grid grid-cols-2 gap-2">
              <Button asChild className={cn(primaryButtonClass, 'h-11')}>
                <a href={openDoc.downloadUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open
                </a>
              </Button>
              <Button asChild className={cn(secondaryButtonClass, 'h-11')}>
                <a href={openDoc.downloadUrl} download={openDoc.fileName} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
            </div>
          ) : undefined
        }
      >
        {openDoc && (
          <div className="space-y-4">
            {isImage(openDoc) ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-pt-sunken">
                <Image src={openDoc.downloadUrl} alt={openDoc.fileName} fill sizes="448px" className="object-contain" unoptimized />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-pt-sunken px-6 py-8 text-center">
                <IconChip icon={typeInfo(openDoc.documentType).icon} tone={typeInfo(openDoc.documentType).tone} size="lg" />
                <p className="text-sm text-pt-muted">Open the file to read it.</p>
              </div>
            )}

            <div className="divide-y divide-pt-line">
              <DetailRow label="Added">{format(new Date(openDoc.uploadedAt), 'EEEE d MMMM yyyy, h:mm a')}</DetailRow>
              <DetailRow label="Size">{formatBytes(openDoc.fileSize)}</DetailRow>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-2xl border border-pt-line p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-sm font-semibold text-pt-ink">
                  Share with my physio
                  <InfoTip>
                    When this is on, the physiotherapists treating you can open this file. Turn it off and only you can see it.
                  </InfoTip>
                </p>
                <p className="mt-0.5 text-xs text-pt-muted">
                  {isShared(openDoc) ? 'Your physio can open this file.' : 'Only you can see this file.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge tone={isShared(openDoc) ? 'green' : 'neutral'}>{isShared(openDoc) ? 'Shared' : 'Private'}</StatusBadge>
                <Switch
                  checked={isShared(openDoc)}
                  disabled={isTogglingSharing}
                  onCheckedChange={(checked) => setSharing(openDoc, checked)}
                  aria-label="Share with my physio"
                  className="data-[state=checked]:bg-pt-accent"
                />
              </div>
            </div>
          </div>
        )}
      </PatientDrawer>
    </PageContainer>
  )
}
