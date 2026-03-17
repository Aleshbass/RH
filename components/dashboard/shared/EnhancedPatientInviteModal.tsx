'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Mail, Link2, QrCode, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useActionUntyped } from '@/lib/convexUntyped'
import { api } from '@/convex/_generated/api'

interface EnhancedPatientInviteModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit?: (formData: { patientEmail: string; patientName?: string; notes?: string }) => Promise<boolean>
}

type Method = 'email' | 'magic' | 'direct'

export default function EnhancedPatientInviteModal({ isOpen, onClose, onSubmit }: EnhancedPatientInviteModalProps) {
  const [method, setMethod] = useState<Method>('email')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [emailData, setEmailData] = useState({ patientEmail: '', patientName: '', notes: '' })
  // SMS disabled for now
  const [magicData, setMagicData] = useState({ patientEmail: '', patientName: '' })
  const [directData, setDirectData] = useState({ patientEmail: '', patientName: '', phoneNumber: '' })

  // Actions (untyped to avoid deep TS issues)
  type UnknownMap = Record<string, unknown>
  const apiRoot = api as unknown as { actions: UnknownMap }
  const patientsModule = apiRoot.actions['patients'] as UnknownMap
  const invitePatientModule = patientsModule['invitePatient'] as UnknownMap
  const alternateInvitesModule = patientsModule['alternateInvites'] as UnknownMap
  const createEmailInvite = useActionUntyped(invitePatientModule['createPatientInvitationWithNotification'])
  const createMagicInvite = useActionUntyped(alternateInvitesModule['createMagicLinkInvitation'])
  const directCreate = useActionUntyped(alternateInvitesModule['directCreatePatient'])

  const appBaseUrl = useMemo(() => {
    if (typeof window !== 'undefined') return window.location.origin
    return process.env.NEXT_PUBLIC_APP_URL || 'https://physioaroundme.com'
  }, [])

  const buildLink = (code?: string) => {
    // Always prefer the current origin in browser to avoid copy/paste links pointing
    // to a different environment (which can cause 'invalid invitation code').
    if (!code) return undefined
    if (typeof window !== 'undefined') {
      const base = window.location.origin.replace(/\/$/, '')
      return `${base}/patient-invite/${code}`
    }
    const base = (process.env.NEXT_PUBLIC_APP_URL || appBaseUrl || '').replace(/\/$/, '')
    return `${base}/patient-invite/${code}`
  }

  const copyAndToast = async (link?: string) => {
    if (!link) return
    try { await navigator.clipboard?.writeText(link) } catch { /* ignore */ }
    toast.success('Invitation created. Link copied to clipboard.', {
      description: link,
      action: {
        label: 'Show QR',
        onClick: () => {
          const qr = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(link)}`
          window.open(qr, '_blank')
        }
      }
    })
  }

  const handleClose = () => {
    setEmailData({ patientEmail: '', patientName: '', notes: '' })
    // SMS disabled
    setMagicData({ patientEmail: '', patientName: '' })
    setDirectData({ patientEmail: '', patientName: '', phoneNumber: '' })
    setMethod('email')
    onClose()
  }

  // Submit handlers per method
  const submitEmail = async () => {
    if (!emailData.patientEmail) {
      toast.error('Email is required')
      return
    }
    // Collapse immediately
    onClose()
    setIsSubmitting(true)
    try {
      let code: string | undefined
      if (onSubmit) {
        const ok = await onSubmit({
          patientEmail: emailData.patientEmail,
          patientName: emailData.patientName || undefined,
          notes: emailData.notes || undefined,
        })
        if (!ok) throw new Error('Failed to send invitation')
      } else {
        const res = await createEmailInvite({
          patientEmail: emailData.patientEmail,
          patientName: emailData.patientName || undefined,
          notes: emailData.notes || undefined,
          sendEmail: true,
        })
        if (!res?.success) throw new Error(res?.message || 'Failed to send invitation')
        code = res?.invitationCode
      }
      const link = buildLink(code)
      await copyAndToast(link)
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Failed to send invitation')
    } finally {
      setIsSubmitting(false)
    }
  }

  // SMS submission is disabled

  const submitMagic = async () => {
    if (!magicData.patientEmail) {
      toast.error('Email is required')
      return
    }
    onClose()
    setIsSubmitting(true)
    try {
      const res = await createMagicInvite({
        patientEmail: magicData.patientEmail,
        patientName: magicData.patientName || undefined,
      })
      if (!res?.success) throw new Error(res?.message || 'Failed to create magic link invitation')
      const link = buildLink(res?.invitationCode)
      await copyAndToast(link)
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Failed to create magic link')
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitDirect = async () => {
    if (!directData.patientEmail) {
      toast.error('Email is required')
      return
    }
    onClose()
    setIsSubmitting(true)
    try {
      const res = await directCreate({
        patientEmail: directData.patientEmail,
        patientName: directData.patientName || undefined,
        phoneNumber: directData.phoneNumber || undefined,
      })
      if (!res?.success) throw new Error(res?.message || 'Failed to create patient')
      const link = buildLink(res?.invitationCode)
      await copyAndToast(link)
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Failed to create patient')
    } finally {
      setIsSubmitting(false)
    }
  }

  const PrimaryAction = () => {
    const baseClass = 'w-full h-11 bg-gradient-to-r from-[#002e2c] to-[#005b57] text-white hover:opacity-95 disabled:opacity-50 rounded-md flex items-center justify-center'
    if (method === 'email') {
      return (
        <Button className={baseClass} disabled={isSubmitting} onClick={submitEmail}>
          <Mail className="h-4 w-4 mr-2" />
          {isSubmitting ? 'Sending…' : 'Send Email Invitation'}
        </Button>
      )
    }
    // SMS disabled
    if (method === 'magic') {
      return (
        <Button className={baseClass} disabled={isSubmitting} onClick={submitMagic}>
          <Link2 className="h-4 w-4 mr-2" />
          {isSubmitting ? 'Creating…' : 'Create Magic Link'}
        </Button>
      )
    }
    return (
      <Button className={baseClass} disabled={isSubmitting} onClick={submitDirect}>
        <UserPlus className="h-4 w-4 mr-2" />
        {isSubmitting ? 'Creating…' : 'Create Patient & Send Invite'}
      </Button>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[96vw] max-w-5xl md:max-w-6xl max-h-[90vh] p-0 overflow-hidden rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr]">
          {/* Left: Form */}
          <div className="p-6 sm:p-8 overflow-y-auto pb-24">
            <DialogHeader>
              <DialogTitle className="text-2xl text-[#005b57]">Invite New Patient</DialogTitle>
              <DialogDescription className="text-gray-600">
                Choose an invitation method. Email is recommended.
              </DialogDescription>
            </DialogHeader>

            {/* Method selector */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              <Button className="h-12" variant={method === 'email' ? 'default' : 'outline'} onClick={() => setMethod('email')}>
                <Mail className="h-4 w-4 mr-2" /> Email
              </Button>
              {/* SMS option disabled */}
              <Button className="h-12" variant={method === 'magic' ? 'default' : 'outline'} onClick={() => setMethod('magic')}>
                <Link2 className="h-4 w-4 mr-2" /> Magic Link
              </Button>
              <Button className="h-12" variant={method === 'direct' ? 'default' : 'outline'} onClick={() => setMethod('direct')}>
                <UserPlus className="h-4 w-4 mr-2" /> Direct Create
              </Button>
            </div>

            {/* Forms */}
            <div className="mt-6 space-y-5">
              {method === 'email' && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Patient Email *</label>
                    <Input
                      type="email"
                      placeholder="patient@example.com"
                      value={emailData.patientEmail}
                      onChange={(e) => setEmailData(prev => ({ ...prev, patientEmail: e.target.value }))}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Patient Name (Optional)</label>
                    <Input
                      placeholder="John Doe"
                      value={emailData.patientName}
                      onChange={(e) => setEmailData(prev => ({ ...prev, patientName: e.target.value }))}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Notes (Optional)</label>
                    <Textarea
                      placeholder="Additional notes for the patient..."
                      value={emailData.notes}
                      onChange={(e) => setEmailData(prev => ({ ...prev, notes: e.target.value }))}
                      disabled={isSubmitting}
                    />
                  </div>
                </>
              )}

              {/* SMS form disabled */}

              {method === 'magic' && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Patient Email *</label>
                    <Input
                      type="email"
                      placeholder="patient@example.com"
                      value={magicData.patientEmail}
                      onChange={(e) => setMagicData(prev => ({ ...prev, patientEmail: e.target.value }))}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Patient Name (Optional)</label>
                    <Input
                      placeholder="John Doe"
                      value={magicData.patientName}
                      onChange={(e) => setMagicData(prev => ({ ...prev, patientName: e.target.value }))}
                      disabled={isSubmitting}
                    />
                  </div>
                  <p className="text-xs text-gray-500">Sends Clerk magic-link invitation. The link still returns to the invite page for onboarding.</p>
                </>
              )}

              {method === 'direct' && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Patient Email *</label>
                    <Input
                      type="email"
                      placeholder="patient@example.com"
                      value={directData.patientEmail}
                      onChange={(e) => setDirectData(prev => ({ ...prev, patientEmail: e.target.value }))}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Patient Name (Optional)</label>
                    <Input
                      placeholder="John Doe"
                      value={directData.patientName}
                      onChange={(e) => setDirectData(prev => ({ ...prev, patientName: e.target.value }))}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Patient Phone (Optional)</label>
                    <Input
                      placeholder="e.g. +234 xxx xxx xxxx"
                      value={directData.phoneNumber}
                      onChange={(e) => setDirectData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                      disabled={isSubmitting}
                    />
                  </div>
                  <p className="text-xs text-gray-500">Creates the Clerk user and sends activation. Patient role is enforced on acceptance.</p>
                </>
              )}

              {/* Sticky footer actions for mobile visibility */}
              <div className="sticky bottom-0 -mx-6 sm:-mx-8 px-6 sm:px-8 py-3 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-t">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="h-12 w-full sm:w-auto">Cancel</Button>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button variant="outline" onClick={() => {
                      // Preview QR - only works after invite is created. Here we show a hint or simple QR for base URL
                      const sample = (process.env.NEXT_PUBLIC_APP_URL || appBaseUrl || '').replace(/\/$/, '') + '/patient-invite/XXXXXX'
                      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(sample)}`
                      window.open(qr, '_blank')
                    }} className="h-12 w-full sm:w-auto">
                      <QrCode className="h-4 w-4 mr-2" />
                      Show QR
                    </Button>
                    <div className="w-full sm:w-auto"><PrimaryAction /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Brand image */}
          <div className="relative hidden md:block">
            <Image
              src="/logos/images/Group 469272.webp"
              alt="Rehabify Health"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-br from-[#005b57]/60 to-[#002e2c]/40" />
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <h3 className="text-xl font-semibold">Grow your patient base</h3>
              <p className="text-sm text-white/90">Invite patients via email, SMS, or magic link. Quick and secure onboarding.</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
