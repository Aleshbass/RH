'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { GraduationCap, Loader2, Mail, Newspaper, RefreshCw, Trash2, UserCheck } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminPage, ConfirmDialog, EmptyState, PageHeader, Panel, StatusBadge, inputClass, primaryButtonClass } from '@/components/admin/ui'
import { roleMeta } from '@/components/dashboard/admin/UserManagement'
import { TEAM_ROLE_LABEL, teamAccessApi, type TeamMember, type TeamInvite, type TeamRole } from '@/lib/teamAccessApi'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const ROLE_INFO: Record<TeamRole, { icon: typeof Newspaper; sees: string }> = {
  blog_editor: { icon: Newspaper, sees: 'Only the blog. They write posts and send them for review; an admin publishes.' },
  learn_instructor: { icon: GraduationCap, sees: 'Only Learn › Video courses, their own. They send courses for review; an admin publishes.' },
}

const errorText = (error: unknown, fallback: string) => {
  const data = (error as { data?: unknown } | null)?.data
  return typeof data === 'string' && data.trim() ? data : fallback
}

export default function TeamAccessPage() {
  const data = useQuery(teamAccessApi.list, {})
  const grant = useMutation(teamAccessApi.grant)
  const resend = useMutation(teamAccessApi.resend)
  const remove = useMutation(teamAccessApi.remove)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<TeamRole>('blog_editor')
  const [busy, setBusy] = useState(false)
  const [confirmSwitch, setConfirmSwitch] = useState<{ name: string; currentRole: string } | null>(null)
  const [removing, setRemoving] = useState<{ member?: TeamMember; invite?: TeamInvite } | null>(null)

  const submit = async (confirm = false) => {
    if (!email.trim()) return
    setBusy(true)
    try {
      const result = await grant({ email: email.trim(), role, ...(confirm ? { confirm: true } : {}) })
      if (result.status === 'confirm') {
        setConfirmSwitch({ name: result.name ?? email, currentRole: result.currentRole ?? '' })
        return
      }
      playSound('success')
      if (result.status === 'granted') toast.success(`${result.name} is now a ${TEAM_ROLE_LABEL[role].toLowerCase()}. We emailed them.`)
      else if (result.status === 'invited') toast.success(`Invite sent. ${email.trim()} becomes a ${TEAM_ROLE_LABEL[role].toLowerCase()} when they sign up with it.`)
      else toast.message(`${result.name} already has this access.`)
      setEmail('')
      setConfirmSwitch(null)
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'Could not give access. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  const Info = ROLE_INFO[role]

  return (
    <AdminPage className="max-w-4xl">
      <PageHeader
        eyebrow="Platform"
        title="Blog & Learn access"
        description="Give someone access with just their email. If they already have an account it switches now; if not, they get an invite and the access starts when they sign up with that email."
      />

      <Panel title="Give access">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="space-y-4"
        >
          <div role="radiogroup" aria-label="Access" className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(TEAM_ROLE_LABEL) as TeamRole[]).map((r) => {
              const Icon = ROLE_INFO[r].icon
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={role === r}
                  onClick={() => setRole(r)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                    role === r ? 'border-rh-lime bg-rh-honeydew dark:bg-white/[0.06]' : 'border-black/10 hover:bg-rh-canvas dark:border-white/10 dark:hover:bg-white/[0.04]'
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0 text-rh-ink dark:text-rh-lime" />
                  <span className="text-sm font-semibold text-rh-ink dark:text-white">{TEAM_ROLE_LABEL[r]}</span>
                </button>
              )
            })}
          </div>
          <p className="flex items-start gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <Info.icon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> They see {Info.sees.charAt(0).toLowerCase() + Info.sees.slice(1)}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className={cn(inputClass, 'flex-1')}
              aria-label="Email address"
              autoComplete="off"
            />
            <Button type="submit" className={primaryButtonClass} disabled={busy || !email.trim()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
              Give access
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="People with access" bodyClassName="p-0">
        {data === undefined ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : data.members.length === 0 ? (
          <EmptyState icon={<UserCheck />} title="Nobody yet" description="People you give access to appear here." />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {data.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{m.name}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {m.email}
                    {m.since ? ` · since ${formatDistanceToNow(m.since, { addSuffix: true })}` : ''}
                    {m.previousRole ? ` · was ${roleMeta(m.previousRole).label.toLowerCase()}` : ''}
                  </p>
                </div>
                <StatusBadge tone="amber">{TEAM_ROLE_LABEL[m.role]}</StatusBadge>
                <button
                  type="button"
                  onClick={() => setRemoving({ member: m })}
                  className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-400/10"
                  title="Remove access"
                  aria-label={`Remove access for ${m.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Waiting to sign up" bodyClassName="p-0">
        {data === undefined ? null : data.pending.length === 0 ? (
          <EmptyState icon={<Mail />} title="No open invites" description="Invites to emails without an account wait here until the person signs up." />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {data.pending.map((inv) => (
              <li key={inv.inviteId} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{inv.email}</p>
                  <p className="truncate text-xs text-neutral-500">
                    Invited by {inv.invitedBy} {formatDistanceToNow(inv.createdAt, { addSuffix: true })}
                    {inv.emailedAt ? ` · emailed ${formatDistanceToNow(inv.emailedAt, { addSuffix: true })}` : ''}
                  </p>
                </div>
                <StatusBadge tone="neutral">{TEAM_ROLE_LABEL[inv.role]}</StatusBadge>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await resend({ inviteId: inv.inviteId })
                      toast.success('Invite emailed again.')
                    } catch (error) {
                      toast.error(errorText(error, 'Could not resend.'))
                    }
                  }}
                  className="rounded-lg p-2 text-neutral-500 hover:bg-rh-canvas hover:text-rh-ink dark:hover:bg-white/10 dark:hover:text-white"
                  title="Email the invite again"
                  aria-label={`Email the invite to ${inv.email} again`}
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRemoving({ invite: inv })}
                  className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-400/10"
                  title="Cancel the invite"
                  aria-label={`Cancel the invite for ${inv.email}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={confirmSwitch !== null}
        onOpenChange={(o) => !o && setConfirmSwitch(null)}
        title={`Switch ${confirmSwitch?.name ?? 'them'} to ${TEAM_ROLE_LABEL[role].toLowerCase()}?`}
        description={
          confirmSwitch
            ? `This account is a ${roleMeta(confirmSwitch.currentRole).label.toLowerCase()}. As a ${TEAM_ROLE_LABEL[role].toLowerCase()} they will only see ${
                role === 'blog_editor' ? 'the blog' : 'Learn video courses'
              }, not their ${roleMeta(confirmSwitch.currentRole).label.toLowerCase()} dashboard. Removing the access later gives them their old role back.`
            : undefined
        }
        confirmLabel="Switch"
        onConfirm={() => submit(true)}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing?.invite ? `Cancel the invite for ${removing.invite.email}?` : `Remove ${removing?.member?.name ?? 'their'} access?`}
        description={
          removing?.invite
            ? 'If they sign up later, they get a normal account without this access.'
            : removing?.member?.previousRole
              ? `They go back to being a ${roleMeta(removing.member.previousRole).label.toLowerCase()}. Posts and courses they made stay.`
              : 'They choose what kind of account they want the next time they sign in. Posts and courses they made stay.'
        }
        confirmLabel={removing?.invite ? 'Cancel invite' : 'Remove access'}
        destructive
        onConfirm={async () => {
          try {
            await remove(removing?.invite ? { inviteId: removing.invite.inviteId } : { userId: removing!.member!.userId })
            toast.success(removing?.invite ? 'Invite cancelled.' : 'Access removed.')
          } catch (error) {
            toast.error(errorText(error, 'Could not remove the access.'))
            throw error
          }
        }}
      />
    </AdminPage>
  )
}
