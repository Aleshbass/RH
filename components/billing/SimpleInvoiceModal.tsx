'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// Remove formatCurrency import since we'll define our own
import { format } from 'date-fns';
import {
  Send,
  CreditCard,
  Download,
  X,
  Calendar,
  User,
  Mail,
  Phone,
  WalletCards
} from '@/components/icons';

// Types used in this modal
interface InvoiceItem {
  description?: string;
  name?: string;
  quantity: number;
  unitPrice?: number;
  amount?: number;
  total?: number;
}

interface Invoice {
  _id?: string;
  invoiceNumber?: string;
  patientName?: string;
  patientEmail?: string;
  patientPhone?: string;
  patient?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
  } | null;
  issueDate?: number;
  dueDate?: number | string;
  status: 'paid' | 'pending' | 'sent' | 'overdue' | 'draft' | string;
  totalAmount?: number;
  subtotal?: number;
  subtotalAmount?: number;
  platformFee?: number;
  platformFeeAmount?: number;
  discountAmount?: number;
  items?: InvoiceItem[];
}

interface SimpleInvoiceModalProps {
  isOpen: boolean;
  selectedInvoice: Invoice | null;
  onClose: () => void;
  onSend: () => void;
  onRecordPayment: (amount: number, method: string) => void;
  onDownload: () => void;
  onInitiateMediLoan?: (invoice: Invoice) => void;
  isInitiatingLoan?: boolean;
}

export function SimpleInvoiceModal({
  isOpen,
  selectedInvoice,
  onClose,
  onSend,
  onRecordPayment,
  onDownload,
  onInitiateMediLoan,
  isInitiatingLoan
}: SimpleInvoiceModalProps) {
  if (!selectedInvoice) return null;

  // Format currency in Naira
  const formatCurrency = (amount: number) => {
    return `₦${(amount / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-blue-100 text-blue-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-start">
            <div>
              <DialogTitle className="text-2xl">Invoice Details</DialogTitle>
              <p className="text-muted-foreground">View and manage invoice #{selectedInvoice.invoiceNumber || selectedInvoice._id?.slice(-6)}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Invoice Header */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedInvoice.patientName || `${selectedInvoice.patient?.firstName || ''} ${selectedInvoice.patient?.lastName || ''}`.trim() || 'Patient'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedInvoice.patientEmail || selectedInvoice.patient?.email || 'Email not available'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedInvoice.patientPhone || selectedInvoice.patient?.phoneNumber || 'Phone not available'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Issued: {selectedInvoice.issueDate ? format(new Date(selectedInvoice.issueDate), 'MMM dd, yyyy, h:mm a') : 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Due: {selectedInvoice.dueDate ? format(new Date(selectedInvoice.dueDate), 'MMM dd, yyyy, h:mm a') : 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Status:</span>
                    <Badge className={getStatusColor(selectedInvoice.status)}>
                      {selectedInvoice.status}
                    </Badge>
                  </div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(selectedInvoice.totalAmount || 0)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Invoice Items */}
          <Card>
            <CardHeader>
              <CardTitle>Services</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {selectedInvoice.items?.map((item: InvoiceItem, index: number) => (
                  <div key={index} className="flex justify-between items-center border-b pb-3">
                    <div>
                      <p className="font-medium">{item.description || item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.quantity} × {formatCurrency((item.unitPrice ?? item.amount ?? 0))}
                      </p>
                    </div>
                    <div className="font-medium">
                      {formatCurrency(item.total ?? (item.quantity * (item.unitPrice ?? item.amount ?? 0)))}
                    </div>
                  </div>
                ))}

                <div className="pt-4 space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(selectedInvoice.subtotalAmount ?? selectedInvoice.subtotal ?? (selectedInvoice.totalAmount ?? 0))}</span>
                  </div>
                  {(selectedInvoice.discountAmount ?? 0) > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount:</span>
                      <span>-{formatCurrency(selectedInvoice.discountAmount ?? 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Platform Fee:</span>
                    <span>{formatCurrency(selectedInvoice.platformFeeAmount ?? selectedInvoice.platformFee ?? 100000)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t">
                    <span>Total:</span>
                    <span>{formatCurrency(selectedInvoice.totalAmount || 0)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 justify-end pt-4">
            <Button variant="outline" onClick={onDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>

            {selectedInvoice.status === 'draft' && (
              <Button onClick={onSend}>
                <Send className="h-4 w-4 mr-2" />
                Send Invoice
              </Button>
            )}

            {(selectedInvoice.status === 'pending' || selectedInvoice.status === 'sent' || selectedInvoice.status === 'overdue') && (
              <>
                {onInitiateMediLoan && (
                  <Button
                    variant="outline"
                    className="border-green-600 text-green-700 hover:bg-green-50"
                    onClick={() => onInitiateMediLoan(selectedInvoice)}
                    disabled={isInitiatingLoan}
                  >
                    <WalletCards className="h-4 w-4 mr-2" />
                    {isInitiatingLoan ? 'Initiating...' : 'Initiate MediLoan'}
                  </Button>
                )}
                <Button onClick={() => onRecordPayment((selectedInvoice.totalAmount || 0) / 100, 'bank_transfer')}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Record Payment
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
