'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import { Settings, FileText, CheckCircle, RefreshCcw, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

type ReferralStatus = 'pending' | 'contacted' | 'booked' | 'completed' | 'paid_out' | 'cancelled'

export default function AdminReferralsPage() {
    const referrals = useQuery(api.adminReferrals.getInboundReferrals)
    const updateReferral = useMutation(api.adminReferrals.updateReferralStatus)

    const [selectedReferral, setSelectedReferral] = useState<any>(null)
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
    const [statusToUpdate, setStatusToUpdate] = useState<ReferralStatus>('pending')
    const [commission, setCommission] = useState('')
    const [notes, setNotes] = useState('')
    const [isUpdating, setIsUpdating] = useState(false)

    const openUpdateModal = (referral: any) => {
        setSelectedReferral(referral)
        setStatusToUpdate(referral.status)
        setCommission(referral.commissionEarned ? (referral.commissionEarned / 100).toString() : '')
        setNotes(referral.clinicalNotes || '')
        setIsUpdateModalOpen(true)
    }

    const handleUpdate = async () => {
        if (!selectedReferral) return

        setIsUpdating(true)
        try {
            await updateReferral({
                referralId: selectedReferral._id,
                status: statusToUpdate,
                clinicalNotes: notes || undefined,
                commissionEarned: commission
                    ? (isNaN(parseFloat(commission)) ? undefined : Math.round(parseFloat(commission) * 100))
                    : undefined
            })
            toast.success("Referral status updated successfully")
            setIsUpdateModalOpen(false)
        } catch (error: any) {
            toast.error(error.message || "Failed to update status")
        } finally {
            setIsUpdating(false)
        }
    }

    if (referrals === undefined) {
        return <div className="p-8 text-center text-gray-500 animate-pulse">Loading intake queue...</div>
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Inbound Referrals</h1>
                <p className="text-sm text-gray-500">Manage patient referrals from the referring doctor network.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Intake Queue</CardTitle>
                    <CardDescription>Review new referrals and update their statuses to track closed-loop progress.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Patient</th>
                                    <th className="px-6 py-3 font-semibold">Contact / Clinic</th>
                                    <th className="px-6 py-3 font-semibold">Referring Doctor</th>
                                    <th className="px-6 py-3 font-semibold">Date</th>
                                    <th className="px-6 py-3 font-semibold">Status / Kickback</th>
                                    <th className="px-6 py-3 font-semibold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {referrals.map((referral: any) => (
                                    <tr key={referral._id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900">
                                                {referral.patientFirstName} {referral.patientLastName}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1 truncate max-w-[150px]">
                                                {referral.condition || 'General'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-gray-900">{referral.patientPhone}</div>
                                            <div className="text-xs text-gray-400 mt-0.5">{referral.patientEmail}</div>
                                            {referral.hospitalClinic && (
                                                <div className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded mt-1 inline-block">
                                                    {referral.hospitalClinic}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-gray-700">{referral.doctorName}</div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                                            {new Date(referral.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge variant={
                                                referral.status === 'completed' || referral.status === 'paid_out' ? 'default' :
                                                    referral.status === 'booked' ? 'secondary' :
                                                        referral.status === 'cancelled' ? 'destructive' :
                                                            'outline'
                                            }>
                                                {referral.status.replace('_', ' ').toUpperCase()}
                                            </Badge>
                                            {referral.commissionEarned && (
                                                <div className="text-xs font-semibold text-green-600 mt-2">
                                                    {formatCurrency(referral.commissionEarned)}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openUpdateModal(referral)}
                                            >
                                                <Settings className="w-4 h-4 mr-2" />
                                                Manage
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                {referrals.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                                            No inbound referrals found in the queue.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isUpdateModalOpen} onOpenChange={setIsUpdateModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Update Referral</DialogTitle>
                        <DialogDescription>
                            Change lifecycle status or manage kickbacks for {selectedReferral?.patientFirstName} {selectedReferral?.patientLastName}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <label htmlFor="referral-status" className="text-sm font-medium">Status</label>
                            <Select value={statusToUpdate} onValueChange={(val: ReferralStatus) => setStatusToUpdate(val)}>
                                <SelectTrigger id="referral-status">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="contacted">Contacted</SelectItem>
                                    <SelectItem value="booked">Booked (Session Scheduled)</SelectItem>
                                    <SelectItem value="completed">Completed (Outcome Sent)</SelectItem>
                                    <SelectItem value="paid_out">Paid Out (Commission Sent)</SelectItem>
                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {(statusToUpdate === 'completed' || statusToUpdate === 'paid_out') && (
                            <div className="space-y-2">
                                <label htmlFor="referral-commission" className="text-sm font-medium">Earned Commission (NGN)</label>
                                <Input
                                    id="referral-commission"
                                    type="number"
                                    placeholder="Amount in Naira"
                                    value={commission}
                                    onChange={(e) => setCommission(e.target.value)}
                                />
                                <p className="text-xs text-gray-500">Total amount to be credited to referring doctor</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label htmlFor="referral-notes" className="text-sm font-medium">Admin / Medical Notes</label>
                            <Textarea
                                id="referral-notes"
                                placeholder="Update notes for admin team or clinical summary"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                            />
                        </div>

                        {selectedReferral?.doctorBankAccount ? (
                            <div className="mt-2 p-3 bg-indigo-50 border border-indigo-100 rounded-md">
                                <h4 className="text-xs font-semibold text-indigo-900 mb-2 uppercase tracking-wider">Payout Details</h4>
                                <div className="space-y-1 text-sm text-indigo-800">
                                    <p><span className="font-medium text-indigo-900">Bank:</span> {selectedReferral.doctorBankAccount.bankName}</p>
                                    <p><span className="font-medium text-indigo-900">Account:</span> {selectedReferral.doctorBankAccount.accountNumber}</p>
                                    <p><span className="font-medium text-indigo-900">Name:</span> {selectedReferral.doctorBankAccount.accountName}</p>
                                    <p className="mt-1 text-xs text-indigo-600 font-mono">
                                        Subaccount Code: {selectedReferral.doctorBankAccount.subaccountCode}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2 p-3 bg-amber-50 border border-amber-100 rounded-md">
                                <h4 className="text-xs font-semibold text-amber-900 mb-1 uppercase tracking-wider">Missing Payout Details</h4>
                                <p className="text-xs text-amber-800">The referring doctor has not connected a verified bank account yet. Automatic split payments will fail.</p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsUpdateModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdate} disabled={isUpdating}>
                            {isUpdating ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
