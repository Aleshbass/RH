'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  TrendingUp
} from 'lucide-react'
import { format } from 'date-fns'

export default function ClinicBillingPage() {
  const billingData = useQuery(api.clinics.getClinicBilling)
  const revenueStats = useQuery(api.clinics.getClinicRevenue)
  const invoices = useQuery(api.clinics.getClinicInvoices)

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

  const pendingInvoices = invoices?.filter((inv: any) => inv.status === 'pending') || []
  const paidInvoices = invoices?.filter((inv: any) => inv.status === 'paid') || []
  const overdueInvoices = invoices?.filter((inv: any) => 
    inv.status === 'pending' && new Date(inv.dueDate) < new Date()
  ) || []

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'default'
      case 'pending': return 'secondary'
      case 'overdue': return 'destructive'
      default: return 'outline'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <CheckCircle2 className="h-3 w-3" />
      case 'pending': return <Clock className="h-3 w-3" />
      case 'overdue': return <AlertCircle className="h-3 w-3" />
      default: return <Receipt className="h-3 w-3" />
    }
  }

  type InvoiceType = NonNullable<ReturnType<typeof useQuery<typeof api.clinics.getClinicInvoices>>>[number];

  const InvoiceCard = ({ invoice }: { invoice: InvoiceType }) => (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Invoice #{invoice.invoiceNumber}</h3>
          <Badge variant={getStatusColor(invoice.status)} className="flex items-center space-x-1">
            {getStatusIcon(invoice.status)}
            <span className="capitalize">{invoice.status}</span>
          </Badge>
        </div>
        <p className="text-sm text-gray-600 mb-1">
          {invoice.patient?.user?.firstName} {invoice.patient?.user?.lastName}
        </p>
        <div className="flex items-center space-x-4 text-xs text-gray-500">
          <span>Amount: ${invoice.amount}</span>
          <span>Due: {format(new Date(invoice.dueDate), 'MMM d, yyyy')}</span>
          <span>Created: {format(new Date(invoice._creationTime), 'MMM d')}</span>
        </div>
      </div>
      <div className="flex items-center space-x-2 ml-4">
        <Button variant="outline" size="sm">
          <Download className="h-3 w-3 mr-1" />
          Download
        </Button>
        {invoice.status === 'pending' && (
          <Button variant="outline" size="sm">
            <Send className="h-3 w-3 mr-1" />
            Send
          </Button>
        )}
        <Button variant="outline" size="sm">View</Button>
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
          <Button>
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
              <div className="text-2xl font-bold">${revenueStats?.totalRevenue || 0}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${revenueStats?.thisMonth || 0}</div>
              <p className="text-xs text-muted-foreground">+12% from last month</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${revenueStats?.pendingPayments || 0}</div>
              <p className="text-xs text-muted-foreground">{pendingInvoices.length} invoices</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${revenueStats?.pendingPayments || 0}</div>
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
                    {pendingInvoices.map((invoice: any) => (
                      <InvoiceCard key={invoice._id} invoice={invoice} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No pending invoices</h3>
                    <p className="text-gray-600 mb-4">All invoices have been paid or no invoices created yet.</p>
                    <Button>
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
                    {paidInvoices.slice(0, 10).map((invoice: any) => (
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
                    {overdueInvoices.map((invoice: any) => (
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
    </div>
  )
}
