'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Id } from '@/convex/_generated/dataModel';
import { Patient } from '@/app/types';
import { programError } from '@/components/exercise-programs/errors';

interface CreateInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    preselectedPatientId?: string;
}

/** yyyy-mm-dd a week from today (local time), the usual payment window */
const defaultDueDate = () => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function CreateInvoiceModal({ isOpen, onClose, preselectedPatientId }: CreateInvoiceModalProps) {
    const [invoiceForm, setInvoiceForm] = useState({
        patientId: preselectedPatientId || '',
        dueDate: defaultDueDate(),
        items: [{ description: '', quantity: 1, unitPrice: 0 }],
        notes: ''
    });

    const patients = useQuery(api.patients.getMyPatients, { limit: 100 });
    const createInvoice = useMutation(api.billing.createInvoice);
    // Optional: the visit this payment is for (recent and upcoming visits with the chosen patient)
    const [appointmentId, setAppointmentId] = useState('');
    const [visitWindowStart] = useState(() => Date.now() - 60 * 24 * 60 * 60 * 1000);
    const myAppointments = useQuery(
        api.appointments.getMyAppointments,
        isOpen && invoiceForm.patientId ? { startDate: visitWindowStart, limit: 200 } : 'skip'
    ) as { _id: string; patientId: string; startTime: number; status: string; appointmentType?: string }[] | undefined;
    const patientVisits = (myAppointments ?? [])
        .filter((a) => a.patientId === invoiceForm.patientId && !String(a.status).startsWith('cancelled'))
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, 20);

    const handleCreateInvoice = useCallback(async () => {
        if (!invoiceForm.patientId || invoiceForm.items.some(item => !item.description || item.unitPrice <= 0)) {
            toast.error('Please fill in all required fields');
            return;
        }
        // End of the chosen day, local time; a blank or unreadable date is never sent
        const dueDate = new Date(`${invoiceForm.dueDate}T23:59:59`).getTime();
        if (!invoiceForm.dueDate || !Number.isFinite(dueDate)) {
            toast.error('Pick a due date');
            return;
        }

        try {
            await createInvoice({
                patientId: invoiceForm.patientId as Id<"users">,
                dueDate,
                items: invoiceForm.items.map(item => ({
                    ...item,
                    totalPrice: item.quantity * item.unitPrice
                })),
                appointmentIds: appointmentId ? [appointmentId as Id<'appointments'>] : [],
                discountAmount: 0,
                notes: invoiceForm.notes
            });

            toast.success('Invoice created successfully');
            setAppointmentId('');
            onClose();
            // Reset form but keep patient if preselected
            setInvoiceForm({
                patientId: preselectedPatientId || '',
                dueDate: defaultDueDate(),
                items: [{ description: '', quantity: 1, unitPrice: 0 }],
                notes: ''
            });
        } catch (error) {
            toast.error(programError(error, 'Failed to create invoice'));
            console.error('Create invoice error:', error);
        }
    }, [invoiceForm, createInvoice, onClose, preselectedPatientId, appointmentId]);

    const addInvoiceItem = useCallback(() => {
        setInvoiceForm(prev => ({
            ...prev,
            items: [...prev.items, { description: '', quantity: 1, unitPrice: 0 }]
        }));
    }, []);

    const removeInvoiceItem = useCallback((index: number) => {
        setInvoiceForm(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    }, []);

    const updateInvoiceItem = useCallback((index: number, field: string, value: string | number) => {
        setInvoiceForm(prev => ({
            ...prev,
            items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item)
        }));
    }, []);

    const subtotal = invoiceForm.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    // Same sums as billing.createInvoice: an independent physio's patient pays the ₦1,000 service fee
    // and Paystack's 1.5% + ₦100 on top; a clinic's patient pays the quoted price (fees come off it)
    const me = useQuery(api.users.getMyUser) as { clinicId?: string } | null | undefined;
    const billsThroughClinic = Boolean(me?.clinicId);
    const platformFee = billsThroughClinic ? 0 : 1000;
    const processingFee = billsThroughClinic || subtotal <= 0 ? 0 : Math.round((subtotal + platformFee) * 0.015 * 100) / 100 + 100;
    const total = subtotal + platformFee + processingFee;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader className="space-y-3 pb-4 border-b">
                    <DialogTitle className="text-2xl font-semibold">Create New Invoice</DialogTitle>
                    <DialogDescription className="text-base">
                        Create and send an invoice to a patient. Platform fees are calculated automatically.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-1 py-6 space-y-6">
                    {/* Patient and Due Date */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Patient *</label>
                            <Select
                                value={invoiceForm.patientId}
                                onValueChange={(value) => setInvoiceForm(prev => ({ ...prev, patientId: value }))}
                                disabled={!!preselectedPatientId}
                            >
                                <SelectTrigger className="h-11">
                                    <SelectValue placeholder="Select a patient" />
                                </SelectTrigger>
                                <SelectContent>
                                    {patients?.map((patient: Patient) => (
                                        <SelectItem key={patient._id} value={patient._id}>
                                            {patient?.firstName || 'Unknown'} {patient?.lastName || 'Patient'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Due Date *</label>
                            <Input
                                type="date"
                                className="h-11"
                                value={invoiceForm.dueDate}
                                onChange={(e) => setInvoiceForm(prev => ({ ...prev, dueDate: e.target.value }))}
                                min={new Date().toISOString().split('T')[0]}
                            />
                        </div>
                    </div>

                    {invoiceForm.patientId && patientVisits.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">For which visit? (optional)</label>
                            <Select value={appointmentId || 'none'} onValueChange={(value) => setAppointmentId(value === 'none' ? '' : value)}>
                                <SelectTrigger className="h-11">
                                    <SelectValue placeholder="Not linked to a visit" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Not linked to a visit</SelectItem>
                                    {patientVisits.map((visit) => (
                                        <SelectItem key={visit._id} value={visit._id}>
                                            {new Date(visit.startTime).toLocaleString('en-NG', {
                                                timeZone: 'Africa/Lagos',
                                                weekday: 'short',
                                                day: 'numeric',
                                                month: 'short',
                                                hour: 'numeric',
                                                minute: '2-digit',
                                            })}
                                            {visit.appointmentType ? ` · ${visit.appointmentType.replace(/[_-]/g, ' ')}` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Invoice Items */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700">Invoice Items *</label>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={addInvoiceItem}
                                className="h-9 gap-1.5"
                            >
                                <Plus className="h-4 w-4" />
                                Add Item
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {invoiceForm.items.map((item, index) => (
                                <div key={index} className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
                                    <div className="grid grid-cols-12 gap-3">
                                        <div className="col-span-6">
                                            <Input
                                                placeholder="Description (e.g., Physiotherapy Session)"
                                                value={item.description}
                                                onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                                                className="h-10"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <Input
                                                type="number"
                                                placeholder="Qty"
                                                value={item.quantity}
                                                min="1"
                                                onChange={(e) => updateInvoiceItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                                className="h-10"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <Input
                                                type="number"
                                                placeholder="Price (₦)"
                                                value={item.unitPrice}
                                                min="0"
                                                onChange={(e) => updateInvoiceItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                                                className="h-10"
                                            />
                                        </div>
                                        <div className="col-span-1 flex items-center justify-center">
                                            {invoiceForm.items.length > 1 && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => removeInvoiceItem(index)}
                                                    className="h-10 w-10 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                        <span className="text-sm text-gray-600">Item Total</span>
                                        <span className="text-base font-semibold text-gray-900">
                                            ₦{(item.quantity * item.unitPrice).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Calculation Summary */}
                    <div className="bg-neutral-50 rounded-xl p-5 border border-neutral-200 dark:bg-neutral-950 dark:border-neutral-800 space-y-3">
                        <div className="flex justify-between items-center text-base">
                            <span className="text-gray-700">Subtotal</span>
                            <span className="font-medium text-gray-900">₦{subtotal.toLocaleString()}</span>
                        </div>

                        {billsThroughClinic ? (
                            <div className="text-xs text-gray-500 bg-white/60 rounded px-3 py-2">
                                This is billed through your clinic: the patient pays the amount above and the
                                clinic&apos;s fee split applies.
                            </div>
                        ) : (
                            <>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-600">Rehabify service fee (paid by patient)</span>
                                    <span className="font-medium text-gray-700">₦{platformFee.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-600">Payment processing (paid by patient)</span>
                                    <span className="font-medium text-gray-700">₦{processingFee.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="text-xs text-gray-500 bg-white/60 rounded px-3 py-2">
                                    You receive the subtotal. The patient sees the same total on their invoice.
                                </div>
                            </>
                        )}

                        <div className="flex justify-between items-center pt-3 border-t border-green-300">
                            <span className="text-lg font-semibold text-gray-900">Patient pays</span>
                            <span className="text-2xl font-bold text-green-600">₦{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Notes (Optional)</label>
                        <textarea
                            className="flex min-h-[100px] w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                            placeholder="Add any additional notes or payment terms..."
                            value={invoiceForm.notes}
                            onChange={(e) => setInvoiceForm(prev => ({ ...prev, notes: e.target.value }))}
                        />
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-3 pt-6 border-t">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="px-6"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreateInvoice}
                        className="bg-green-600 hover:bg-green-700 text-white px-8"
                    >
                        Create Invoice
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
