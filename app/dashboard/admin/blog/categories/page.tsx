'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { ArrowUpRight, Loader2, Pencil, Plus, Tags, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AdminPage, ConfirmDialog, EmptyState, PageHeader, Panel, inputClass, primaryButtonClass } from '@/components/admin/ui'
import { useConsoleRole } from '@/components/admin/shell/consoleRole'
import { blogApi, errorText, type CategoryRow } from '@/lib/blog/api'

type Draft = { _id?: CategoryRow['_id']; name: string; slug: string; description: string; order: number }

export default function BlogCategoriesPage() {
  const role = useConsoleRole()
  const categories = useQuery(blogApi.adminCategories, {}) as CategoryRow[] | undefined
  const save = useMutation(blogApi.saveCategory)
  const remove = useMutation(blogApi.deleteCategory)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [target, setTarget] = useState<CategoryRow | null>(null)
  const isAdmin = role === 'admin'

  const submit = async () => {
    if (!draft) return
    setSaving(true)
    try {
      await save({ categoryId: draft._id, name: draft.name, slug: draft.slug || undefined, description: draft.description, order: draft.order })
      toast.success('Topic saved.')
      setDraft(null)
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminPage className="max-w-4xl">
      <PageHeader
        eyebrow="Blog"
        title="Topics"
        description="Each topic gets its own page on the blog (for example /blog/category/back-pain), which helps people and Google find related posts."
        actions={
          isAdmin ? (
            <Button type="button" className={primaryButtonClass} onClick={() => setDraft({ name: '', slug: '', description: '', order: (categories?.length ?? 0) + 1 })}>
              <Plus className="mr-1.5 h-4 w-4" /> New topic
            </Button>
          ) : null
        }
      />
      <Panel bodyClassName="p-0">
        {categories === undefined ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : categories.length === 0 ? (
          <EmptyState icon={<Tags />} title="No topics yet" description="Good first topics: Back and neck pain, Sports injuries, After surgery, Stroke recovery, Living with arthritis." />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {categories.map((c) => (
              <li key={c._id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-rh-ink dark:text-white">{c.name}</p>
                  <p className="truncate text-[12px] text-neutral-500">
                    /blog/category/{c.slug} · {c.postCount} post{c.postCount === 1 ? '' : 's'}
                    {c.description ? ` · ${c.description}` : ''}
                  </p>
                </div>
                <a href={`/blog/category/${c.slug}`} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-neutral-500 hover:bg-rh-canvas hover:text-rh-ink dark:hover:bg-white/10" title="View">
                  <ArrowUpRight className="h-4 w-4" />
                </a>
                {isAdmin ? (
                  <>
                    <button type="button" className="rounded-lg p-2 text-neutral-500 hover:bg-rh-canvas hover:text-rh-ink dark:hover:bg-white/10" title="Edit" onClick={() => setDraft({ ...c })}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-400/10" title="Delete" onClick={() => setTarget(c)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog open={draft !== null} onOpenChange={(o) => !saving && !o && setDraft(null)}>
        <DialogContent className="rounded-2xl sm:max-w-lg dark:border-white/10 dark:bg-rh-ink-2">
          <DialogHeader>
            <DialogTitle className="dark:text-white">{draft?._id ? 'Edit topic' : 'New topic'}</DialogTitle>
            <DialogDescription>Short, plain names work best: the words patients would search for.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-300">Name</label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Back and neck pain" className={inputClass} maxLength={60} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-300">Web address (optional)</label>
                <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="made from the name" className={inputClass} maxLength={60} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-300">Description (shown on the topic page and in Google)</label>
                <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} className={inputClass} maxLength={300} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-300">Order</label>
                <Input type="number" value={draft.order} onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) || 0 })} className={inputClass} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" className={primaryButtonClass} onClick={submit} disabled={saving || !draft?.name.trim()}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Delete "${target?.name ?? ''}"?`}
        description="Only topics with no posts can be deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!target) return
          try {
            await remove({ categoryId: target._id })
            toast.success('Topic deleted.')
          } catch (error) {
            toast.error(errorText(error))
            throw error
          }
        }}
      />
    </AdminPage>
  )
}
