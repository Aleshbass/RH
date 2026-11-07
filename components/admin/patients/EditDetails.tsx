'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { errorMessage } from '@/components/partners/portal/shared'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { NIGERIAN_STATES } from '@/lib/nigerianStates'
import { patientApi, type CareFormat, type DetailsPatch, type PatientRecord } from './patientApi'

const LANGUAGES = ['English', 'Pidgin', 'Yoruba', 'Igbo', 'Hausa']
const NONE = '__none'

type Form = {
  dateOfBirth: string
  ageYears: string
  gender: string
  preferredLanguage: string
  state: string
  city: string
  area: string
  address: string
  mainComplaint: string
  preferredFormat: string
  careTeamNotes: string
}

function initial(record: PatientRecord): Form {
  return {
    dateOfBirth: /^\d{4}-\d{2}-\d{2}/.test(record.dateOfBirth ?? '') ? record.dateOfBirth!.slice(0, 10) : '',
    ageYears: record.dateOfBirth ? '' : record.ageYears !== null ? String(record.ageYears) : '',
    gender: record.gender ?? NONE,
    preferredLanguage: record.language ?? '',
    state: record.state ?? '',
    city: record.city ?? '',
    area: record.area ?? '',
    address: record.address ?? '',
    // Prefill with what Joy or a referral said, so the team only corrects it
    mainComplaint: record.mainComplaint ?? record.complaint ?? '',
    preferredFormat: record.preferredFormat ?? record.format ?? NONE,
    careTeamNotes: record.careTeamNotes ?? '',
  }
}

/** What the care team learns on a call: fills the gaps that stop a patient being matched. */
export function EditDetails({ record, onDone }: { record: PatientRecord; onDone: () => void }) {
  const save = useMutation(patientApi.updateDetails)
  const [start] = useState(() => initial(record))
  const [form, setForm] = useState<Form>(start)
  const [saving, setSaving] = useState(false)
  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async () => {
    const patch: DetailsPatch = { patientId: record.userId }
    const changed = (key: keyof Form) => form[key].trim() !== start[key].trim()
    if (changed('dateOfBirth')) patch.dateOfBirth = form.dateOfBirth.trim()
    if (changed('ageYears')) {
      const age = form.ageYears.trim()
      if (age && !/^\d{1,3}$/.test(age)) {
        toast.error('Age must be a whole number.')
        return
      }
      patch.ageYears = age ? Number(age) : null
    }
    if (changed('gender')) patch.gender = form.gender === NONE ? null : (form.gender as DetailsPatch['gender'])
    for (const key of ['preferredLanguage', 'state', 'city', 'area', 'address', 'mainComplaint', 'careTeamNotes'] as const) {
      if (changed(key)) patch[key] = form[key]
    }
    if (changed('preferredFormat')) patch.preferredFormat = form.preferredFormat === NONE ? null : (form.preferredFormat as CareFormat)
    if (Object.keys(patch).length === 1) {
      onDone()
      return
    }
    setSaving(true)
    try {
      await save(patch)
      playSound('success')
      toast.success('Details saved')
      onDone()
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, "Couldn’t save the details. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  const field = 'space-y-1.5'
  const label = 'text-xs font-medium text-neutral-600 dark:text-neutral-300'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={field}>
          <Label htmlFor="pd-dob" className={label}>Date of birth</Label>
          <Input id="pd-dob" type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth')(e.target.value)} className={inputClass} />
        </div>
        <div className={field}>
          <Label htmlFor="pd-age" className={label}>Or age, if that&apos;s all they said</Label>
          <Input id="pd-age" inputMode="numeric" value={form.ageYears} onChange={(e) => set('ageYears')(e.target.value)} placeholder="e.g. 54" className={inputClass} disabled={Boolean(form.dateOfBirth)} />
        </div>
        <div className={field}>
          <Label className={label}>Gender</Label>
          <Select value={form.gender} onValueChange={set('gender')}>
            <SelectTrigger className={cn(inputClass, 'h-10')} aria-label="Gender">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not given</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="other">Other</SelectItem>
              <SelectItem value="prefer_not_to_say">Prefers not to say</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className={field}>
          <Label htmlFor="pd-lang" className={label}>Language</Label>
          <Input id="pd-lang" list="pd-languages" value={form.preferredLanguage} onChange={(e) => set('preferredLanguage')(e.target.value)} className={inputClass} />
          <datalist id="pd-languages">
            {LANGUAGES.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
        <div className={field}>
          <Label htmlFor="pd-state" className={label}>State</Label>
          <Input id="pd-state" list="pd-states" value={form.state} onChange={(e) => set('state')(e.target.value)} placeholder="e.g. Lagos" className={inputClass} />
          <datalist id="pd-states">
            {NIGERIAN_STATES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className={field}>
          <Label htmlFor="pd-city" className={label}>City</Label>
          <Input id="pd-city" value={form.city} onChange={(e) => set('city')(e.target.value)} placeholder="e.g. Lagos" className={inputClass} />
        </div>
        <div className={field}>
          <Label htmlFor="pd-area" className={label}>Area / LGA</Label>
          <Input id="pd-area" value={form.area} onChange={(e) => set('area')(e.target.value)} placeholder="e.g. Lekki" className={inputClass} />
        </div>
        <div className={field}>
          <Label className={label}>Video or home visit</Label>
          <Select value={form.preferredFormat} onValueChange={set('preferredFormat')}>
            <SelectTrigger className={cn(inputClass, 'h-10')} aria-label="Video or home visit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not given</SelectItem>
              <SelectItem value="online">Video</SelectItem>
              <SelectItem value="home_visit">Home visit</SelectItem>
              <SelectItem value="clinic">Clinic visit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className={cn(field, 'sm:col-span-2')}>
          <Label htmlFor="pd-address" className={label}>Address (for home visits)</Label>
          <Input id="pd-address" value={form.address} onChange={(e) => set('address')(e.target.value)} className={inputClass} />
        </div>
        <div className={cn(field, 'sm:col-span-2')}>
          <Label htmlFor="pd-complaint" className={label}>Main complaint</Label>
          <Input id="pd-complaint" value={form.mainComplaint} onChange={(e) => set('mainComplaint')(e.target.value)} placeholder="e.g. Low back pain for 3 months" className={inputClass} />
        </div>
        <div className={cn(field, 'sm:col-span-2')}>
          <Label htmlFor="pd-notes" className={label}>Care team notes</Label>
          <Textarea id="pd-notes" rows={3} value={form.careTeamNotes} onChange={(e) => set('careTeamNotes')(e.target.value)} placeholder="Best time to call, who to speak to, anything the physio should know" className={inputClass} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={saving} className={softButtonClass}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} disabled={saving} className={primaryButtonClass}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save details
        </Button>
      </div>
    </div>
  )
}
