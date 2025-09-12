'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Id } from 'convex/_generated/dataModel'

type Invoice = {
  _id: Id<'invoices'>
  invoiceNumber: string
  totalAmount: number
  dueDate: number
  status: string
  paidAt?: number
  _creationTime: number
  patient?: {
    user?: {
      firstName?: string
      lastName?: string
      email?: string
    }
  }
}
import { InvoiceModal } from '@/components/billing/InvoiceModal'
import { SimpleInvoiceModal } from '@/components/billing/SimpleInvoiceModal'
import { InvoicePaymentModal } from '@/components/billing/InvoicePaymentModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { 
  DollarSign, 
  Receipt, 
  Plus,
  Filter,
  Download,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Eye,
  CreditCard,
  MoreVertical,
  Mail
} from 'lucide-react'
import { format } from 'date-fns'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function ClinicBillingPage() {
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  
  const billingData = useQuery(api.clinics.getClinicBilling)
  const revenueStats = useQuery(api.clinics.getClinicRevenue)
  const invoices = useQuery(api.clinics.getClinicInvoices)
  
  const sendInvoice = useMutation(api.billing.sendInvoice)
  const sendPaymentReminders = useMutation(api.billing.sendPaymentReminders)
  const generateInvoicePDF = useMutation(api.billing.generateInvoicePDF)

  if (billingData === undefined || revenueStats === undefined || invoices === undefined) {
    return (
      <div className="p-8">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  const pendingInvoices = Array.isArray(invoices) ? invoices.filter((inv: { status: string }) => inv.status === 'pending' || inv.status === 'sent') : []
  const paidInvoices = Array.isArray(invoices) ? invoices.filter((inv: { status: string }) => inv.status === 'paid') : []
  const overdueInvoices = Array.isArray(invoices) ? invoices.filter((inv: { status: string, dueDate: number }) => 
    (inv.status === 'pending' || inv.status === 'sent') && new Date(inv.dueDate) < new Date()
  ) : []

  const getStatusColor = (status: string, dueDate?: number) => {
    if (status === 'paid') return 'default'
    if (dueDate && new Date(dueDate) < new Date()) return 'destructive'
    if (status === 'sent') return 'secondary'
    if (status === 'pending') return 'outline'
    return 'outline'
  }

  const getStatusIcon = (status: string, dueDate?: number) => {
    if (status === 'paid') return <CheckCircle2 className="h-3 w-3" />
    if (dueDate && new Date(dueDate) < new Date()) return <AlertCircle className="h-3 w-3" />
    if (status === 'sent') return <Mail className="h-3 w-3" />
    if (status === 'pending') return <Clock className="h-3 w-3" />
    return <Receipt className="h-3 w-3" />
  }
  
  const getStatusText = (status: string, dueDate?: number) => {
    if (dueDate && new Date(dueDate) < new Date() && status !== 'paid') return 'Overdue'
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  const handleSendInvoice = async (invoiceId: Id<"invoices">) => {
    try {
      await sendInvoice({ invoiceId })
      toast.success('Invoice sent successfully')
    } catch {
      toast.error('Failed to send invoice')
    }
  }

  const handleSendReminder = async (invoiceId: Id<"invoices">) => {
    try {
      await sendPaymentReminders({ invoiceIds: [invoiceId] })
      toast.success('Payment reminder sent')
    } catch {
      toast.error('Failed to send reminder')
    }
  }


  const handleGeneratePDF = async (invoiceId: Id<"invoices">) => {
    try {
      const result = await generateInvoicePDF({ invoiceId })
      if (result.pdfUrl) {
        window.open(result.pdfUrl, '_blank')
      }
      toast.success('PDF generated successfully')
    } catch {
      toast.error('Failed to generate PDF')
    }
  }

  const InvoiceCard = ({ invoice }: { invoice: Invoice }) => (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Invoice #{invoice.invoiceNumber}</h3>
          <Badge 
            variant={getStatusColor(invoice.status, invoice.dueDate)} 
            className="flex items-center space-x-1"
          >
            {getStatusIcon(invoice.status, invoice.dueDate)}
            <span>{getStatusText(invoice.status, invoice.dueDate)}</span>
          </Badge>
        </div>
        <p className="text-sm text-gray-600 mb-1">
          {invoice.patient?.user?.firstName} {invoice.patient?.user?.lastName}
          {invoice.patient?.user?.email && (
            <span className="text-xs text-gray-400 ml-2">{invoice.patient.user.email}</span>
          )}
        </p>
        <div className="flex items-center space-x-4 text-xs text-gray-500">
          <span className="font-medium">₦{invoice.totalAmount?.toLocaleString()}</span>
          <span>Due: {format(new Date(invoice.dueDate), 'MMM d, yyyy')}</span>
          <span>Created: {format(new Date(invoice._creationTime), 'MMM d, yyyy')}</span>
          {invoice.paidAt && (
            <span className="text-green-600">Paid: {format(new Date(invoice.paidAt), 'MMM d, yyyy')}</span>
          )}
        </div>
      </div>
      <div className="flex items-center space-x-2 ml-4">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => {
            setSelectedInvoice(invoice)
            setShowViewModal(true)
          }}
        >
          <Eye className="h-3 w-3 mr-1" />
          View
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {invoice.status === 'pending' && (
              <DropdownMenuItem onClick={() => handleSendInvoice(invoice._id)}>
                <Send className="h-3 w-3 mr-2" />
                Send Invoice
              </DropdownMenuItem>
            )}
            
            {(invoice.status === 'sent' || invoice.status === 'pending') && (
              <>
                <DropdownMenuItem onClick={() => handleSendReminder(invoice._id)}>
                  <Mail className="h-3 w-3 mr-2" />
                  Send Reminder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setSelectedInvoice(invoice)
                  setShowPaymentModal(true)
                }}>
                  <CreditCard className="h-3 w-3 mr-2" />
                  Process Payment
                </DropdownMenuItem>
              </>
            )}
            
            <DropdownMenuItem onClick={() => handleGeneratePDF(invoice._id)}>
              <Download className="h-3 w-3 mr-2" />
              Download PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )

  return (
    <div className="p-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Billing & Invoicing</h1>
            <p className="text-gray-600">Manage clinic finances and patient invoices</p>
          </div>
          <Button onClick={() => setShowInvoiceModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Invoice
          </Button>
        </div>

        {/* Revenue Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₦{(billingData?.totalRevenue || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₦{(billingData?.thisMonthRevenue || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">+12% from last month</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₦{(billingData?.pendingAmount || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{pendingInvoices.length} invoices</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₦{(billingData?.overdueAmount || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{overdueInvoices.length} invoices</p>
            </CardContent>
          </Card>
        </div>

        {/* Invoices Tabs */}
        <Tabs defaultValue="pending" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="pending">Pending ({pendingInvoices.length})</TabsTrigger>
              <TabsTrigger value="paid">Paid ({paidInvoices.length})</TabsTrigger>
              <TabsTrigger value="overdue">Overdue ({overdueInvoices.length})</TabsTrigger>
            </TabsList>
            <div className="flex space-x-2">
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle>Pending Invoices</CardTitle>
                <CardDescription>
                  {pendingInvoices.length} invoices awaiting payment
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingInvoices.length > 0 ? (
                  <div className="space-y-4">
                    {pendingInvoices.map((invoice) => (
                      <InvoiceCard key={invoice._id} invoice={invoice} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No pending invoices</h3>
                    <p className="text-gray-600 mb-4">All invoices have been paid or no invoices created yet.</p>
                    <Button onClick={() => setShowInvoiceModal(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Invoice
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="paid">
            <Card>
              <CardHeader>
                <CardTitle>Paid Invoices</CardTitle>
                <CardDescription>
                  {paidInvoices.length} invoices successfully paid
                </CardDescription>
              </CardHeader>
              <CardContent>
                {paidInvoices.length > 0 ? (
                  <div className="space-y-4">
                    {paidInvoices.slice(0, 10).map((invoice) => (
                      <InvoiceCard key={invoice._id} invoice={invoice} />
                    ))}
                    {paidInvoices.length > 10 && (
                      <div className="text-center pt-4">
                        <Button variant="outline">Load More</Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No paid invoices yet</h3>
                    <p className="text-gray-600">Paid invoices will appear here.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overdue">
            <Card>
              <CardHeader>
                <CardTitle>Overdue Invoices</CardTitle>
                <CardDescription>
                  {overdueInvoices.length} invoices past due date
                </CardDescription>
              </CardHeader>
              <CardContent>
                {overdueInvoices.length > 0 ? (
                  <div className="space-y-4">
                    {overdueInvoices.map((invoice) => (
                      <InvoiceCard key={invoice._id} invoice={invoice} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No overdue invoices</h3>
                    <p className="text-gray-600">Great! All invoices are up to date.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Invoice Creation Modal */}
      {showInvoiceModal && (
        <InvoiceModal 
          isOpen={showInvoiceModal}
          onClose={() => setShowInvoiceModal(false)}
        />
      )}
      
      {/* Invoice View Modal */}
      {showViewModal && selectedInvoice && (
        <SimpleInvoiceModal
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
          selectedInvoice={{
            _id: selectedInvoice._id,
            invoiceNumber: selectedInvoice.invoiceNumber,
            patientName: selectedInvoice.patient?.user?.firstName && selectedInvoice.patient?.user?.lastName 
              ? `${selectedInvoice.patient.user.firstName} ${selectedInvoice.patient.user.lastName}`
              : undefined,
            patientEmail: selectedInvoice.patient?.user?.email,
            patient: selectedInvoice.patient?.user ? {
              firstName: selectedInvoice.patient.user.firstName,
              lastName: selectedInvoice.patient.user.lastName,
              email: selectedInvoice.patient.user.email,
              phoneNumber: undefined
            } : null,
            issueDate: selectedInvoice._creationTime,
            dueDate: selectedInvoice.dueDate,
            status: selectedInvoice.status,
            totalAmount: selectedInvoice.totalAmount,
            subtotal: selectedInvoice.totalAmount,
            subtotalAmount: selectedInvoice.totalAmount,
            platformFee: undefined,
            platformFeeAmount: undefined,
            discountAmount: undefined,
            items: undefined
          }}
          onSend={() => {}}
          onRecordPayment={() => {}}
          onDownload={() => {}}
        />
      )}
      
      {/* Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <InvoicePaymentModal
          open={showPaymentModal}
          onOpenChange={setShowPaymentModal}
          invoice={selectedInvoice}
        />
      )}
    </div>
  )
}
