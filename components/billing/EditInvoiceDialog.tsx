'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { playSound } from '@/lib/sounds'

/** An invoice as the edit form needs it (billing.getInvoiceForEdit). */
export type InvoiceForEdit = {
  _id: Id<'invoices'>
  invoiceNumber: string
  status: string
  clinicInvoice: boolean
  items: { description: string; quantity: number; unitPriceNaira: number }[]
  discountNaira: number
  dueDate: number
  paymentMethod: string | null
  paidByHand: boolean
}

// By name: the generated `api` type is at TypeScript's depth limit
export const getInvoiceForEditRef = makeFunctionReference<'query', { invoiceId: Id<'invoices'> }, InvoiceForEdit | null>(
  'billing:getInvoiceForEdit'
)
const updateMyInvoiceRef = makeFunctionReference<
  'mutation',
  { invoiceId: Id<'invoices'>; items: { description: string; quantity: number; unitPrice: number }[]; dueDate?: number },
  { success: boolean }
>('billing:updateMyInvoice')
export const cancelMyInvoiceRef = makeFunctionReference<'mutation', { invoiceId: Id<'invoices'>; reason?: string }, { success: boolean }>(
  'billing:cancelMyInvoice'
)
export const undoMyRecordedPaymentRef = makeFunctionReference<'mutation', { invoiceId: Id<'invoices'> }, { success: boolean }>(
  'billing:undoMyRecordedPayment'
)

export function invoiceErrorText(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data
  return fallback
}

type Line = { description: string; quantity: string; price: string }

/** Correct the services, amounts or due date of an unpaid invoice. It keeps its number; the patient is told. */
export function EditInvoiceDialog({ invoiceId, onClose }: { invoiceId: Id<'invoices'> | null; onClose: () => void }) {
  const invoice = useQuery(getInvoiceForEditRef, invoiceId ? { invoiceId } : 'skip')
  const update = useMutation(updateMyInvoiceRef)
  const [lines, setLines] = useState<Line[]>([])
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!invoice) return
    setLines(invoice.items.map((item) => ({ description: item.description, quantity: String(item.quantity), price: String(item.unitPriceNaira) })))
    setDue(Number.isFinite(invoice.dueDate) ? format(invoice.dueDate, 'yyyy-MM-dd') : '')
  }, [invoice])

  const setLine = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.price.replace(/,/g, '')) || 0), 0)

  const save = async () => {
    if (!invoiceId) return
    const items = lines.map((line) => ({
      description: line.description.trim(),
      quantity: Math.round(Number(line.quantity)),
      unitPrice: Number(line.price.replace(/,/g, '')),
    }))
    if (items.some((item) => !item.description)) return toast.error('Each line needs a description.')
    if (items.some((item) => !(item.quantity >= 1))) return toast.error('Each line needs a quantity of at least 1.')
    if (items.some((item) => !(item.unitPrice > 0))) return toast.error('Each line needs an amount in naira.')
    const dueDate = due ? new Date(`${due}T23:59:00`).getTime() : undefined
    setSaving(true)
    try {
      await update({ invoiceId, items, dueDate })
      playSound('success')
      toast.success('Invoice corrected', { description: 'The patient has been told. A payment link sent before no longer works; send the new one.' })
      onClose()
    } catch (error) {
      toast.error(invoiceErrorText(error, 'Couldn’t change the invoice. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={invoiceId !== null} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit invoice{invoice ? ` #${invoice.invoiceNumber}` : ''}</DialogTitle>
          <DialogDescription>Correct the services, amounts or due date. The patient is told, and it keeps its number.</DialogDescription>
        </DialogHeader>
        {invoice === undefined ? (
          <div className="flex items-center gap-2 py-6 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : invoice === null ? (
          <p className="py-4 text-sm text-neutral-500">You can’t change this invoice.</p>
        ) : (
          <div className="space-y-4">
            {lines.map((line, index) => (
              <div key={index} className="space-y-2 rounded-2xl border border-black/[0.06] p-3 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Line ${index + 1} description`}
                    value={line.description}
                    onChange={(e) => setLine(index, { description: e.target.value })}
                    placeholder="e.g. Physiotherapy session"
                  />
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove line ${index + 1}`}
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(e) => setLine(index, { quantity: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Price each (₦)</Label>
                    <Input inputMode="decimal" value={line.price} onChange={(e) => setLine(index, { price: e.target.value.replace(/[^\d.,]/g, '') })} />
                  </div>
                </div>
              </div>
            ))}
            {lines.length < 20 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, { description: '', quantity: '1', price: '' }])}>
                <Plus className="mr-1.5 h-4 w-4" /> Add a line
              </Button>
            )}
            <div>
              <Label htmlFor="edit-invoice-due" className="text-xs">
                Due date
              </Label>
              <Input id="edit-invoice-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">
              New total ₦{total.toLocaleString('en-NG', { maximumFractionDigits: 2 })}
              {invoice.discountNaira > 0 ? ` before the ₦${invoice.discountNaira.toLocaleString('en-NG')} discount` : ''}
            </p>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Back
          </Button>
          <Button onClick={() => void save()} disabled={saving || !invoice}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
