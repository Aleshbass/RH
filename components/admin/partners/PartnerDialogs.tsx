'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Check, Copy, ExternalLink, Link2, Loader2, Plus } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import type { PartnerApplication } from './PartnerReview'
import { Callout, dialogClass, dialogTitleClass, errorMessage, hintClass, labelClass, linkClass, selectContentClass } from './shared'

// Referring doctors ('doctor') sign up themselves so they can give their licence number;
// the admin approves them in Applications, so they aren't created here.
type PartnerType = 'hospital' | 'hmo' | 'corporate' | 'employer' | 'gym' | 'telemedicine' | 'pharmacy' | 'digital_health'

const PARTNER_TYPE_OPTIONS: { value: PartnerType; label: string }[] = [
  { value: 'hospital', label: 'Hospital / Clinic' },
  { value: 'hmo', label: 'HMO / Insurer' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'employer', label: 'Employer' },
  { value: 'gym', label: 'Gym / Fitness' },
  { value: 'telemedicine', label: 'Telemedicine' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'digital_health', label: 'Digital health' },
]

const EMPTY_NEW_PARTNER = {
  name: '',
  type: 'hospital' as PartnerType,
  ownerEmail: '',
  contactName: '',
  contactPhone: '',
  tier: 'standard' as 'standard' | 'enterprise',
}

/** For partners onboarded by the Rehabify team. */
export function CreatePartnerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const adminCreatePartner = useMutation(api.partners.adminCreatePartner)
  const [form, setForm] = useState(EMPTY_NEW_PARTNER)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.name.trim() || !form.ownerEmail.trim()) {
      toast.error('Organisation name and owner email are required')
      return
    }
    setSaving(true)
    try {
      const res = await adminCreatePartner({
        name: form.name.trim(),
        type: form.type,
        ownerEmail: form.ownerEmail.trim(),
        contactName: form.contactName.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        tier: form.tier,
      })
      playSound('success')
      toast.success(`Partner created (${res.code}). The owner gets sandbox access by signing in with ${form.ownerEmail.trim()}.`)
      onOpenChange(false)
      setForm(EMPTY_NEW_PARTNER)
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Failed to create partner'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className={`${dialogClass} sm:max-w-[480px]`}>
        <DialogHeader>
          <DialogTitle className={dialogTitleClass}>
            <Plus className="h-5 w-5 text-rh-teal dark:text-rh-aqua" />
            Create partner organisation
          </DialogTitle>
          <DialogDescription>
            The organisation gets sandbox access straight away and the owner claims it by signing in with the owner email. Live access still needs
            a go-live approval.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="new-partner-name" className={labelClass}>
              Organisation name
            </label>
            <Input
              id="new-partner-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Reddington Hospital"
              className={inputClass}
              maxLength={120}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className={labelClass}>Type</span>
              <Select value={form.type} onValueChange={(value) => setForm((p) => ({ ...p, type: value as PartnerType }))}>
                <SelectTrigger className={cn(inputClass, 'w-full')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  {PARTNER_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <span className={labelClass}>Tier</span>
              <Select value={form.tier} onValueChange={(value) => setForm((p) => ({ ...p, tier: value === 'enterprise' ? 'enterprise' : 'standard' }))}>
                <SelectTrigger className={cn(inputClass, 'w-full')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-partner-email" className={labelClass}>
              Owner email
            </label>
            <Input
              id="new-partner-email"
              type="email"
              value={form.ownerEmail}
              onChange={(e) => setForm((p) => ({ ...p, ownerEmail: e.target.value }))}
              placeholder="partnerships@hospital.com"
              className={inputClass}
            />
            <p className={hintClass}>The owner must sign in with this exact, verified email to claim the organisation.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="new-partner-contact" className={labelClass}>
                Contact name
              </label>
              <Input
                id="new-partner-contact"
                value={form.contactName}
                onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-partner-phone" className={labelClass}>
                Contact phone
              </label>
              <Input
                id="new-partner-phone"
                value={form.contactPhone}
                onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className={softButtonClass}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className={primaryButtonClass}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create partner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Creates a trackable referral URL for a partner. Pass `partner` to open it. */
export function ReferralLinkDialog({ partner, onClose }: { partner: PartnerApplication | null; onClose: () => void }) {
  return (
    <Dialog open={!!partner} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`${dialogClass} sm:max-w-[480px]`}>
        {/* Keyed so the form resets for every partner */}
        {partner && <ReferralLinkForm key={partner._id} partner={partner} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function ReferralLinkForm({ partner, onClose }: { partner: PartnerApplication; onClose: () => void }) {
  const createLink = useMutation(api.partnerLinks.createReferralLink)
  const canGoLive = partner.productionStatus === 'approved'
  const [campaignName, setCampaignName] = useState(`${partner.name} Referral Campaign`)
  const [careMode, setCareMode] = useState('patient_choice')
  const [expiresInDays, setExpiresInDays] = useState('30')
  const [environment, setEnvironment] = useState<'live' | 'sandbox'>(canGoLive ? 'live' : 'sandbox')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ publicCode: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    setGenerating(true)
    try {
      const days = parseInt(expiresInDays) || 0
      const res = await createLink({
        partnerCode: partner.code,
        environment,
        campaignName: campaignName.trim() || undefined,
        defaultCareMode: careMode,
        expiresAt: days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : undefined,
      })
      setResult({ publicCode: res.public_code, url: res.url })
      playSound('success')
      toast.success(environment === 'sandbox' ? 'Sandbox referral link created' : 'Live referral link created')
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Failed to generate referral link'))
    } finally {
      setGenerating(false)
    }
  }

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Referral link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.')
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className={dialogTitleClass}>
          <Link2 className="h-5 w-5 text-rh-teal dark:text-rh-aqua" />
          Generate referral link
        </DialogTitle>
        <DialogDescription>
          Create a trackable referral URL for <strong className="text-rh-night dark:text-white">{partner.name}</strong>. Leads submitted through
          this link are attributed to this partner.
        </DialogDescription>
      </DialogHeader>

      {result ? (
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl bg-rh-mist p-4 dark:bg-rh-aqua/[0.08]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rh-night dark:text-white">Your trackable link</span>
              <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs text-rh-teal dark:bg-rh-ink-3 dark:text-rh-aqua">{result.publicCode}</span>
            </div>
            <div className="flex items-center gap-2">
              <Input readOnly value={result.url} className={cn(inputClass, 'font-mono text-xs')} onFocus={(e) => e.currentTarget.select()} />
              <Button size="sm" onClick={() => copy(result.url)} className={cn(primaryButtonClass, 'shrink-0')} aria-label="Copy link">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <a href={result.url} target="_blank" rel="noreferrer" className={cn(linkClass, 'mr-auto inline-flex items-center gap-1 text-xs')}>
              <ExternalLink className="h-3.5 w-3.5" />
              Preview landing page
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setResult(null)
                setCampaignName('')
              }}
              className={softButtonClass}
            >
              Generate another
            </Button>
            <Button size="sm" onClick={onClose} className={primaryButtonClass}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className={labelClass}>Environment</span>
            <Select value={environment} onValueChange={(value) => setEnvironment(value === 'sandbox' ? 'sandbox' : 'live')}>
              <SelectTrigger className={cn(inputClass, 'w-full')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                <SelectItem value="live" disabled={!canGoLive}>
                  Live (real patients)
                </SelectItem>
                <SelectItem value="sandbox">Sandbox (test leads, nobody is contacted)</SelectItem>
              </SelectContent>
            </Select>
            {!canGoLive && <Callout tone="warning">Live links need production access. Approve go-live first.</Callout>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="link-campaign" className={labelClass}>
              Campaign / purpose
            </label>
            <Input
              id="link-campaign"
              placeholder="e.g. Q4 Corporate Wellness Drive"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className={labelClass}>Default care mode</span>
              <Select value={careMode} onValueChange={setCareMode}>
                <SelectTrigger className={cn(inputClass, 'w-full')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  <SelectItem value="patient_choice">Patient choice</SelectItem>
                  <SelectItem value="remote">Virtual (tele-physio)</SelectItem>
                  <SelectItem value="face_to_face">In-person and home visits</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <span className={labelClass}>Link valid for</span>
              <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                <SelectTrigger className={cn(inputClass, 'w-full')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days (recommended)</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="0">Never expires</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={onClose} className={softButtonClass}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={generating} className={primaryButtonClass}>
              {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate link
            </Button>
          </DialogFooter>
        </div>
      )}
    </>
  )
}
