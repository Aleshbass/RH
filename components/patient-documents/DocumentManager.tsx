'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useMutation } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { toast } from 'sonner'
import type { Id } from '@/convex/_generated/dataModel'
import { Check, Download, FileText, Loader2, Lock, MoreHorizontal, Pencil, Tag, Trash2, Upload, X } from '@/components/icons'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, Panel, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui'
import { programError } from '@/components/exercise-programs/errors'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

/**
 * Files on a patient's record (referral letters, scans, reports, HMO cards), for the physio
 * workspace's Files tab and the clinic record's Documents tab: add several at once, tick files to
 * download or delete them together, and rename, re-type or delete one from its menu.
 * Who may change a file is decided on the server (convex/helpers/patientDocuments.ts): the care
 * team for 24 hours after it was added, then only the clinic admin. Each row says which.
 */

export type DocumentType = 'referralLetter' | 'medicalRecord' | 'insuranceCard' | 'otherDocument'

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  medicalRecord: 'Medical record or scan',
  referralLetter: 'Referral letter',
  insuranceCard: 'Insurance or HMO card',
  otherDocument: 'Other',
}
const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]

/** A file as files:getPatientDocumentsForPhysio and clinicTools:getClinicPatientFullRecord return it. */
export type ManagedDocument = {
  _id: string
  fileName: string
  documentType?: string
  fileSize?: number
  uploadedAt?: number
  downloadUrl?: string | null
  /** A name, "Patient", or null for older files that don't say */
  uploadedByName?: string | null
  /** The viewer may rename, re-type or delete it now */
  canEdit?: boolean
  /** When that right ends (24 hours after the upload) */
  editableUntil?: number
  /** Why the viewer can't change it, when the care team can't after 24 hours */
  lockedReason?: string
}

type DeleteResult = { deleted: number; skipped: { documentId: string; fileName: string; reason: string }[] }

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const updateDocumentRef = makeFunctionReference<
  'mutation',
  { documentId: Id<'patientDocuments'>; fileName?: string; documentType?: DocumentType },
  { changed: boolean }
>('files:updatePatientDocument')
const deleteDocumentsRef = makeFunctionReference<'mutation', { documentIds: Id<'patientDocuments'>[] }, DeleteResult>(
  'files:deletePatientDocuments'
)

const MAX_FILE_BYTES = 15 * 1024 * 1024
const LOCKED_AFTER_WINDOW = 'Only the clinic admin can change files after 24 hours.'

const checkboxClass =
  'border-pt-line-strong data-[state=checked]:border-pt-accent data-[state=checked]:bg-pt-accent data-[state=checked]:text-[#06210a] dark:data-[state=checked]:border-pt-accent dark:data-[state=checked]:bg-pt-accent dark:data-[state=checked]:text-[#06210a]'

function formatSize(bytes: number | undefined) {
  if (!bytes) return null
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "Editable for 5 h" / "Editable for 20 min" */
function editableFor(until: number, now: number) {
  const ms = until - now
  if (ms >= 60 * 60 * 1000) return `Editable for ${Math.floor(ms / (60 * 60 * 1000))} h`
  return `Editable for ${Math.max(1, Math.ceil(ms / 60_000))} min`
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** Saves a file under its own name; where the browser can't fetch it, opens it in a new tab. */
async function saveFile(url: string, fileName: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(String(response.status))
    const blobUrl = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000)
    return true
  } catch {
    return Boolean(window.open(url, '_blank', 'noopener,noreferrer'))
  }
}

export function DocumentManager({
  documents,
  uploadOne,
  accept,
  uploadHint,
  defaultType,
  title,
  description,
  guard,
}: {
  /** undefined while loading */
  documents: ManagedDocument[] | undefined
  /** Adds one file to the record. Without it there's no upload panel (e.g. care has ended). */
  uploadOne?: (file: File, documentType: DocumentType) => Promise<void>
  accept: string
  uploadHint: string
  defaultType: DocumentType
  title: string
  description: string
  /** Asked before any change; false stops it (the clinic's "can't take changes yet" prompt) */
  guard?: (actionName: string) => boolean
}) {
  const updateDocument = useMutation(updateDocumentRef)
  const deleteDocuments = useMutation(deleteDocumentsRef)
  const inputRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState<DocumentType>(defaultType)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  // Rename starts from the row's menu: keep focus in the name field when the menu closes
  const focusRename = useRef(false)
  // The 24-hour window runs out while the page is open: re-check every minute
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const sorted = useMemo(() => [...(documents ?? [])].sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0)), [documents])
  // Files that left the record (deleted here or elsewhere) drop out of the selection
  const chosen = sorted.filter((doc) => selected.has(doc._id))
  const allSelected = sorted.length > 0 && chosen.length === sorted.length

  const editable = (doc: ManagedDocument) => Boolean(doc.canEdit) && (!doc.editableUntil || doc.editableUntil > now)
  const lockedHint = (doc: ManagedDocument) => {
    if (editable(doc)) return null
    if (doc.canEdit) return LOCKED_AFTER_WINDOW // the window ran out while the page was open
    return doc.lockedReason ?? null
  }
  const typeLabel = (value?: string) => DOCUMENT_TYPE_LABELS[value as DocumentType] ?? 'Document'

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const uploadFiles = async (files: File[]) => {
    if (!uploadOne || files.length === 0) return
    if (guard && !guard('Upload document')) return
    const failed: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProgress({ current: i + 1, total: files.length })
      if (file.size > MAX_FILE_BYTES) {
        failed.push(`${file.name}: it’s over 15 MB`)
        continue
      }
      try {
        await uploadOne(file, docType)
      } catch (error) {
        failed.push(`${file.name}: ${programError(error, 'The upload didn’t go through.')}`)
      }
    }
    setProgress(null)
    const added = files.length - failed.length
    if (failed.length === 0) {
      playSound('success')
      toast.success(files.length === 1 ? `${files[0].name} added` : `${added} files added`)
    } else {
      playSound('error')
      const headline =
        files.length === 1
          ? 'The file didn’t upload'
          : added > 0
            ? `${added} of ${files.length} files added. ${failed.length} didn’t upload.`
            : `None of the ${files.length} files uploaded`
      toast.error(headline, { description: failed.join(' · ') })
    }
  }

  const saveChange = async (doc: ManagedDocument, change: { fileName?: string; documentType?: DocumentType }) => {
    if (guard && !guard('Change document')) return
    setSavingId(doc._id)
    try {
      const result = await updateDocument({ documentId: doc._id as Id<'patientDocuments'>, ...change })
      if (result.changed) {
        playSound('success')
        toast.success(change.fileName !== undefined ? 'File renamed' : `Saved as ${typeLabel(change.documentType)}`)
      }
      setRenaming(null)
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t save the change. Please try again.'))
    } finally {
      setSavingId(null)
    }
  }

  const submitRename = (doc: ManagedDocument) => {
    if (!renaming) return
    const value = renaming.value.trim()
    if (!value) {
      toast.error('Give the file a name')
      return
    }
    if (value === doc.fileName) {
      setRenaming(null)
      return
    }
    void saveChange(doc, { fileName: value })
  }

  const askDelete = (ids: string[]) => {
    if (ids.length === 0) return
    if (guard && !guard('Delete documents')) return
    setConfirmIds(ids)
  }

  const runDelete = async () => {
    if (!confirmIds) return
    setDeleting(true)
    try {
      const result = await deleteDocuments({ documentIds: confirmIds as Id<'patientDocuments'>[] })
      const reasons = [...new Set(result.skipped.map((s) => s.reason))]
      const skippedText = result.skipped.length
        ? `${result.skipped.length} couldn’t be deleted: ${lowerFirst(reasons.join(' '))}`
        : ''
      if (result.deleted === 0) {
        playSound('error')
        toast.error(
          result.skipped.length === 1 ? `Not deleted: ${lowerFirst(reasons[0] ?? '')}` : `None deleted. ${skippedText}`
        )
      } else if (result.skipped.length) {
        playSound('success')
        toast.warning(`Deleted ${result.deleted}. ${skippedText}`)
      } else {
        playSound('success')
        toast.success(result.deleted === 1 ? 'File deleted' : `Deleted ${result.deleted} files`)
      }
      setSelected((prev) => {
        const next = new Set(prev)
        const kept = new Set(result.skipped.map((s) => s.documentId))
        for (const id of confirmIds) if (!kept.has(id)) next.delete(id)
        return next
      })
      setConfirmIds(null)
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t delete. Please try again.'))
    } finally {
      setDeleting(false)
    }
  }

  const downloadSelected = async () => {
    const files = chosen.filter((doc) => doc.downloadUrl)
    if (files.length === 0) return
    setDownloading(true)
    let failed = 0
    for (const doc of files) {
      if (!(await saveFile(doc.downloadUrl as string, doc.fileName))) failed += 1
    }
    setDownloading(false)
    if (failed > 0) toast.error(`${failed} file${failed === 1 ? '' : 's'} didn’t download. Allow pop-ups, or open them one at a time.`)
  }

  const confirmDocs = sorted.filter((doc) => confirmIds?.includes(doc._id))
  const confirmLocked = confirmDocs.filter((doc) => !editable(doc)).length
  const uploading = progress !== null

  return (
    <div className="space-y-5">
      {uploadOne && (
        <Panel>
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept={accept}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                event.target.value = ''
                void uploadFiles(files)
              }}
            />
            <Select value={docType} onValueChange={(value) => setDocType(value as DocumentType)}>
              <SelectTrigger className={cn(fieldClass, 'h-10 sm:w-60')} aria-label="Document type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {DOCUMENT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => inputRef.current?.click()} disabled={uploading} className={cn(primaryButtonClass, 'h-10')}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {progress ? (progress.total > 1 ? `Uploading ${progress.current} of ${progress.total}…` : 'Uploading…') : 'Upload files'}
            </Button>
            <p className="text-xs text-pt-muted">{uploadHint}</p>
          </div>
        </Panel>
      )}

      <Panel title={title} description={description}>
        {documents === undefined ? (
          <div className="p-5">
            <Skeleton className="h-12 rounded-xl bg-pt-sunken" />
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState icon={<FileText />} title="No files yet" />
        ) : (
          <>
            {/* Select all, and what to do with the ticked files */}
            <div
              className={cn(
                'mx-2 mt-1 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-1.5 sm:mx-3',
                chosen.length > 0 && 'bg-pt-sunken'
              )}
            >
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-pt-muted">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(value) => setSelected(value === true ? new Set(sorted.map((doc) => doc._id)) : new Set())}
                  aria-label="Select all files"
                  className={checkboxClass}
                />
                {chosen.length > 0 ? (
                  <span className="font-medium text-pt-ink">{chosen.length} selected</span>
                ) : (
                  'Select all'
                )}
              </label>
              {chosen.length > 0 && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button size="sm" className={cn(secondaryButtonClass, 'h-9')} disabled={downloading} onClick={() => void downloadSelected()}>
                    {downloading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                    Download
                  </Button>
                  <Button
                    size="sm"
                    className="h-9 rounded-xl border-0 bg-pt-rose-bg text-pt-rose-fg shadow-none transition hover:brightness-95 active:scale-[0.98]"
                    // Nothing ticked can be deleted by this person (e.g. care has ended)
                    disabled={!chosen.some(editable)}
                    onClick={() => askDelete(chosen.map((doc) => doc._id))}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 rounded-xl text-pt-muted hover:bg-pt-hover hover:text-pt-ink"
                    onClick={() => setSelected(new Set())}
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>

            <ul className="px-2 pb-2 sm:px-3">
              {sorted.map((doc) => {
                const canChange = editable(doc)
                const hint = lockedHint(doc)
                const isRenaming = renaming?.id === doc._id
                const saving = savingId === doc._id
                const uploadedAt = doc.uploadedAt ? format(doc.uploadedAt, 'd MMM yyyy, h:mm a') : null
                return (
                  <li
                    key={doc._id}
                    className={cn('flex items-start gap-3 rounded-2xl px-3 py-2.5', selected.has(doc._id) && 'bg-pt-sunken/60')}
                  >
                    <Checkbox
                      checked={selected.has(doc._id)}
                      onCheckedChange={(value) => toggle(doc._id, value === true)}
                      aria-label={`Select ${doc.fileName}`}
                      className={cn(checkboxClass, 'mt-3')}
                    />
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pt-sunken text-pt-ink">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            autoFocus
                            value={renaming.value}
                            maxLength={200}
                            disabled={saving}
                            onChange={(event) => setRenaming({ id: doc._id, value: event.target.value })}
                            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                submitRename(doc)
                              } else if (event.key === 'Escape') {
                                setRenaming(null)
                              }
                            }}
                            aria-label="File name"
                            className={cn(fieldClass, 'h-9')}
                          />
                          <Button
                            size="icon"
                            className={cn(primaryButtonClass, 'h-9 w-9 shrink-0')}
                            disabled={saving}
                            onClick={() => submitRename(doc)}
                            aria-label="Save name"
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 shrink-0 rounded-xl hover:bg-pt-hover"
                            disabled={saving}
                            onClick={() => setRenaming(null)}
                            aria-label="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <p className="truncate text-sm font-medium text-pt-ink">{doc.fileName}</p>
                      )}
                      <p className="truncate text-xs text-pt-muted">
                        {[typeLabel(doc.documentType), formatSize(doc.fileSize)].filter(Boolean).join(' · ')}
                      </p>
                      <p className="text-xs text-pt-muted">
                        {doc.uploadedByName ? `Uploaded by ${doc.uploadedByName}` : 'Uploaded'}
                        {uploadedAt && ` · ${uploadedAt}`}
                        {canChange && doc.editableUntil && (
                          <span className="font-medium text-pt-ink"> · {editableFor(doc.editableUntil, now)}</span>
                        )}
                      </p>
                      {hint && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-pt-faint">
                          <Lock className="h-3 w-3 shrink-0" />
                          {hint}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {doc.downloadUrl && (
                        <Button asChild variant="ghost" size="icon" className="rounded-xl hover:bg-pt-hover" aria-label={`Open ${doc.fileName}`}>
                          <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-xl hover:bg-pt-hover"
                            disabled={!canChange || saving}
                            aria-label={canChange ? `Change ${doc.fileName}` : hint ?? 'You can’t change this file'}
                            title={canChange ? undefined : hint ?? undefined}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-52 rounded-2xl border-pt-line bg-pt-surface p-1.5 text-pt-ink shadow-pt-lift"
                          onCloseAutoFocus={(event) => {
                            if (!focusRename.current) return
                            focusRename.current = false
                            event.preventDefault()
                          }}
                        >
                          <DropdownMenuItem
                            className="rounded-xl px-3 py-2.5 focus:bg-pt-hover"
                            onSelect={() => {
                              if (guard && !guard('Rename document')) return
                              focusRename.current = true
                              setRenaming({ id: doc._id, value: doc.fileName })
                            }}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="rounded-xl px-3 py-2.5 focus:bg-pt-hover data-[state=open]:bg-pt-hover">
                              <Tag className="mr-2 h-3.5 w-3.5" />
                              Change type
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="rounded-2xl border-pt-line bg-pt-surface p-1.5 text-pt-ink shadow-pt-lift">
                              <DropdownMenuRadioGroup
                                value={doc.documentType}
                                onValueChange={(value) => void saveChange(doc, { documentType: value as DocumentType })}
                              >
                                {DOCUMENT_TYPES.map((type) => (
                                  <DropdownMenuRadioItem key={type} value={type} className="rounded-xl py-2.5 focus:bg-pt-hover">
                                    {DOCUMENT_TYPE_LABELS[type]}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSeparator className="bg-pt-line" />
                          <DropdownMenuItem
                            className="rounded-xl px-3 py-2.5 text-pt-rose-fg focus:bg-pt-rose-bg focus:text-pt-rose-fg"
                            onSelect={() => askDelete([doc._id])}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Panel>

      <AlertDialog open={confirmIds !== null} onOpenChange={(open) => !open && !deleting && setConfirmIds(null)}>
        <AlertDialogContent className="rounded-2xl border-pt-line bg-pt-surface text-pt-ink">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-pt-ink">
              {confirmDocs.length === 1 ? `Delete ${confirmDocs[0].fileName}?` : `Delete ${confirmDocs.length} files?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pt-muted">
              {confirmDocs.length === 1 ? 'It leaves' : 'They leave'} this patient’s record for everyone. A copy is kept for the audit trail.
              {confirmLocked > 0 && ` ${confirmLocked} of them will stay: only the clinic admin can delete ${confirmLocked === 1 ? 'it' : 'them'}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cn(secondaryButtonClass, 'h-11 sm:h-10')} disabled={deleting}>
              Keep
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl bg-pt-rose-fg text-pt-surface hover:bg-pt-rose-fg/90 sm:h-10"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                void runDelete()
              }}
            >
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
