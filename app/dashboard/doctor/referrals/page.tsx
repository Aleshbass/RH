'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Download } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { generateClinicalReport } from '@/lib/pdf/generateClinicalReport'

export default function MyReferralsPage() {
    const referrals = useQuery(api.doctors.getMyReferrals)
    const doctorProfile = useQuery(api.doctors.getMyDoctorProfile)

    if (referrals === undefined || doctorProfile === undefined) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        )
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-800'
            case 'contacted': return 'bg-blue-100 text-blue-800'
            case 'booked': return 'bg-purple-100 text-purple-800'
            case 'completed': return 'bg-green-100 text-green-800'
            case 'paid_out': return 'bg-indigo-100 text-indigo-800'
            case 'cancelled': return 'bg-red-100 text-red-800'
            default: return 'bg-gray-100 text-gray-800'
        }
    }

    const getStatusText = (status: string) => {
        return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    }

    return (
        <div className="space-y-6">
            <div className="sm:flex sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Referrals</h1>
                    <p className="text-sm text-gray-500">Track the status of your referred patients.</p>
                </div>
                <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
                    <Link href="/dashboard/doctor/referrals/new">
                        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            <Plus className="mr-2 h-4 w-4" />
                            Refer Patient
                        </Button>
                    </Link>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Referred Patients</CardTitle>
                </CardHeader>
                <CardContent>
                    {referrals.length === 0 ? (
                        <div className="text-center py-12">
                            <h3 className="text-sm font-medium text-gray-900">No referrals yet</h3>
                            <p className="mt-1 text-sm text-gray-500">Get started by referring your first patient.</p>
                            <div className="mt-6">
                                <Link href="/dashboard/doctor/referrals/new">
                                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                        <Plus className="mr-2 h-4 w-4" />
                                        Refer Patient
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-300">
                                <thead>
                                    <tr>
                                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                                            Patient Name
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                            Condition
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                            Date Referred
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                            Status
                                        </th>
                                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                            Earned
                                        </th>
                                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                                            <span className="sr-only">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {referrals.map((referral: any) => (
                                        <tr key={referral._id}>
                                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                                                {referral.patientFirstName} {referral.patientLastName}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                {referral.condition || '-'}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                {new Date(referral.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                <Badge className={`${getStatusColor(referral.status)} border-none`} variant="outline">
                                                    {getStatusText(referral.status)}
                                                </Badge>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                                                {referral.commissionEarned != null ? formatCurrency(referral.commissionEarned, 'NGN') : '-'}
                                            </td>
                                            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                                                {referral.status === 'completed' || referral.status === 'paid_out' ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-indigo-600 hover:text-indigo-900"
                                                        onClick={() => {
                                                            generateClinicalReport(
                                                                referral,
                                                                doctorProfile?.profile?.title,
                                                                doctorProfile?.user?.lastName
                                                            );
                                                        }}
                                                    >
                                                        <Download className="mr-2 h-4 w-4" />
                                                        EMR Export
                                                    </Button>
                                                ) : (
                                                    <span className="text-gray-400 text-xs italic">Awaiting EMR</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
