'use client'

import { useState } from 'react'
import { makeFunctionReference } from 'convex/server'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNaira } from '@/components/admin/ui'

const recordRef = makeFunctionReference<'mutation', { clinicId: string; reference: string }, { count: number; kobo: number }>(
  'adminClinics:recordClinicTransfer'
)

/**
 * Money Rehabify held for a clinic (its patients paid before it connected its bank): once it has
 * been sent by bank transfer, record the reference here. The clinic owner is told.
 */
export function HeldTransfer({ clinicId, heldKobo }: { clinicId: string; heldKobo: number }) {
  const record = useMutation(recordRef)
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  if (heldKobo <= 0) return null

  const submit = async () => {
    setSaving(true)
    try {
      const { count, kobo } = await record({ clinicId, reference })
      toast.success(count > 0 ? `Recorded ${formatNaira(kobo / 100)} sent to the clinic` : 'Nothing was waiting')
      setReference('')
    } catch (err) {
      const data = (err as { data?: unknown } | null)?.data
      toast.error(typeof data === 'string' ? data : 'Could not record the transfer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="col-span-full flex flex-col gap-2 rounded-xl border border-amber-300/70 p-3 dark:border-amber-500/30 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-sm text-neutral-700 dark:text-neutral-300">
        Sent {formatNaira(heldKobo / 100)} to the clinic? Record the transfer reference.
      </p>
      <Input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="Transfer reference"
        className="h-9 sm:w-48"
        aria-label="Transfer reference"
      />
      <Button size="sm" className="h-9" disabled={saving || !reference.trim()} onClick={() => void submit()}>
        {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        Record transfer
      </Button>
    </div>
  )
}
