'use client'

import { useState } from 'react'
import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Loader2, ShieldCheck } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { accentButtonClass } from '@/components/patient/ui'
import { programError } from '@/components/exercise-programs/errors'
import { POLICIES, policyVersions, type PolicyId } from '@/lib/policies'
import { playSound } from '@/lib/sounds'

type Consents = {
  needed: PolicyId[]
  documents: { id: PolicyId; title: string; href: string; version: string }[]
} | null

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const consentsRef = makeFunctionReference<'query', Record<string, never>, Consents>('users:myPolicyConsents')
const acceptRef = makeFunctionReference<'mutation', { accepted: Record<string, string> }, { recorded: PolicyId[] }>(
  'users:acceptPatientConsents'
)

const link = 'font-medium text-pt-ink underline underline-offset-2 hover:opacity-80'

/**
 * True once we know nothing is waiting to be agreed to. Anything else that opens on top of the
 * page (the welcome tour) waits for this, so it never stacks on the dialog below.
 */
export function useConsentsSettled(enabled = true) {
  const consents = useQuery(consentsRef, enabled ? {} : 'skip')
  return consents !== undefined && (consents?.needed.length ?? 0) === 0
}

/**
 * Patients who joined before Rehabify asked (or whose Terms or Privacy Policy has a new version)
 * are asked once, here, before using the dashboard. It can't be
 * dismissed, but there's nothing else to do: read if they like, then "Agree and continue".
 * Recorded append-only with channel "web" (users.acceptPatientConsents).
 */
export function ConsentDialog() {
  const consents = useQuery(consentsRef, {})
  const accept = useMutation(acceptRef)
  const [saving, setSaving] = useState(false)
  const needed = consents?.needed ?? []
  if (needed.length === 0) return null

  const agree = async () => {
    setSaving(true)
    try {
      await accept({ accepted: policyVersions(needed) })
      playSound('success')
    } catch (error) {
      toast.error(programError(error, 'We couldn’t save that. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        className="max-w-md gap-0 rounded-3xl border-pt-line bg-pt-surface p-0 text-pt-ink [&>button:last-child]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-2 px-6 pb-2 pt-6 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pt-sunken text-pt-ink">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <DialogTitle className="text-lg font-semibold tracking-tight text-pt-ink">
            Before you continue
          </DialogTitle>
          <DialogDescription className="text-sm text-pt-muted">It only takes a moment.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 py-3 text-sm leading-relaxed text-pt-ink">
          <p className="rounded-2xl bg-pt-sunken p-4">
            I agree to the{' '}
            <a href={POLICIES.terms.href} target="_blank" rel="noopener noreferrer" className={link}>
              Terms of Service
            </a>{' '}
            and the{' '}
            <a href={POLICIES.privacy.href} target="_blank" rel="noopener noreferrer" className={link}>
              Privacy Policy
            </a>
            .
          </p>
        </div>

        <div className="px-6 pb-6 pt-2">
          <Button type="button" disabled={saving} onClick={() => void agree()} className={`${accentButtonClass} h-11 w-full`}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Agree and continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
