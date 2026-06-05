'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Wallet, ArrowUpRight, Loader2, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { DoctorBankAccountConnection } from '@/components/billing/DoctorBankAccountConnection'

export default function EarningsPage() {
    const stats = useQuery(api.doctors.getDashboardStats)
    const currentUser = useQuery(api.users.getMyUser)

    if (stats === undefined || currentUser === undefined) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        )
    }

    if (!stats || !currentUser) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center">
                <AlertCircle className="h-10 w-10 text-amber-500 mb-3" />
                <p className="text-gray-700 font-medium">Unable to load earnings data</p>
                <p className="text-sm text-gray-500 mt-1">Please refresh the page or contact support if the issue persists.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Earnings & Payouts</h1>
                <p className="text-gray-500">Track your referral kickbacks and manage your payout accounts.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="col-span-1 md:col-span-2 bg-indigo-50 border-indigo-100">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg text-indigo-900">Total Referrals Commission</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-extrabold text-indigo-700 tracking-tight">
                            {formatCurrency(stats.totalEarned, 'NGN')}
                        </div>
                        <p className="text-sm text-indigo-600 mt-2 flex items-center">
                            <ArrowUpRight className="h-4 w-4 mr-1" />
                            From {stats.completed} completed patient referrals
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Pending Commission</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">
                            {/* Simple estimate: booked but not yet paid_out assumed flat rate placeholder for UI */}
                            {formatCurrency((stats.booked - stats.completed) * 500000, 'NGN')}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Estimated from booked sessions
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2 items-start">
                {/* Left Column: Bank Accounts */}
                <div className="space-y-6">
                    <DoctorBankAccountConnection doctorId={currentUser._id} />
                    
                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                        <div className="text-sm text-amber-800">
                            <strong>Payout Schedule:</strong> Kickback commissions are disbursed to your registered bank account automatically via Paystack. Please ensure your bank details are verified above.
                        </div>
                    </div>
                </div>

                {/* Right Column: Payout History */}
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle>Recent Payouts</CardTitle>
                        <CardDescription>Your recent payouts directly to your bank account.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
                            <Wallet className="h-12 w-12 text-gray-300 mb-4" />
                            <h3 className="text-lg font-medium text-gray-900">No payouts yet</h3>
                            <p className="mt-1 text-sm max-w-xs mx-auto">Payouts are processed to your connected bank account.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
