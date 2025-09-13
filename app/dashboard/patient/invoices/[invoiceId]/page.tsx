'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { usePaystackCheckout } from '@/components/billing/PaystackCheckout'
import {
  Receipt,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  CreditCard,
  ArrowLeft,
} from 'lucide-react'

interface PatientInvoice {
  _id: Id<'invoices'>
  invoiceNumber: string
  clinicName?: string
  items: Array<{ description: string; quantity: number; unitPrice: number; totalPrice: number }>
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

export default function PatientInvoiceDetailPage() {
  const router = useRouter()
  const params = useParams()
  const invoiceId = params.invoiceId as string
  const { isLoaded, isSignedIn } = useAuth()
  const { initializePayment } = usePaystackCheckout()

  // Fetch invoice details for the authenticated patient
  const invoice = useQuery(
    api.billing.getInvoiceForPatient,
    invoiceId ? { invoiceId: invoiceId as Id<'invoices'> } : 'skip'
  ) as PatientInvoice | null | undefined

  // Redirect unauthenticated users to sign-in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      const redirectPath = encodeURIComponent(`/dashboard/patient/invoices/${invoiceId}`)
      router.push(`/sign-in?redirect_url=${redirectPath}`)
    }
  }, [isLoaded, isSignedIn, invoiceId, router])

  const formatCurrency = (amount: number, currency: string = 'NGN') => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
    }).format((amount || 0) / 100)
  }

  const statusBadge = (status?: string, isOverdue?: boolean) => {
    if (!status) return null
    if (status === 'paid') return <Badge className="bg-green-100 text-green-800">Paid</Badge>
    if (isOverdue && status !== 'paid') return <Badge className="bg-red-100 text-red-800">Overdue</Badge>
    if (status === 'pending' || status === 'sent') return <Badge className="bg-blue-100 text-blue-800">Pending</Badge>
    return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>
  }

  const handlePayNow = async () => {
    if (!invoice) return
    try {
      await initializePayment(invoice._id)
      // Redirect handled by hook
    } catch (err) {
      console.error('Payment init error:', err)
      toast.error('Failed to initialize payment')
    }
  }

  // Loading state
  if (!isLoaded || invoice === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading invoice...</p>
        </div>
      </div>
    )
  }

  // Not found or no access
  if (invoice === null) {
    return (
      <div className="p-6 space-y-6">
        <Button variant="outline" onClick={() => router.push('/dashboard/patient/invoices')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Invoices
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>Invoice not found</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">This invoice either does not exist or you do not have access.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Calculate payable summary (for display only)
  const base = invoice.totalAmount || 0
  const platform = invoice.platformFeeAmount || 100000 // ₦1,000 in kobo
  const paystackFee = Math.round((base + platform) * 0.015) + 10000 // 1.5% + ₦100
  const payable = base + platform + paystackFee

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => router.push('/dashboard/patient/invoices')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Invoices
        </Button>
        <div className="flex items-center space-x-3">
          {statusBadge(invoice.status, invoice.isOverdue)}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center space-x-2">
              <Receipt className="h-5 w-5" />
              <span>Invoice #{invoice.invoiceNumber}</span>
            </span>
            <span className="text-gray-500">{invoice.clinicName}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Services */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Services</h3>
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
                  {invoice.items?.map((item, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(item.unitPrice, invoice.currency)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(item.totalPrice, invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>{formatCurrency(invoice.subtotalAmount, invoice.currency)}</span>
              </div>
              {invoice.discountAmount && invoice.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount:</span>
                  <span>-{formatCurrency(invoice.discountAmount, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>Platform Fee:</span>
                <span>{formatCurrency(platform, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Paystack Fee (est.):</span>
                <span>{formatCurrency(paystackFee, invoice.currency)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-lg font-bold">
                <span>Total Payable:</span>
                <span className="text-green-600">{formatCurrency(payable, invoice.currency)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span>Issued On:</span>
                  <span>{new Date(invoice.issueDate).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Due Date:</span>
                  <span className={invoice.isOverdue ? 'text-red-600 font-medium' : ''}>{new Date(invoice.dueDate).toLocaleString()}</span>
                </div>
                {invoice.paymentDate && (
                  <div className="flex items-center justify-between text-sm">
                    <span>Paid On:</span>
                    <span className="text-green-600">{new Date(invoice.paymentDate).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {invoice.canPay && (
                <Button
                  onClick={handlePayNow}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay Now
                </Button>
              )}

              {!invoice.canPay && invoice.status === 'paid' && (
                <div className="flex items-center text-green-600 text-sm">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  This invoice has been paid.
                </div>
              )}
            </div>
          </div>

          {invoice.notes && (
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Notes</h4>
              <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{invoice.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
