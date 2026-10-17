'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ChevronDown, FileSignature, Handshake, Loader2, Pencil, Plus, Search, Trash2, XCircle } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  Stagger,
  StaggerItem,
  inputClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/admin/ui'
import { errorText, formatKobo, personInitials } from '@/components/admin/finance/format'

const termsApi = api.commercialTerms

type ModelType = 'fixed_per_patient' | 'percentage_revenue_share' | 'tiered_volume' | 'hybrid'
type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated'

type Tier = {
  tierName: string
  minReferrals: number
  maxReferrals?: number
  feePerReferral?: number // kobo
  revenueSharePercent?: number
  bonusAmount?: number // kobo
}

/** One contract from commercialTerms.adminListPartnerContracts. Money fields are in kobo. */
type Contract = {
  _id: Id<'partnerContracts'>
  partnerId: string
  partnerName: string
  partnerType: string | null
  partnerActive: boolean
  contractNumber: string
  status: ContractStatus
  effectiveFrom: number
  effectiveTo?: number
  paymentTermsDays: number
  payoutCurrency: string
  modelType: ModelType
  baseFeePerBooking?: number
  revenueSharePercent?: number
  activationBonusPerPatient?: number
  vatApplicable: boolean
  withholdingTaxPercent?: number
  notes?: string
  createdAt: number
  updatedAt: number
  tiers: (Tier & { _id: string })[]
}

type PartnerOption = {
  code: string
  name: string
  type: string
  approvalStatus: string
  productionStatus: string
  isActive: boolean
}

type PartnerGroup = {
  code: string
  name: string
  type: string | null
  approvalStatus: string | null
  isActive: boolean
  active: Contract | null
  contracts: Contract[]
}

type Filter = 'all' | 'contract' | 'default'

const MODEL_META: Record<ModelType, { label: string; help: string }> = {
  percentage_revenue_share: {
    label: 'Revenue share',
    help: 'A percentage of every paid session from patients they refer.',
  },
  fixed_per_patient: {
    label: 'Fixed fee per new patient',
    help: 'A flat fee for each referred patient’s first paid session.',
  },
  hybrid: {
    label: 'Revenue share + fixed fee',
    help: 'A percentage of every paid session, plus a flat fee for each new patient.',
  },
  tiered_volume: {
    label: 'Volume tiers',
    help: 'The share (and optional new-patient fee) depends on how many paid patients they’ve referred.',
  },
}

const STATUS_TONE: Record<ContractStatus, 'neutral' | 'teal' | 'green' | 'amber' | 'red'> = {
  active: 'green',
  draft: 'neutral',
  expired: 'amber',
  terminated: 'red',
}

const usesShare = (m: ModelType) => m === 'percentage_revenue_share' || m === 'hybrid' || m === 'tiered_volume'
const usesBaseFee = (m: ModelType) => m === 'fixed_per_patient' || m === 'hybrid'

function termsSummary(c: Contract) {
  const parts: string[] = []
  if (c.modelType === 'tiered_volume') {
    parts.push(`${c.tiers.length} ${c.tiers.length === 1 ? 'tier' : 'tiers'}`)
  } else {
    if (usesShare(c.modelType) && c.revenueSharePercent !== undefined) parts.push(`${c.revenueSharePercent}% of each session`)
    if (usesBaseFee(c.modelType) && c.baseFeePerBooking !== undefined) parts.push(`${formatKobo(c.baseFeePerBooking)} per new patient`)
  }
  if (c.activationBonusPerPatient) parts.push(`${formatKobo(c.activationBonusPerPatient)} activation bonus`)
  return parts.join(' · ') || MODEL_META[c.modelType].label
}

// ── Form state ───────────────────────────────────────────────────────────────

type TierDraft = { key: number; tierName: string; minReferrals: string; maxReferrals: string; share: string; fee: string; bonus: string }
type FormState = {
  partnerId: string
  contractNumber: string
  modelType: ModelType
  revenueSharePercent: string
  baseFee: string
  activationBonus: string
  paymentTermsDays: string
  payoutCurrency: string
  vatApplicable: boolean
  withholdingTaxPercent: string
  notes: string
  tiers: TierDraft[]
}

let tierKey = 0
const nairaText = (kobo?: number) => (kobo === undefined || kobo === null ? '' : String(kobo / 100))
const blankTier = (): TierDraft => ({ key: ++tierKey, tierName: '', minReferrals: '', maxReferrals: '', share: '', fee: '', bonus: '' })

function formFrom(contract: Contract | null, partnerId: string, contractNumber: string, defaultShare: number): FormState {
  if (!contract) {
    return {
      partnerId,
      contractNumber,
      modelType: 'percentage_revenue_share',
      revenueSharePercent: String(defaultShare),
      baseFee: '',
      activationBonus: '',
      paymentTermsDays: '30',
      payoutCurrency: 'NGN',
      vatApplicable: false,
      withholdingTaxPercent: '0',
      notes: '',
      tiers: [blankTier()],
    }
  }
  return {
    partnerId: contract.partnerId,
    contractNumber: contract.contractNumber,
    modelType: contract.modelType,
    revenueSharePercent: contract.revenueSharePercent === undefined ? '' : String(contract.revenueSharePercent),
    baseFee: nairaText(contract.baseFeePerBooking),
    activationBonus: nairaText(contract.activationBonusPerPatient),
    paymentTermsDays: String(contract.paymentTermsDays),
    payoutCurrency: contract.payoutCurrency,
    vatApplicable: contract.vatApplicable,
    withholdingTaxPercent: String(contract.withholdingTaxPercent ?? 0),
    notes: contract.notes ?? '',
    tiers: contract.tiers.length
      ? contract.tiers.map((t) => ({
          key: ++tierKey,
          tierName: t.tierName,
          minReferrals: String(t.minReferrals),
          maxReferrals: t.maxReferrals === undefined ? '' : String(t.maxReferrals),
          share: t.revenueSharePercent === undefined ? '' : String(t.revenueSharePercent),
          fee: nairaText(t.feePerReferral),
          bonus: nairaText(t.bonusAmount),
        }))
      : [blankTier()],
  }
}

/** Parses the form into upsertPartnerContract args, or returns an error message. */
function toArgs(f: FormState): { args: Record<string, unknown> } | { error: string } {
  const optNumber = (text: string) => (text.trim() === '' ? undefined : Number(text))
  const pct = (text: string, label: string, required = false) => {
    const n = optNumber(text)
    if (n === undefined) return required ? `${label} is required.` : undefined
    if (!Number.isFinite(n) || n < 0 || n > 50) return `${label} must be between 0 and 50%.`
    return n
  }
  const kobo = (text: string, label: string, required = false) => {
    const n = optNumber(text)
    if (n === undefined) return required ? `${label} is required.` : undefined
    if (!Number.isFinite(n) || n < 0) return `${label} must be ₦0 or more.`
    return Math.round(n * 100)
  }

  if (!f.partnerId) return { error: 'Choose a partner.' }
  const contractNumber = f.contractNumber.trim()
  if (!contractNumber) return { error: 'Add a contract number.' }

  const share = usesShare(f.modelType) ? pct(f.revenueSharePercent, 'Revenue share', f.modelType !== 'tiered_volume') : undefined
  if (typeof share === 'string') return { error: share }
  const baseFee = usesBaseFee(f.modelType) ? kobo(f.baseFee, 'Fee per new patient', true) : undefined
  if (typeof baseFee === 'string') return { error: baseFee }
  const bonus = kobo(f.activationBonus, 'Activation bonus')
  if (typeof bonus === 'string') return { error: bonus }
  const wht = pct(f.withholdingTaxPercent, 'Withholding tax') ?? 0
  if (typeof wht === 'string') return { error: wht }
  const days = Number(f.paymentTermsDays)
  if (!Number.isInteger(days) || days < 0 || days > 365) return { error: 'Payment terms must be a whole number of days (0–365).' }
  const currency = f.payoutCurrency.trim().toUpperCase() || 'NGN'
  if (!/^[A-Z]{3}$/.test(currency)) return { error: 'Use a 3-letter currency code, e.g. NGN.' }

  let tiers: Tier[] | undefined
  if (f.modelType === 'tiered_volume') {
    tiers = []
    for (const [i, t] of f.tiers.entries()) {
      const label = t.tierName.trim() || `Tier ${i + 1}`
      if (!t.tierName.trim()) return { error: `Name tier ${i + 1}.` }
      const min = Number(t.minReferrals)
      if (t.minReferrals.trim() === '' || !Number.isInteger(min) || min < 0) return { error: `${label}: “from” must be a whole number.` }
      const max = optNumber(t.maxReferrals)
      if (max !== undefined && (!Number.isInteger(max) || max < min)) return { error: `${label}: “to” must be a whole number at least ${min}.` }
      const tierShare = pct(t.share, `${label} share`)
      if (typeof tierShare === 'string') return { error: tierShare }
      const fee = kobo(t.fee, `${label} fee`)
      if (typeof fee === 'string') return { error: fee }
      const tierBonus = kobo(t.bonus, `${label} bonus`)
      if (typeof tierBonus === 'string') return { error: tierBonus }
      tiers.push({ tierName: t.tierName.trim(), minReferrals: min, maxReferrals: max, revenueSharePercent: tierShare, feePerReferral: fee, bonusAmount: tierBonus })
    }
    if (tiers.length === 0) return { error: 'Add at least one tier.' }
    tiers.sort((a, b) => a.minReferrals - b.minReferrals)
  }

  return {
    args: {
      partnerId: f.partnerId,
      contractNumber,
      paymentTermsDays: days,
      payoutCurrency: currency,
      modelType: f.modelType,
      baseFeePerBooking: baseFee,
      revenueSharePercent: share,
      activationBonusPerPatient: bonus,
      vatApplicable: f.vatApplicable,
      withholdingTaxPercent: wht,
      notes: f.notes.trim() || undefined,
      tiers,
    },
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPartnerContractsPage() {
  const partners = useQuery(api.partners.adminListPartners, {}) as unknown as PartnerOption[] | undefined
  const data = useQueryUntyped(termsApi.adminListPartnerContracts, {}) as
    | { contracts: Contract[]; defaultPartnerPercent: number }
    | undefined

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [editing, setEditing] = useState<Contract | null>(null)
  const [ending, setEnding] = useState<{ contract: Contract; partnerName: string } | null>(null)
  const [endReason, setEndReason] = useState('')
  const terminate = useMutation(termsApi.terminatePartnerContract)

  const defaultShare = data?.defaultPartnerPercent ?? 10

  const endContract = async () => {
    if (!ending) return
    try {
      await terminate({ contractId: ending.contract._id, reason: endReason })
      playSound('reject')
      toast.success(`${ending.contract.contractNumber} ended. ${ending.partnerName} now earns the platform default.`)
      setEndReason('')
    } catch (err) {
      toast.error(errorText(err))
      throw err
    }
  }

  const groups = useMemo<PartnerGroup[]>(() => {
    if (!partners || !data) return []
    const byPartner = new Map<string, Contract[]>()
    for (const c of data.contracts) byPartner.set(c.partnerId, [...(byPartner.get(c.partnerId) ?? []), c])
    const now = Date.now()
    const activeOf = (list: Contract[]) =>
      list
        .filter((c) => c.status === 'active' && c.effectiveFrom <= now && (!c.effectiveTo || c.effectiveTo > now))
        .sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0] ?? null
    const result: PartnerGroup[] = partners.map((p) => {
      const list = byPartner.get(p.code) ?? []
      byPartner.delete(p.code)
      return { code: p.code, name: p.name, type: p.type, approvalStatus: p.approvalStatus, isActive: p.isActive, active: activeOf(list), contracts: list }
    })
    // Contracts whose partner is no longer listed
    for (const [code, list] of byPartner) {
      result.push({ code, name: list[0]?.partnerName ?? code, type: list[0]?.partnerType ?? null, approvalStatus: null, isActive: false, active: activeOf(list), contracts: list })
    }
    return result.sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || a.name.localeCompare(b.name))
  }, [partners, data])

  const counts = useMemo(
    () => ({ all: groups.length, contract: groups.filter((g) => g.active).length, default: groups.filter((g) => !g.active).length }),
    [groups]
  )

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return groups.filter((g) => {
      if (filter === 'contract' && !g.active) return false
      if (filter === 'default' && g.active) return false
      if (!term) return true
      return [g.name, g.code, ...g.contracts.map((c) => c.contractNumber)].some((v) => v.toLowerCase().includes(term))
    })
  }, [groups, filter, search])

  const nextContractNumber = () => {
    const year = new Date().getFullYear()
    const taken = new Set((data?.contracts ?? []).map((c) => c.contractNumber))
    let n = (data?.contracts.length ?? 0) + 1
    while (taken.has(`CTR-${year}-${String(n).padStart(3, '0')}`)) n++
    return `CTR-${year}-${String(n).padStart(3, '0')}`
  }

  const openEditor = (group: PartnerGroup | null) => {
    const active = group?.active ?? null
    setEditing(active)
    setForm(formFrom(active, group?.code ?? '', active ? active.contractNumber : nextContractNumber(), defaultShare))
  }

  const loading = partners === undefined || data === undefined

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Partners"
        title="Contracts"
        description={`Commercial terms for each referral partner. Commissions use the active contract at the time a patient pays. Partners without one earn the platform default of ${defaultShare}%.`}
        actions={
          <Button className={primaryButtonClass} onClick={() => openEditor(null)} disabled={loading}>
            <Plus className="mr-2 h-4 w-4" />
            New contract
          </Button>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StaggerItem>
          <StatTile label="Partners" value={loading ? '–' : counts.all} icon={Handshake} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="On a contract" value={loading ? '–' : counts.contract} hint="active terms in force" icon={FileSignature} tone="mint" />
        </StaggerItem>
        <StaggerItem className="col-span-2 lg:col-span-1">
          <StatTile label="On platform default" value={loading ? '–' : counts.default} hint={`${defaultShare}% revenue share`} tone="peach" />
        </StaggerItem>
      </Stagger>

      <Panel>
        <div className="flex flex-col gap-3 border-b border-black/[0.05] p-4 dark:border-white/[0.06] sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All partners', count: loading ? undefined : counts.all },
              { value: 'contract', label: 'On a contract', count: loading ? undefined : counts.contract },
              { value: 'default', label: 'Platform default', count: loading ? undefined : counts.default },
            ]}
          />
          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search partner or contract number"
              aria-label="Search partners"
              className={cn(inputClass, 'pl-9')}
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-4 sm:px-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<FileSignature />}
            title={groups.length === 0 ? 'No partners yet' : 'No partners match'}
            description={groups.length === 0 ? 'Create a partner organisation first, then set its commercial terms here.' : 'Try a different filter or search.'}
          />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {visible.map((g) => {
              const open = expanded === g.code
              return (
                <li key={g.code} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-mist text-sm font-semibold text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
                        {personInitials(g.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate text-sm font-semibold text-rh-night dark:text-white">{g.name}</p>
                          {g.type && <StatusBadge>{g.type.replace(/_/g, ' ')}</StatusBadge>}
                          {g.approvalStatus && g.approvalStatus !== 'approved' && <StatusBadge tone="amber">{g.approvalStatus}</StatusBadge>}
                          {!g.isActive && <StatusBadge tone="red">inactive</StatusBadge>}
                        </div>
                        {g.active ? (
                          <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300">
                            <span className="font-medium">{g.active.contractNumber}</span> · {MODEL_META[g.active.modelType].label} · {termsSummary(g.active)}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">Platform default · {defaultShare}% of each session</p>
                        )}
                        {g.active && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            Net-{g.active.paymentTermsDays} · {g.active.payoutCurrency}
                            {g.active.withholdingTaxPercent ? ` · ${g.active.withholdingTaxPercent}% WHT` : ''}
                            {g.active.vatApplicable ? ' · VAT applies' : ''} · since {format(g.active.effectiveFrom, 'd MMM yyyy')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0">
                      {g.contracts.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-xl text-neutral-600 dark:text-neutral-300"
                          onClick={() => setExpanded(open ? null : g.code)}
                          aria-expanded={open}
                        >
                          {g.contracts.length} {g.contracts.length === 1 ? 'contract' : 'contracts'}
                          <ChevronDown className={cn('ml-1 h-4 w-4 transition-transform', open && 'rotate-180')} />
                        </Button>
                      )}
                      <Button size="sm" className={softButtonClass} onClick={() => openEditor(g)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        {g.active ? 'Edit terms' : 'Set terms'}
                      </Button>
                      {g.active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-500/10"
                          onClick={() => {
                            setEndReason('')
                            setEnding({ contract: g.active as Contract, partnerName: g.name })
                          }}
                        >
                          <XCircle className="mr-2 h-3.5 w-3.5" />
                          End
                        </Button>
                      )}
                    </div>
                  </div>

                  {open && (
                    <ul className="mt-3 space-y-2 pl-[52px]">
                      {g.contracts.map((c) => (
                        <li key={c._id} className="rounded-xl bg-rh-canvas px-3 py-2 text-xs dark:bg-white/[0.04]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-rh-night dark:text-white">{c.contractNumber}</span>
                            <StatusBadge tone={STATUS_TONE[c.status]}>{c.status}</StatusBadge>
                            <span className="text-neutral-600 dark:text-neutral-300">{MODEL_META[c.modelType].label}</span>
                          </div>
                          <p className="mt-1 text-neutral-600 dark:text-neutral-300">{termsSummary(c)}</p>
                          {c.modelType === 'tiered_volume' && c.tiers.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-neutral-500 dark:text-neutral-400">
                              {c.tiers.map((t) => (
                                <li key={t._id}>
                                  {t.tierName}: {t.minReferrals}
                                  {t.maxReferrals !== undefined ? `–${t.maxReferrals}` : '+'} patients
                                  {t.revenueSharePercent !== undefined ? ` · ${t.revenueSharePercent}%` : ''}
                                  {t.feePerReferral ? ` · ${formatKobo(t.feePerReferral)} per new patient` : ''}
                                  {t.bonusAmount ? ` · ${formatKobo(t.bonusAmount)} bonus` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="mt-1 text-neutral-500 dark:text-neutral-400">
                            {format(c.effectiveFrom, 'd MMM yyyy')}
                            {c.effectiveTo ? ` – ${format(c.effectiveTo, 'd MMM yyyy')}` : ' onwards'} · updated {format(c.updatedAt, 'd MMM yyyy')}
                          </p>
                          {c.notes && <p className="mt-1 whitespace-pre-wrap text-neutral-500 dark:text-neutral-400">{c.notes}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={ending !== null}
        onOpenChange={(open) => !open && setEnding(null)}
        title={ending ? `End ${ending.contract.contractNumber}?` : 'End contract?'}
        description={
          ending
            ? `${ending.partnerName}'s terms stop now. New commissions use the platform default of ${defaultShare}%; anything already earned stays as it is.`
            : undefined
        }
        confirmLabel="End contract"
        destructive
        onConfirm={endContract}
      >
        <div className="space-y-1.5">
          <Label htmlFor="end-reason" className="text-sm dark:text-neutral-200">
            Reason (kept on the contract)
          </Label>
          <Textarea
            id="end-reason"
            value={endReason}
            onChange={(e) => setEndReason(e.target.value)}
            placeholder="e.g. Partnership ended by mutual agreement"
            maxLength={500}
            className={inputClass}
          />
        </div>
      </ConfirmDialog>

      {form && (
        <ContractDialog
          form={form}
          setForm={setForm}
          editing={editing}
          partners={partners ?? []}
          groups={groups}
          onClose={() => {
            setForm(null)
            setEditing(null)
          }}
        />
      )}
    </AdminPage>
  )
}

// ── Create / edit dialog ─────────────────────────────────────────────────────

function ContractDialog({
  form,
  setForm,
  editing,
  partners,
  groups,
  onClose,
}: {
  form: FormState
  setForm: (f: FormState | null) => void
  editing: Contract | null
  partners: PartnerOption[]
  groups: PartnerGroup[]
  onClose: () => void
}) {
  const upsert = useMutation(api.commercialTerms.upsertPartnerContract)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value })
  const setTier = (key: number, patch: Partial<TierDraft>) => set('tiers', form.tiers.map((t) => (t.key === key ? { ...t, ...patch } : t)))

  const selectedGroup = groups.find((g) => g.code === form.partnerId)
  const willUpdateActive = !editing && Boolean(selectedGroup?.active)

  const submit = async () => {
    const parsed = toArgs(form)
    if ('error' in parsed) {
      setError(parsed.error)
      playSound('error')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await upsert(parsed.args as Parameters<typeof upsert>[0])
      playSound('success')
      const name = selectedGroup?.name ?? form.partnerId
      toast.success(editing || willUpdateActive ? `Terms updated for ${name}` : `Contract started for ${name}`, {
        description: 'New commissions use these terms from now on.',
      })
      onClose()
    } catch (e) {
      playSound('error')
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl dark:border-white/10 dark:bg-rh-ink-2 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="dark:text-white">{editing ? `Edit ${editing.contractNumber}` : 'New partner contract'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'You’re editing the partner’s active contract. Commissions already earned keep the terms they were earned under.'
              : 'Starts today as the partner’s active contract. Amounts are entered in naira.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Partner</Label>
              <Select value={form.partnerId} onValueChange={(v) => set('partnerId', v)} disabled={Boolean(editing)}>
                <SelectTrigger className={inputClass} aria-label="Partner">
                  <SelectValue placeholder="Choose a partner" />
                </SelectTrigger>
                <SelectContent className="max-h-72 dark:border-white/10 dark:bg-rh-ink-2">
                  {partners.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name}
                      {p.approvalStatus !== 'approved' ? ` (${p.approvalStatus})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {willUpdateActive && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {selectedGroup?.name} already has an active contract ({selectedGroup?.active?.contractNumber}). Saving replaces its terms.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ctr-number">Contract number</Label>
              <Input id="ctr-number" value={form.contractNumber} onChange={(e) => set('contractNumber', e.target.value)} className={inputClass} maxLength={40} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Commission model</Label>
            <Select value={form.modelType} onValueChange={(v) => set('modelType', v as ModelType)}>
              <SelectTrigger className={inputClass} aria-label="Commission model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:border-white/10 dark:bg-rh-ink-2">
                {(Object.keys(MODEL_META) as ModelType[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODEL_META[m].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{MODEL_META[form.modelType].help}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {usesShare(form.modelType) && (
              <div className="space-y-1.5">
                <Label htmlFor="ctr-share">{form.modelType === 'tiered_volume' ? 'Fallback share (%)' : 'Revenue share (%)'}</Label>
                <Input id="ctr-share" type="number" inputMode="decimal" min={0} max={50} step="0.5" value={form.revenueSharePercent} onChange={(e) => set('revenueSharePercent', e.target.value)} className={inputClass} />
              </div>
            )}
            {usesBaseFee(form.modelType) && (
              <div className="space-y-1.5">
                <Label htmlFor="ctr-fee">Fee per new patient (₦)</Label>
                <Input id="ctr-fee" type="number" inputMode="decimal" min={0} step="100" value={form.baseFee} onChange={(e) => set('baseFee', e.target.value)} className={inputClass} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ctr-bonus">Activation bonus (₦)</Label>
              <Input id="ctr-bonus" type="number" inputMode="decimal" min={0} step="100" value={form.activationBonus} onChange={(e) => set('activationBonus', e.target.value)} placeholder="Optional" className={inputClass} />
            </div>
          </div>

          {form.modelType === 'tiered_volume' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Tiers</Label>
                <Button type="button" size="sm" variant="ghost" className="rounded-xl text-rh-teal dark:text-rh-aqua" onClick={() => set('tiers', [...form.tiers, blankTier()])}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add tier
                </Button>
              </div>
              <div className="space-y-2">
                {form.tiers.map((t, i) => (
                  <div key={t.key} className="grid grid-cols-2 gap-2 rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.04] sm:grid-cols-[1.4fr_repeat(5,1fr)_auto] sm:items-end">
                    <TierField label="Name" value={t.tierName} placeholder={['Bronze', 'Silver', 'Gold', 'Platinum'][i] ?? 'Tier'} onChange={(v) => setTier(t.key, { tierName: v })} className="col-span-2 sm:col-span-1" />
                    <TierField label="From (patients)" type="number" value={t.minReferrals} onChange={(v) => setTier(t.key, { minReferrals: v })} />
                    <TierField label="To" type="number" value={t.maxReferrals} placeholder="No limit" onChange={(v) => setTier(t.key, { maxReferrals: v })} />
                    <TierField label="Share %" type="number" value={t.share} onChange={(v) => setTier(t.key, { share: v })} />
                    <TierField label="New patient ₦" type="number" value={t.fee} onChange={(v) => setTier(t.key, { fee: v })} />
                    <TierField label="Bonus ₦" type="number" value={t.bonus} onChange={(v) => setTier(t.key, { bonus: v })} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 justify-self-end rounded-lg text-neutral-500 hover:text-rose-600 dark:text-neutral-400"
                      onClick={() => set('tiers', form.tiers.filter((x) => x.key !== t.key))}
                      disabled={form.tiers.length === 1}
                      aria-label={`Remove tier ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ctr-days">Payment terms (days)</Label>
              <Input id="ctr-days" type="number" inputMode="numeric" min={0} max={365} value={form.paymentTermsDays} onChange={(e) => set('paymentTermsDays', e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ctr-currency">Payout currency</Label>
              <Input id="ctr-currency" value={form.payoutCurrency} onChange={(e) => set('payoutCurrency', e.target.value)} maxLength={3} className={cn(inputClass, 'uppercase')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ctr-wht">Withholding tax (%)</Label>
              <Input id="ctr-wht" type="number" inputMode="decimal" min={0} max={50} step="0.5" value={form.withholdingTaxPercent} onChange={(e) => set('withholdingTaxPercent', e.target.value)} className={inputClass} />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl bg-rh-canvas px-3 py-2.5 dark:bg-white/[0.04]">
            <span>
              <span className="block text-sm font-medium text-rh-night dark:text-white">VAT applies</span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">The partner charges VAT on their commission invoices.</span>
            </span>
            <Switch checked={form.vatApplicable} onCheckedChange={(v) => set('vatApplicable', v)} />
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="ctr-notes">Notes</Label>
            <Textarea id="ctr-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Anything finance should know (signed date, special terms)" className={inputClass} maxLength={2000} />
          </div>

          {error && <p className="rounded-xl bg-rh-blush px-3 py-2 text-sm text-[#be123c] dark:bg-rose-400/10 dark:text-rose-300">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl dark:border-white/10 dark:bg-transparent dark:text-white" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className={primaryButtonClass} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing || willUpdateActive ? 'Save terms' : 'Start contract'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TierField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  placeholder?: string
  className?: string
}) {
  return (
    <label className={cn('space-y-1', className)}>
      <span className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{label}</span>
      <Input type={type} inputMode={type === 'number' ? 'decimal' : undefined} min={type === 'number' ? 0 : undefined} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, 'h-9')} />
    </label>
  )
}
