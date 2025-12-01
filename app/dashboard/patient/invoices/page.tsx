'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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
  ExternalLink,
  CheckCircle2,
  ChevronRight,
  FileText,
  Wallet
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { usePaystackCheckout } from '@/components/billing/PaystackCheckout'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

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
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const { initializePayment } = usePaystackCheckout()

  // Queries
  const invoices = useQuery(api.billing.getPatientInvoices, { limit: 50 }) as Invoice[] | undefined

  // Mutations
  const generateInvoicePDF = useMutation(api.billing.generateInvoicePDF)

  // Calculate summary stats
  const stats = {
    total: invoices?.length || 0,
    pending: invoices?.filter(inv => inv.status === 'pending' || inv.status === 'sent').length || 0,
    overdue: invoices?.filter(inv => inv.isOverdue).length || 0,
    paid: invoices?.filter(inv => inv.status === 'paid').length || 0,
    totalPending: invoices?.filter(inv => inv.status === 'pending' || inv.status === 'sent').reduce((sum, inv) => sum + inv.totalAmount, 0) || 0,
  }

  const getStatusBadge = (status: string, isOverdue: boolean) => {
    if (status === 'paid') {
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Paid</Badge>
    }
    if (isOverdue && status !== 'paid') {
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">Overdue</Badge>
    }
    if (status === 'pending' || status === 'sent') {
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">Pending</Badge>
    }
    return <Badge variant="outline" className="text-gray-600">{status}</Badge>
  }

  const formatCurrency = (amount: number, currency: string = 'NGN') => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency,
    }).format(amount / 100) // Convert from kobo to naira
  }

  const handlePayNow = async (invoice: Invoice) => {
    setIsProcessingPayment(true)
    try {
      await initializePayment(invoice._id)
      // Paystack will redirect to their checkout page
    } catch (error) {
      toast.error('Failed to initialize payment')
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

  const downloadInvoice = async () => {
    if (!selectedInvoice) return

    try {
      const result = await generateInvoicePDF({ invoiceId: selectedInvoice._id })
      if (result.pdfUrl) {
        window.open(result.pdfUrl, '_blank')
        toast.success('PDF generated successfully')
      }
    } catch {
      toast.error('Failed to send reminder')
    }
  }

  const StatCard = ({ title, value, icon: Icon, colorClass, bgClass }: any) => (
    <div className="min-w-[240px] md:min-w-0 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
      <div className={cn("h-12 w-12 rounded-full flex items-center justify-center shrink-0", bgClass)}>
        <Icon className={cn("h-6 w-6", colorClass)} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-4 md:p-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Billing & Invoices</h1>
          <p className="text-gray-500">Manage payments and view history</p>
        </div>
      </div>

      {/* Stats Section - Horizontal Scroll on Mobile */}
      <div className="flex overflow-x-auto pb-4 -mx-4 px-4 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 md:mx-0 md:px-0 scrollbar-hide snap-x">
        <div className="snap-center pr-4 md:pr-0">
          <StatCard
            title="Total Due"
            value={formatCurrency(stats.totalPending)}
            icon={DollarSign}
            colorClass="text-brand"
            bgClass="bg-brand/10"
          />
        </div>
        <div className="snap-center pr-4 md:pr-0">
          <StatCard
            title="Pending"
            value={stats.pending}
            icon={Clock}
            colorClass="text-amber-600"
            bgClass="bg-amber-50"
          />
        </div>
        <div className="snap-center pr-4 md:pr-0">
          <StatCard
            title="Overdue"
            value={stats.overdue}
            icon={AlertTriangle}
            colorClass="text-red-600"
            bgClass="bg-red-50"
          />
        </div>
        <div className="snap-center">
          <StatCard
            title="Paid Invoices"
            value={stats.paid}
            icon={CheckCircle2}
            colorClass="text-green-600"
            bgClass="bg-green-50"
          />
        </div>
      </div>

      {/* Invoices List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Invoices</h2>
        </div>

        <div className="grid gap-4">
          {invoices === undefined ? (
            // Loading State
            [...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />
            ))
          ) : invoices.length === 0 ? (
            // Empty State
            <div className="text-center py-16 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
              <div className="bg-white p-4 rounded-full shadow-sm inline-block mb-4">
                <Wallet className="h-8 w-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">No invoices yet</h3>
              <p className="text-gray-500 max-w-xs mx-auto mt-2">
                When you have appointments or services, your invoices will appear here.
              </p>
            </div>
          ) : (
            // Invoice Items
            invoices.map((invoice, index) => (
              <motion.div
                key={invoice._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                      invoice.status === 'paid' ? "bg-green-50 text-green-600" :
                        invoice.isOverdue ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                    )}>
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">#{invoice.invoiceNumber}</span>
                        {getStatusBadge(invoice.status, invoice.isOverdue)}
                      </div>
                      <p className="text-sm text-gray-500">{invoice.clinicName || 'Rehabify Clinic'}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>Issued: {format(new Date(invoice.issueDate), 'MMM d, yyyy')}</span>
                        {invoice.dueDate && (
                          <span>• Due: {format(new Date(invoice.dueDate), 'MMM d, yyyy')}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-4 md:pt-0 mt-2 md:mt-0">
                    <div className="text-left md:text-right">
                      <p className="text-lg font-bold text-gray-900">
                        {formatCurrency(invoice.totalAmount, invoice.currency)}
                      </p>
                      {invoice.paymentMethod && (
                        <p className="text-xs text-gray-500">Paid via {invoice.paymentMethod}</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {((invoice.status === 'pending' || invoice.status === 'sent') || invoice.isOverdue) && (
                        <Button
                          size="sm"
                          onClick={() => handlePayNow(invoice)}
                          disabled={isProcessingPayment}
                          className="bg-gray-900 hover:bg-black text-white rounded-xl shadow-lg shadow-gray-200"
                        >
                          {isProcessingPayment ? 'Processing...' : 'Pay Now'}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedInvoice(invoice)}
                        className="rounded-xl border-gray-200"
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Invoice Details Modal */}
      <Dialog open={!!selectedInvoice && !shareModalOpen} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-0 gap-0">
          {selectedInvoice && (
            <>
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <DialogTitle className="text-xl font-bold">Invoice #{selectedInvoice.invoiceNumber}</DialogTitle>
                  {getStatusBadge(selectedInvoice.status, selectedInvoice.isOverdue)}
                </div>
                <DialogDescription>
                  {selectedInvoice.clinicName} • Issued on {format(new Date(selectedInvoice.issueDate), 'MMMM d, yyyy')}
                </DialogDescription>
              </div>

              <div className="p-6 space-y-8">
                {/* Amount Section */}
                <div className="bg-gray-50 p-6 rounded-xl text-center">
                  <p className="text-sm text-gray-500 mb-1">Total Amount</p>
                  <p className="text-4xl font-bold text-gray-900">
                    {formatCurrency(selectedInvoice.totalAmount, selectedInvoice.currency)}
                  </p>
                  {selectedInvoice.status === 'paid' && selectedInvoice.paymentDate && (
                    <div className="flex items-center justify-center gap-2 mt-2 text-sm text-green-600 font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      Paid on {format(new Date(selectedInvoice.paymentDate), 'MMM d, yyyy')}
                    </div>
                  )}
                </div>

                {/* Items */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-4">Services Breakdown</h4>
                  <div className="space-y-3">
                    {selectedInvoice.items.map((item, index) => (
                      <div key={index} className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="font-medium text-gray-900">{item.description}</p>
                          <p className="text-sm text-gray-500">{item.quantity} x {formatCurrency(item.unitPrice, selectedInvoice.currency)}</p>
                        </div>
                        <p className="font-medium text-gray-900">{formatCurrency(item.totalPrice, selectedInvoice.currency)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Subtotal</span>
                      <span>{formatCurrency(selectedInvoice.subtotalAmount, selectedInvoice.currency)}</span>
                    </div>
                    {selectedInvoice.discountAmount && selectedInvoice.discountAmount > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Discount</span>
                        <span>-{formatCurrency(selectedInvoice.discountAmount, selectedInvoice.currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Platform Fee</span>
                      <span>{formatCurrency(selectedInvoice.platformFeeAmount, selectedInvoice.currency)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-gray-900 pt-2">
                      <span>Total</span>
                      <span>{formatCurrency(selectedInvoice.totalAmount, selectedInvoice.currency)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={downloadInvoice} className="rounded-xl h-12">
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                  <Button variant="outline" onClick={() => setShareModalOpen(true)} className="rounded-xl h-12">
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </Button>
                  {selectedInvoice.canPay && (
                    <Button
                      onClick={() => handlePayNow(selectedInvoice)}
                      disabled={isProcessingPayment}
                      className="col-span-2 bg-gray-900 hover:bg-black text-white rounded-xl h-12"
                    >
                      {isProcessingPayment ? 'Processing...' : 'Pay Now'}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Modal */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Share Invoice</DialogTitle>
            <DialogDescription>
              Share this invoice via link
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4 pt-4">
              <div className="flex gap-2">
                <Input
                  value={`${window.location.origin}/invoices/shared/${selectedInvoice._id}`}
                  readOnly
                  className="rounded-xl bg-gray-50"
                />
                <Button onClick={() => shareInvoice(selectedInvoice)} size="icon" className="shrink-0 rounded-xl">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={() => window.open(`${window.location.origin}/invoices/shared/${selectedInvoice._id}`, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open in New Tab
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
} 