'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { Check, Copy, Loader2, Mail, Trash2, UserPlus, Users, WhatsApp } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import {
  EmptyState,
  InfoTip,
  LoadingBlocks,
  Panel,
  PatientDrawer,
  StatusBadge,
  fieldClass,
  initials,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/patient/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { ACCESS_LABEL, CARE_ACCESS_OPTIONS, RELATIONSHIPS, careRefs, type CareAccess } from './refs'

function errorText(err: unknown, fallback: string) {
  const data = (err as { data?: unknown })?.data
  if (typeof data === 'string' && data.trim()) return data
  const message = (err as Error)?.message ?? ''
  return message && !message.includes('Server Error') && !message.includes('[CONVEX') ? message : fallback
}

/** Who reads this: the patient ("your"), their clinic, or a caregiver who manages the profile. */
type Audience = 'patient' | 'clinic' | 'caregiver'

/**
 * The people helping with someone's care: who they are, what each can do, invites waiting, and
 * "Invite someone". Used on the patient's Care circle page, a clinic patient's record and by a
 * caregiver who manages a relative's profile.
 */
export function CareCircleManager({ patientId, audience = 'patient' }: { patientId?: Id<'users'>; audience?: Audience }) {
  const circle = useQuery(careRefs.getCareCircle, patientId ? { patientId } : {})
  const updateAccess = useMutation(careRefs.updateAccess)
  const remove = useMutation(careRefs.remove)
  const cancelInvite = useMutation(careRefs.cancelInvite)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [removing, setRemoving] = useState<{ grantId: Id<'familyAccessGrants'>; name: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  if (circle === undefined) return <LoadingBlocks rows={2} />
  if (circle === null) {
    return (
      <Panel>
        <EmptyState icon={Users} title="Care circle unavailable" description="Only the patient, their clinic or the person who manages their profile can see this." />
      </Panel>
    )
  }

  const first = circle.patient.firstName || 'they'
  const whose = audience === 'patient' ? 'your' : `${first}'s`

  const changeAccess = async (grantId: Id<'familyAccessGrants'>, access: CareAccess) => {
    setBusy(grantId)
    try {
      await updateAccess({ grantId, access })
      playSound('success')
      toast.success('Access updated')
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Could not change their access. Please try again.'))
    } finally {
      setBusy(null)
    }
  }

  const confirmRemove = async () => {
    if (!removing) return
    setBusy(removing.grantId)
    try {
      await remove({ grantId: removing.grantId })
      playSound('reject')
      toast.success(`${removing.name} was removed`)
      setRemoving(null)
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Could not remove them. Please try again.'))
    } finally {
      setBusy(null)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      playSound('success')
      toast.success('Invite link copied')
    } catch {
      toast.error('Copy did not work on this device')
    }
  }

  return (
    <div className="space-y-5">
      <Panel
        title={audience === 'patient' ? 'People helping with your care' : `People helping with ${first}'s care`}
        info={`Family and carers see ${whose} visits, care plan and progress, never the private clinical notes. Choose what else each person can do, and change it at any time.`}
        actions={
          <Button className={cn(primaryButtonClass, 'h-9')} onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Invite someone
          </Button>
        }
        bodyClassName="px-2 pb-3 sm:px-3"
      >
        {circle.members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No one yet"
            description={`Add a daughter, son, spouse or carer. They follow ${whose} visits and progress, and you choose whether they can also book, pay or message the care team.`}
          />
        ) : (
          <ul className="space-y-1">
            {circle.members.map((member) => (
              <li key={member.grantId} className="flex flex-col gap-3 rounded-2xl px-3 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pt-green-bg text-sm font-semibold text-pt-green-fg">
                    {initials(member.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-pt-ink">
                      <span className="truncate">{member.name}</span>
                      {member.isMe && <StatusBadge>You</StatusBadge>}
                      {member.managed && <StatusBadge tone="violet">Manages the profile</StatusBadge>}
                    </p>
                    <p className="truncate text-xs text-pt-muted">
                      {[member.relationship, member.phone, member.source === 'joy' ? 'Added on WhatsApp' : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0">
                  {member.isMe ? (
                    <StatusBadge tone="green">{ACCESS_LABEL[member.access]}</StatusBadge>
                  ) : (
                    <>
                      <Select value={member.access} onValueChange={(value) => void changeAccess(member.grantId, value as CareAccess)} disabled={busy === member.grantId}>
                        <SelectTrigger className={cn(fieldClass, 'h-9 w-[150px]')} aria-label={`What ${member.name} can do`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CARE_ACCESS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl text-pt-muted hover:bg-pt-rose-bg hover:text-pt-rose-fg"
                        aria-label={`Remove ${member.name}`}
                        onClick={() => setRemoving({ grantId: member.grantId, name: member.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {circle.invites.length > 0 && (
        <Panel title="Invites waiting" description="Until they open the link and sign in" bodyClassName="px-2 pb-3 sm:px-3">
          <ul className="space-y-1">
            {circle.invites.map((invite) => {
              const whatsapp = `https://wa.me/${(invite.phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(
                `Hi ${invite.name.split(' ')[0]}, please accept this invite to help with ${whose === 'your' ? 'my' : whose} care on Rehabify: ${invite.link}`
              )}`
              return (
                <li key={invite.inviteId} className="flex flex-col gap-3 rounded-2xl px-3 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-pt-ink">
                      {invite.name} <span className="font-normal text-pt-muted">· {invite.relationship}</span>
                    </p>
                    <p className="text-xs text-pt-muted">
                      {ACCESS_LABEL[invite.access]} · link expires in {formatDistanceToNowStrict(invite.expiresAt)}
                      {invite.email ? ` · emailed ${invite.email}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button className={cn(secondaryButtonClass, 'h-9')} onClick={() => void copy(invite.link)}>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy link
                    </Button>
                    <Button asChild className={cn(secondaryButtonClass, 'h-9')}>
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                        <WhatsApp className="mr-1.5 h-3.5 w-3.5" />
                        WhatsApp
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-9 rounded-xl text-pt-muted hover:bg-pt-hover hover:text-pt-ink"
                      disabled={busy === invite.inviteId}
                      onClick={async () => {
                        setBusy(invite.inviteId)
                        try {
                          await cancelInvite({ inviteId: invite.inviteId })
                          playSound('reject')
                          toast.success('Invite cancelled')
                        } catch (err) {
                          toast.error(errorText(err, 'Could not cancel the invite.'))
                        } finally {
                          setBusy(null)
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      <InviteCareDrawer
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        patientId={patientId}
        patientFirstName={circle.patient.firstName}
        audience={audience}
      />

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent className="rounded-3xl border-pt-line bg-pt-surface text-pt-ink">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-pt-muted">
              They&apos;ll stop seeing {whose} care straight away. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={secondaryButtonClass}>Keep them</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-pt-rose-bg text-pt-rose-fg hover:brightness-95" onClick={() => void confirmRemove()}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Name, relationship, how to reach them and what they can do; then the link to share. */
export function InviteCareDrawer({
  open,
  onOpenChange,
  patientId,
  patientFirstName,
  audience,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId?: Id<'users'>
  patientFirstName: string | null
  audience: Audience
}) {
  const invite = useMutation(careRefs.invite)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState<string>('')
  const [otherRelationship, setOtherRelationship] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [access, setAccess] = useState<CareAccess>('view')
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState<{ link: string; whatsappText: string; email: string | null; phone: string | null; name: string } | null>(null)

  const whose = audience === 'patient' ? 'your' : `${patientFirstName || 'their'}'s`
  const finalRelationship = relationship === 'Other' ? otherRelationship.trim() : relationship

  const reset = () => {
    setName('')
    setRelationship('')
    setOtherRelationship('')
    setPhone('')
    setEmail('')
    setAccess('view')
    setSent(null)
  }

  const close = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const submit = async () => {
    if (!name.trim()) return toast.error('Add their name')
    if (!finalRelationship) return toast.error('Choose how they’re related')
    setSaving(true)
    try {
      const result = await invite({
        patientId,
        name: name.trim(),
        relationship: finalRelationship,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        access,
      })
      playSound('send')
      setSent({ link: result.link, whatsappText: result.whatsappText, email: email.trim() || null, phone: phone.trim() || null, name: name.trim() })
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Could not create the invite. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const whatsappHref = sent
    ? `https://wa.me/${(sent.phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(sent.whatsappText)}`
    : '#'

  return (
    <PatientDrawer
      open={open}
      onOpenChange={close}
      title={sent ? 'Invite ready' : 'Invite someone to help'}
      description={sent ? `Send ${sent.name.split(' ')[0]} the link. It works for 14 days.` : `Family or a carer who helps with ${whose} care`}
      footer={
        sent ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className={cn(secondaryButtonClass, 'w-full')} onClick={() => close(false)}>
              Done
            </Button>
            <Button asChild className={cn(primaryButtonClass, 'w-full')}>
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                <WhatsApp className="mr-2 h-4 w-4" />
                Send on WhatsApp
              </a>
            </Button>
          </div>
        ) : (
          <Button className={cn(primaryButtonClass, 'h-11 w-full')} disabled={saving} onClick={() => void submit()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create invite
          </Button>
        )
      }
    >
      {sent ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-pt-green-bg p-4 text-pt-green-fg">
            <Check className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              {sent.email ? `We emailed ${sent.email}. ` : ''}Share the link on WhatsApp or by text too, so it reaches them.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-pt-line bg-pt-sunken p-2 pl-3">
            <p className="min-w-0 flex-1 truncate text-sm text-pt-ink">{sent.link}</p>
            <Button
              size="sm"
              className={cn(secondaryButtonClass, 'h-9 shrink-0')}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(sent.link)
                  playSound('success')
                  toast.success('Link copied')
                } catch {
                  toast.error('Copy did not work on this device')
                }
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy
            </Button>
          </div>
          {sent.email && (
            <p className="flex items-center gap-2 text-xs text-pt-muted">
              <Mail className="h-3.5 w-3.5" />
              The email has the same link and explains what they&apos;ll see.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="care-name" className="text-xs font-medium text-pt-ink">
              Their name
            </Label>
            <Input id="care-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ngozi Okafor" className={cn(fieldClass, 'h-11')} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-pt-ink">How they&apos;re related to {audience === 'patient' ? 'you' : patientFirstName || 'them'}</p>
            <div className="flex flex-wrap gap-2">
              {[...RELATIONSHIPS, 'Other'].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRelationship(option)}
                  aria-pressed={relationship === option}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-sm transition',
                    relationship === option ? 'border-pt-primary bg-pt-primary font-medium text-pt-on-primary' : 'border-pt-line bg-pt-surface text-pt-muted hover:border-pt-line-strong hover:text-pt-ink'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            {relationship === 'Other' && (
              <Input value={otherRelationship} onChange={(e) => setOtherRelationship(e.target.value)} placeholder="e.g. Niece, Neighbour" className={cn(fieldClass, 'h-10')} aria-label="Relationship" />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="care-phone" className="text-xs font-medium text-pt-ink">
                WhatsApp number
              </Label>
              <Input id="care-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 000 0000" className={cn(fieldClass, 'h-11')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="care-email" className="text-xs font-medium text-pt-ink">
                Email (optional)
              </Label>
              <Input id="care-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ngozi@email.com" className={cn(fieldClass, 'h-11')} />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 flex items-center gap-1 text-xs font-medium text-pt-ink">
              What they can do
              <InfoTip>They never see private clinical notes. You can change this or remove them at any time.</InfoTip>
            </legend>
            {CARE_ACCESS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition',
                  access === option.value ? 'border-pt-primary bg-pt-sunken' : 'border-pt-line hover:border-pt-line-strong'
                )}
              >
                <input
                  type="radio"
                  name="care-access"
                  value={option.value}
                  checked={access === option.value}
                  onChange={() => setAccess(option.value)}
                  className="mt-0.5 h-4 w-4 accent-[#16181c] dark:accent-white"
                />
                <span>
                  <span className="block text-sm font-semibold text-pt-ink">{option.title}</span>
                  <span className="block text-xs text-pt-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </PatientDrawer>
  )
}
