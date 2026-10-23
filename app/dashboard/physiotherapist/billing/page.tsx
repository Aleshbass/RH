'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { format } from 'date-fns';
import { Download, Plus, Receipt, Search } from '@/components/icons';
import { toast } from 'sonner';
import { playSound } from '@/lib/sounds';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SimpleInvoiceModal } from '@/components/billing/SimpleInvoiceModal';
import { CreateInvoiceModal } from '@/components/dashboard/physiotherapist/modals/CreateInvoiceModal';
import { EmptyState, PageContainer, PageHeader, Panel, StatTile, StatusBadge, primaryButtonClass } from '@/components/physio/ui';
import { PaystackTestModeBanner } from '@/components/billing/PaystackTestModeBanner';
import { programError } from '@/components/exercise-programs/errors';

type InvoiceFromQuery = {
  _id: Id<'invoices'>;
  invoiceNumber: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  totalAmount: number; // kobo
  currency: string;
  status: string;
  issueDate: number;
  dueDate: number;
  paymentDate?: number;
  isOverdue: boolean;
  lastPaymentStatus?: string;
};

type BillingStats = {
  totalRevenue: number;
  pendingPayments: number;
  overdueInvoices: number; // a count, not an amount
  paidInvoices: number;
  monthlyRevenue: number;
};

const STATUS_OPTIONS = [
  ['all', 'All invoices'],
  ['draft', 'Draft'],
  ['sent', 'Sent'],
  ['partial_payment', 'Part paid'],
  ['overdue', 'Overdue'],
  ['paid', 'Paid'],
  ['void', 'Void'],
] as const;

function formatKobo(amount: number, currency = 'NGN') {
  return (amount / 100).toLocaleString('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 });
}

function invoiceStatus(invoice: InvoiceFromQuery) {
  if (invoice.isOverdue && invoice.status !== 'paid' && invoice.status !== 'void') return <StatusBadge tone="red">Overdue</StatusBadge>;
  switch (invoice.status) {
    case 'paid':
      return <StatusBadge tone="green">Paid</StatusBadge>;
    case 'partial_payment':
      return <StatusBadge tone="amber">Part paid</StatusBadge>;
    case 'sent':
    case 'pending':
      return <StatusBadge tone="teal">Sent</StatusBadge>;
    case 'void':
      return <StatusBadge>Void</StatusBadge>;
    default:
      return <StatusBadge>Draft</StatusBadge>;
  }
}

export default function BillingPage() {
  const invoices = useQuery(api.billing.getMyInvoices, { limit: 200 }) as InvoiceFromQuery[] | undefined;
  const stats = useQuery(api.billing.getBillingStats, {}) as BillingStats | undefined;
  const patients = useQuery(api.patients.getMyPatients, { limit: 200 }) as
    | { _id: string; firstName?: string; lastName?: string; email?: string; phoneNumber?: string }[]
    | undefined;
  const bankAccounts = useQuery(api.paystack.getMyBankAccounts) as { accountName?: string; bankName?: string }[] | undefined;

  const sendInvoice = useMutation(api.billing.sendInvoice);
  const recordPayment = useMutation(api.billing.recordPayment);
  const generateInvoicePDF = useMutation(api.billing.generateInvoicePDF);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<InvoiceFromQuery | null>(null);
  const [creating, setCreating] = useState(false);
  const [isInitiatingLoan, setIsInitiatingLoan] = useState(false);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (invoices ?? []).filter((invoice) => {
      const matchesSearch =
        !term || invoice.invoiceNumber.toLowerCase().includes(term) || invoice.patientName.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'overdue' ? invoice.isOverdue && invoice.status !== 'paid' : invoice.status === statusFilter);
      return matchesSearch && matchesStatus;
    });
  }, [invoices, searchTerm, statusFilter]);

  const handleSend = useCallback(
    async (invoiceId: Id<'invoices'>) => {
      try {
        await sendInvoice({ invoiceId });
        toast.success('Invoice sent');
      } catch (error) {
        toast.error(programError(error, 'Couldn’t send the invoice'));
      }
    },
    [sendInvoice]
  );

  const handleRecordPayment = useCallback(
    async (invoiceId: Id<'invoices'>, amount: number, method: string) => {
      // Marking an invoice paid by hand is final, so the physio confirms the money really arrived
      const ok = window.confirm(
        `Record ₦${amount.toLocaleString('en-NG')} as received by ${method === 'cash' ? 'cash' : 'bank transfer'}? ` +
          'Only do this once the money is in your account. The patient will see the invoice as paid.'
      );
      if (!ok) return;
      try {
        await recordPayment({
          invoiceId,
          paymentAmount: Math.round(amount * 100),
          paymentMethod: method,
          paymentReference: `MANUAL-${Date.now()}`,
          notes: 'Recorded from the dashboard',
        });
        playSound('paid');
        toast.success('Payment recorded');
      } catch (error) {
        toast.error(programError(error, 'Couldn’t record the payment'));
      }
    },
    [recordPayment]
  );

  const handleDownload = useCallback(
    async (invoiceId: Id<'invoices'>) => {
      try {
        const result = await generateInvoicePDF({ invoiceId });
        if (result.pdfUrl) window.open(result.pdfUrl, '_blank', 'noopener');
        else toast.error('The PDF isn’t ready yet. Try again in a moment.');
      } catch {
        toast.error('Couldn’t create the PDF');
      }
    },
    [generateInvoicePDF]
  );

  // MediLoan lets a patient spread the cost of an invoice; started from the invoice dialog
  const handleInitiateMediLoan = useCallback(
    async (invoice: InvoiceFromQuery) => {
      setIsInitiatingLoan(true);
      try {
        // The server takes the patient and the amount owed from the invoice itself; the phone
        // here is only used if the patient's account has none
        const patient = patients?.find((p) => {
          const full = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim().toLowerCase();
          return full.length > 0 && full === invoice.patientName.trim().toLowerCase();
        });
        const response = await fetch('/api/myitura/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: invoice._id,
            phoneNumber: invoice.patientPhone || patient?.phoneNumber || undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'MediLoan request failed');
        playSound('success');
        const whatsappUrl: string | null = data.data?.whatsappUrl ?? null;
        toast.success(data.data?.message ?? 'MediLoan started.', {
          description: 'The invoice is marked paid when the loan pays out.',
          duration: 15000,
          action: whatsappUrl
            ? { label: 'Send on WhatsApp', onClick: () => window.open(whatsappUrl, '_blank', 'noopener,noreferrer') }
            : undefined,
        });
      } catch (error) {
        toast.error((error as Error).message || 'Couldn’t start MediLoan');
      } finally {
        setIsInitiatingLoan(false);
      }
    },
    [patients]
  );

  const payout = bankAccounts?.[0];
  const statValue = (value: number | undefined, asMoney = true) =>
    stats === undefined ? '–' : asMoney ? formatKobo(value ?? 0) : String(value ?? 0);

  return (
    <PageContainer>
      <PaystackTestModeBanner />
      <PageHeader
        title="Billing"
        description="Invoices you’ve sent and payments you’ve received."
        actions={
          <Button onClick={() => setCreating(true)} className={primaryButtonClass}>
            <Plus className="mr-2 h-4 w-4" />
            New invoice
          </Button>
        }
      />

      {bankAccounts !== undefined && !payout && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-amber-900 dark:text-amber-200">Add a payout account so patient payments can reach you.</p>
          <Link href="/dashboard/physiotherapist/settings/payout" className="shrink-0 font-medium text-amber-900 underline dark:text-amber-200">
            Add account
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Received this month" value={statValue(stats?.monthlyRevenue)} />
        <StatTile label="Received in total" value={statValue(stats?.totalRevenue)} hint={stats ? `${stats.paidInvoices} paid invoices` : undefined} />
        <StatTile label="Waiting for payment" value={statValue(stats?.pendingPayments)} />
        <StatTile
          label="Overdue"
          value={statValue(stats?.overdueInvoices, false)}
          hint="invoices past their due date"
          tone={stats && stats.overdueInvoices > 0 ? 'attention' : 'default'}
        />
      </div>

      <Panel
        title="Invoices"
        description={payout ? `Payouts go to ${payout.bankName ?? 'your bank'} · ${payout.accountName ?? ''}` : undefined}
      >
        <div className="flex flex-col gap-2 border-b border-neutral-100 p-4 dark:border-white/[0.07] sm:flex-row sm:px-5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Search by invoice number or patient"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              aria-label="Search invoices"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-44" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {invoices === undefined ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-8 w-8" />}
            title={invoices.length === 0 ? 'No invoices yet' : 'No invoices match'}
            description={
              invoices.length === 0
                ? 'Use invoices for sessions that weren’t paid when they were booked.'
                : 'Try a different search or status.'
            }
            action={
              invoices.length === 0 && (
                <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                  Create an invoice
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.map((invoice) => (
              <li key={invoice._id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={() => setSelected(invoice)}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`Open invoice ${invoice.invoiceNumber}`}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{invoice.patientName}</p>
                    {invoiceStatus(invoice)}
                    {invoice.status !== 'paid' && invoice.status !== 'void' &&
                      (invoice.lastPaymentStatus === 'failed' || invoice.lastPaymentStatus === 'cancelled') && (
                        <StatusBadge tone="red">Payment failed</StatusBadge>
                      )}
                    {invoice.status !== 'paid' && invoice.status !== 'void' &&
                      (invoice.lastPaymentStatus === 'pending' || invoice.lastPaymentStatus === 'processing') && (
                        <StatusBadge tone="amber">Payment started</StatusBadge>
                      )}
                  </div>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    #{invoice.invoiceNumber} · Issued {Number.isFinite(invoice.issueDate) ? format(invoice.issueDate, 'd MMM yyyy') : '—'} · Due {Number.isFinite(invoice.dueDate) ? format(invoice.dueDate, 'd MMM') : '—'}
                  </p>
                </button>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">
                  {formatKobo(invoice.totalAmount, invoice.currency)}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  {invoice.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => handleSend(invoice._id)} className="hidden sm:inline-flex">
                      Send
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDownload(invoice._id)}
                    aria-label={`Download invoice ${invoice.invoiceNumber}`}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <CreateInvoiceModal isOpen={creating} onClose={() => setCreating(false)} />

      {selected && (
        <SimpleInvoiceModal
          isOpen
          selectedInvoice={{
            ...selected,
            patient: {
              firstName: selected.patientName.split(' ')[0],
              lastName: selected.patientName.split(' ').slice(1).join(' '),
            },
          } as never}
          onClose={() => setSelected(null)}
          onSend={() => handleSend(selected._id)}
          onRecordPayment={(amount: number, method: string) => handleRecordPayment(selected._id, amount, method)}
          onDownload={() => handleDownload(selected._id)}
          onInitiateMediLoan={handleInitiateMediLoan as never}
          isInitiatingLoan={isInitiatingLoan}
        />
      )}
    </PageContainer>
  );
}
