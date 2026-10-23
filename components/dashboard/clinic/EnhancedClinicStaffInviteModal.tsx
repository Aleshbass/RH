'use client'

import { useState, type FormEvent } from 'react'
import { useAction, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Loader2 } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { primaryButtonClass } from '@/components/clinic/ui'
import { fieldClass, isMissingId, labelClass } from '@/components/clinic/patients/patient-record-shared'
import { FULL_ACCESS, roleSummary, teamError, type ClinicRole } from '@/components/clinic/staff/team-shared'

interface EnhancedClinicStaffInviteModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const buildLink = (code?: string) =>
  code && typeof window !== 'undefined' ? `${window.location.origin.replace(/\/$/, '')}/staff-invite/${code}` : undefined

async function copyLink(link: string) {
  try {
    await navigator.clipboard?.writeText(link)
    return true
  } catch {
    return false
  }
}

const showQr = (link: string) =>
  window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`, '_blank')

export default function EnhancedClinicStaffInviteModal({
  isOpen,
  onClose,
  onSuccess,
}: EnhancedClinicStaffInviteModalProps) {
  const [submitting, setSubmitting] = useState(false)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg space-y-5 border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            Invite a clinician
          </DialogTitle>
          <DialogDescription className="text-sm text-neutral-500 dark:text-neutral-400">
            They get an email with a link to join your clinic and sign in with their own account. The link works
            for 7 days.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the form starts empty each time */}
        <InviteForm
          submitting={submitting}
          setSubmitting={setSubmitting}
          onCancel={onClose}
          onSent={() => {
            onClose()
            onSuccess?.()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function InviteForm({
  submitting,
  setSubmitting,
  onCancel,
  onSent,
}: {
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onCancel: () => void
  onSent: () => void
}) {
  const roles = useQuery(api.clinicTools.listClinicRoles, {}) as ClinicRole[] | undefined
  const createStaffInvite = useAction(
    api.actions.clinics.inviteClinicStaff.createClinicStaffInvitationWithNotification
  )

  const [roleId, setRoleId] = useState<string>(FULL_ACCESS)
  const [form, setForm] = useState({ email: '', name: '', message: '' })

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const selectedRole = roles?.find((r) => r._id === roleId)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const email = form.email.trim()
    if (!email) {
      toast.error('Enter their email address')
      return
    }

    setSubmitting(true)
    try {
      const clinicRoleId =
        roleId !== FULL_ACCESS && !isMissingId(roleId) ? (roleId as Id<'clinicRoles'>) : undefined
      const res = await createStaffInvite({
        inviteeEmail: email,
        inviteeName: form.name.trim() || undefined,
        message: form.message.trim() || undefined,
        sendEmail: true,
        origin: window.location.origin,
        // The team is clinicians only; an administrator uses the owner's account
        staffType: 'clinician',
        clinicRoleId,
      })

      if (!res?.success) {
        toast.error(res?.message || 'Could not send the invitation')
        return
      }

      const link = buildLink(res.code)
      const copied = link ? await copyLink(link) : false
      const qrAction = link ? { label: 'Show QR', onClick: () => showQr(link) } : undefined

      if (res.message === 'Invitation already sent') {
        // The backend returns the existing pending invitation instead of making a second one
        toast.info(`${email} already has a pending invitation`, {
          description: copied
            ? 'Link copied. Use Resend under Pending invitations to email it again.'
            : 'Use Resend under Pending invitations to email it again.',
          action: qrAction,
        })
      } else {
        toast.success('Invitation sent', {
          description: copied ? `Link copied: ${link}` : link,
          action: qrAction,
        })
      }
      onSent()
    } catch (err) {
      toast.error(teamError(err, 'Could not send the invitation'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="invite-email" className={labelClass}>
            Email
          </Label>
          <Input
            id="invite-email"
            type="email"
            required
            autoComplete="off"
            placeholder="name@example.com"
            value={form.email}
            onChange={set('email')}
            disabled={submitting}
            className={cn(fieldClass, 'h-9')}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="invite-name" className={labelClass}>
            Name <span className="font-normal text-neutral-400 dark:text-neutral-500">(optional)</span>
          </Label>
          <Input
            id="invite-name"
            autoComplete="off"
            placeholder="e.g. Dr Ngozi Obi"
            value={form.name}
            onChange={set('name')}
            disabled={submitting}
            className={cn(fieldClass, 'h-9')}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-role" className={labelClass}>
          Dashboard role
        </Label>
        <Select value={roleId} onValueChange={setRoleId} disabled={submitting}>
          <SelectTrigger id="invite-role" className={cn(fieldClass, 'h-9 w-full')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FULL_ACCESS}>Clinician access (Appointments, Patients)</SelectItem>
            {(roles ?? []).map((role) => (
              <SelectItem key={role._id} value={role._id}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {selectedRole && selectedRole.permissions.length > 0
            ? `Can open Home, ${roleSummary(selectedRole.permissions)}. You can change this later.`
            : roles && roles.length === 0
              ? 'Can open Home, Appointments and Patients. To give Billing or other pages, create a role under Roles.'
              : 'Can open Home, Appointments and Patients. Pick a role to add Billing or other pages.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-message" className={labelClass}>
          Message <span className="font-normal text-neutral-400 dark:text-neutral-500">(optional)</span>
        </Label>
        <Textarea
          id="invite-message"
          rows={3}
          placeholder="Added to the invitation email"
          value={form.message}
          onChange={set('message')}
          disabled={submitting}
          className={cn(fieldClass, 'resize-none')}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className={cn(primaryButtonClass, 'h-9 px-4')} disabled={submitting}>
          {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {submitting ? 'Sending…' : 'Send invitation'}
        </Button>
      </div>
    </form>
  )
}
