'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Receipt,
  DollarSign,
  Plus,
  Download,
  Search,
  AlertTriangle,
  FileText,
  Eye,
  Send,
  CreditCard,
  Building2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Id } from '@/convex/_generated/dataModel';
import { Patient } from '@/app/types';

// Simple type definition to avoid complex inference

// Import billing components
import { SimpleInvoiceModal } from '@/components/billing/SimpleInvoiceModal';
import { BankAccountConnection } from '@/components/billing/BankAccountConnection';

// Type definitions


interface BillingStats {
  totalRevenue: number;
  invoicesSent: number;
  outstandingAmount: number;
  overdueInvoices: number;
}

type InvoiceFromQuery = {
  _id: Id<"invoices">;
  invoiceNumber: string;
  patientName: string;
  totalAmount: number;
  currency: string;
  status: "draft" | "pending" | "sent" | "paid" | "overdue" | "void" | "partial_payment";
  issueDate: number;
  dueDate: number;
  paymentDate?: number;
  isOverdue: boolean;
};

// Type definitions
// Type definitions

// Custom hook for data fetching - optimizations have resolved deep instantiation issues
function useBillingData() {
  const patients = useQuery(api.patients.getMyPatients, { limit: 100 });
  const invoices = useQuery(api.billing.getMyInvoices, {});
  const billingStats = useQuery(api.billing.getBillingStats, {});

  return { patients, invoices, billingStats };
}

interface BankAccount { isDefault?: boolean; accountName?: string }

export default function BillingPage() {
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceFromQuery | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [invoiceForm, setInvoiceForm] = useState({
    patientId: '',
    dueDate: '',
    items: [{ description: '', quantity: 1, unitPrice: 0 }],
    notes: '',
    discountAmount: 0,
    taxRate: 0
  });

  const { patients, invoices, billingStats } = useBillingData() as {
    patients: Patient[] | undefined;
    invoices: InvoiceFromQuery[] | undefined;
    billingStats: BillingStats | undefined;
  };
  // Connected payout account status
  const bankAccounts = useQuery(api.flutterwave.getMyBankAccounts as never);
  const accounts: BankAccount[] = Array.isArray(bankAccounts) ? (bankAccounts as unknown as BankAccount[]) : [];
  const defaultAccount: BankAccount | undefined = accounts.find((a) => a?.isDefault) || accounts[0];

  // Mutations
  const createInvoice = useMutation(api.billing.createInvoice);
  const sendInvoice = useMutation(api.billing.sendInvoice);
  const recordPayment = useMutation(api.billing.recordPayment);
  const generateInvoicePDF = useMutation(api.billing.generateInvoicePDF);
  // initiateLoan mutation removed — logging is handled server-side in /api/myitura/initiate

  const [isInitiatingLoan, setIsInitiatingLoan] = useState(false);

  const filteredInvoices = useMemo(() => {
    return invoices?.filter((invoice: InvoiceFromQuery) => {
      const patientName = invoice.patientName.toLowerCase();

      const matchesSearch =
        invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patientName.includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [invoices, searchTerm, statusFilter]);

  const handleCreateInvoice = useCallback(async () => {
    if (!invoiceForm.patientId || invoiceForm.items.some(item => !item.description || item.unitPrice <= 0)) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await createInvoice({
        patientId: invoiceForm.patientId as Id<"users">,
        dueDate: new Date(invoiceForm.dueDate).getTime(),
        items: invoiceForm.items.map(item => ({
          ...item,
          totalPrice: item.quantity * item.unitPrice
        })),
        appointmentIds: [],
        discountAmount: invoiceForm.discountAmount,
        notes: invoiceForm.notes
      });

      toast.success('Invoice created successfully');
      setIsCreateModalOpen(false);
      setInvoiceForm({
        patientId: '',
        dueDate: '',
        items: [{ description: '', quantity: 1, unitPrice: 0 }],
        notes: '',
        discountAmount: 0,
        taxRate: 0
      });
    } catch (error) {
      toast.error('Failed to create invoice');
      console.error('Create invoice error:', error);
    }
  }, [invoiceForm, createInvoice]);

  const handleSendInvoice = useCallback(async (invoiceId: Id<"invoices">) => {
    try {
      await sendInvoice({ invoiceId: invoiceId });
      toast.success('Invoice sent successfully');
    } catch (error) {
      toast.error('Failed to send invoice');
      console.error('Send invoice error:', error);
    }
  }, [sendInvoice]);

  const handleRecordPayment = useCallback(async (invoiceId: Id<"invoices">, amount: number, method: string) => {
    try {
      await recordPayment({
        invoiceId: invoiceId,
        paymentAmount: Math.round(amount * 100), // Convert to kobo
        paymentMethod: method,
        paymentReference: `PAY-${Date.now()}`,
        notes: 'Payment recorded via dashboard'
      });
      toast.success('Payment recorded successfully');
    } catch (error) {
      toast.error('Failed to record payment');
      console.error('Record payment error:', error);
    }
  }, [recordPayment]);

  const handleDownloadPDF = useCallback(async (invoiceId: Id<"invoices">) => {
    try {
      const result = await generateInvoicePDF({ invoiceId });
      if (result.pdfUrl) {
        window.open(result.pdfUrl, '_blank');
      } else {
        toast.error('PDF URL not found in response.');
      }
    } catch (error) {
      toast.error('Failed to download invoice PDF');
      console.error('Download PDF error:', error);
    }
  }, [generateInvoicePDF]);

  const handleInitiateMediLoan = useCallback(async (invoice: InvoiceFromQuery) => {
    setIsInitiatingLoan(true);
    try {
      // Match patient by ID first, then fall back to normalized name comparison
      const activePatient = patients?.find(p => {
        if ((invoice as any).patientId && p._id === (invoice as any).patientId) return true;
        const pName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim().toLowerCase();
        const iName = (invoice.patientName ?? '').trim().toLowerCase();
        return pName.length > 0 && pName === iName;
      });

      // Validate phone number before calling external API
      const phoneNumber = (invoice as any).patientPhone || (activePatient as any)?.phone || (activePatient as any)?.phoneNumber || '';
      if (!phoneNumber) {
        toast.error('Patient phone number is required to initiate MediLoan. Please update the patient profile.');
        setIsInitiatingLoan(false);
        return;
      }

      const response = await fetch('/api/myitura/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: activePatient?._id || undefined,
          firstName: activePatient?.firstName || invoice.patientName.split(' ')[0],
          lastName: activePatient?.lastName || invoice.patientName.split(' ').slice(1).join(' ') || 'Patient',
          email: (invoice as any).patientEmail || activePatient?.email || undefined,
          phoneNumber,
          treatment: invoice.invoiceNumber ? `Invoice ${invoice.invoiceNumber}` : 'General Physiotherapy',
          treatmentAmount: invoice.totalAmount, // Already in kobo
          invoiceReference: invoice.invoiceNumber || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to initiate MediLoan');
      }

      toast.success(
        `MediLoan initiated! SMS sent to patient. Ref: ${data.data.sdkReference}`,
        { duration: 6000 }
      );
    } catch (error: any) {
      toast.error("Failed to initiate loan: " + error.message);
    } finally {
      setIsInitiatingLoan(false);
    }
  }, [patients]);

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

  const getStatusBadge = useCallback((status: string, isOverdue?: boolean) => {
    if (isOverdue && status !== 'paid') {
      return <Badge variant="destructive">Overdue</Badge>;
    }
    switch (status) {
      case 'paid': return <Badge variant="default" className="bg-green-500 text-white">Paid</Badge>;
      case 'pending': return <Badge variant="secondary" className="bg-blue-500 text-white">Pending</Badge>;
      case 'sent': return <Badge variant="secondary">Sent</Badge>;
      case 'partial_payment': return <Badge variant="secondary" className="bg-yellow-500 text-white">Partial</Badge>;
      case 'overdue': return <Badge variant="destructive">Overdue</Badge>;
      case 'draft': return <Badge variant="outline">Draft</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  }, []);

  const formatCurrency = useCallback((amount: number, currency = 'NGN') => {
    return (amount / 100).toLocaleString('en-NG', { style: 'currency', currency });
  }, []);

  if (!patients || !invoices || !billingStats) {
    return <div>Loading...</div>; // Or a skeleton loader
  }

  const handleRowClick = (invoice: InvoiceFromQuery) => {
    const fullInvoiceDetails = {
      ...invoice,
      // We don't have this from the list view, so we'll pass what we have
      patient: {
        firstName: invoice.patientName.split(' ')[0],
        lastName: invoice.patientName.split(' ').slice(1).join(' '),
      },
      patientEmail: (invoice as InvoiceFromQuery & { patientEmail?: string }).patientEmail,
      patientPhone: (invoice as InvoiceFromQuery & { patientPhone?: string }).patientPhone,
    };
    setSelectedInvoice(fullInvoiceDetails);
    setIsInvoiceModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Billing & Invoices</h1>
          <p className="text-muted-foreground">
            Manage invoices, track payments, and handle billing
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Building2 className="mr-2 h-4 w-4" />
                {defaultAccount ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
                    {defaultAccount?.accountName || 'Account Connected'}
                  </span>
                ) : (
                  'Bank Account'
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Connect Bank Account</DialogTitle>
                <DialogDescription>
                  Connect or update your payout account to receive funds from patient payments. You can remove or replace your account anytime.
                </DialogDescription>
              </DialogHeader>
              <BankAccountConnection />
            </DialogContent>
          </Dialog>
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Invoice
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Invoice</DialogTitle>
                <DialogDescription>
                  Create and send an invoice to a patient. Platform fees and Paystack fees are calculated automatically at checkout.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Patient *</label>
                    <Select
                      value={invoiceForm.patientId}
                      onValueChange={(value) => setInvoiceForm(prev => ({ ...prev, patientId: value }))}
                    >
                      <SelectTrigger>
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

                  <div>
                    <label className="text-sm font-medium">Due Date *</label>
                    <Input
                      type="date"
                      value={invoiceForm.dueDate}
                      onChange={(e) => setInvoiceForm(prev => ({ ...prev, dueDate: e.target.value }))}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>

                {/* Invoice Items */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium">Invoice Items *</label>
                    <Button size="sm" variant="outline" onClick={addInvoiceItem}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Item
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {invoiceForm.items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5">
                          <Input
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => updateInvoiceItem(index, 'quantity', parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div className="col-span-3">
                          <Input
                            type="number"
                            placeholder="Unit Price (₦)"
                            value={item.unitPrice}
                            onChange={(e) => updateInvoiceItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-2 flex items-center justify-between">
                          <span className="text-sm font-medium">
                            ₦{(item.quantity * item.unitPrice).toLocaleString()}
                          </span>
                          {invoiceForm.items.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeInvoiceItem(index)}
                              className="h-6 w-6 p-0 text-red-500"
                            >
                              ×
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals and Tax */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Tax Rate (%)</label>
                    <Input
                      type="number"
                      value={invoiceForm.taxRate}
                      onChange={(e) => setInvoiceForm(prev => ({ ...prev, taxRate: parseFloat(e.target.value) || 0 }))}
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Discount (₦)</label>
                    <Input
                      type="number"
                      value={invoiceForm.discountAmount}
                      onChange={(e) => setInvoiceForm(prev => ({ ...prev, discountAmount: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                {/* Calculation Summary */}
                <div className="border-t pt-4">
                  {(() => {
                    const subtotal = invoiceForm.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
                    const taxAmount = subtotal * (invoiceForm.taxRate / 100);
                    const total = subtotal + taxAmount - invoiceForm.discountAmount;

                    return (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span>₦{subtotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tax ({invoiceForm.taxRate}%):</span>
                          <span>₦{taxAmount.toLocaleString()}</span>
                        </div>
                        {invoiceForm.discountAmount > 0 && (
                          <div className="flex justify-between">
                            <span>Discount:</span>
                            <span>-₦{invoiceForm.discountAmount.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm text-blue-600 bg-blue-50 p-2 rounded">
                          <span>Platform Fee:</span>
                          <span>₦1,000</span>
                        </div>
                        <div className="text-xs text-gray-500 px-2">
                          Platform fee includes payment processing and secure hosting
                        </div>
                        <div className="flex justify-between font-bold text-base border-t pt-2">
                          <span>Total (incl. platform fee):</span>
                          <span>₦{(total + 1000).toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="text-sm font-medium">Notes</label>
                  <textarea
                    placeholder="Additional notes or payment terms..."
                    value={invoiceForm.notes}
                    onChange={(e) => setInvoiceForm(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateInvoice}>
                    Create Invoice
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {billingStats ? formatCurrency(billingStats.totalRevenue || 0) : '₦0'}
            </div>
            <p className="text-xs text-muted-foreground">
              This month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {billingStats ? formatCurrency(billingStats.outstandingAmount || 0) : '₦0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Unpaid invoices
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {billingStats ? formatCurrency(billingStats.overdueInvoices || 0) : '₦0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Past due date
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {invoices?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Total invoices
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices by number or patient name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="sm:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                  <SelectItem value="partial_payment">Partial Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Invoices List */}
          <div className="space-y-3">
            {filteredInvoices && filteredInvoices.length > 0 ? (
              filteredInvoices.map((invoice: InvoiceFromQuery) => (
                <div key={invoice._id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                      <Receipt className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">#{invoice.invoiceNumber}</p>
                        {getStatusBadge(invoice.status, invoice.isOverdue)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {invoice.patientName || 'Unknown Patient'}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Issued: {format(new Date(invoice.issueDate), 'MMM d, yyyy, h:mm a')}</span>
                        <span>Due: {format(new Date(invoice.dueDate), 'MMM d, yyyy, h:mm a')}</span>
                        <span className="font-medium">{formatCurrency(invoice.totalAmount, invoice.currency)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRowClick(invoice)}
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadPDF(invoice._id)}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    {invoice.status === 'draft' && (
                      <Button
                        size="sm"
                        onClick={() => handleSendInvoice(invoice._id)}
                      >
                        <Send className="h-3 w-3 mr-1" />
                        Send
                      </Button>
                    )}
                    {(invoice.status === 'pending' || invoice.status === 'sent' || invoice.status === 'overdue') && (
                      <Button
                        size="sm"
                        onClick={() => handleRecordPayment(invoice._id, invoice.totalAmount / 100, 'bank_transfer')}
                      >
                        <CreditCard className="h-3 w-3 mr-1" />
                        Record Payment
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No invoices found</p>
                <p className="text-sm">Create your first invoice to get started</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <SimpleInvoiceModal
          isOpen={isInvoiceModalOpen && selectedInvoice !== null}
          selectedInvoice={selectedInvoice}
          onClose={() => {
            setIsInvoiceModalOpen(false);
            setSelectedInvoice(null);
          }}
          onSend={async () => handleSendInvoice(selectedInvoice._id)}
          onRecordPayment={async (amount: number, method: string) => handleRecordPayment(selectedInvoice._id, amount, method)}
          onDownload={async () => handleDownloadPDF(selectedInvoice._id)}
          onInitiateMediLoan={handleInitiateMediLoan as any}
          isInitiatingLoan={isInitiatingLoan}
        />
      )}
    </div>
  );
} 