'use client'

import { useRef, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { BookOpen, ExternalLink, Loader2, Upload } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminPage, EmptyState, PageHeader, Panel, StatusBadge, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { uploadToImagekit } from '@/components/learn/video/videoApi'

type Version = { id: string; title: string; version: string; size: number; uploadedAt: number; uploadedBy: string; current: boolean }
type UploadAuth = { token: string; expire: number; signature: string; publicKey: string; folder: string }

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const listRef = makeFunctionReference<'query', Record<string, never>, Version[]>('physioSetup:adminListHandbooks')
const uploadAuthRef = makeFunctionReference<'action', Record<string, never>, UploadAuth>('physioSetup:adminHandbookUploadAuth')
const publishRef = makeFunctionReference<
  'mutation',
  { title: string; version: string; fileId: string; filePath: string; url: string; size: number },
  { id: string }
>('physioSetup:adminPublishHandbook')
const readLinkRef = makeFunctionReference<'action', Record<string, never>, { url: string; expiresAt: number }>('physioSetup:getPracticeHandbookLink')

const MAX_BYTES = 30 * 1024 * 1024
const DEFAULT_TITLE = 'Standard of Physiotherapy Practice'

const errorText = (error: unknown, fallback: string) =>
  error instanceof ConvexError && typeof error.data === 'string' ? error.data : error instanceof Error && error.message ? error.message : fallback

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * The physiotherapist handbook (SOP). Upload a PDF and it becomes the version physios read in
 * Settings → Terms & handbook. It's stored on ImageKit as a private file; physios only ever get
 * links that expire. Earlier versions stay listed for the record.
 */
export default function AdminHandbookPage() {
  const versions = useQuery(listRef, {})
  const getUploadAuth = useAction(uploadAuthRef)
  const publish = useMutation(publishRef)
  const getReadLink = useAction(readLinkRef)

  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [version, setVersion] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [opening, setOpening] = useState(false)
  const busy = progress !== null

  const pick = (picked: File | undefined) => {
    if (!picked) return
    if (picked.type !== 'application/pdf' && !/\.pdf$/i.test(picked.name)) {
      toast.error('Choose a PDF.')
      return
    }
    if (picked.size > MAX_BYTES) {
      toast.error('The PDF must be under 30 MB.')
      return
    }
    setFile(picked)
  }

  const submit = async () => {
    if (!file) return toast.error('Choose the handbook PDF first.')
    if (!version.trim()) return toast.error('Add a version label, e.g. 0.1.')
    setProgress(0)
    try {
      const auth = await getUploadAuth({})
      const uploaded = await uploadToImagekit(file, file.name, auth, { isPrivate: true, onProgress: setProgress })
      await publish({ title: title.trim() || DEFAULT_TITLE, version: version.trim(), ...uploaded })
      toast.success(`Version ${version.trim()} is now the handbook physios see`)
      setFile(null)
      setVersion('')
      if (fileInput.current) fileInput.current.value = ''
    } catch (error) {
      toast.error(errorText(error, 'Couldn’t publish the handbook. Please try again.'))
    } finally {
      setProgress(null)
    }
  }

  const openCurrent = async () => {
    const tab = window.open('', '_blank')
    setOpening(true)
    try {
      const { url } = await getReadLink({})
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch (error) {
      tab?.close()
      toast.error(errorText(error, 'Couldn’t open the handbook.'))
    } finally {
      setOpening(false)
    }
  }

  const current = versions?.find((v) => v.current)

  return (
    <AdminPage className="max-w-4xl">
      <PageHeader
        title="Physio handbook"
        description="Rehabify’s Standard of Physiotherapy Practice. Approved physios read the newest version in Settings → Terms & handbook, through private links that expire."
        actions={
          current && (
            <Button className={softButtonClass} onClick={() => void openCurrent()} disabled={opening}>
              {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Open current version
            </Button>
          )
        }
      />

      <Panel title="Publish a new version" description="The PDF you upload here replaces what physios see straight away. Earlier versions stay listed below.">
        <div className="space-y-4 px-5 pb-5 pt-3">
          <div>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              id="handbook-file"
              onChange={(e) => pick(e.target.files?.[0])}
              disabled={busy}
            />
            <label
              htmlFor="handbook-file"
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-black/15 px-4 py-4 text-sm transition hover:border-black/30 dark:border-white/15 dark:hover:border-white/30"
            >
              <Upload className="h-4 w-4 shrink-0 text-neutral-500" />
              {file ? (
                <span className="min-w-0 truncate text-rh-ink dark:text-white">
                  {file.name} <span className="text-neutral-500">· {megabytes(file.size)}</span>
                </span>
              ) : (
                <span className="text-neutral-500 dark:text-neutral-400">Choose the handbook PDF (up to 30 MB)</span>
              )}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <div>
              <Label htmlFor="handbook-title" className="text-sm font-medium">
                Title
              </Label>
              <Input id="handbook-title" className={`${inputClass} mt-1.5`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
            </div>
            <div>
              <Label htmlFor="handbook-version" className="text-sm font-medium">
                Version
              </Label>
              <Input
                id="handbook-version"
                className={`${inputClass} mt-1.5`}
                value={version}
                maxLength={40}
                placeholder="e.g. 0.1"
                onChange={(e) => setVersion(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          {busy && (
            <div className="h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]" role="progressbar" aria-valuenow={Math.round((progress ?? 0) * 100)}>
              <div className="h-full rounded-full bg-rh-lime transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
            </div>
          )}

          <div className="flex justify-end">
            <Button className={primaryButtonClass} onClick={() => void submit()} disabled={busy || !file || !version.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busy ? `Uploading ${Math.round((progress ?? 0) * 100)}%` : 'Upload and publish'}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Versions">
        {versions === undefined ? (
          <div className="px-5 pb-5">
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : versions.length === 0 ? (
          <EmptyState icon={<BookOpen />} title="No handbook yet" description="Upload the PDF above. Physios see it as soon as it’s published." />
        ) : (
          <ul className="divide-y divide-black/[0.05] px-5 pb-2 dark:divide-white/[0.06]">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-rh-ink dark:text-white">
                    {v.title} <span className="font-normal text-neutral-500">· version {v.version}</span>
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {day(v.uploadedAt)} · {v.uploadedBy} · {megabytes(v.size)}
                  </p>
                </div>
                {v.current ? <StatusBadge tone="green">Current</StatusBadge> : <StatusBadge>Earlier version</StatusBadge>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </AdminPage>
  )
}
