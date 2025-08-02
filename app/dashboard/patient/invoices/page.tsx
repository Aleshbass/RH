'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Receipt, 
  DollarSign, 
  AlertTriangle,
  Eye,
  Share2,
  Download,
  CreditCard,
  Clock,
  Copy,
  ExternalLink
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface Invoice {
  _id: Id<"invoices">
  invoiceNumber: string
  clinicName?: string
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }>
  subtotalAmount: number
  discountAmount?: number
  platformFeeAmount: number
  totalAmount: number
  status: string
  issueDate: number
  dueDate: number
  notes?: string
  isOverdue: boolean
  canPay: boolean
  currency: string
  paymentMethod?: string
  paymentDate?: number
}

export default function PatientInvoicesPage() {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  
  // Queries
  const invoices = useQuery(api.billing.getPatientInvoices, { limit: 50 }) as Invoice[] | undefined
  
  // Mutations
  const processPayment = useMutation(api.billing.processPayment)
  
  // Calculate summary stats
  const stats = {
    total: invoices?.length || 0,
    pending: invoices?.filter(inv => inv.status === 'sent').length || 0,
    overdue: invoices?.filter(inv => inv.isOverdue).length || 0,
    paid: invoices?.filter(inv => inv.status === 'paid').length || 0,
    totalPending: invoices?.filter(inv => inv.status === 'sent').reduce((sum, inv) => sum + inv.totalAmount, 0) || 0,
  }
  
  const getStatusBadge = (status: string, isOverdue: boolean) => {
    if (status === 'paid') {
      return <Badge className="bg-green-100 text-green-800">Paid</Badge>
    }
    if (isOverdue && status !== 'paid') {
      return <Badge className="bg-red-100 text-red-800">Overdue</Badge>
    }
    if (status === 'sent') {
      return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
    }
    return <Badge variant="secondary">{status}</Badge>
  }
  
  const formatCurrency = (amount: number, currency: string = 'NGN') => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency,
    }).format(amount / 100) // Convert from kobo to naira
  }
  
  const handlePayment = async () => {
    if (!selectedInvoice || !paymentMethod) {
      toast.error('Please select a payment method')
      return
    }
    
    setIsProcessingPayment(true)
    try {
      const result = await processPayment({
        invoiceId: selectedInvoice._id,
        paymentMethod,
        paymentReference: `PAY-${Date.now()}-${selectedInvoice.invoiceNumber}`,
      })
      
      if (result.success) {
        toast.success('Payment processed successfully!')
        setIsPaymentModalOpen(false)
        setSelectedInvoice(null)
        setPaymentMethod('')
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error('Failed to process payment')
      console.error('Payment error:', error)
    } finally {
      setIsProcessingPayment(false)
    }
  }
  
  const shareInvoice = (invoice: Invoice) => {
    const shareUrl = `${window.location.origin}/invoices/shared/${invoice._id}`
    navigator.clipboard.writeText(shareUrl)
    toast.success('Invoice link copied to clipboard!')
    setShareModalOpen(false)
  }
  
  const downloadInvoice = () => {
    // This would integrate with a PDF generation service
    toast.info('PDF download feature coming soon')
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Invoices</h1>
          <p className="text-gray-600">Manage your billing and payment history</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Invoices</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <Receipt className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Payment</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Pending</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(stats.totalPending)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoices List */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {invoices && invoices.length > 0 ? (
              invoices.map((invoice) => (
                <div key={invoice._id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Receipt className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-gray-900">#{invoice.invoiceNumber}</h3>
                          {getStatusBadge(invoice.status, invoice.isOverdue)}
                        </div>
                        <p className="text-sm text-gray-600">{invoice.clinicName}</p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                          <span>Issued: {format(new Date(invoice.issueDate), 'MMM d, yyyy')}</span>
                          <span>Due: {format(new Date(invoice.dueDate), 'MMM d, yyyy')}</span>
                          {invoice.paymentDate && (
                            <span>Paid: {format(new Date(invoice.paymentDate), 'MMM d, yyyy')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(invoice.totalAmount, invoice.currency)}
                        </p>
                        {invoice.paymentMethod && (
                          <p className="text-xs text-gray-500">via {invoice.paymentMethod}</p>
                        )}
                      </div>
                      
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedInvoice(invoice)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedInvoice(invoice)
                            setShareModalOpen(true)
                          }}
                        >
                          <Share2 className="w-4 h-4 mr-1" />
                          Share
                        </Button>
                        
                        {invoice.canPay && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedInvoice(invoice)
                              setIsPaymentModalOpen(true)
                            }}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CreditCard className="w-4 h-4 mr-1" />
                            Pay Now
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices yet</h3>
                <p className="text-gray-600">You don&apos;t have any invoices at the moment.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoice Details Modal */}
      {selectedInvoice && !isPaymentModalOpen && !shareModalOpen && (
        <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Receipt className="w-5 h-5" />
                <span>Invoice #{selectedInvoice.invoiceNumber}</span>
                {getStatusBadge(selectedInvoice.status, selectedInvoice.isOverdue)}
              </DialogTitle>
              <DialogDescription>
                {selectedInvoice.clinicName} • Issued on {format(new Date(selectedInvoice.issueDate), 'MMMM d, yyyy')}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Invoice Items */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Services</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedInvoice.items.map((item, index) => (
                        <tr key={index}>
                          <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">{item.quantity}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">
                            {formatCurrency(item.unitPrice, selectedInvoice.currency)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">
                            {formatCurrency(item.totalPrice, selectedInvoice.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Invoice Summary */}
              <div className="border-t pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(selectedInvoice.subtotalAmount, selectedInvoice.currency)}</span>
                  </div>
                  {selectedInvoice.discountAmount && selectedInvoice.discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount:</span>
                      <span>-{formatCurrency(selectedInvoice.discountAmount, selectedInvoice.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span>Platform Fee:</span>
                    <span>{formatCurrency(selectedInvoice.platformFeeAmount, selectedInvoice.currency)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span>{formatCurrency(selectedInvoice.totalAmount, selectedInvoice.currency)}</span>
                  </div>
                </div>
              </div>
              
              {/* Payment Info */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Due Date:</span>
                    <p className={`${selectedInvoice.isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                      {format(new Date(selectedInvoice.dueDate), 'MMMM d, yyyy')}
                    </p>
                  </div>
                  {selectedInvoice.paymentDate && (
                    <div>
                      <span className="font-medium text-gray-700">Paid On:</span>
                      <p className="text-green-600">{format(new Date(selectedInvoice.paymentDate), 'MMMM d, yyyy')}</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Notes */}
              {selectedInvoice.notes && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Notes</h4>
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{selectedInvoice.notes}</p>
                </div>
              )}
              
              {/* Actions */}
              <div className="flex space-x-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => downloadInvoice()}
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => {
                    setShareModalOpen(true)
                  }}
                  className="flex-1"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share Invoice
                </Button>
                
                {selectedInvoice.canPay && (
                  <Button
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Pay Now
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedInvoice && (
        <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pay Invoice #{selectedInvoice.invoiceNumber}</DialogTitle>
              <DialogDescription>
                Total amount: {formatCurrency(selectedInvoice.totalAmount, selectedInvoice.currency)}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="card">Credit/Debit Card</SelectItem>
                    <SelectItem value="paystack">Paystack</SelectItem>
                    <SelectItem value="cash">Cash Payment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handlePayment}
                  disabled={isProcessingPayment || !paymentMethod}
                  className="flex-1"
                >
                  {isProcessingPayment ? 'Processing...' : 'Process Payment'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Share Modal */}
      {shareModalOpen && selectedInvoice && (
        <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share Invoice</DialogTitle>
              <DialogDescription>
                Share this invoice with others using the link below
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="shareUrl">Shareable Link</Label>
                <div className="flex space-x-2">
                  <Input
                    id="shareUrl"
                    value={`${window.location.origin}/invoices/shared/${selectedInvoice._id}`}
                    readOnly
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => shareInvoice(selectedInvoice)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setShareModalOpen(false)}
                  className="flex-1"
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    window.open(`${window.location.origin}/invoices/shared/${selectedInvoice._id}`, '_blank')
                  }}
                  className="flex-1"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in New Tab
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
} 