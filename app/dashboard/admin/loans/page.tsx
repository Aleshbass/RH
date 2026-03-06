'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { WalletCards, Clock, CheckCircle, XCircle, BanknoteIcon, ArrowRight } from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    initiated: { label: 'SMS Sent', variant: 'outline' },
    pending: { label: 'Applying', variant: 'secondary' },
    approved: { label: 'Approved', variant: 'default' },
    disbursed: { label: 'Disbursed', variant: 'default' },
    declined: { label: 'Declined', variant: 'destructive' },
    expired: { label: 'Expired', variant: 'outline' },
    failed: { label: 'Failed', variant: 'destructive' },
    repaid: { label: 'Fully Repaid', variant: 'default' },
}

export default function AdminLoansPage() {
    const loans = useQuery(api.mediloan.getAllLoans)

    if (loans === undefined) {
        return <div className="p-8 text-center text-gray-500 animate-pulse">Loading loan applications...</div>
    }

    const stats = {
        total: loans.length,
        initiated: loans.filter((l: any) => l.status === 'initiated').length,
        approved: loans.filter((l: any) => l.status === 'approved' || l.status === 'disbursed').length,
        declined: loans.filter((l: any) => l.status === 'declined').length,
        totalAmount: loans.reduce((sum: number, l: any) => sum + l.amount, 0),
        disbursedAmount: loans.filter((l: any) => l.status === 'disbursed' || l.status === 'repaid').reduce((sum: number, l: any) => sum + l.amount, 0),
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">MediLoan Applications</h1>
                <p className="text-sm text-gray-500">Track patient loan applications initiated via MyItura MediLoan.</p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
                        <WalletCards className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Awaiting Response</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">{stats.initiated}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Approved</CardTitle>
                        <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Disbursed Value</CardTitle>
                        <BanknoteIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ₦{(stats.disbursedAmount / 100).toLocaleString()}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Loans Table */}
            <Card>
                <CardHeader>
                    <CardTitle>All Loan Applications</CardTitle>
                    <CardDescription>Status updates are received automatically via webhook from MyItura.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Patient</th>
                                    <th className="px-6 py-3 font-semibold">Treatment</th>
                                    <th className="px-6 py-3 font-semibold">Amount</th>
                                    <th className="px-6 py-3 font-semibold">Status</th>
                                    <th className="px-6 py-3 font-semibold">SDK Ref</th>
                                    <th className="px-6 py-3 font-semibold">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {loans.map((loan: any) => {
                                    const statusConfig = STATUS_CONFIG[loan.status] || { label: loan.status, variant: 'outline' as const }
                                    return (
                                        <tr key={loan._id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-900">
                                                    {loan.patientFirstName} {loan.patientLastName}
                                                </div>
                                                <div className="text-xs text-gray-400 mt-0.5">{loan.patientPhone}</div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-700 max-w-[200px] truncate">
                                                {loan.treatment}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-gray-900">
                                                ₦{(loan.amount / 100).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge variant={statusConfig.variant}>
                                                    {statusConfig.label}
                                                </Badge>
                                                {loan.repaymentStatus && (
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Repayment: {loan.repaymentStatus}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-mono text-xs text-gray-500">
                                                {loan.myituraSdkRef || '—'}
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 whitespace-nowrap text-xs">
                                                {loan.createdAt && !isNaN(new Date(loan.createdAt).getTime())
                                                    ? new Date(loan.createdAt).toLocaleDateString()
                                                    : '—'}
                                            </td>
                                        </tr>
                                    )
                                })}
                                {loans.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                                            No loan applications yet. MediLoan can be initiated from the Billing page.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
