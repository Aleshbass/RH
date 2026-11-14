'use client'

/**
 * Admin › Learn › Groups (Mary 2026-11-14): small groups for group activities. Learn admins and
 * Learn super admins create groups and assign people (members or leads). Each group gets a private
 * room in the Learn community and can hold group-only Spaces (leads can host them).
 */
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Archive, ArchiveRestore, Check, Crown, ExternalLink, Loader2, Pencil, Plus, Search, Trash2, UserPlus, Users } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AdminPage, ConfirmDialog, EmptyState, PageHeader, Panel, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { AdminDrawer, Field } from '@/components/admin/learn/drawer'
import {
  GROUP_COLORS,
  groupAddRef,
  groupArchiveRef,
  groupCreateRef,
  groupRef,
  groupRemoveRef,
  groupSearchRef,
  groupSetRoleRef,
  groupsListRef,
  groupTone,
  groupUpdateRef,
  type AdminGroupMember,
  type AdminGroupRow,
  type GroupColor,
} from '@/lib/learnAdminsApi'
import { learnUrl } from '@/lib/site-hosts'
import { cn } from '@/lib/utils'
import type { Id } from '@/convex/_generated/dataModel'

const errorText = (e: unknown) => {
  const data = (e as { data?: unknown })?.data
  return typeof data === 'string' ? data : 'Something went wrong. Try again.'
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?'

function PersonAvatar({ name, imageUrl, size = 36 }: { name: string; imageUrl: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (imageUrl && !broken) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-rh-cream text-xs font-semibold text-rh-ink dark:bg-white/[0.08] dark:text-white"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

function ColorPicker({ value, onChange }: { value: GroupColor; onChange: (c: GroupColor) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Group colour">
      {GROUP_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-rh-ink-2',
            value === c ? 'ring-rh-ink dark:ring-white' : 'ring-transparent'
          )}
          style={{ background: groupTone(c).dot }}
        >
          {value === c && <Check className="h-4 w-4 text-white" />}
        </button>
      ))}
    </div>
  )
}

// ── New group ─────────────────────────────────────────────────────────────────

function NewGroupDrawer({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: Id<'learnGroups'>) => void }) {
  const create = useMutation(groupCreateRef)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<GroupColor>('lime')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setColor(GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)])
    }
  }, [open])
  const submit = async () => {
    setBusy(true)
    try {
      const id = await create({ name, description: description || undefined, color })
      toast.success('Group created. Now add people.')
      onOpenChange(false)
      onCreated(id)
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AdminDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="New group"
      description="A small group gets its own private room in the Learn community and can hold group-only Spaces."
      footer={
        <Button className={cn(primaryButtonClass, 'w-full')} disabled={busy || name.trim().length < 3} onClick={submit}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Create group
        </Button>
      }
    >
      <div className="space-y-5">
        <Field label="Name" htmlFor="group-name">
          <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UI 400L Clinical Group A" className={inputClass} maxLength={60} />
        </Field>
        <Field label="What it's for" htmlFor="group-description" hint="Optional. Members see this at the top of their group room.">
          <Textarea
            id="group-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Weekly case discussions before the OSCE"
            className={cn(inputClass, 'min-h-[90px]')}
            maxLength={240}
          />
        </Field>
        <Field label="Colour">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>
    </AdminDrawer>
  )
}

// ── One group ─────────────────────────────────────────────────────────────────

function AddPeople({ groupId }: { groupId: Id<'learnGroups'> }) {
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim())
  const results = useQuery(groupSearchRef, term.length >= 2 ? { q: term, groupId } : 'skip')
  const add = useMutation(groupAddRef)
  const [busyId, setBusyId] = useState<string | null>(null)

  const addOne = async (userId: Id<'users'>, role: 'member' | 'lead') => {
    setBusyId(userId + role)
    try {
      const res = await add({ groupId, userIds: [userId], role })
      if (res.skipped.length) toast.error(`${res.skipped[0]} hasn't joined Rehabify Learn yet.`)
      else toast.success(role === 'lead' ? 'Added as a lead.' : 'Added to the group.')
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Learn members by name or email"
          className={cn(inputClass, 'pl-9')}
          aria-label="Search people to add"
          autoComplete="off"
        />
      </div>
      {term.length >= 2 && (
        <div className="overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08]">
          {results === undefined ? (
            <div className="flex justify-center py-5">
              <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
            </div>
          ) : results.length === 0 ? (
            <p className="px-4 py-4 text-sm text-neutral-500">Nobody found. They need a Rehabify Learn account first.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-black/[0.05] overflow-y-auto dark:divide-white/[0.06]">
              {results.map((p) => (
                <li key={p.userId} className="flex items-center gap-3 px-3 py-2.5">
                  <PersonAvatar name={p.name} imageUrl={p.imageUrl} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-rh-ink dark:text-white">{p.name}</p>
                    <p className="truncate text-xs text-neutral-500">{[p.tag, p.email].filter(Boolean).join(' · ')}</p>
                  </div>
                  {p.inGroup ? (
                    <span className="shrink-0 text-xs font-medium text-neutral-500">In group</span>
                  ) : !p.isLearnMember ? (
                    <span className="shrink-0 text-xs text-neutral-400">Not on Learn</span>
                  ) : (
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="ghost" className={cn(softButtonClass, 'h-8 px-2.5 text-xs')} disabled={Boolean(busyId)} onClick={() => addOne(p.userId, 'lead')}>
                        {busyId === p.userId + 'lead' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crown className="h-3.5 w-3.5" />}
                        <span className="ml-1">Lead</span>
                      </Button>
                      <Button size="sm" className={cn(primaryButtonClass, 'h-8 px-2.5 text-xs')} disabled={Boolean(busyId)} onClick={() => addOne(p.userId, 'member')}>
                        {busyId === p.userId + 'member' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                        <span className="ml-1">Add</span>
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function MemberRow({ groupId, m }: { groupId: Id<'learnGroups'>; m: AdminGroupMember }) {
  const setRole = useMutation(groupSetRoleRef)
  const remove = useMutation(groupRemoveRef)
  const [confirm, setConfirm] = useState(false)
  const toggleLead = async () => {
    try {
      await setRole({ groupId, userId: m.userId, role: m.role === 'lead' ? 'member' : 'lead' })
    } catch (e) {
      toast.error(errorText(e))
    }
  }
  return (
    <li className="flex items-center gap-3 py-2.5">
      <PersonAvatar name={m.name} imageUrl={m.imageUrl} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-rh-ink dark:text-white">
          <span className="truncate">{m.name}</span>
          {m.role === 'lead' && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rh-lime px-1.5 py-px text-[10px] font-semibold text-rh-ink">
              <Crown className="h-2.5 w-2.5" /> Lead
            </span>
          )}
        </p>
        <p className="truncate text-xs text-neutral-500">
          {[m.tag, `${m.courses} course${m.courses === 1 ? '' : 's'}`, `${m.casesPassed} case${m.casesPassed === 1 ? '' : 's'} passed`, `${m.posts} post${m.posts === 1 ? '' : 's'} here`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 rounded-lg px-2 text-xs text-neutral-600 hover:bg-rh-honeydew dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        onClick={toggleLead}
        aria-label={m.role === 'lead' ? `Make ${m.name} a member` : `Make ${m.name} a lead`}
      >
        {m.role === 'lead' ? 'Make member' : 'Make lead'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 rounded-lg p-0 text-neutral-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
        onClick={() => setConfirm(true)}
        aria-label={`Remove ${m.name} from the group`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Remove ${m.name}?`}
        description="They lose the group room and its Spaces. Their posts stay."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          try {
            await remove({ groupId, userId: m.userId })
            toast.success('Removed from the group.')
          } catch (e) {
            toast.error(errorText(e))
          }
        }}
      />
    </li>
  )
}

function GroupDrawer({ groupId, onOpenChange }: { groupId: Id<'learnGroups'> | null; onOpenChange: (o: boolean) => void }) {
  const group = useQuery(groupRef, groupId ? { groupId } : 'skip')
  const update = useMutation(groupUpdateRef)
  const archive = useMutation(groupArchiveRef)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<GroupColor>('lime')
  useEffect(() => setEditing(false), [groupId])

  const startEdit = () => {
    if (!group) return
    setName(group.name)
    setDescription(group.description ?? '')
    setColor((GROUP_COLORS as readonly string[]).includes(group.color) ? (group.color as GroupColor) : 'lime')
    setEditing(true)
  }
  const save = async () => {
    if (!group) return
    try {
      await update({ groupId: group.id, name, description, color })
      setEditing(false)
      toast.success('Saved.')
    } catch (e) {
      toast.error(errorText(e))
    }
  }
  const leads = group?.members.filter((m) => m.role === 'lead').length ?? 0
  const tone = groupTone(group?.color)

  return (
    <AdminDrawer
      open={Boolean(groupId)}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: tone.dot }} aria-hidden />
          <span className="truncate">{group?.name ?? 'Group'}</span>
        </span>
      }
      description={group ? `${group.memberCount} of ${group.maxMembers} people · ${leads} lead${leads === 1 ? '' : 's'}` : undefined}
      footer={
        group ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className={cn(primaryButtonClass, 'flex-1')}>
              <a href={learnUrl(`/community/${group.roomSlug}`)} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Open group room
              </a>
            </Button>
            <Button
              variant="ghost"
              className={cn(softButtonClass, 'flex-1')}
              onClick={async () => {
                try {
                  await archive({ groupId: group.id, archived: !group.archived })
                  toast.success(group.archived ? 'Group restored.' : 'Group archived. Members no longer see it.')
                } catch (e) {
                  toast.error(errorText(e))
                }
              }}
            >
              {group.archived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
              {group.archived ? 'Restore group' : 'Archive group'}
            </Button>
          </div>
        ) : undefined
      }
    >
      {group === undefined ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : group === null ? (
        <p className="py-8 text-center text-sm text-neutral-500">This group doesn&apos;t exist any more.</p>
      ) : (
        <div className="space-y-6">
          {editing ? (
            <div className="space-y-4 rounded-2xl bg-rh-canvas p-4 dark:bg-white/[0.03]">
              <Field label="Name" htmlFor="edit-group-name">
                <Input id="edit-group-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={60} />
              </Field>
              <Field label="What it's for" htmlFor="edit-group-description">
                <Textarea id="edit-group-description" value={description} onChange={(e) => setDescription(e.target.value)} className={cn(inputClass, 'min-h-[80px]')} maxLength={240} />
              </Field>
              <Field label="Colour">
                <ColorPicker value={color} onChange={setColor} />
              </Field>
              <div className="flex gap-2">
                <Button className={primaryButtonClass} onClick={save} disabled={name.trim().length < 3}>
                  Save
                </Button>
                <Button variant="ghost" className={softButtonClass} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 text-sm text-neutral-600 dark:text-neutral-300">{group.description || 'No description yet.'}</p>
              <Button variant="ghost" size="sm" className={cn(softButtonClass, 'h-8 shrink-0 px-2.5 text-xs')} onClick={startEdit}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
            </div>
          )}

          {group.archived ? (
            <p className="rounded-xl bg-rh-warn-soft px-3 py-2 text-sm text-rh-warn-ink">Archived: members don&apos;t see this group. Restore it to add people.</p>
          ) : (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-rh-ink dark:text-white">Add people</h3>
              <p className="text-xs text-neutral-500">Leads can hold Spaces for the group. Everyone gets a notification when they&apos;re added.</p>
              <AddPeople groupId={group.id} />
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-rh-ink dark:text-white">People</h3>
            {group.members.length === 0 ? (
              <p className="py-4 text-sm text-neutral-500">Nobody yet. Search above to add people.</p>
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {group.members.map((m) => (
                  <MemberRow key={m.userId} groupId={group.id} m={m} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AdminDrawer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function GroupCard({ g, onOpen }: { g: AdminGroupRow; onOpen: () => void }) {
  const tone = groupTone(g.color)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex w-full flex-col rounded-2xl border border-black/[0.05] bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift dark:border-white/[0.06] dark:bg-rh-ink-2',
        g.archived && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: tone.soft, color: tone.ink }}>
          <Users className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-rh-ink dark:text-white">{g.name}</p>
          <p className="truncate text-xs text-neutral-500">
            {g.memberCount} {g.memberCount === 1 ? 'person' : 'people'}
            {g.leads.length ? ` · led by ${g.leads.join(', ')}` : ''}
          </p>
        </div>
        {g.archived && <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-300">Archived</span>}
      </div>
      {g.description && <p className="mt-3 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-300">{g.description}</p>}
      <p className="mt-3 text-xs text-neutral-500">
        {g.postCount} post{g.postCount === 1 ? '' : 's'}
        {g.lastActivityAt ? ` · active ${formatDistanceToNow(g.lastActivityAt, { addSuffix: true })}` : ' · no activity yet'}
      </p>
    </button>
  )
}

export function GroupsAdmin() {
  const groups = useQuery(groupsListRef, {})
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<Id<'learnGroups'> | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const shown = useMemo(() => (groups ?? []).filter((g) => showArchived || !g.archived), [groups, showArchived])
  const archivedCount = (groups ?? []).filter((g) => g.archived).length

  return (
    <AdminPage className="max-w-6xl">
      <PageHeader
        eyebrow="Rehabify Learn"
        title="Groups"
        description="Small groups for group activities. Each one gets a private room in the Learn community and can hold group-only Spaces."
        actions={
          <Button className={primaryButtonClass} onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> New group
          </Button>
        }
      />

      {groups === undefined ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Users />}
            title="No groups yet"
            description="Create a group, add people as members or leads, and they'll find a private room for it in the Learn community."
            action={
              <Button className={primaryButtonClass} onClick={() => setCreating(true)}>
                <Plus className="mr-2 h-4 w-4" /> New group
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((g) => (
              <GroupCard key={g.id} g={g} onOpen={() => setOpenId(g.id)} />
            ))}
          </div>
          {archivedCount > 0 && (
            <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-sm font-medium text-neutral-500 underline-offset-4 hover:underline">
              {showArchived ? 'Hide archived groups' : `Show archived groups (${archivedCount})`}
            </button>
          )}
        </>
      )}

      <NewGroupDrawer open={creating} onOpenChange={setCreating} onCreated={(id) => setOpenId(id)} />
      <GroupDrawer groupId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </AdminPage>
  )
}
