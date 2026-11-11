'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { History, Loader2 } from '@/components/icons'
import { ConfirmDialog } from '@/components/admin/ui'
import { blogApi, errorText, type PostId, type RevisionRow } from '@/lib/blog/api'

const REASON: Record<RevisionRow['reason'], string> = {
  autosave: 'Saved while editing',
  submitted: 'Sent for review',
  published: 'Published',
  restored: 'Before a restore',
}

/** Earlier versions of the post (kept on submit, publish, and every 10 minutes of editing). */
export function HistoryPanel({
  postId,
  canRestore,
  flush,
  onRestored,
}: {
  postId: PostId
  canRestore: boolean
  flush: () => Promise<boolean>
  onRestored: (version: { title: string; body: string }) => void
}) {
  const revisions = useQuery(blogApi.listRevisions, { postId }) as RevisionRow[] | undefined
  const restore = useMutation(blogApi.restoreRevision)
  const [target, setTarget] = useState<RevisionRow | null>(null)

  if (revisions === undefined) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    )
  }
  if (revisions.length === 0) {
    return <p className="py-6 text-center text-[13px] text-neutral-500">No earlier versions yet. One is kept every 10 minutes while you write.</p>
  }

  return (
    <div>
      <ol className="space-y-1">
        {revisions.map((r) => (
          <li key={r._id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-rh-canvas dark:hover:bg-white/[0.04]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rh-canvas text-neutral-500 dark:bg-white/[0.06]">
              <History className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-rh-ink dark:text-white">{REASON[r.reason]}</span>
              <span className="block truncate text-[12px] text-neutral-500">
                {formatDistanceToNow(r.savedAt, { addSuffix: true })} · {r.savedBy} · {r.words} words
              </span>
            </span>
            {canRestore ? (
              <button type="button" onClick={() => setTarget(r)} className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-rh-ink hover:bg-rh-honeydew dark:text-white dark:hover:bg-white/10">
                Restore
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Go back to this version?"
        description="The title and text return to how they were then. What you have now is kept in the history first, so you can come back to it."
        confirmLabel="Restore"
        onConfirm={async () => {
          if (!target) return
          if (!(await flush())) return
          try {
            const version = await restore({ revisionId: target._id })
            onRestored(version)
            toast.success('Version restored.')
          } catch (error) {
            toast.error(errorText(error))
            throw error
          }
        }}
      />
    </div>
  )
}
