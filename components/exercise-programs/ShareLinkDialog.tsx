'use client'

import { useEffect, useState } from 'react'
import { useAction } from 'convex/react'
import { format } from 'date-fns'
import { Check, Copy, KeyRound, Link2, Loader2, MessageCircle, ShieldCheck } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { primaryButtonClass } from '@/components/physio/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { programError } from './errors'

type Expiry = 'plan' | '7' | '30' | '90'
type Result = { url: string; message: string; whatsappUrl: string; expiresAt: number; pinSource: 'phone' | 'custom'; pinHint: string }

const EXPIRY: { value: Expiry; label: string; hint: string }[] = [
  { value: 'plan', label: 'Until the plan ends', hint: '+7 days, or 30 days if there’s no end date' },
  { value: '7', label: '7 days', hint: 'Short course' },
  { value: '30', label: '30 days', hint: 'A month' },
  { value: '90', label: '90 days', hint: 'Long-term programme' },
]

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error('Couldn’t copy. Select the text and copy it instead.')
  }
}

/** Makes a PIN-protected link to a programme and hands it to WhatsApp. */
export function ShareLinkDialog({
  programId,
  patientName,
  hasPhone,
  open,
  onOpenChange,
}: {
  programId: Id<'exercisePrograms'> | null
  patientName: string
  hasPhone: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createLink = useAction(api.exerciseShareLinks.createShareLink)
  const [expiry, setExpiry] = useState<Expiry>('plan')
  const [pinMode, setPinMode] = useState<'phone' | 'custom'>(hasPhone ? 'phone' : 'custom')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    if (!open) return
    setResult(null)
    setExpiry('plan')
    setPinMode(hasPhone ? 'phone' : 'custom')
    setPin('')
  }, [open, hasPhone])

  const create = async () => {
    if (!programId) return
    if (pinMode === 'custom' && !/^\d{4}$/.test(pin)) return toast.error('Enter a 4-digit PIN.')
    setBusy(true)
    try {
      const res = await createLink({
        programId,
        untilPlanEnds: expiry === 'plan',
        expiresInDays: expiry === 'plan' ? 30 : Number(expiry),
        customPin: pinMode === 'custom' ? pin : undefined,
      })
      setResult(res)
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t create the link. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const option = (active: boolean) =>
    cn(
      'rounded-2xl border p-3 text-left transition active:scale-[0.99]',
      active ? 'border-rh-lime bg-rh-honeydew ring-1 ring-rh-lime/30 dark:border-rh-lime dark:bg-white/[0.06]' : 'border-black/[0.08] hover:bg-rh-canvas dark:border-white/10 dark:hover:bg-white/[0.03]'
    )

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-[#25D366]" /> Share on WhatsApp</DialogTitle>
          <DialogDescription>
            {patientName} opens the link and enters a PIN. A forwarded link won&apos;t open without it.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-rh-ink dark:text-white">How long should the link work?</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {EXPIRY.map((e) => (
                  <button key={e.value} type="button" className={option(expiry === e.value)} onClick={() => setExpiry(e.value)}>
                    <p className="text-sm font-medium text-rh-ink dark:text-white">{e.label}</p>
                    <p className="text-xs text-neutral-500">{e.hint}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-rh-ink dark:text-white">PIN to open it</p>
              <div className="mt-2 grid gap-2">
                <button type="button" disabled={!hasPhone} className={cn(option(pinMode === 'phone'), !hasPhone && 'opacity-50')} onClick={() => setPinMode('phone')}>
                  <p className="text-sm font-medium text-rh-ink dark:text-white">Last 4 digits of their phone number</p>
                  <p className="text-xs text-neutral-500">{hasPhone ? 'Easiest: they already know it.' : 'No phone number on file for this patient.'}</p>
                </button>
                <button type="button" className={option(pinMode === 'custom')} onClick={() => setPinMode('custom')}>
                  <p className="text-sm font-medium text-rh-ink dark:text-white">A PIN you choose</p>
                  <p className="text-xs text-neutral-500">Tell them the PIN yourself, not in the same message.</p>
                </button>
                {pinMode === 'custom' && (
                  <Input
                    inputMode="numeric"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4-digit PIN"
                    className="w-36 rounded-xl text-center text-lg tracking-[0.4em]"
                  />
                )}
              </div>
            </div>
            <Button className={cn(primaryButtonClass, 'w-full')} onClick={create} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              Create link
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl bg-rh-honeydew p-3.5 text-sm text-[#065f46] dark:bg-emerald-400/10 dark:text-emerald-200">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Link ready, works until {format(result.expiresAt, 'd MMM yyyy')}</p>
                <p className="mt-0.5 flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> PIN: {result.pinHint}</p>
              </div>
            </div>
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-2xl bg-rh-canvas p-3.5 font-sans text-sm text-rh-ink dark:bg-white/[0.04] dark:text-neutral-200">{result.message}</pre>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button asChild className="rounded-xl bg-[#25D366] text-white hover:bg-[#1ebe5b] sm:col-span-3">
                <a href={result.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" /> Open WhatsApp
                </a>
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={() => copy(result.message, 'Message')}><Copy className="mr-2 h-4 w-4" /> Copy message</Button>
              <Button variant="outline" className="rounded-xl" onClick={() => copy(result.url, 'Link')}><Link2 className="mr-2 h-4 w-4" /> Copy link</Button>
              <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}><Check className="mr-2 h-4 w-4" /> Done</Button>
            </div>
            <p className="text-xs text-neutral-500">For privacy the link isn&apos;t stored. To share again, create a new link; you can turn old ones off from the programme.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
