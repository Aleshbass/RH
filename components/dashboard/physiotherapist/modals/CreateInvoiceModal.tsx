'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, FileText, Loader2, Mail, Plus, Receipt, Search, Trash2, WhatsApp } from '@/components/icons';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { fieldClass, formatNaira, InfoTip, PhysioDrawer, primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui';
import { programError } from '@/components/exercise-programs/errors';
import { useActionUntyped, useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped';
import { playSound } from '@/lib/sounds';
import { cn } from '@/lib/utils';

interface CreateInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    preselectedPatientId?: string;
}

/** The generated api types sit at TypeScript's depth limit, so this drawer reads its functions untyped. */
const root = api as unknown as Record<string, Record<string, unknown>>;

const DAY_MS = 24 * 60 * 60 * 1000;

type PatientOption = { _id: string; firstName?: string; lastName?: string; email?: string; phoneNumber?: string; patientNumber?: string };
type Visit = { _id: string; patientId: string; startTime: number; status: string; serviceType?: string };
type Item = { description: string; amount: string };

const DUE_OPTIONS = [
    { value: '0', label: 'Today' },
    { value: '3', label: 'In 3 days' },
    { value: '7', label: 'In a week' },
    { value: '14', label: 'In 2 weeks' },
] as const;
type DueIn = (typeof DUE_OPTIONS)[number]['value'];

const ITEM_SUGGESTIONS = ['Physiotherapy session', 'Initial assessment', 'Home visit', 'Video consultation'];

const nameOf = (p?: Pick<PatientOption, 'firstName' | 'lastName'> | null) => [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Patient';

function Section({ label, info, children }: { label: string; info?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div>
            <p className="flex items-center gap-1 text-sm font-medium text-pt-ink">
                {label}
                {info && <InfoTip>{info}</InfoTip>}
            </p>
            <div className="mt-2">{children}</div>
        </div>
    );
}

/**
 * Request a payment from one of your patients: who, what it's for and the amount, when to pay by.
 * Shows exactly what the patient pays and what you receive, then sends the pay link by WhatsApp,
 * email or copy. (One amount per line: there's no quantity to fill in.)
 */
export function CreateInvoiceModal({ isOpen, onClose, preselectedPatientId }: CreateInvoiceModalProps) {
    const patients = useQueryUntyped(root.patients.getMyPatientOptions, isOpen ? {} : 'skip') as PatientOption[] | undefined;
    const me = useQueryUntyped(root.users.getMyUser, isOpen ? {} : 'skip') as { clinicId?: string } | null | undefined;
    const createInvoice = useMutationUntyped(root.billing.createInvoice);
    const createLink = useActionUntyped(root.physioBilling.createPhysioPaymentLink);

    const [patientId, setPatientId] = useState(preselectedPatientId ?? '');
    const [search, setSearch] = useState('');
    const [items, setItems] = useState<Item[]>([{ description: '', amount: '' }]);
    const [dueIn, setDueIn] = useState<DueIn>('7');
    const [visitId, setVisitId] = useState('');
    const [notes, setNotes] = useState('');
    const [showNotes, setShowNotes] = useState(false);
    const [saving, setSaving] = useState(false);
    const [sent, setSent] = useState<{ invoiceId: Id<'invoices'>; invoiceNumber?: string; total: number } | null>(null);
    const [linkBusy, setLinkBusy] = useState<'copy' | 'email' | 'whatsapp' | null>(null);

    // A fresh form each time it opens
    useEffect(() => {
        if (!isOpen) return;
        setPatientId(preselectedPatientId ?? '');
        setSearch('');
        setItems([{ description: '', amount: '' }]);
        setDueIn('7');
        setVisitId('');
        setNotes('');
        setShowNotes(false);
        setSent(null);
    }, [isOpen, preselectedPatientId]);

    // Recent and upcoming visits with the chosen patient, to link the payment to one (optional)
    const [visitWindowStart] = useState(() => Date.now() - 60 * DAY_MS);
    const visits = useQueryUntyped(root.appointments.getMyAppointments, isOpen && patientId ? { startDate: visitWindowStart, limit: 200 } : 'skip') as Visit[] | undefined;
    const patientVisits = (visits ?? [])
        .filter((v) => v.patientId === patientId && !String(v.status).startsWith('cancelled'))
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, 12);

    const patient = (patients ?? []).find((p) => p._id === patientId) ?? null;
    const matches = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (patients ?? []).filter((p) => !q || `${nameOf(p)} ${p.email ?? ''} ${p.patientNumber ?? ''}`.toLowerCase().includes(q)).slice(0, 30);
    }, [patients, search]);

    const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    // Same sums as billing.createInvoice: an independent physio's patient pays the ₦1,000 service fee
    // and Paystack's 1.5% + ₦100 on top; a clinic's patient pays the quoted price
    const throughClinic = Boolean(me?.clinicId);
    const serviceFee = throughClinic ? 0 : 1000;
    const processing = throughClinic || subtotal <= 0 ? 0 : Math.round((subtotal + serviceFee) * 0.015) + 100;
    const patientPays = subtotal + serviceFee + processing;
    const first = patient?.firstName || 'The patient';

    const setItem = (index: number, patch: Partial<Item>) => setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));

    const submit = async () => {
        if (!patientId) return toast.error('Choose who the payment is from.');
        const clean = items.filter((item) => item.description.trim() || Number(item.amount) > 0);
        if (clean.length === 0 || clean.some((item) => !item.description.trim() || !(Number(item.amount) > 0))) {
            return toast.error('Each line needs what it’s for and an amount.');
        }
        setSaving(true);
        try {
            const due = new Date(Date.now() + Number(dueIn) * DAY_MS);
            due.setHours(23, 59, 59, 0);
            const result = (await createInvoice({
                patientId: patientId as Id<'users'>,
                appointmentIds: visitId ? [visitId as Id<'appointments'>] : [],
                items: clean.map((item) => ({ description: item.description.trim(), quantity: 1, unitPrice: Number(item.amount), totalPrice: Number(item.amount) })),
                discountAmount: 0,
                notes: notes.trim(),
                dueDate: due.getTime(),
            })) as { success: boolean; invoiceId?: Id<'invoices'>; invoiceNumber?: string; message: string };
            if (!result.success || !result.invoiceId) throw new Error(result.message);
            playSound('success');
            setSent({ invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber, total: subtotal });
        } catch (error) {
            playSound('error');
            toast.error(programError(error, 'Couldn’t create the request. Please try again.'));
        } finally {
            setSaving(false);
        }
    };

    const share = async (how: 'copy' | 'email' | 'whatsapp') => {
        if (!sent) return;
        setLinkBusy(how);
        try {
            const result = (await createLink({ invoiceId: sent.invoiceId, emailPatient: how === 'email' })) as { paymentLink: string; emailed: boolean };
            if (how === 'copy') {
                await navigator.clipboard.writeText(result.paymentLink);
                toast.success('Payment link copied');
            } else if (how === 'email') {
                toast.success(result.emailed ? `Emailed to ${first}` : 'Link ready, but this patient has no email on file');
            } else {
                const phone = (patient?.phoneNumber ?? '').replace(/\D/g, '').replace(/^0/, '234');
                const text = `Hi ${patient?.firstName ?? ''}, here's the link to pay for your physiotherapy (${formatNaira(sent.total)}): ${result.paymentLink}`;
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
            }
        } catch (error) {
            toast.error(programError(error, 'Couldn’t create the payment link. Please try again.'));
        } finally {
            setLinkBusy(null);
        }
    };

    return (
        <PhysioDrawer
            open={isOpen}
            onOpenChange={(open) => !open && !saving && onClose()}
            title={sent ? 'Payment request sent' : 'Request payment'}
            description={sent ? `${first} has been told in their app.` : 'They pay by card, transfer or USSD.'}
            footer={
                sent ? (
                    <Button className={cn(primaryButtonClass, 'h-11 w-full')} onClick={onClose}>
                        Done
                    </Button>
                ) : (
                    <div className="flex gap-2">
                        <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} disabled={saving} onClick={onClose}>
                            Cancel
                        </Button>
                        <Button className={cn(primaryButtonClass, 'h-11 flex-1')} disabled={saving || subtotal <= 0 || !patientId} onClick={() => void submit()}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Send request
                        </Button>
                    </div>
                )
            }
        >
            {sent ? (
                <div className="space-y-5">
                    <div className="flex flex-col items-center rounded-2xl bg-pt-sunken px-4 py-6 text-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pt-accent text-[#06210a]">
                            <Receipt className="h-5 w-5" />
                        </span>
                        <p className="mt-3 text-2xl font-semibold tabular-nums text-pt-ink">{formatNaira(sent.total)}</p>
                        <p className="text-sm text-pt-muted">{sent.invoiceNumber ? `Invoice #${sent.invoiceNumber}` : 'Invoice created'} · {nameOf(patient)}</p>
                    </div>
                    <Section label="Send them the pay link" info="The link opens a secure Paystack page. When they pay, the invoice is marked paid and you get a notification.">
                        <div className="grid gap-2">
                            <Button className="h-11 rounded-xl bg-[#25D366] text-white shadow-none hover:bg-[#1ebe5b]" disabled={linkBusy !== null} onClick={() => void share('whatsapp')}>
                                {linkBusy === 'whatsapp' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WhatsApp className="mr-2 h-4 w-4" />}
                                Send on WhatsApp
                            </Button>
                            <div className="grid grid-cols-2 gap-2">
                                <Button className={cn(secondaryButtonClass, 'h-11')} disabled={linkBusy !== null} onClick={() => void share('copy')}>
                                    {linkBusy === 'copy' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                                    Copy link
                                </Button>
                                <Button className={cn(secondaryButtonClass, 'h-11')} disabled={linkBusy !== null} onClick={() => void share('email')}>
                                    {linkBusy === 'email' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                                    Email it
                                </Button>
                            </div>
                        </div>
                    </Section>
                </div>
            ) : (
                <div className="space-y-5">
                    <Section label="From">
                        {patient ? (
                            <div className="flex items-center gap-3 rounded-2xl border border-pt-line px-3 py-2.5">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pt-sunken text-xs font-semibold text-pt-ink">
                                    {`${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase() || 'P'}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-pt-ink">{nameOf(patient)}</span>
                                    {patient.email && <span className="block truncate text-xs text-pt-muted">{patient.email}</span>}
                                </span>
                                {!preselectedPatientId && (
                                    <Button size="sm" variant="ghost" className="h-8 rounded-lg text-pt-muted hover:bg-pt-hover hover:text-pt-ink" onClick={() => setPatientId('')}>
                                        Change
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" />
                                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your patients" aria-label="Search your patients" className={cn(fieldClass, 'pl-9')} />
                                </div>
                                <ul className="max-h-56 space-y-1 overflow-y-auto">
                                    {patients === undefined ? (
                                        <li className="flex justify-center py-6">
                                            <Loader2 className="h-4 w-4 animate-spin text-pt-muted" />
                                        </li>
                                    ) : matches.length === 0 ? (
                                        <li className="py-6 text-center text-sm text-pt-muted">No patients match.</li>
                                    ) : (
                                        matches.map((p) => (
                                            <li key={p._id}>
                                                <button
                                                    type="button"
                                                    onClick={() => setPatientId(p._id)}
                                                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-pt-hover"
                                                >
                                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pt-sunken text-[11px] font-semibold text-pt-ink">
                                                        {`${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() || 'P'}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-sm font-medium text-pt-ink">{nameOf(p)}</span>
                                                        {p.email && <span className="block truncate text-xs text-pt-muted">{p.email}</span>}
                                                    </span>
                                                </button>
                                            </li>
                                        ))
                                    )}
                                </ul>
                            </div>
                        )}
                    </Section>

                    <Section label="What it’s for" info="One line per thing you’re charging for, with its amount. Add more lines for a package or several sessions.">
                        <div className="space-y-2">
                            {items.map((item, index) => (
                                <div key={index} className="flex gap-2">
                                    <Input
                                        className={cn(fieldClass, 'min-w-0 flex-1')}
                                        value={item.description}
                                        onChange={(e) => setItem(index, { description: e.target.value })}
                                        placeholder="e.g. Physiotherapy session"
                                        aria-label={`Line ${index + 1}`}
                                        list="invoice-item-suggestions"
                                    />
                                    <div className="relative w-32 shrink-0">
                                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-pt-muted">₦</span>
                                        <Input
                                            className={cn(fieldClass, 'pl-7 tabular-nums')}
                                            inputMode="numeric"
                                            value={item.amount}
                                            onChange={(e) => setItem(index, { amount: e.target.value.replace(/[^\d]/g, '') })}
                                            placeholder="15000"
                                            aria-label={`Amount for line ${index + 1}`}
                                        />
                                    </div>
                                    {items.length > 1 && (
                                        <Button type="button" variant="ghost" size="icon" className="shrink-0 text-pt-faint hover:text-pt-rose-fg" onClick={() => setItems((list) => list.filter((_, i) => i !== index))} aria-label={`Remove line ${index + 1}`}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                            <datalist id="invoice-item-suggestions">
                                {ITEM_SUGGESTIONS.map((s) => (
                                    <option key={s} value={s} />
                                ))}
                            </datalist>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="mt-1 h-8 rounded-lg px-2 text-pt-ink hover:bg-pt-hover" onClick={() => setItems((list) => [...list, { description: '', amount: '' }])}>
                            <Plus className="mr-1 h-4 w-4" />
                            Add another line
                        </Button>
                    </Section>

                    <Section label="Pay by">
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pay by">
                            {DUE_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={dueIn === option.value}
                                    onClick={() => setDueIn(option.value)}
                                    className={cn(
                                        'rounded-full border px-3 py-1.5 text-sm transition active:scale-95',
                                        dueIn === option.value ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong text-pt-ink hover:bg-pt-hover'
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </Section>

                    {patientId && patientVisits.length > 0 && (
                        <Section label="For a visit (optional)" info="Link the payment to a session so it shows against that visit in your records.">
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setVisitId('')}
                                    className={cn(
                                        'rounded-full border px-3 py-1.5 text-sm transition',
                                        !visitId ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong text-pt-ink hover:bg-pt-hover'
                                    )}
                                >
                                    Not linked
                                </button>
                                {patientVisits.map((visit) => (
                                    <button
                                        key={visit._id}
                                        type="button"
                                        onClick={() => setVisitId(visit._id)}
                                        className={cn(
                                            'rounded-full border px-3 py-1.5 text-sm transition',
                                            visitId === visit._id ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong text-pt-ink hover:bg-pt-hover'
                                        )}
                                    >
                                        {new Date(visit.startTime).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                                    </button>
                                ))}
                            </div>
                        </Section>
                    )}

                    <div className="rounded-2xl bg-pt-sunken p-4 text-sm">
                        <div className="flex justify-between text-pt-muted">
                            <span>You charge</span>
                            <span className="tabular-nums text-pt-ink">{formatNaira(subtotal)}</span>
                        </div>
                        {!throughClinic && (
                            <>
                                <div className="mt-1.5 flex justify-between text-pt-muted">
                                    <span className="flex items-center gap-1">
                                        Rehabify service fee
                                        <InfoTip>A flat ₦1,000 the patient pays on top. You still receive the full amount you charge.</InfoTip>
                                    </span>
                                    <span className="tabular-nums">{formatNaira(serviceFee)}</span>
                                </div>
                                <div className="mt-1.5 flex justify-between text-pt-muted">
                                    <span className="flex items-center gap-1">
                                        Card and transfer fee
                                        <InfoTip>Paystack’s 1.5% + ₦100, added to what the patient pays.</InfoTip>
                                    </span>
                                    <span className="tabular-nums">{formatNaira(processing)}</span>
                                </div>
                            </>
                        )}
                        <div className="mt-3 flex justify-between border-t border-pt-line pt-3 font-semibold text-pt-ink">
                            <span>{patient ? `${first} pays` : 'The patient pays'}</span>
                            <span className="tabular-nums">{formatNaira(patientPays)}</span>
                        </div>
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-pt-muted">
                            <FileText className="h-3.5 w-3.5" />
                            {throughClinic ? 'Billed through your clinic, to the clinic’s payout account.' : `You receive ${formatNaira(subtotal)} to your payout account.`}
                        </p>
                    </div>

                    {showNotes ? (
                        <Section label="Note on the invoice (optional)">
                            <Textarea className={cn(fieldClass, 'resize-none')} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Covers the four sessions in March" />
                        </Section>
                    ) : (
                        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-pt-muted hover:bg-pt-hover hover:text-pt-ink" onClick={() => setShowNotes(true)}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add a note to the invoice
                        </Button>
                    )}
                </div>
            )}
        </PhysioDrawer>
    );
}
