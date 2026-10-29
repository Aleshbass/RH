'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { AlertTriangle, Archive, Loader2, Minus, Package, Pencil, Plus, Wrench } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { EmptyState, PageShell, Panel, StatTile, StatusBadge, primaryButtonClass } from '@/components/clinic/ui'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'

type Condition = 'good' | 'needs_service' | 'out_of_service'
type Item = {
  _id: string
  kind: 'consumable' | 'equipment'
  name: string
  category: string | null
  unit: string | null
  quantity: number
  minStock: number | null
  location: string | null
  condition: Condition | null
  maintenanceDueAt: number | null
  responsibleUserId: string | null
  responsibleName: string | null
  notes: string | null
  low: boolean
  maintenanceDue: boolean
  updatedAt: number
}
type Purchase = {
  _id: string
  supplier: string
  purchasedAt: number
  lines: { itemId?: string; name: string; quantity: number; unitCostKobo?: number }[]
  totalKobo: number | null
  notes: string | null
  createdByName: string | null
}
type Inventory =
  | { available: false }
  | {
      available: true
      items: Item[]
      purchases: Purchase[]
      team: { _id: string; name: string }[]
      lowStockCount: number
      maintenanceDueCount: number
    }
  | null

const inventoryRef = makeFunctionReference<'query', Record<string, never>, Inventory>('clinicInventory:getInventory')
type SaveArgs = {
  itemId?: string
  kind: 'consumable' | 'equipment'
  name: string
  category?: string
  unit?: string
  quantity?: number
  minStock?: number
  location?: string
  condition?: Condition
  maintenanceDueAt?: number
  responsibleUserId?: string
  notes?: string
}
const saveRef = makeFunctionReference<'mutation', SaveArgs, { itemId: string }>('clinicInventory:saveInventoryItem')
const adjustRef = makeFunctionReference<
  'mutation',
  { itemId: string; change: number; reason: 'used' | 'restocked' | 'adjusted'; note?: string },
  { quantity: number }
>('clinicInventory:adjustStock')
const archiveRef = makeFunctionReference<'mutation', { itemId: string }, null>('clinicInventory:archiveInventoryItem')
const purchaseRef = makeFunctionReference<
  'mutation',
  { supplier: string; purchasedAt: number; lines: { itemId?: string; name: string; quantity: number; unitCostNaira?: number }[]; notes?: string },
  { purchaseId: string }
>('clinicInventory:recordPurchase')

const CONDITION: Record<Condition, { label: string; tone: 'green' | 'amber' | 'red' }> = {
  good: { label: 'Good', tone: 'green' },
  needs_service: { label: 'Needs service', tone: 'amber' },
  out_of_service: { label: 'Out of service', tone: 'red' },
}

const errorText = (err: unknown, fallback: string) => {
  const data = (err as { data?: unknown } | null)?.data
  return typeof data === 'string' && data ? data : fallback
}
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
const fieldClass = 'h-9 text-sm'
const selectClass =
  'h-9 w-full rounded-md border border-pt-line bg-pt-surface px-3 text-sm text-pt-ink'

function Drawer({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="mt-5 space-y-4 px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-pt-ink">{label}</Label>
      {children}
      {hint && <p className="text-xs text-pt-muted">{hint}</p>}
    </div>
  )
}

/** Add or edit a consumable or a piece of equipment. */
function ItemDrawer({
  open,
  onOpenChange,
  kind,
  item,
  team,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  kind: 'consumable' | 'equipment'
  item: Item | null
  team: { _id: string; name: string }[]
}) {
  const save = useMutation(saveRef)
  const [form, setForm] = useState(() => ({
    name: item?.name ?? '',
    category: item?.category ?? '',
    unit: item?.unit ?? '',
    quantity: item ? String(item.quantity) : '',
    minStock: item?.minStock !== null && item?.minStock !== undefined ? String(item.minStock) : '',
    location: item?.location ?? '',
    condition: (item?.condition ?? 'good') as Condition,
    maintenance: item?.maintenanceDueAt ? format(item.maintenanceDueAt, 'yyyy-MM-dd') : '',
    responsible: item?.responsibleUserId ?? '',
    notes: item?.notes ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))
  const num = (value: string) => (value.trim() === '' ? undefined : Number(value))

  const submit = async () => {
    setSaving(true)
    try {
      await save({
        itemId: item?._id,
        kind,
        name: form.name,
        category: form.category || undefined,
        unit: kind === 'consumable' ? form.unit || undefined : undefined,
        quantity: kind === 'consumable' && !item ? num(form.quantity) : undefined,
        minStock: kind === 'consumable' ? num(form.minStock) : undefined,
        location: form.location || undefined,
        condition: kind === 'equipment' ? form.condition : undefined,
        maintenanceDueAt: kind === 'equipment' && form.maintenance ? new Date(`${form.maintenance}T09:00:00`).getTime() : undefined,
        responsibleUserId: form.responsible || undefined,
        notes: form.notes || undefined,
      })
      playSound('success')
      toast.success(item ? 'Saved' : kind === 'consumable' ? 'Supply added' : 'Equipment added')
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err, 'Could not save. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={item ? `Edit ${item.name}` : kind === 'consumable' ? 'Add a supply' : 'Add equipment'}
      description={kind === 'consumable' ? 'Tape, gloves, electrodes and other supplies you use up.' : 'Couches, exercise equipment and devices.'}
    >
      <Field label="Name">
        <Input value={form.name} onChange={set('name')} placeholder={kind === 'consumable' ? 'e.g. Kinesiology tape' : 'e.g. Treatment couch 2'} className={fieldClass} />
      </Field>
      <Field label="Category (optional)">
        <Input value={form.category} onChange={set('category')} placeholder={kind === 'consumable' ? 'e.g. Taping' : 'e.g. Electrotherapy'} className={fieldClass} />
      </Field>
      {kind === 'consumable' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {!item && (
              <Field label="On hand now">
                <Input type="number" min={0} inputMode="decimal" value={form.quantity} onChange={set('quantity')} className={fieldClass} />
              </Field>
            )}
            <Field label="Unit">
              <Input value={form.unit} onChange={set('unit')} placeholder="rolls, boxes, packs" className={fieldClass} />
            </Field>
          </div>
          <Field label="Restock when down to" hint="You get a reminder when stock reaches this.">
            <Input type="number" min={0} inputMode="decimal" value={form.minStock} onChange={set('minStock')} className={fieldClass} />
          </Field>
          <Field label="Where it's kept (optional)">
            <Input value={form.location} onChange={set('location')} placeholder="e.g. Store room, shelf 2" className={fieldClass} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Location">
            <Input value={form.location} onChange={set('location')} placeholder="e.g. Treatment room 1" className={fieldClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Condition">
              <select value={form.condition} onChange={set('condition')} className={selectClass}>
                {(Object.keys(CONDITION) as Condition[]).map((c) => (
                  <option key={c} value={c}>{CONDITION[c].label}</option>
                ))}
              </select>
            </Field>
            <Field label="Next maintenance">
              <Input type="date" value={form.maintenance} onChange={set('maintenance')} className={fieldClass} />
            </Field>
          </div>
          <Field label="Responsible" hint="They're reminded a week before maintenance is due.">
            <select value={form.responsible} onChange={set('responsible')} className={selectClass}>
              <option value="">Nobody yet</option>
              {team.map((person) => (
                <option key={person._id} value={person._id}>{person.name}</option>
              ))}
            </select>
          </Field>
        </>
      )}
      <Field label="Notes (optional)">
        <Textarea rows={3} value={form.notes} onChange={set('notes')} className="resize-none text-sm" />
      </Field>
      <Button onClick={() => void submit()} disabled={saving || !form.name.trim()} className={cn(primaryButtonClass, 'h-10 w-full')}>
        {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {item ? 'Save changes' : 'Add'}
      </Button>
    </Drawer>
  )
}

/** Record supplies bought: lines linked to a supply restock it. */
function PurchaseDrawer({ open, onOpenChange, items }: { open: boolean; onOpenChange: (o: boolean) => void; items: Item[] }) {
  const record = useMutation(purchaseRef)
  const [supplier, setSupplier] = useState('')
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([{ itemId: '', name: '', quantity: '', cost: '' }])
  const [saving, setSaving] = useState(false)
  const supplies = items.filter((i) => i.kind === 'consumable')

  const update = (index: number, patch: Partial<(typeof lines)[number]>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))

  const submit = async () => {
    setSaving(true)
    try {
      await record({
        supplier,
        purchasedAt: new Date(`${date}T12:00:00`).getTime(),
        notes: notes || undefined,
        lines: lines
          .filter((l) => (l.name.trim() || l.itemId) && Number(l.quantity) > 0)
          .map((l) => ({
            itemId: l.itemId || undefined,
            name: l.name.trim() || supplies.find((s) => s._id === l.itemId)?.name || 'Item',
            quantity: Number(l.quantity),
            unitCostNaira: l.cost.trim() === '' ? undefined : Number(l.cost),
          })),
      })
      playSound('success')
      toast.success('Purchase recorded')
      setSupplier('')
      setNotes('')
      setLines([{ itemId: '', name: '', quantity: '', cost: '' }])
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err, 'Could not record the purchase. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Record a purchase" description="Supplies you link here are added to stock.">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier">
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
        </Field>
      </div>
      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={index} className="space-y-2 rounded-lg border border-pt-line p-3">
            <select
              value={line.itemId}
              onChange={(e) => update(index, { itemId: e.target.value })}
              className={selectClass}
              aria-label="Supply"
            >
              <option value="">Not a tracked supply (type a name)</option>
              {supplies.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
            {!line.itemId && <Input value={line.name} onChange={(e) => update(index, { name: e.target.value })} placeholder="What you bought" className={fieldClass} />}
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min={0} inputMode="decimal" value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} placeholder="Quantity" className={fieldClass} />
              <Input type="number" min={0} inputMode="decimal" value={line.cost} onChange={(e) => update(index, { cost: e.target.value })} placeholder="Unit cost ₦ (optional)" className={fieldClass} />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((l) => [...l, { itemId: '', name: '', quantity: '', cost: '' }])}>
          <Plus className="mr-1.5 h-4 w-4" />
          Another item
        </Button>
      </div>
      <Field label="Notes (optional)">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none text-sm" />
      </Field>
      <Button onClick={() => void submit()} disabled={saving || !supplier.trim()} className={cn(primaryButtonClass, 'h-10 w-full')}>
        {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        Record purchase
      </Button>
    </Drawer>
  )
}

/** Quick −/+ on a supply: used one, or restocked one. */
function StockStepper({ item }: { item: Item }) {
  const adjust = useMutation(adjustRef)
  const { requireFullAccess } = useClinicAccess()
  const [busy, setBusy] = useState(false)
  const step = async (change: number) => {
    if (!requireFullAccess('Update stock')) return
    setBusy(true)
    try {
      await adjust({ itemId: item._id, change, reason: change < 0 ? 'used' : 'restocked' })
    } catch (err) {
      toast.error(errorText(err, 'Could not update the stock.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={busy || item.quantity <= 0} onClick={() => void step(-1)} aria-label={`Used one ${item.name}`}>
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="w-14 text-center text-sm font-semibold tabular-nums text-pt-ink">{item.quantity}</span>
      <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={busy} onClick={() => void step(1)} aria-label={`Add one ${item.name}`}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

export default function ClinicInventoryPage() {
  const data = useQuery(inventoryRef, {})
  const archive = useMutation(archiveRef)
  const { requireFullAccess } = useClinicAccess()
  // ?tab=equipment (from Home's "service due" alert) opens on equipment
  const [tab, setTab] = useState<'consumable' | 'equipment' | 'purchases'>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'equipment' ? 'equipment' : 'consumable'
  )
  const [editing, setEditing] = useState<{ kind: 'consumable' | 'equipment'; item: Item | null } | null>(null)
  const [buying, setBuying] = useState(false)

  const items = useMemo(() => (data && data.available ? data.items : []), [data])
  const list = items.filter((i) => i.kind === tab)

  if (data === undefined) {
    return (
      <PageShell title="Inventory">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </PageShell>
    )
  }
  if (data === null) {
    return (
      <PageShell title="Inventory">
        <Panel>
          <EmptyState title="Inventory isn't part of your role" description="Ask the clinic owner if you need it." />
        </Panel>
      </PageShell>
    )
  }
  if (!data.available) {
    return (
      <PageShell title="Inventory">
        <Panel>
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title="Inventory comes with the Enterprise plan"
            description="Track supplies with restock reminders, equipment with maintenance dates and who's responsible, and what you buy."
            action={
              <Button asChild size="sm" className={primaryButtonClass}>
                <Link href="/dashboard/clinic/billing/plan">See your plan</Link>
              </Button>
            }
          />
        </Panel>
      </PageShell>
    )
  }

  const openAdd = () =>
    requireFullAccess(tab === 'purchases' ? 'Record purchase' : 'Add item', () =>
      tab === 'purchases' ? setBuying(true) : setEditing({ kind: tab, item: null })
    )

  return (
    <PageShell
      title="Inventory"
      description="Supplies, equipment and purchases, with reminders before you run out or a service is due."
      info="Set a minimum stock for each supply and a service date for equipment. Home and your notifications remind you in time."
      actions={
        <Button size="sm" onClick={openAdd} className={cn('h-9', primaryButtonClass)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {tab === 'consumable' ? 'Add supply' : tab === 'equipment' ? 'Add equipment' : 'Record purchase'}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Supplies" value={items.filter((i) => i.kind === 'consumable').length} />
        <StatTile label="Running low" value={data.lowStockCount} tone={data.lowStockCount > 0 ? 'attention' : 'default'} hint="At or below the restock level" />
        <StatTile label="Equipment" value={items.filter((i) => i.kind === 'equipment').length} />
        <StatTile label="Maintenance due" value={data.maintenanceDueCount} tone={data.maintenanceDueCount > 0 ? 'attention' : 'default'} hint="Within a week" />
      </div>

      <div className="inline-flex rounded-lg bg-pt-sunken p-1" role="tablist" aria-label="Inventory">
        {(
          [
            ['consumable', 'Supplies'],
            ['equipment', 'Equipment'],
            ['purchases', 'Purchases'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === value ? 'bg-pt-surface text-pt-ink shadow-sm' : 'text-pt-muted hover:text-pt-ink'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'purchases' ? (
        <Panel>
          {data.purchases.length === 0 ? (
            <EmptyState title="No purchases yet" description="Record what you buy, from whom and for how much. Linked supplies are restocked." />
          ) : (
            <ul className="divide-y divide-pt-line">
              {data.purchases.map((p) => (
                <li key={p._id} className="px-5 py-3 sm:px-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-pt-ink">{p.supplier}</p>
                    <p className="shrink-0 text-sm tabular-nums text-pt-ink">{p.totalKobo !== null ? naira(p.totalKobo) : ''}</p>
                  </div>
                  <p className="text-xs text-pt-muted">
                    {format(p.purchasedAt, 'd MMM yyyy')} · {p.lines.map((l) => `${l.quantity} × ${l.name}`).join(', ')}
                    {p.createdByName ? ` · by ${p.createdByName}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : (
        <Panel>
          {list.length === 0 ? (
            <EmptyState
              icon={tab === 'consumable' ? <Package className="h-8 w-8" /> : <Wrench className="h-8 w-8" />}
              title={tab === 'consumable' ? 'No supplies yet' : 'No equipment yet'}
              description={
                tab === 'consumable'
                  ? 'Add tape, gloves, electrodes and anything else you use up. We remind you before you run out.'
                  : 'Add couches, exercise equipment and devices with their location and next service date.'
              }
            />
          ) : (
            <ul className="divide-y divide-pt-line">
              {list.map((item) => (
                <li key={item._id} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-pt-ink">
                      {item.name}
                      {item.low && <StatusBadge tone="amber">Running low</StatusBadge>}
                      {item.condition && item.condition !== 'good' && <StatusBadge tone={CONDITION[item.condition].tone}>{CONDITION[item.condition].label}</StatusBadge>}
                      {item.maintenanceDue && (
                        <StatusBadge tone="amber">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Service due
                        </StatusBadge>
                      )}
                    </p>
                    <p className="text-xs text-pt-muted">
                      {(item.kind === 'consumable'
                        ? [item.category, item.unit && `in ${item.unit}`, item.minStock !== null && `restock at ${item.minStock}`, item.location]
                        : [
                            item.category,
                            item.location,
                            item.maintenanceDueAt && `service ${format(item.maintenanceDueAt, 'd MMM yyyy')}`,
                            item.responsibleName && `looked after by ${item.responsibleName}`,
                          ]
                      )
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {item.kind === 'consumable' && <StockStepper item={item} />}
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label={`Edit ${item.name}`} onClick={() => requireFullAccess('Edit item', () => setEditing({ kind: item.kind, item }))}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-pt-faint"
                      aria-label={`Remove ${item.name}`}
                      onClick={() =>
                        requireFullAccess('Remove item', async () => {
                          try {
                            await archive({ itemId: item._id })
                            playSound('reject')
                            toast.success(`${item.name} removed`)
                          } catch (err) {
                            toast.error(errorText(err, 'Could not remove it.'))
                          }
                        })
                      }
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {editing && (
        <ItemDrawer
          key={editing.item?._id ?? `new-${editing.kind}`}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          kind={editing.kind}
          item={editing.item}
          team={data.team}
        />
      )}
      <PurchaseDrawer open={buying} onOpenChange={setBuying} items={items} />
    </PageShell>
  )
}
