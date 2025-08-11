'use client'

import { useQuery } from 'convex/react'
import { useParams } from 'next/navigation'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Receipt, 
  MapPin,
  Phone,
  Download,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react'
import { format } from 'date-fns'

// Types for invoice data
interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}
interface InvoiceData {
  _id: string;
  invoiceNumber: string | number;
  status: 'paid' | 'sent' | 'overdue' | 'draft' | string;
  isOverdue: boolean;
  currency: string;
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
  patientName?: string;
  issueDate: number;
  dueDate: number;
  paymentDate?: number;
  notes?: string;
}

function SharedInvoicePageComponent() {
  const params = useParams()
  const invoiceId = params?.invoiceId as Id<"invoices">
  
  // Query the shareable invoice (no authentication required)
  const invoice = useQuery(
    api.billing.getShareableInvoice,
    invoiceId ? { invoiceId } : 'skip'
  ) as InvoiceData | null | undefined

  if (!params || !params.invoiceId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invoice Link</h1>
          <p className="text-gray-600">Please check the URL or contact support.</p>
        </div>
      </div>
    )
  }
  
  if (invoice === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading invoice...</p>
        </div>
      </div>
    )
  }
  
  if (invoice === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Receipt className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invoice Not Found</h1>
          <p className="text-gray-600">The invoice you&apos;re looking for doesn&apos;t exist or has been removed.</p>
        </div>
      </div>
    )
  }
  
  const getStatusBadge = (status: string, isOverdue: boolean) => {
    if (status === 'paid') {
      return (
        <Badge className="bg-green-100 text-green-800 flex items-center space-x-1">
          <CheckCircle className="w-3 h-3" />
          <span>Paid</span>
        </Badge>
      )
    }
    if (isOverdue && status !== 'paid') {
      return (
        <Badge className="bg-red-100 text-red-800 flex items-center space-x-1">
          <AlertTriangle className="w-3 h-3" />
          <span>Overdue</span>
        </Badge>
      )
    }
    if (status === 'sent') {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 flex items-center space-x-1">
          <Clock className="w-3 h-3" />
          <span>Pending</span>
        </Badge>
      )
    }
    return <Badge variant="secondary">{status}</Badge>
  }
  
  const formatCurrency = (amount: number, currency: string = 'NGN') => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency,
    }).format(amount / 100) // Convert from kobo to naira
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Receipt className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Invoice #{invoice.invoiceNumber}</h1>
                <p className="text-sm text-gray-600">Public View</p>
              </div>
            </div>
            {getStatusBadge(invoice.status, invoice.isOverdue)}
          </div>
        </div>
      </div>
      
      {/* Invoice Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Card className="shadow-lg">
          <CardHeader className="border-b bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Clinic Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">From</h3>
                <div className="space-y-2">
                  <p className="font-medium text-gray-900">{invoice.clinicName}</p>
                  {invoice.clinicAddress && (
                    <div className="flex items-start space-x-2 text-sm text-gray-600">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <p>{invoice.clinicAddress}</p>
                    </div>
                  )}
                  {invoice.clinicPhone && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4" />
                      <p>{invoice.clinicPhone}</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Patient Info & Invoice Details */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Invoice Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Patient:</span>
                    <span className="font-medium text-gray-900">{invoice.patientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Issue Date:</span>
                    <span className="text-gray-900">{format(new Date(invoice.issueDate), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Due Date:</span>
                    <span className={`${invoice.isOverdue ? 'text-red-600 font-medium' : 'text-gray-900'}`}>
                      {format(new Date(invoice.dueDate), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {invoice.paymentDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Paid Date:</span>
                      <span className="text-green-600 font-medium">{format(new Date(invoice.paymentDate), 'MMM d, yyyy')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-8">
            {/* Invoice Items */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Services</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Qty
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rate
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invoice.items.map((item: InvoiceItem, index: number) => (
                      <tr key={index}>
                        <td className="px-4 py-4 text-sm text-gray-900">{item.description}</td>
                        <td className="px-4 py-4 text-sm text-gray-900 text-right">{item.quantity}</td>
                        <td className="px-4 py-4 text-sm text-gray-900 text-right">
                          {formatCurrency(item.unitPrice, invoice.currency)}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900 text-right">
                          {formatCurrency(item.unitPrice * item.quantity, invoice.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Invoice Total */}
            <div className="flex justify-end mb-8">
              <div className="w-full md:w-1/3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="text-gray-900">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tax ({invoice.taxRate}%)</span>
                    <span className="text-gray-900">{formatCurrency(invoice.taxAmount, invoice.currency)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg">
                    <span className="text-gray-900">Total</span>
                    <span className="text-gray-900">{formatCurrency(invoice.total, invoice.currency)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Notes */}
            {invoice.notes && (
              <div className="border-t pt-6">
                <h3 className="text-base font-semibold text-gray-900 mb-2">Notes</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Actions */}
        <div className="mt-8 flex justify-center space-x-4">
          <Button>
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
          {invoice.status !== 'paid' && (
            <Button variant="default">
              Pay with Paystack
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}


export default function SharedInvoicePage() {
  const params = useParams()
  // Render a loading/error state on the server if the ID is missing
  if (!params || !params.invoiceId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invoice Link</h1>
          <p className="text-gray-600">Please check the URL or contact support.</p>
        </div>
      </div>
    )
  }
  return <SharedInvoicePageComponent />
} 