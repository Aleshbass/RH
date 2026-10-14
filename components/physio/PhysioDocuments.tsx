'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Check, FileText, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { useFileUpload } from '@/lib/hooks/useFileUpload'
import { cn } from '@/lib/utils'

export type PhysioDocumentType =
  | 'licenseDocument'
  | 'additionalCertificate'
  | 'degreeCertificate'
  | 'nyscCertificate'
  | 'transcript'
  | 'mrtbLicense'
  | 'npaMembership'
  | 'practicingLicense'
  | 'nationalId'
  | 'passportPhoto'
  | 'proofOfAddress'

export type PhysioDocument = {
  _id: Id<'physiotherapistDocuments'>
  documentType: PhysioDocumentType
  fileName: string
  fileSize: number
  uploadedAt: number
  downloadUrl: string
}

export const DOCUMENT_LABELS: Record<PhysioDocumentType, { title: string; hint?: string }> = {
  nationalId: { title: 'Government ID', hint: 'NIN slip, national ID card, international passport or driver’s licence' },
  mrtbLicense: { title: 'MRTB licence', hint: 'Your current licence from the Medical Rehabilitation Therapists Board' },
  degreeCertificate: { title: 'Degree certificate', hint: 'BPT, BSc or MSc in Physiotherapy' },
  passportPhoto: { title: 'Passport photograph', hint: 'A recent photo on a plain background' },
  practicingLicense: { title: 'Facility practising licence', hint: 'Only if you’re employed by a clinic or hospital' },
  npaMembership: { title: 'NPA membership', hint: 'Nigeria Physiotherapy Association' },
  nyscCertificate: { title: 'NYSC certificate', hint: 'Discharge or exemption certificate' },
  transcript: { title: 'Academic transcript' },
  proofOfAddress: { title: 'Proof of address', hint: 'A utility bill or bank statement from the last 3 months' },
  licenseDocument: { title: 'Licence document' },
  additionalCertificate: { title: 'Other certificate' },
}

const MAX_BYTES = 10 * 1024 * 1024
const PDF_OR_IMAGE = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
const IMAGE_ONLY = ['image/jpeg', 'image/jpg', 'image/png']

/** Live list of the signed-in physio's documents (null profile → empty). */
export function usePhysioDocuments(profileId: Id<'physiotherapistProfiles'> | null | undefined) {
  const documents = useQuery(api.files.getPhysiotherapistDocuments, profileId ? { physiotherapistId: profileId } : 'skip') as
    | PhysioDocument[]
    | undefined
  return profileId ? documents : profileId === null ? [] : undefined
}

/**
 * Uploads a file to Convex storage and records it as one of the physio's documents.
 * Replacing a document removes the previous file of that type.
 */
export function usePhysioDocumentUpload() {
  const { uploadFile } = useFileUpload()
  const save = useMutation(api.files.savePhysiotherapistDocument)
  const remove = useMutation(api.files.deletePhysiotherapistDocument)

  return {
    upload: async (
      profileId: Id<'physiotherapistProfiles'>,
      type: PhysioDocumentType,
      file: File,
      replacing?: PhysioDocument[]
    ) => {
      const allowed = type === 'passportPhoto' ? IMAGE_ONLY : PDF_OR_IMAGE
      if (!allowed.includes(file.type)) {
        throw new Error(type === 'passportPhoto' ? 'Upload a JPG or PNG photo.' : 'Upload a PDF, JPG or PNG file.')
      }
      if (file.size > MAX_BYTES) throw new Error('That file is over 10 MB. Try a smaller scan or photo.')

      const result = await uploadFile(file)
      if (!result?.storageId) throw new Error('Upload failed. Check your connection and try again.')
      await save({
        physiotherapistId: profileId,
        storageId: result.storageId,
        documentType: type,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
      })
      for (const old of replacing ?? []) {
        await remove({ documentId: old._id }).catch(() => undefined)
      }
    },
    remove: (documentId: Id<'physiotherapistDocuments'>) => remove({ documentId }),
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * One document row: what it is, whether it's on file, and upload / replace / remove.
 */
export function DocumentRow({
  type,
  documents,
  onUpload,
  onRemove,
  required,
  disabled,
}: {
  type: PhysioDocumentType
  documents: PhysioDocument[]
  onUpload: (file: File) => Promise<void>
  onRemove?: (doc: PhysioDocument) => Promise<unknown>
  required?: boolean
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const label = DOCUMENT_LABELS[type]
  const current = documents
    .filter((doc) => doc.documentType === type)
    .sort((a, b) => b.uploadedAt - a.uploadedAt)[0]

  const choose = () => inputRef.current?.click()
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      await onUpload(file)
      toast.success(`${label.title} uploaded`)
    } catch (error) {
      toast.error((error as Error).message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={type === 'passportPhoto' ? 'image/png,image/jpeg' : 'application/pdf,image/png,image/jpeg'}
        onChange={handleFile}
      />
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            current
              ? 'bg-[#005b57]/10 text-[#005b57] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf]'
              : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500'
          )}
        >
          {current ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900 dark:text-white">
            {label.title}
            {required && !current && <span className="ml-1.5 text-xs font-normal text-amber-600 dark:text-amber-400">Required</span>}
          </p>
          {current ? (
            <a
              href={current.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs text-neutral-500 hover:text-neutral-900 hover:underline dark:text-neutral-400 dark:hover:text-white"
            >
              {current.fileName} · {formatSize(current.fileSize)} · {format(current.uploadedAt, 'd MMM yyyy')}
            </a>
          ) : (
            label.hint && <p className="text-xs text-neutral-500 dark:text-neutral-400">{label.hint}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 pl-11 sm:pl-0">
        {current && onRemove && !required && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || disabled}
            className="text-neutral-500"
            onClick={async () => {
              setBusy(true)
              try {
                await onRemove(current)
              } catch {
                toast.error('Couldn’t remove that file')
              } finally {
                setBusy(false)
              }
            }}
          >
            Remove
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={choose} disabled={busy || disabled}>
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            !current && <Upload className="mr-1.5 h-4 w-4" />
          )}
          {busy ? 'Uploading…' : current ? 'Replace' : 'Upload'}
        </Button>
      </div>
    </div>
  )
}
