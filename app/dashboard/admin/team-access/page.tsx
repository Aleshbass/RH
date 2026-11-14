'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Check, Copy, GraduationCap, Link as LinkIcon, Loader2, Mail, Newspaper, Trash2, UserCheck, WhatsApp, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminPage, ConfirmDialog, EmptyState, PageHeader, Panel, StatusBadge, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { roleMeta } from '@/components/dashboard/admin/UserManagement'
import { LearnSuperAdmins } from '@/components/admin/learn/LearnSuperAdmins'
import {
  TEAM_ROLE_LABEL,
  formatPhone,
  teamAccessApi,
  whatsappInviteUrl,
  type TeamInvite,
  type TeamMember,
  type TeamRole,
} from '@/lib/teamAccessApi'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const ROLE_INFO: Record<TeamRole, { icon: typeof Newspaper; sees: string }> = {
  blog_editor: { icon: Newspaper, sees: 'only the blog. They write posts and send them for review; an admin publishes.' },
  learn_instructor: { icon: GraduationCap, sees: 'only Learn › Video courses, their own. They send courses for review; an admin publishes.' },
}

const errorText = (error: unknown, fallback: string) => {
  const data = (error as { data?: unknown } | null)?.data
  return typeof data === 'string' && data.trim() ? data : fallback
}

type Share = { link: string; phone: string | null; email: string | null; role: TeamRole }

/** A one-time invite link, ready to send on WhatsApp or copy. */
function ShareCard({ share, onClose }: { share: Share; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-2xl bg-rh-honeydew p-4 dark:bg-white/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-rh-ink dark:text-white">
            {share.phone ? `Invite ready for ${formatPhone(share.phone)}` : share.email ? `Invite emailed to ${share.email}` : 'Invite link ready'}
          </p>
          <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
            {share.phone
              ? 'Send it from your WhatsApp. They open the link, sign in or create an account, and get the access.'
              : 'You can also send this link yourself. It works once and expires in 14 days.'}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {share.phone ? (
          <a
            href={whatsappInviteUrl(share.phone, share.link, share.role)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(primaryButtonClass, 'inline-flex h-10 items-center px-4 text-sm font-semibold')}
          >
            <WhatsApp className="mr-2 h-4 w-4" /> Send on WhatsApp
          </a>
        ) : null}
        <Button
          type="button"
          className={softButtonClass}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(share.link)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {
              toast.error('Copy the link from the box below.')
            }
          }}
        >
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />} {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <input
        readOnly
        value={share.link}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-3 w-full truncate rounded-lg bg-white/70 px-2.5 py-1.5 font-mono text-[11px] text-neutral-600 outline-none dark:bg-black/20 dark:text-neutral-300"
        aria-label="Invite link"
      />
    </div>
  )
}

export default function TeamAccessPage() {
  const data = useQuery(teamAccessApi.list, {})
  const grant = useMutation(teamAccessApi.grant)
  const inviteLink = useMutation(teamAccessApi.inviteLink)
  const remove = useMutation(teamAccessApi.remove)
  const [contact, setContact] = useState('')
  const [role, setRole] = useState<TeamRole>('blog_editor')
  const [busy, setBusy] = useState(false)
  const [share, setShare] = useState<Share | null>(null)
  const [confirmSwitch, setConfirmSwitch] = useState<{ name: string; currentRole: string } | null>(null)
  const [removing, setRemoving] = useState<{ member?: TeamMember; invite?: TeamInvite } | null>(null)

  const submit = async (confirm = false) => {
    if (!contact.trim()) return
    setBusy(true)
    try {
      const result = await grant({ contact: contact.trim(), role, ...(confirm ? { confirm: true } : {}) })
      if (result.status === 'confirm') {
        setConfirmSwitch({ name: result.name ?? contact, currentRole: result.currentRole ?? '' })
        return
      }
      playSound('success')
      if (result.status === 'granted') {
        toast.success(`${result.name} is now a ${TEAM_ROLE_LABEL[role].toLowerCase()}.`)
        setShare(null)
      } else if (result.status === 'invited' && result.link) {
        setShare({
          link: result.link,
          phone: result.channel === 'phone' ? (result.phone ?? null) : null,
          email: result.channel === 'email' ? contact.trim().toLowerCase() : null,
          role,
        })
      } else toast.message(`${result.name} already has this access.`)
      setContact('')
      setConfirmSwitch(null)
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'Could not give access. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  const freshLink = async (invite: TeamInvite, email = false) => {
    try {
      const result = await inviteLink({ inviteId: invite.inviteId, ...(email ? { email: true } : {}) })
      setShare({ link: result.link, phone: result.phone, email: email ? invite.email : null, role: result.role })
      if (email) toast.success(`Invite emailed again to ${invite.email}.`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      toast.error(errorText(error, 'Could not make a new link.'))
    }
  }

  const info = ROLE_INFO[role]
  const InfoIcon = info.icon
  const looksLikeEmail = contact.includes('@')

  return (
    <AdminPage className="max-w-4xl">
      <PageHeader
        eyebrow="Platform"
        title="Blog & Learn access"
        description="Give someone access with their email or WhatsApp number. An existing account switches now; anyone else gets a one-time invite link (by email, or from your WhatsApp)."
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
            <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> They see {info.sees}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              {contact.trim() ? (
                looksLikeEmail ? (
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                ) : (
                  <WhatsApp className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#25D366]" />
                )
              ) : (
                <UserCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              )}
              <Input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Email or WhatsApp number (e.g. 0803 123 4567)"
                className={cn(inputClass, 'pl-9')}
                aria-label="Email address or WhatsApp number"
                autoComplete="off"
                inputMode={looksLikeEmail ? 'email' : 'text'}
              />
            </div>
            <Button type="submit" className={primaryButtonClass} disabled={busy || !contact.trim()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
              Give access
            </Button>
          </div>
          {share ? <ShareCard share={share} onClose={() => setShare(null)} /> : null}
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
                    {[m.email, m.phone ? formatPhone(m.phone) : null].filter(Boolean).join(' · ')}
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

      <Panel title="Invites waiting" bodyClassName="p-0">
        {data === undefined ? null : data.pending.length === 0 ? (
          <EmptyState icon={<Mail />} title="No open invites" description="Invites wait here until the person opens their link and signs in." />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {data.pending.map((inv) => (
              <li key={inv.inviteId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-rh-ink dark:text-white">
                    {inv.phone ? <WhatsApp className="h-3.5 w-3.5 shrink-0 text-[#25D366]" /> : <Mail className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
                    {inv.phone ? formatPhone(inv.phone) : inv.email}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    Invited by {inv.invitedBy} {formatDistanceToNow(inv.createdAt, { addSuffix: true })}
                    {inv.linkExpired ? ' · link expired, send a new one' : ''}
                  </p>
                </div>
                <StatusBadge tone="neutral">{TEAM_ROLE_LABEL[inv.role]}</StatusBadge>
                <div className="flex items-center gap-0.5">
                  {inv.phone ? (
                    <button
                      type="button"
                      onClick={() => freshLink(inv)}
                      className="rounded-lg p-2 text-[#128C7E] hover:bg-rh-canvas dark:hover:bg-white/10"
                      title="New link to send on WhatsApp"
                      aria-label={`New WhatsApp invite link for ${inv.phone}`}
                    >
                      <WhatsApp className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => freshLink(inv, true)}
                      className="rounded-lg p-2 text-neutral-500 hover:bg-rh-canvas hover:text-rh-ink dark:hover:bg-white/10 dark:hover:text-white"
                      title="Email a new link"
                      aria-label={`Email a new invite link to ${inv.email}`}
                    >
                      <Mail className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => freshLink(inv)}
                    className="rounded-lg p-2 text-neutral-500 hover:bg-rh-canvas hover:text-rh-ink dark:hover:bg-white/10 dark:hover:text-white"
                    title="New link to copy"
                    aria-label="New invite link to copy"
                  >
                    <LinkIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving({ invite: inv })}
                    className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-400/10"
                    title="Cancel the invite"
                    aria-label="Cancel the invite"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && data.pending.length > 0 ? (
          <p className="border-t border-black/[0.05] px-5 py-3 text-xs text-neutral-500 dark:border-white/[0.06]">
            Making a new link stops the old one working.
          </p>
        ) : null}
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
      <LearnSuperAdmins />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing?.invite ? 'Cancel this invite?' : `Remove ${removing?.member?.name ?? 'their'} access?`}
        description={
          removing?.invite
            ? 'Their link stops working. If they sign up later, they get a normal account without this access.'
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
