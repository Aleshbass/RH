'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { Building2, ExternalLink, FileSignature, Loader2, Search, Send, ShieldCheck, Stethoscope } from '@/components/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  inputClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/admin/ui'
import {
  AgreementPaper,
  DownloadCopyButton,
  ExecutionBlock,
  StateChip,
  useFingerprintCheck,
  type AgreementState,
} from '@/components/agreements/AgreementCenter'
import { formatSigned, type SignedAgreement } from '@/components/agreements/agreementPdf'
import { AGREEMENTS, filledAgreement, type AgreementId } from '@/lib/agreements'
import { CLINIC_PLANS } from '@/lib/clinicPlans'

type Row = {
  key: string
  agreementId: AgreementId
  party: 'physiotherapist' | 'clinic'
  userId: string | null
  clinicId: string | null
  name: string
  reference: string | null
  email: string | null
  detail: string | null
  state: AgreementState | 'void'
  signatureId: string | null
  signedAt: number | null
  version: string | null
  lastRemindedAt: number | null
}

type Overview = {
  rows: Row[]
  stats: { total: number; active: number; awaitingCountersign: number; notSigned: number; outdated: number }
  enforcedAt: number | null
  signatories: { name: string; title: string }[]
}

type SignatureDetail = SignedAgreement & {
  userAgent: string | null
  voidReason: string | null
  voidedAt: number | null
  signerAccount: { id: string; name: string; email: string | null; reference: string | null } | null
  countersignedByAccount: string | null
  history: { id: string; version: string; status: string; signedAt: number }[]
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const overviewRef = makeFunctionReference<'query', Record<string, never>, Overview>('agreements:adminAgreementsOverview')
const signatureRef = makeFunctionReference<'query', { signatureId: string }, SignatureDetail | null>('agreements:adminAgreementSignature')
const countersignRef = makeFunctionReference<'mutation', { signatureId: string; signatory: number }, { success: boolean }>(
  'agreements:adminCountersignAgreement'
)
const voidRef = makeFunctionReference<'mutation', { signatureId: string; reason: string }, { success: boolean }>(
  'agreements:adminVoidAgreementSignature'
)
const remindRef = makeFunctionReference<'mutation', { userId: string; agreementId: string; clinicId?: string }, { success: boolean }>(
  'agreements:adminSendAgreementRequest'
)
const enforceRef = makeFunctionReference<'mutation', { enforcedAt?: number }, { success: boolean }>('agreements:adminSetAgreementsEnforcement')

const errorText = (error: unknown) =>
  error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Something went wrong. Please try again.'

type StateFilter = 'action' | 'awaiting_countersign' | 'not_signed' | 'active' | 'all'
type KindFilter = 'all' | AgreementId

const ago = (timestamp: number) => {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}
const shortDate = (timestamp: number) => new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const dateInput = (timestamp: number | null) => (timestamp ? new Date(timestamp).toISOString().slice(0, 10) : '')

export default function AdminAgreementsPage() {
  const data = useQuery(overviewRef, {})
  const remind = useMutation(remindRef)
  const countersign = useMutation(countersignRef)
  const [kind, setKind] = useState<KindFilter>('all')
  const [state, setState] = useState<StateFilter>('action')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [bulk, setBulk] = useState<null | 'countersign' | 'remind'>(null)
  const [signatory, setSignatory] = useState(0)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const rows = useMemo(() => data?.rows ?? [], [data])
  const ofKind = useMemo(() => rows.filter((row) => kind === 'all' || row.agreementId === kind), [rows, kind])
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return ofKind
      .filter((row) => {
        if (state === 'action') return row.state !== 'active'
        if (state === 'not_signed') return row.state === 'not_signed' || row.state === 'outdated'
        if (state !== 'all') return row.state === state
        return true
      })
      .filter(
        (row) =>
          !term ||
          row.name.toLowerCase().includes(term) ||
          (row.email ?? '').toLowerCase().includes(term) ||
          (row.reference ?? '').toLowerCase().includes(term)
      )
      // Waiting for us first, then never signed, then the rest; newest signatures first
      .sort((a, b) => order(a.state) - order(b.state) || (b.signedAt ?? 0) - (a.signedAt ?? 0) || a.name.localeCompare(b.name))
  }, [ofKind, state, search])

  const awaiting = ofKind.filter((row) => row.state === 'awaiting_countersign')
  const unsigned = ofKind.filter((row) => (row.state === 'not_signed' || row.state === 'outdated') && row.userId)
  const remindable = unsigned.filter((row) => !row.lastRemindedAt || Date.now() - row.lastRemindedAt > 20 * 3_600_000)

  const sendReminder = async (row: Row) => {
    if (!row.userId) return
    setBusyKey(row.key)
    try {
      await remind({ userId: row.userId, agreementId: row.agreementId, clinicId: row.clinicId ?? undefined })
      toast.success(`Sent ${row.name} a link to sign`)
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusyKey(null)
    }
  }

  const count = (s: StateFilter) =>
    s === 'all'
      ? ofKind.length
      : s === 'action'
        ? ofKind.filter((row) => row.state !== 'active').length
        : s === 'not_signed'
          ? ofKind.filter((row) => row.state === 'not_signed' || row.state === 'outdated').length
          : ofKind.filter((row) => row.state === s).length

  return (
    <AdminPage>
      <PageHeader
        title="Agreements"
        description="Who has signed what. Physios and clinic owners sign in their dashboard; you countersign and send reminders here."
        actions={
          <>
            {awaiting.length > 0 && (
              <button type="button" onClick={() => setBulk('countersign')} className={`${primaryButtonClass} h-10 px-4 text-sm font-semibold`}>
                Countersign {awaiting.length}
              </button>
            )}
            {remindable.length > 0 && (
              <button type="button" onClick={() => setBulk('remind')} className={`${softButtonClass} inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold`}>
                <Send className="h-3.5 w-3.5" />
                Remind {remindable.length}
              </button>
            )}
          </>
        }
      />

      {data === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Signed" value={data.stats.active} hint={`of ${data.stats.total} who should sign`} />
            <StatTile
              label="Waiting for you"
              value={data.stats.awaitingCountersign}
              hint="Signed, needs Rehabify’s countersignature"
              tone={data.stats.awaitingCountersign > 0 ? 'attention' : 'default'}
            />
            <StatTile label="Not signed yet" value={data.stats.notSigned} />
            <StatTile label="New version to sign" value={data.stats.outdated} hint="Signed an older version" />
          </div>

          <EnforcementPanel enforcedAt={data.enforcedAt} unsignedPhysios={data.rows.filter((r) => r.party === 'physiotherapist' && (r.state === 'not_signed' || r.state === 'outdated')).length} />

          <Panel
            title="Everyone who should sign"
            actions={
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or ID" className={`${inputClass} pl-9`} />
              </div>
            }
          >
            <div className="space-y-2 px-5 pb-3 pt-2">
              <FilterChips
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'all', label: 'All agreements' },
                  { value: 'network_contractor', label: 'Network contractor' },
                  { value: 'independent_platform', label: 'Independent' },
                  { value: 'clinic_master_saas', label: 'Clinics' },
                ]}
              />
              <FilterChips
                value={state}
                onChange={setState}
                options={[
                  { value: 'action', label: 'Needs action', count: count('action') },
                  { value: 'awaiting_countersign', label: 'Waiting for you', count: count('awaiting_countersign') },
                  { value: 'not_signed', label: 'Not signed', count: count('not_signed') },
                  { value: 'active', label: 'Signed', count: count('active') },
                  { value: 'all', label: 'All', count: count('all') },
                ]}
              />
            </div>
            {visible.length === 0 ? (
              <EmptyState icon={<FileSignature />} title={state === 'action' ? 'Nothing needs you' : 'No one here'} description={state === 'action' ? 'Everyone has signed and been countersigned.' : undefined} />
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {visible.map((row) => (
                  <li key={row.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                    <button
                      type="button"
                      disabled={!row.signatureId}
                      onClick={() => row.signatureId && setOpenId(row.signatureId)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-canvas text-rh-ink dark:bg-white/[0.06] dark:text-white">
                        {row.party === 'clinic' ? <Building2 className="h-4 w-4" /> : <Stethoscope className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className="truncate text-sm font-semibold text-rh-ink dark:text-white">{row.name}</span>
                          {row.reference && <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{row.reference}</span>}
                        </span>
                        <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {AGREEMENTS[row.agreementId].shortTitle}
                          {row.detail ? ` · ${row.detail}` : ''}
                          {row.email ? ` · ${row.email}` : ''}
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {row.signedAt
                          ? `Signed ${shortDate(row.signedAt)}${row.state === 'outdated' ? ` (v${row.version})` : ''}`
                          : row.lastRemindedAt
                            ? `Reminded ${ago(row.lastRemindedAt)}`
                            : ''}
                      </span>
                      <StateChip state={row.state} />
                      {row.state === 'awaiting_countersign' && row.signatureId && (
                        <button
                          type="button"
                          disabled={busyKey === row.key}
                          onClick={async () => {
                            setBusyKey(row.key)
                            try {
                              await countersign({ signatureId: row.signatureId!, signatory })
                              toast.success(`Countersigned for ${row.name}`)
                            } catch (error) {
                              toast.error(errorText(error))
                            } finally {
                              setBusyKey(null)
                            }
                          }}
                          className={`${primaryButtonClass} inline-flex h-8 items-center gap-1.5 px-3 text-xs font-semibold`}
                        >
                          {busyKey === row.key && <Loader2 className="h-3 w-3 animate-spin" />}
                          Countersign
                        </button>
                      )}
                      {(row.state === 'not_signed' || row.state === 'outdated') && row.userId && (
                        <button
                          type="button"
                          disabled={busyKey === row.key}
                          onClick={() => sendReminder(row)}
                          className={`${softButtonClass} inline-flex h-8 items-center gap-1.5 px-3 text-xs font-semibold`}
                        >
                          {busyKey === row.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          Remind
                        </button>
                      )}
                      {row.signatureId && (
                        <button type="button" onClick={() => setOpenId(row.signatureId)} className="h-8 rounded-xl px-3 text-xs font-semibold text-rh-ink hover:bg-rh-canvas dark:text-white dark:hover:bg-white/[0.06]">
                          View
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Countersigning as{' '}
            <select value={signatory} onChange={(e) => setSignatory(Number(e.target.value))} className="rounded-lg bg-transparent font-semibold text-rh-ink underline underline-offset-4 dark:text-white">
              {data.signatories.map((person, i) => (
                <option key={person.name} value={i}>
                  {person.name}, {person.title}
                </option>
              ))}
            </select>
            . Only countersign as yourself or with their authority. Read-only copies:{' '}
            {Object.values(AGREEMENTS).map((spec, i) => (
              <span key={spec.id}>
                {i > 0 && ' · '}
                <Link href={spec.href} target="_blank" className="underline underline-offset-4 hover:text-rh-ink dark:hover:text-white">
                  {spec.shortTitle}
                </Link>
              </span>
            ))}
          </p>

          <ConfirmDialog
            open={bulk === 'countersign'}
            onOpenChange={(open) => !open && setBulk(null)}
            title={`Countersign ${awaiting.length} agreement${awaiting.length === 1 ? '' : 's'}?`}
            description={`You’ll sign for Rehabify as ${data.signatories[signatory]?.name}, ${data.signatories[signatory]?.title}. Each signer gets an email that their agreement is fully signed.`}
            confirmLabel="Countersign all"
            onConfirm={async () => {
              let done = 0
              for (const row of awaiting) {
                if (!row.signatureId) continue
                try {
                  await countersign({ signatureId: row.signatureId, signatory })
                  done++
                } catch (error) {
                  toast.error(`${row.name}: ${errorText(error)}`)
                }
              }
              toast.success(`Countersigned ${done}`)
            }}
          />
          <ConfirmDialog
            open={bulk === 'remind'}
            onOpenChange={(open) => !open && setBulk(null)}
            title={`Email ${remindable.length} ${remindable.length === 1 ? 'person' : 'people'} a link to sign?`}
            description="Anyone reminded in the last day is skipped."
            confirmLabel="Send reminders"
            onConfirm={async () => {
              let sent = 0
              for (const row of remindable) {
                if (!row.userId) continue
                try {
                  await remind({ userId: row.userId, agreementId: row.agreementId, clinicId: row.clinicId ?? undefined })
                  sent++
                } catch {
                  // Already reminded or no email: skip
                }
              }
              toast.success(`Sent ${sent} reminder${sent === 1 ? '' : 's'}`)
            }}
          />
        </>
      )}

      <SignatureSheet signatureId={openId} onClose={() => setOpenId(null)} signatory={signatory} signatories={data?.signatories ?? []} />
    </AdminPage>
  )
}

const order = (state: Row['state']) =>
  ({ awaiting_countersign: 0, outdated: 1, not_signed: 2, active: 3, void: 4 })[state]

function EnforcementPanel({ enforcedAt, unsignedPhysios }: { enforcedAt: number | null; unsignedPhysios: number }) {
  const save = useMutation(enforceRef)
  const [date, setDate] = useState(dateInput(enforcedAt))
  const [busy, setBusy] = useState(false)
  const passed = enforcedAt !== null && enforcedAt <= Date.now()

  const submit = async (value: string) => {
    setBusy(true)
    try {
      // Midnight Lagos time (UTC+1) on the chosen day
      await save({ enforcedAt: value ? new Date(`${value}T00:00:00+01:00`).getTime() : undefined })
      toast.success(value ? 'Signing deadline saved' : 'Deadline removed')
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Signing deadline for physios"
      description={
        enforcedAt
          ? passed
            ? `In force since ${shortDate(enforcedAt)}: physios who haven’t signed can’t be booked by Rehabify patients.`
            : `From ${shortDate(enforcedAt)}, physios who haven’t signed can’t be booked by Rehabify patients.`
          : 'Off. Unsigned physios see a reminder in their setup checklist but can still be booked.'
      }
    >
      <div className="flex flex-col gap-3 px-5 pb-5 pt-3 sm:flex-row sm:items-center">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} sm:w-48`} aria-label="Deadline" />
        <button type="button" disabled={busy || date === dateInput(enforcedAt)} onClick={() => submit(date)} className={`${primaryButtonClass} h-10 px-4 text-sm font-semibold disabled:opacity-50`}>
          Save deadline
        </button>
        {enforcedAt && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDate('')
              void submit('')
            }}
            className={`${softButtonClass} h-10 px-4 text-sm font-semibold`}
          >
            Remove
          </button>
        )}
        <p className="text-sm text-neutral-500 dark:text-neutral-400 sm:ml-auto">
          {unsignedPhysios === 0 ? 'Every approved physio has signed.' : `${unsignedPhysios} physio agreement${unsignedPhysios === 1 ? '' : 's'} not signed yet.`}
        </p>
      </div>
    </Panel>
  )
}

function SignatureSheet({
  signatureId,
  onClose,
  signatory,
  signatories,
}: {
  signatureId: string | null
  onClose: () => void
  signatory: number
  signatories: { name: string; title: string }[]
}) {
  const detail = useQuery(signatureRef, signatureId ? { signatureId } : 'skip')
  const countersign = useMutation(countersignRef)
  const voidSignature = useMutation(voidRef)
  const [showText, setShowText] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const verified = useFingerprintCheck(detail ?? null)
  const spec = detail ? AGREEMENTS[detail.agreementId] : null

  const fields = detail && spec ? spec.fields.map((field) => [field.label, displayValue(field.key, detail.values[field.key])] as const) : []

  return (
    <Sheet
      open={signatureId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          setShowText(false)
        }
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto bg-white p-0 sm:max-w-2xl dark:bg-rh-ink-2">
        {!detail || !spec ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <div className="space-y-6 p-6">
            <SheetHeader className="p-0">
              <SheetTitle className="pr-8 text-xl text-rh-ink dark:text-white">{detail.values.clinicLegalName ?? detail.signatureName}</SheetTitle>
              <SheetDescription>
                {spec.title} · version {detail.version}
              </SheetDescription>
              <div className="pt-1">
                <StateChip state={detail.status === 'void' ? 'void' : detail.version !== spec.version ? 'outdated' : detail.status} />
              </div>
            </SheetHeader>

            <div className="flex flex-wrap gap-2">
              {detail.status === 'awaiting_countersign' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await countersign({ signatureId: detail.id, signatory })
                      toast.success('Countersigned')
                    } catch (error) {
                      toast.error(errorText(error))
                    } finally {
                      setBusy(false)
                    }
                  }}
                  className={`${primaryButtonClass} inline-flex h-11 items-center gap-2 px-5 text-sm font-semibold`}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Countersign as {signatories[signatory]?.name}
                </button>
              )}
              {detail.status !== 'void' && <DownloadCopyButton signature={detail} className="rounded-xl" />}
              <button type="button" onClick={() => setShowText((value) => !value)} className={`${softButtonClass} h-11 px-4 text-sm font-semibold`}>
                {showText ? 'Hide agreement' : 'Read agreement'}
              </button>
            </div>

            <section>
              <h3 className="text-sm font-semibold text-rh-ink dark:text-white">Details as signed</h3>
              <dl className="mt-2 divide-y divide-black/[0.05] rounded-2xl ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:ring-white/10">
                {fields.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-2.5 text-sm">
                    <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
                    <dd className="min-w-0 break-words text-rh-ink dark:text-white">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-rh-ink dark:text-white">Signing record</h3>
              <dl className="mt-2 divide-y divide-black/[0.05] rounded-2xl ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:ring-white/10">
                {[
                  ['Signed', `${formatSigned(detail.signedAt)} by ${detail.signatureName}`],
                  ['Account', detail.signerAccount ? `${detail.signerAccount.name || detail.signerAccount.email} (${detail.signerEmail})` : detail.signerEmail],
                  ['Method', detail.signatureDrawing ? 'Drawn and typed signature, “I agree” ticked' : 'Typed full name, “I agree” ticked'],
                  [
                    'Rehabify',
                    detail.countersignedAt
                      ? `${detail.countersignName}, ${detail.countersignTitle} · ${formatSigned(detail.countersignedAt)}${detail.countersignedByAccount ? ` (clicked by ${detail.countersignedByAccount})` : ''}`
                      : spec.countersign
                        ? 'Not countersigned yet'
                        : 'Not required',
                  ],
                  ['Device', detail.userAgent ?? '—'],
                  ['Record ID', detail.id],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-2.5 text-sm">
                    <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
                    <dd className="min-w-0 break-words text-rh-ink dark:text-white">{value}</dd>
                  </div>
                ))}
                <div className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-2.5 text-sm">
                  <dt className="text-neutral-500 dark:text-neutral-400">Fingerprint</dt>
                  <dd className="min-w-0">
                    <span className="block break-all font-mono text-xs text-rh-ink dark:text-white">{detail.documentHash}</span>
                    <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {verified === null ? 'Checking…' : verified ? (<><ShieldCheck className="h-3.5 w-3.5" /> Matches the signed text</>) : 'Doesn’t match the current text of this version'}
                    </span>
                  </dd>
                </div>
              </dl>
            </section>

            {detail.status === 'void' && (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
                Voided {detail.voidedAt ? shortDate(detail.voidedAt) : ''}: {detail.voidReason}
              </p>
            )}

            {detail.history.length > 1 && (
              <section>
                <h3 className="text-sm font-semibold text-rh-ink dark:text-white">All signatures of this agreement</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {detail.history.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 odd:bg-rh-canvas dark:odd:bg-white/[0.03]">
                      <span className="text-rh-ink dark:text-white">
                        v{item.version} · {shortDate(item.signedAt)}
                      </span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">{item.status.replace(/_/g, ' ')}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {showText && (
              <AgreementPaper doc={filledAgreement(detail.agreementId, detail.values, detail.signedAt)}>
                <ExecutionBlock signature={detail} />
              </AgreementPaper>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-black/[0.06] pt-4 text-sm dark:border-white/10">
              {detail.signerAccount && (
                <Link href={`/dashboard/admin/users/${detail.signerAccount.id}`} className="inline-flex items-center gap-1.5 font-medium text-rh-ink underline-offset-4 hover:underline dark:text-white">
                  Open account <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
              {detail.status !== 'void' && (
                <button type="button" onClick={() => setVoiding(true)} className="ml-auto text-sm font-medium text-rose-700 hover:underline dark:text-rose-300">
                  Void signature
                </button>
              )}
            </div>
            <ConfirmDialog
              open={voiding}
              onOpenChange={setVoiding}
              title="Void this signature?"
              description="Use this only if it was signed in error, for example with wrong details. They’ll be asked to sign again. The record stays in the history."
              confirmLabel="Void signature"
              destructive
              onConfirm={async () => {
                try {
                  await voidSignature({ signatureId: detail.id, reason })
                  toast.success('Signature voided')
                  setReason('')
                } catch (error) {
                  toast.error(errorText(error))
                  throw error
                }
              }}
            >
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (kept with the record)" className={inputClass} />
            </ConfirmDialog>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

const ENTITY_LABEL: Record<string, string> = { company: 'Company limited by shares', business_name: 'Business name', partnership: 'Partnership' }

function displayValue(key: string, value: string | undefined): string {
  if (!value) return ''
  if (key === 'plan') return CLINIC_PLANS.find((plan) => plan.id === value)?.name ?? value
  if (key === 'entityType') return ENTITY_LABEL[value] ?? value
  return value
}
