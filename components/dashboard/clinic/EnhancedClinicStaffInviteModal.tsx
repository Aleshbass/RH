'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Mail, QrCode, UserPlus, Stethoscope } from 'lucide-react'
import { toast } from 'sonner'
import { useActionUntyped } from '@/lib/convexUntyped'
import { api } from '@/convex/_generated/api'

interface EnhancedClinicStaffInviteModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

type InviteMethod = 'email' | 'direct'

export default function EnhancedClinicStaffInviteModal({ isOpen, onClose, onSuccess }: EnhancedClinicStaffInviteModalProps) {
  const [method, setMethod] = useState<InviteMethod>('email')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [emailData, setEmailData] = useState({
    inviteeEmail: '',
    inviteeName: '',
    message: ''
  })
  const [directData, setDirectData] = useState({
    inviteeEmail: '',
    inviteeName: '',
    phoneNumber: '',
    licenseNumber: '',
    specialization: '',
  })

  // Action (untyped to avoid deep TS issues)
  type UnknownMap = Record<string, unknown>
  const apiRoot = api as unknown as { actions: UnknownMap }
  const clinicsModule = apiRoot.actions['clinics'] as UnknownMap
  const inviteClinicStaffModule = clinicsModule['inviteClinicStaff'] as UnknownMap
  const createStaffInvite = useActionUntyped(inviteClinicStaffModule['createClinicStaffInvitationWithNotification'])

  const appBaseUrl = useMemo(() => {
    if (typeof window !== 'undefined') return window.location.origin
    return process.env.NEXT_PUBLIC_APP_URL || 'https://physioaroundme.com'
  }, [])

  const buildLink = (code?: string) => {
    if (!code) return undefined
    if (typeof window !== 'undefined') {
      const base = window.location.origin.replace(/\/$/, '')
      return `${base}/staff-invite/${code}`
    }
    const base = (process.env.NEXT_PUBLIC_APP_URL || appBaseUrl || '').replace(/\/$/, '')
    return `${base}/staff-invite/${code}`
  }

  const copyAndToast = async (link?: string) => {
    if (!link) return
    try { await navigator.clipboard?.writeText(link) } catch { /* ignore */ }
    toast.success('Staff invitation created! Link copied to clipboard.', {
      description: link,
      action: {
        label: 'Show QR',
        onClick: () => {
          const qr = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`
          window.open(qr, '_blank')
        }
      }
    })
  }

  const handleClose = () => {
    setEmailData({ inviteeEmail: '', inviteeName: '', message: '' })
    setDirectData({ inviteeEmail: '', inviteeName: '', phoneNumber: '', licenseNumber: '', specialization: '' })
    setMethod('email')
    onClose()
  }

  const submitEmail = async () => {
    if (!emailData.inviteeEmail) {
      toast.error('Email is required')
      return
    }

    // Close modal immediately for better UX
    onClose()
    setIsSubmitting(true)

    try {
      const res = await createStaffInvite({
        inviteeEmail: emailData.inviteeEmail,
        inviteeName: emailData.inviteeName || undefined,
        message: emailData.message || undefined,
        sendEmail: true,
        origin: window.location.origin,
      })

      if (!res?.success) {
        // Check if it's a duplicate invitation error
        if (res?.message?.includes('already a pending invitation')) {
          toast.error('This email already has a pending invitation', {
            description: 'Go to the staff page to resend the existing invitation.',
            action: {
              label: 'View Staff',
              onClick: () => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/dashboard/clinic/staff'
                }
              }
            }
          })
        } else {
          throw new Error(res?.message || 'Failed to send invitation')
        }
        return
      }

      const link = buildLink(res?.code)
      await copyAndToast(link)

      // Reset form
      setEmailData({ inviteeEmail: '', inviteeName: '', message: '' })
      onSuccess?.()
    } catch (e) {
      console.error(e)
      const errorMessage = e instanceof Error ? e.message : 'Failed to send invitation'

      // Check if it's a duplicate invitation error
      if (errorMessage.includes('already a pending invitation')) {
        toast.error('This email already has a pending invitation', {
          description: 'Go to the staff page to resend the existing invitation.',
          action: {
            label: 'View Staff',
            onClick: () => {
              if (typeof window !== 'undefined') {
                window.location.href = '/dashboard/clinic/staff'
              }
            }
          }
        })
      } else {
        toast.error(errorMessage)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitDirect = async () => {
    if (!directData.inviteeEmail) {
      toast.error('Email is required')
      return
    }

    onClose()
    setIsSubmitting(true)

    try {
      // For now, use the invitation method (direct creation can be added later)
      const res = await createStaffInvite({
        inviteeEmail: directData.inviteeEmail,
        inviteeName: directData.inviteeName || undefined,
        message: `Welcome! We're creating your profile with the following details:\n- License: ${directData.licenseNumber || 'Not provided'}\n- Specialization: ${directData.specialization || 'General'}`,
        sendEmail: true,
        origin: window.location.origin,
      })

      if (!res?.success) {
        // Check if it's a duplicate invitation error
        if (res?.message?.includes('already a pending invitation')) {
          toast.error('This email already has a pending invitation', {
            description: 'Go to the staff page to resend the existing invitation.',
            action: {
              label: 'View Staff',
              onClick: () => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/dashboard/clinic/staff'
                }
              }
            }
          })
        } else {
          throw new Error(res?.message || 'Failed to create staff member')
        }
        return
      }

      const link = buildLink(res?.code)
      await copyAndToast(link)

      setDirectData({ inviteeEmail: '', inviteeName: '', phoneNumber: '', licenseNumber: '', specialization: '' })
      onSuccess?.()
    } catch (e) {
      console.error(e)
      const errorMessage = e instanceof Error ? e.message : 'Failed to create staff member'

      // Check if it's a duplicate invitation error
      if (errorMessage.includes('already a pending invitation')) {
        toast.error('This email already has a pending invitation', {
          description: 'Go to the staff page to resend the existing invitation.',
          action: {
            label: 'View Staff',
            onClick: () => {
              if (typeof window !== 'undefined') {
                window.location.href = '/dashboard/clinic/staff'
              }
            }
          }
        })
      } else {
        toast.error(errorMessage)
      }
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
    return (
      <Button className={baseClass} disabled={isSubmitting} onClick={submitDirect}>
        <UserPlus className="h-4 w-4 mr-2" />
        {isSubmitting ? 'Creating…' : 'Create & Send Invite'}
      </Button>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[96vw] max-w-5xl md:max-w-6xl max-h-[90vh] p-0 overflow-hidden rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr] h-full max-h-[90vh]">
          {/* Left: Form */}
          <div className="p-6 sm:p-8 overflow-y-auto max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="text-2xl text-[#005b57] flex items-center gap-2">
                <Stethoscope className="h-6 w-6" />
                Invite Physiotherapist to Clinic
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                Send a professional invitation to join your clinic team. They'll receive an email with a secure link.
              </DialogDescription>
            </DialogHeader>

            {/* Method selector */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                className="h-12"
                variant={method === 'email' ? 'default' : 'outline'}
                onClick={() => setMethod('email')}
              >
                <Mail className="h-4 w-4 mr-2" /> Email Invitation
              </Button>
              <Button
                className="h-12"
                variant={method === 'direct' ? 'default' : 'outline'}
                onClick={() => setMethod('direct')}
              >
                <UserPlus className="h-4 w-4 mr-2" /> Create Profile
              </Button>
            </div>

            {/* Forms */}
            <div className="mt-6 space-y-5">
              {method === 'email' && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block text-gray-700">
                      Physiotherapist Email *
                    </label>
                    <Input
                      type="email"
                      placeholder="physiotherapist@example.com"
                      value={emailData.inviteeEmail}
                      onChange={(e) => setEmailData(prev => ({ ...prev, inviteeEmail: e.target.value }))}
                      disabled={isSubmitting}
                      className="h-11"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block text-gray-700">
                      Full Name (Optional)
                    </label>
                    <Input
                      placeholder="Dr. John Doe"
                      value={emailData.inviteeName}
                      onChange={(e) => setEmailData(prev => ({ ...prev, inviteeName: e.target.value }))}
                      disabled={isSubmitting}
                      className="h-11"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Personalizes the invitation email
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block text-gray-700">
                      Personal Message (Optional)
                    </label>
                    <Textarea
                      placeholder="Welcome to our clinic! We're excited to have you join our team..."
                      value={emailData.message}
                      onChange={(e) => setEmailData(prev => ({ ...prev, message: e.target.value }))}
                      disabled={isSubmitting}
                      rows={4}
                      className="resize-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Add a personal touch to make them feel welcome
                    </p>
                  </div>
                </>
              )}

              {method === 'direct' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block text-gray-700">
                        Email *
                      </label>
                      <Input
                        type="email"
                        placeholder="physiotherapist@example.com"
                        value={directData.inviteeEmail}
                        onChange={(e) => setDirectData(prev => ({ ...prev, inviteeEmail: e.target.value }))}
                        disabled={isSubmitting}
                        className="h-11"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block text-gray-700">
                        Full Name *
                      </label>
                      <Input
                        placeholder="Dr. John Doe"
                        value={directData.inviteeName}
                        onChange={(e) => setDirectData(prev => ({ ...prev, inviteeName: e.target.value }))}
                        disabled={isSubmitting}
                        className="h-11"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block text-gray-700">
                        Phone Number
                      </label>
                      <Input
                        placeholder="+234 xxx xxx xxxx"
                        value={directData.phoneNumber}
                        onChange={(e) => setDirectData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                        disabled={isSubmitting}
                        className="h-11"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block text-gray-700">
                        License Number
                      </label>
                      <Input
                        placeholder="License #"
                        value={directData.licenseNumber}
                        onChange={(e) => setDirectData(prev => ({ ...prev, licenseNumber: e.target.value }))}
                        disabled={isSubmitting}
                        className="h-11"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block text-gray-700">
                      Specialization
                    </label>
                    <Input
                      placeholder="e.g., Orthopedic, Sports, Neurological"
                      value={directData.specialization}
                      onChange={(e) => setDirectData(prev => ({ ...prev, specialization: e.target.value }))}
                      disabled={isSubmitting}
                      className="h-11"
                    />
                  </div>

                  <p className="text-xs text-gray-500">
                    Creates profile and sends activation email. They'll complete onboarding after accepting.
                  </p>
                </>
              )}

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  What happens next?
                </h4>
                <ul className="text-xs text-blue-800 space-y-1.5">
                  <li>• Physiotherapist receives a professional email invitation</li>
                  <li>• They can accept or decline the invitation</li>
                  <li>• Upon acceptance, they join your clinic team</li>
                  <li>• You'll be notified via email and in-app notification</li>
                  <li>• Invitation expires in 7 days</li>
                </ul>
              </div>

              {/* Action buttons - always visible at bottom */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="h-12 w-full sm:w-auto order-2 sm:order-1"
                  >
                    Cancel
                  </Button>
                  <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto order-1 sm:order-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        // Preview QR with sample URL
                        const sample = (process.env.NEXT_PUBLIC_APP_URL || appBaseUrl || '').replace(/\/$/, '') + '/staff-invite/XXXXXX'
                        const qr = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(sample)}`
                        window.open(qr, '_blank')
                      }}
                      className="h-12 w-full sm:w-auto"
                      disabled={isSubmitting}
                    >
                      <QrCode className="h-4 w-4 mr-2" />
                      Preview QR
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
              alt="Rehabify Health Clinic"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-br from-[#005b57]/60 to-[#002e2c]/40" />
            <div className="absolute bottom-8 left-6 right-6 text-white">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
                <h3 className="text-2xl font-semibold mb-3">Build Your Dream Team</h3>
                <p className="text-sm text-white/90 mb-4">
                  Invite experienced physiotherapists to join your clinic. Streamline onboarding with secure, professional invitations.
                </p>
                <div className="flex items-center gap-4 text-xs text-white/80">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    <span>Secure</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                    <span>Professional</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                    <span>Fast</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
