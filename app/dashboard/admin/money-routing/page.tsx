'use client'

/**
 * Admin › Finance › Money routing (full admins only). Rehabify's own bank account as a Paystack
 * sub-account, and the switch that sends Rehabify's share of checkouts to it, so the Paystack
 * balance keeps only what is owed to clinicians (who are paid by transfers from that balance).
 * Backend: convex/paystackRouting.ts; the rules per checkout: convex/helpers/paystackRouting.ts.
 */

import { useEffect, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { toast } from 'sonner'
import { AlertTriangle, Landmark, Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AdminPage,
  ConfirmDialog,
  PageHeader,
  Panel,
  StatusBadge,
  checkboxClass,
  inputClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/admin/ui'
import { errorText } from '@/components/admin/finance/format'
import { formatLagos } from '@/convex/helpers/lagosTime'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Mode = 'test' | 'live'
type Routing = {
  currentMode: Mode
  account: {
    bankName: string
    accountName: string
    last4: string
    paystackMode: Mode
    savedAt: number
    savedByName: string | null
    usable: boolean
  } | null
  routingOn: boolean
  routingActive: boolean
  routingChangedAt: number | null
  routingChangedByName: string | null
  lastSplitProblem: { at: number; source: string; message: string } | null
}
type Bank = { name: string; code: string; slug: string | null }

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const refs = {
  get: makeFunctionReference<'query', Record<string, never>, Routing>('paystackRouting:adminGetRouting'),
  setRouting: makeFunctionReference<'mutation', { on: boolean }, { routingOn: boolean }>('paystackRouting:adminSetRouting'),
  resolve: makeFunctionReference<'action', { bankCode: string; accountNumber: string }, { accountName: string }>(
    'paystackRouting:adminResolveRehabifyAccount'
  ),
  save: makeFunctionReference<'action', { bankCode: string; bankName: string; accountNumber: string }, { accountName: string }>(
    'paystackRouting:adminSaveRehabifyAccount'
  ),
  // The same Paystack bank list the clinic payout form uses
  banks: makeFunctionReference<'action', Record<string, never>, Bank[]>('clinicBilling:listBanks'),
}

const muted = 'text-neutral-500 dark:text-neutral-400'
const strong = 'text-rh-ink dark:text-white'
const when = (ms: number) => formatLagos(ms, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }, 'en-GB')

export default function MoneyRoutingPage() {
  const routing = useQuery(refs.get, {})
  return (
    <AdminPage>
      <PageHeader
        eyebrow="Finance"
        title="Money routing"
        description="Keep clinicians’ money in the Paystack balance that pays their payouts, and send Rehabify’s share to Rehabify’s bank account."
      />
      <HowItWorks />
      {routing === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : (
        <>
          <AccountPanel routing={routing} />
          <SwitchPanel routing={routing} />
        </>
      )}
    </AdminPage>
  )
}

function HowItWorks() {
  return (
    <Panel title="How it works">
      <div className={cn('space-y-3 px-5 pb-5 pt-2 text-sm leading-relaxed', muted)}>
        <p>
          Physio payouts are Paystack transfers from Rehabify’s <strong className={strong}>Paystack balance</strong>. Today patients’ payments
          settle to Rehabify’s bank account, so the balance is usually empty and has to be topped up before each payout run.
        </p>
        <p>With the switch on, each new checkout is split by Paystack:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className={strong}>Rehabify Care bookings</strong> (web and Joy): the physio’s fixed share stays in Paystack for their payout.
            The rest, less Paystack’s fee, goes to Rehabify’s bank account below.
          </li>
          <li>
            <strong className={strong}>Rehabify’s own products</strong> (clinic plans, Individual Pro, Scribe top-ups, Joy months, Learn, Flex): all
            of it, less Paystack’s fee, goes to Rehabify’s bank account. Small card checks that are refunded stay as they are.
          </li>
          <li>
            <strong className={strong}>Clinic and independent-physio invoices</strong>: unchanged. They already pay into the clinic’s or physio’s own
            account, and Rehabify’s fee on them stays in Paystack.
          </li>
        </ul>
        <p className="flex items-start gap-2 rounded-xl bg-rh-peach px-3 py-2 text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Turn the switch on only after Paystack keeps your settlements in the Paystack balance (a setting in the Paystack dashboard, or ask Paystack
            support). Until then the clinicians’ share still settles to the bank, so both shares end up in the same bank account.
          </span>
        </p>
        <div>
          <p className={cn('font-medium', strong)}>Good to know</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Refunds come out of the Paystack balance, even for payments whose Rehabify share went to the bank. Top the balance up after a refund.</li>
            <li>Rehabify’s fee on clinic and independent-physio invoices stays in the Paystack balance. Move it to the bank yourself for now.</li>
            <li>Money paid before the switch went on has already settled to the bank. It doesn’t move.</li>
            <li>Partner commissions are paid from the Paystack balance but come out of Rehabify’s share. Top up before partner payouts.</li>
            <li>If Paystack ever refuses a split, that checkout goes ahead without it (as before) and the reason shows below.</li>
          </ul>
        </div>
      </div>
    </Panel>
  )
}

function AccountPanel({ routing }: { routing: Routing }) {
  const account = routing.account
  const listBanks = useAction(refs.banks)
  const resolve = useAction(refs.resolve)
  const save = useAction(refs.save)
  const [editing, setEditing] = useState(false)
  const [banks, setBanks] = useState<Bank[] | null>(null)
  const [bankError, setBankError] = useState<string | null>(null)
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const [busy, setBusy] = useState<'resolve' | 'save' | null>(null)
  const [confirmSave, setConfirmSave] = useState(false)
  const showForm = editing || account === null

  useEffect(() => {
    if (!showForm || banks !== null || bankError) return
    let cancelled = false
    listBanks({})
      .then((list) => !cancelled && setBanks(list))
      .catch((err) => !cancelled && setBankError(errorText(err, 'Could not load the list of banks')))
    return () => {
      cancelled = true
    }
  }, [showForm, banks, bankError, listBanks])

  // A different bank or number needs its name looked up again
  useEffect(() => setResolvedName(null), [bankCode, accountNumber])

  const reset = () => {
    setEditing(false)
    setBankCode('')
    setAccountNumber('')
    setResolvedName(null)
  }

  const doResolve = async () => {
    setBusy('resolve')
    try {
      const { accountName } = await resolve({ bankCode, accountNumber })
      setResolvedName(accountName)
    } catch (err) {
      toast.error(errorText(err, 'We could not find that account'))
    } finally {
      setBusy(null)
    }
  }

  const doSave = async () => {
    const bank = banks?.find((b) => b.code === bankCode)
    if (!bank) return
    setBusy('save')
    try {
      const { accountName } = await save({ bankCode, bankName: bank.name, accountNumber })
      playSound('approve')
      toast.success('Saved as Rehabify’s account', { description: `${accountName}. The switch is off until you turn it on.` })
      reset()
    } catch (err) {
      playSound('error')
      toast.error('That didn’t work', { description: errorText(err) })
      throw err
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel
      title="Rehabify’s bank account"
      description="Paystack sends Rehabify’s share here when the switch is on."
      actions={
        account ? (
          account.usable ? (
            <StatusBadge tone="green">Ready ({account.paystackMode} keys)</StatusBadge>
          ) : (
            <StatusBadge tone="amber">Save again for {routing.currentMode} keys</StatusBadge>
          )
        ) : (
          <StatusBadge tone="neutral">Not set up</StatusBadge>
        )
      }
    >
      <div className="space-y-4 px-5 pb-5 pt-2">
        {account && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rh-canvas dark:bg-white/[0.06]">
                <Landmark className={cn('h-4 w-4', strong)} />
              </span>
              <div className="min-w-0">
                <p className={cn('truncate text-sm font-medium', strong)}>{account.accountName}</p>
                <p className={cn('truncate text-sm tabular-nums', muted)}>
                  {account.bankName} ••{account.last4} · saved {when(account.savedAt)}
                  {account.savedByName ? ` by ${account.savedByName}` : ''}
                </p>
              </div>
            </div>
            {!editing && (
              <Button size="sm" className={softButtonClass} onClick={() => setEditing(true)}>
                Change account
              </Button>
            )}
          </div>
        )}
        {account && !account.usable && (
          <p className="text-sm text-[#b4690e] dark:text-amber-300">
            This account was saved with Paystack {account.paystackMode} keys, but payments now run on {routing.currentMode} keys, where it doesn’t
            exist. Checkouts won’t use it until you save it again.
          </p>
        )}

        {showForm && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="routing-bank">Bank</Label>
                <Select value={bankCode} onValueChange={setBankCode} disabled={!banks}>
                  <SelectTrigger id="routing-bank" className={cn(inputClass, 'w-full min-w-0')}>
                    <SelectValue placeholder={banks ? 'Choose the bank' : bankError ? 'Banks unavailable' : 'Loading banks…'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 max-w-[calc(100vw-2rem)]">
                    {(banks ?? []).map((bank) => (
                      <SelectItem key={bank.code} value={bank.code}>
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {bankError && (
                  <p className="text-xs text-rose-600 dark:text-rose-300">
                    {bankError}.{' '}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => {
                        setBankError(null)
                        setBanks(null)
                      }}
                    >
                      Try again
                    </button>
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="routing-account">Account number</Label>
                <Input
                  id="routing-account"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10 digits"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  className={inputClass}
                />
              </div>
            </div>
            {resolvedName ? (
              <div className="flex flex-col gap-3 rounded-xl border border-black/[0.06] p-3 dark:border-white/10 sm:flex-row sm:items-center">
                <p className={cn('min-w-0 flex-1 text-sm', strong)}>
                  Account name: <span className="font-semibold">{resolvedName}</span>
                </p>
                <Button size="sm" className={primaryButtonClass} onClick={() => setConfirmSave(true)} disabled={busy !== null}>
                  Save as Rehabify’s account
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className={softButtonClass}
                  onClick={doResolve}
                  disabled={!bankCode || accountNumber.length !== 10 || busy !== null}
                >
                  {busy === 'resolve' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Check account
                </Button>
                {account && (
                  <Button size="sm" variant="ghost" onClick={reset} disabled={busy !== null}>
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title="Save as Rehabify’s account?"
        description={`Paystack will set up ${resolvedName ?? 'this account'} as Rehabify’s revenue account (with the current ${routing.currentMode} keys). The switch stays off until you turn it on${
          account ? ', and the old account stops being used' : ''
        }.`}
        confirmLabel="Save"
        onConfirm={doSave}
      />
    </Panel>
  )
}

function SwitchPanel({ routing }: { routing: Routing }) {
  const setRouting = useMutation(refs.setRouting)
  const [dialog, setDialog] = useState<'on' | 'off' | null>(null)
  const [settlementsConfirmed, setSettlementsConfirmed] = useState(false)
  const canTurnOn = Boolean(routing.account?.usable)

  const apply = async (on: boolean) => {
    try {
      await setRouting({ on })
      playSound(on ? 'approve' : 'reject')
      toast.success(on ? 'Rehabify’s share now goes to its bank account' : 'Money routing is off', {
        description: on ? 'New checkouts are split from now on.' : 'New checkouts are no longer split.',
      })
    } catch (err) {
      toast.error('That didn’t work', { description: errorText(err) })
      throw err
    }
  }

  const status = routing.routingActive
    ? { tone: 'green' as const, label: 'On' }
    : routing.routingOn
      ? { tone: 'amber' as const, label: 'On, but not in use' }
      : { tone: 'neutral' as const, label: 'Off' }

  return (
    <Panel title="Send Rehabify’s share to this bank account" actions={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}>
      <div className="space-y-3 px-5 pb-5 pt-2 text-sm">
        <label className="flex items-center justify-between gap-4">
          <span className={muted}>
            {routing.routingActive
              ? 'New checkouts send Rehabify’s share to the bank account above.'
              : routing.routingOn
                ? 'The switch is on, but the account was saved with the other Paystack keys, so checkouts aren’t split. Save the account again.'
                : canTurnOn
                  ? 'Off: every checkout works as before, and all of it settles the way your Paystack account is set up.'
                  : 'Save Rehabify’s bank account (for the current Paystack keys) before you can turn this on.'}
          </span>
          <Switch
            checked={routing.routingOn}
            disabled={!routing.routingOn && !canTurnOn}
            onCheckedChange={(on) => {
              setSettlementsConfirmed(false)
              setDialog(on ? 'on' : 'off')
            }}
            aria-label="Send Rehabify’s share to this bank account"
          />
        </label>
        {routing.routingChangedAt && (
          <p className={cn('text-xs', muted)}>
            Last changed {when(routing.routingChangedAt)}
            {routing.routingChangedByName ? ` by ${routing.routingChangedByName}` : ''}.
          </p>
        )}
        {routing.lastSplitProblem && (
          <p className="rounded-xl bg-rh-blush px-3 py-2 text-sm text-[#be123c] dark:bg-rose-400/10 dark:text-rose-300">
            {when(routing.lastSplitProblem.at)}: Paystack refused a split checkout ({routing.lastSplitProblem.source.replace(/_/g, ' ')}):
            “{routing.lastSplitProblem.message}”. That checkout went ahead without the split, so its money stayed in the Paystack account.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={dialog === 'on'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Send Rehabify’s share to its bank account?"
        description="From now on, new checkouts are split: clinicians’ shares stay in Paystack for payouts, Rehabify’s share goes to the bank account above. Checkout pages opened before now are unchanged."
        confirmLabel="Turn on"
        confirmDisabled={!settlementsConfirmed}
        onConfirm={() => apply(true)}
      >
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className={cn(checkboxClass, 'mt-0.5')}
            checked={settlementsConfirmed}
            onChange={(e) => setSettlementsConfirmed(e.target.checked)}
          />
          <span className={strong}>Paystack now keeps our settlements in the Paystack balance (not paid out to the bank).</span>
        </label>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'off'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Turn money routing off?"
        description="New checkouts won’t be split any more: all of each payment settles to Rehabify’s main Paystack account, as before."
        confirmLabel="Turn off"
        destructive
        onConfirm={() => apply(false)}
      />
    </Panel>
  )
}
