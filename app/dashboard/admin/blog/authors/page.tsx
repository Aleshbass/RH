'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { ArrowUpRight, BadgeCheck, ImagePlus, Loader2, Pencil, Plus, Trash2, Users } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AdminPage, ConfirmDialog, EmptyState, PageHeader, Panel, StatusBadge, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { useConsoleRole } from '@/components/admin/shell/consoleRole'
import { MediaPicker } from '@/components/admin/blog/MediaPicker'
import { blogApi, errorText, type AuthorRow, type BlogImage } from '@/lib/blog/api'
import { imagekitTransform } from '@/lib/blog/content'

type Draft = { _id?: AuthorRow['_id']; name: string; slug: string; credentials: string; bio: string; photo: BlogImage | null; sameAs: string }

function Avatar({ name, photo, size = 44 }: { name: string; photo: BlogImage | null; size?: number }) {
  if (photo?.url) {
    // eslint-disable-next-line @next/next/no-img-element -- ImageKit thumbnail
    return <img src={imagekitTransform(photo.url, { w: size * 2, h: size * 2 })} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-rh-lime font-bold text-rh-ink" style={{ width: size, height: size }}>
      {name.charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export default function BlogAuthorsPage() {
  const role = useConsoleRole()
  const authors = useQuery(blogApi.adminAuthors, {}) as AuthorRow[] | undefined
  const save = useMutation(blogApi.saveAuthor)
  const remove = useMutation(blogApi.deleteAuthor)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)
  const [target, setTarget] = useState<AuthorRow | null>(null)
  const isAdmin = role === 'admin'
  const mine = authors?.find((a) => a.mine)

  const open = (a?: AuthorRow) =>
    setDraft(
      a
        ? { _id: a._id, name: a.name, slug: a.slug, credentials: a.credentials, bio: a.bio, photo: a.photo, sameAs: a.sameAs.join('\n') }
        : { name: '', slug: '', credentials: '', bio: '', photo: null, sameAs: '' }
    )

  const submit = async () => {
    if (!draft) return
    setSaving(true)
    try {
      await save({
        authorId: draft._id,
        name: draft.name,
        slug: isAdmin && draft.slug ? draft.slug : undefined,
        credentials: draft.credentials,
        bio: draft.bio,
        photo: draft.photo ?? undefined,
        sameAs: draft.sameAs.split(/\s+/).filter(Boolean),
      })
      toast.success('Profile saved.')
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
        title={isAdmin ? 'Authors and reviewers' : 'My author profile'}
        description="The names, credentials and photos shown on posts. For health articles, Google looks for who wrote and who checked the advice."
        actions={
          isAdmin ? (
            <Button type="button" className={primaryButtonClass} onClick={() => open()}>
              <Plus className="mr-1.5 h-4 w-4" /> Add a person
            </Button>
          ) : !mine ? (
            <Button type="button" className={primaryButtonClass} onClick={() => open()}>
              <Plus className="mr-1.5 h-4 w-4" /> Create my profile
            </Button>
          ) : null
        }
      />
      <Panel bodyClassName="p-0">
        {authors === undefined ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : authors.length === 0 ? (
          <EmptyState icon={<Users />} title="No authors yet" description="A profile is made for each writer the first time they start a post. Add the physiotherapists who review posts here too." />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {authors.map((a) => (
              <li key={a._id} className="flex items-center gap-4 px-5 py-4">
                <Avatar name={a.name} photo={a.photo} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold text-rh-ink dark:text-white">
                    {a.name}
                    {a.mine ? <StatusBadge tone="teal">You</StatusBadge> : null}
                    {!a.bio || !a.credentials ? <StatusBadge tone="amber">Profile incomplete</StatusBadge> : null}
                  </p>
                  <p className="truncate text-[12px] text-neutral-500">
                    {a.credentials || 'No credentials yet'} · {a.postCount} post{a.postCount === 1 ? '' : 's'}
                    {a.reviewCount ? (
                      <>
                        {' '}
                        · <BadgeCheck className="inline h-3 w-3 text-rh-lime-deep" /> reviewed {a.reviewCount}
                      </>
                    ) : null}
                    {a.accountName ? ` · account: ${a.accountName}` : ''}
                  </p>
                </div>
                <a href={`/blog/author/${a.slug}`} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-neutral-500 hover:bg-rh-canvas hover:text-rh-ink dark:hover:bg-white/10" title="View">
                  <ArrowUpRight className="h-4 w-4" />
                </a>
                {a.canEdit ? (
                  <button type="button" className="rounded-lg p-2 text-neutral-500 hover:bg-rh-canvas hover:text-rh-ink dark:hover:bg-white/10" title="Edit" onClick={() => open(a)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                ) : null}
                {isAdmin ? (
                  <button type="button" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-400/10" title="Delete" onClick={() => setTarget(a)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog open={draft !== null} onOpenChange={(o) => !saving && !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg dark:border-white/10 dark:bg-rh-ink-2">
          <DialogHeader>
            <DialogTitle className="dark:text-white">{draft?._id ? 'Edit profile' : 'New profile'}</DialogTitle>
            <DialogDescription>Shown on posts and on the author&apos;s own page on the blog.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar name={draft.name} photo={draft.photo} size={56} />
                <Button type="button" size="sm" className={softButtonClass} onClick={() => setPicking(true)}>
                  <ImagePlus className="mr-1.5 h-4 w-4" /> {draft.photo ? 'Change photo' : 'Add a photo'}
                </Button>
                {draft.photo ? (
                  <Button type="button" size="sm" variant="ghost" className="rounded-xl" onClick={() => setDraft({ ...draft, photo: null })}>
                    Remove
                  </Button>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-300">Full name</label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} maxLength={80} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-300">Credentials and role</label>
                <Input
                  value={draft.credentials}
                  onChange={(e) => setDraft({ ...draft, credentials: e.target.value })}
                  placeholder="e.g. BPT, MSc · Sports physiotherapist"
                  className={inputClass}
                  maxLength={120}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-300">Short bio</label>
                <Textarea
                  value={draft.bio}
                  onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                  rows={4}
                  placeholder="Experience, what they treat, where they trained. Two to four sentences."
                  className={inputClass}
                  maxLength={1200}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-300">Profile links (one per line)</label>
                <Textarea
                  value={draft.sameAs}
                  onChange={(e) => setDraft({ ...draft, sameAs: e.target.value })}
                  rows={2}
                  placeholder={'https://www.linkedin.com/in/...\nhttps://physioaroundme.com/find-a-physio/...'}
                  className={inputClass}
                />
              </div>
              {isAdmin ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-300">Web address (optional)</label>
                  <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="made from the name" className={inputClass} maxLength={60} />
                </div>
              ) : null}
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

      <MediaPicker
        open={picking}
        onOpenChange={setPicking}
        title="Profile photo"
        onPick={([img]) => {
          if (img && draft) setDraft({ ...draft, photo: { ...img, alt: img.alt || `Photo of ${draft.name}` } })
        }}
      />

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Delete ${target?.name ?? ''}?`}
        description="Only people not named on any post can be deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!target) return
          try {
            await remove({ authorId: target._id })
            toast.success('Deleted.')
          } catch (error) {
            toast.error(errorText(error))
            throw error
          }
        }}
      />
    </AdminPage>
  )
}
