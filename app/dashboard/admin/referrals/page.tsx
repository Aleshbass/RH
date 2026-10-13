'use client'

import { useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import { Settings, Search, Building2, UserCheck, Filter, X, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

type ReferralStatus = 'pending' | 'contacted' | 'booked' | 'in_treatment' | 'completed' | 'paid_out' | 'cancelled'

function AdminReferralsContent() {
    const searchParams = useSearchParams()
    const initialPartner = searchParams.get('partner') || 'all'

    const referrals = useQuery(api.adminReferrals.getInboundReferrals)
    const routableClinics = useQuery(api.adminReferrals.listClinicsForReferralRouting)
    const updateReferral = useMutation(api.adminReferrals.updateReferralStatus)
    const assignReferralToClinic = useMutation(api.adminReferrals.assignReferralToClinic)

    const [selectedReferral, setSelectedReferral] = useState<any>(null)
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
    const [statusToUpdate, setStatusToUpdate] = useState<ReferralStatus>('pending')
    const [commission, setCommission] = useState('')
    const [notes, setNotes] = useState('')
    const [clinicToAssign, setClinicToAssign] = useState('none')
    const [isUpdating, setIsUpdating] = useState(false)

    // Search and filter states
    const [searchTerm, setSearchTerm] = useState('')
    const [partnerFilter, setPartnerFilter] = useState(initialPartner)
    const [statusFilter, setStatusFilter] = useState('all')

    const openUpdateModal = (referral: any) => {
        setSelectedReferral(referral)
        setStatusToUpdate(referral.status)
        setCommission(referral.commissionEarned ? (referral.commissionEarned / 100).toString() : '')
        setNotes(referral.clinicalNotes || '')
        setClinicToAssign(referral.assignedClinicId || 'none')
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
            const currentClinic = selectedReferral.assignedClinicId || 'none'
            if (clinicToAssign !== currentClinic) {
                await assignReferralToClinic({
                    referralId: selectedReferral._id,
                    clinicId: clinicToAssign === 'none' ? undefined : (clinicToAssign as Id<'clinics'>),
                })
            }
            toast.success("Referral status updated successfully")
            setIsUpdateModalOpen(false)
        } catch (error: any) {
            toast.error(error.message || "Failed to update status")
        } finally {
            setIsUpdating(false)
        }
    }

    // Extract unique partner organizations from referrals list
    const partnerOptions = useMemo(() => {
        if (!referrals) return []
        const partnerMap = new Map<string, { code: string; name: string; count: number }>()

        for (const r of referrals) {
            const code = r.partnerCode || (r.partnerId ? String(r.partnerId) : null)
            const name = r.partnerName || code
            if (code && name) {
                const existing = partnerMap.get(code)
                if (existing) {
                    existing.count += 1
                } else {
                    partnerMap.set(code, { code, name, count: 1 })
                }
            }
        }

        return Array.from(partnerMap.values())
    }, [referrals])

    // Filter referrals based on search term, partner filter, and status filter
    const filteredReferrals = useMemo(() => {
        if (!referrals) return []

        return referrals.filter((referral: any) => {
            // Partner filter
            if (partnerFilter !== 'all') {
                const matchesCode = (referral.partnerCode || '').toLowerCase() === partnerFilter.toLowerCase()
                const matchesId = (referral.partnerId || '').toLowerCase() === partnerFilter.toLowerCase()
                const matchesName = (referral.partnerName || '').toLowerCase() === partnerFilter.toLowerCase()
                if (!matchesCode && !matchesId && !matchesName) return false
            }

            // Status filter
            if (statusFilter !== 'all' && referral.status !== statusFilter) {
                return false
            }

            // Search term
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim()
                const patientName = `${referral.patientFirstName || ''} ${referral.patientLastName || ''}`.toLowerCase()
                const phone = (referral.patientPhone || '').toLowerCase()
                const email = (referral.patientEmail || '').toLowerCase()
                const trackingCode = (referral.trackingCode || '').toLowerCase()
                const partnerExt = (referral.partnerExternalId || '').toLowerCase()
                const partnerName = (referral.partnerName || '').toLowerCase()
                const doctorName = (referral.doctorName || '').toLowerCase()
                const condition = (referral.condition || '').toLowerCase()

                const matchesSearch =
                    patientName.includes(term) ||
                    phone.includes(term) ||
                    email.includes(term) ||
                    trackingCode.includes(term) ||
                    partnerExt.includes(term) ||
                    partnerName.includes(term) ||
                    doctorName.includes(term) ||
                    condition.includes(term)

                if (!matchesSearch) return false
            }

            return true
        })
    }, [referrals, partnerFilter, statusFilter, searchTerm])

    const hasActiveFilters = searchTerm.trim() !== '' || partnerFilter !== 'all' || statusFilter !== 'all'

    const clearFilters = () => {
        setSearchTerm('')
        setPartnerFilter('all')
        setStatusFilter('all')
    }

    if (referrals === undefined) {
        return <div className="p-8 text-center text-gray-500 animate-pulse">Loading intake queue...</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Inbound Referrals</h1>
                    <p className="text-sm text-gray-500">
                        Manage patient referrals from healthcare partners and referring doctor networks.
                    </p>
                </div>

                {/* Filter / Search stats badge */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                        Showing <strong>{filteredReferrals.length}</strong> of <strong>{referrals.length}</strong> referrals
                    </span>
                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearFilters}
                            className="text-xs text-red-600 hover:text-red-700 h-8 px-2 flex items-center gap-1"
                        >
                            <X className="w-3.5 h-3.5" />
                            Clear Filters
                        </Button>
                    )}
                </div>
            </div>

            {/* Filter and Search Bar Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
                {/* Search Bar */}
                <div className="sm:col-span-6 relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                    <Input
                        placeholder="Search patient, phone, tracking code, partner..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 text-xs sm:text-sm"
                    />
                </div>

                {/* Partner Organization Filter */}
                <div className="sm:col-span-3">
                    <Select value={partnerFilter} onValueChange={setPartnerFilter}>
                        <SelectTrigger className="text-xs sm:text-sm">
                            <div className="flex items-center gap-2 truncate">
                                <Building2 className="w-4 h-4 text-teal-600 shrink-0" />
                                <SelectValue placeholder="All Partners" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Healthcare Partners ({referrals.length})</SelectItem>
                            {partnerOptions.map((p) => (
                                <SelectItem key={p.code} value={p.code}>
                                    {p.name} ({p.count})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Lifecycle Status Filter */}
                <div className="sm:col-span-3">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="text-xs sm:text-sm">
                            <div className="flex items-center gap-2 truncate">
                                <Filter className="w-4 h-4 text-gray-500 shrink-0" />
                                <SelectValue placeholder="All Statuses" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="booked">Booked</SelectItem>
                            <SelectItem value="in_treatment">In Treatment</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="paid_out">Paid Out</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Intake Queue</CardTitle>
                    <CardDescription>
                        Review inbound patient referrals, verify partner attribution, and progress closed-loop clinical care.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50/80 border-y border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Patient</th>
                                    <th className="px-6 py-3 font-semibold">Contact & Location</th>
                                    <th className="px-6 py-3 font-semibold">Partner / Referrer</th>
                                    <th className="px-6 py-3 font-semibold">Date</th>
                                    <th className="px-6 py-3 font-semibold">Status / Commission</th>
                                    <th className="px-6 py-3 font-semibold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {filteredReferrals.map((referral: any) => (
                                    <tr key={referral._id} className="hover:bg-gray-50/80 transition-colors">
                                        {/* Patient Details */}
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
                                                <span>{referral.patientFirstName} {referral.patientLastName}</span>
                                                {referral.trackingCode && (
                                                    <a
                                                        href={`/track/${referral.trackingCode}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="font-mono text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded border border-teal-200 hover:bg-teal-100 inline-flex items-center gap-0.5"
                                                        title="Open live care tracking page"
                                                    >
                                                        <span>{referral.trackingCode}</span>
                                                        <ExternalLink className="w-2.5 h-2.5" />
                                                    </a>
                                                )}
                                            </div>
                                            {referral.partnerExternalId && (
                                                <div className="text-[11px] font-mono text-teal-700 mt-0.5">
                                                    Ext Ref: {referral.partnerExternalId}
                                                </div>
                                            )}
                                            <div className="text-xs text-gray-500 mt-1 truncate max-w-[170px]">
                                                {referral.condition || referral.reason || 'General Rehabilitation'}
                                            </div>
                                        </td>

                                        {/* Contact & Location */}
                                        <td className="px-6 py-4">
                                            <div className="text-gray-900 font-medium text-xs">{referral.patientPhone}</div>
                                            {referral.patientEmail && (
                                                <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">
                                                    {referral.patientEmail}
                                                </div>
                                            )}
                                            {(referral.city || referral.state) && (
                                                <div className="text-[11px] text-gray-500 mt-1">
                                                    {[referral.city, referral.state].filter(Boolean).join(', ')}
                                                </div>
                                            )}
                                        </td>

                                        {/* Partner Attribution & Referring Doctor */}
                                        <td className="px-6 py-4 space-y-1.5">
                                            {referral.partnerName || referral.partnerCode ? (
                                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-teal-50 text-teal-800 border border-teal-200 text-xs font-medium">
                                                    <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                                    <span className="font-semibold">{referral.partnerName || referral.partnerCode}</span>
                                                    {referral.partnerType && (
                                                        <span className="text-[10px] uppercase text-teal-600 font-mono">
                                                            ({referral.partnerType})
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="inline-flex items-center gap-1 text-xs text-gray-700 font-medium">
                                                    <UserCheck className="w-3.5 h-3.5 text-gray-400" />
                                                    <span>{referral.doctorName}</span>
                                                </div>
                                            )}

                                            {referral.hospitalClinic && referral.partnerName !== referral.hospitalClinic && (
                                                <div className="text-[11px] text-gray-500">
                                                    Clinic: {referral.hospitalClinic}
                                                </div>
                                            )}
                                        </td>

                                        {/* Date */}
                                        <td className="px-6 py-4 text-gray-500 text-xs whitespace-nowrap">
                                            {new Date(referral.createdAt).toLocaleDateString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric'
                                            })}
                                        </td>

                                        {/* Status & commission */}
                                        <td className="px-6 py-4">
                                            <Badge variant={
                                                referral.status === 'completed' || referral.status === 'paid_out' ? 'default' :
                                                    referral.status === 'in_treatment' ? 'default' :
                                                        referral.status === 'booked' ? 'secondary' :
                                                            referral.status === 'cancelled' ? 'destructive' :
                                                                'outline'
                                            }>
                                                {referral.status.replace('_', ' ').toUpperCase()}
                                            </Badge>
                                            {referral.commissionEarned && (
                                                <div className="text-xs font-semibold text-green-600 mt-1.5">
                                                    {formatCurrency(referral.commissionEarned)}
                                                </div>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="px-6 py-4 text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openUpdateModal(referral)}
                                                className="text-xs h-8"
                                            >
                                                <Settings className="w-3.5 h-3.5 mr-1.5" />
                                                Manage
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredReferrals.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            {hasActiveFilters ? (
                                                <div className="space-y-2">
                                                    <p className="font-medium text-gray-700">No referrals match your current search or filter.</p>
                                                    <Button variant="outline" size="sm" onClick={clearFilters} className="text-xs">
                                                        Reset All Filters
                                                    </Button>
                                                </div>
                                            ) : (
                                                "No inbound referrals found in the queue."
                                            )}
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
                            Change the lifecycle status or record the referral commission for {selectedReferral?.patientFirstName} {selectedReferral?.patientLastName}.
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
                                    <SelectItem value="in_treatment">In Treatment (Active Sessions)</SelectItem>
                                    <SelectItem value="completed">Completed (Outcome Sent)</SelectItem>
                                    <SelectItem value="paid_out">Paid Out (Commission Sent)</SelectItem>
                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="referral-clinic" className="text-sm font-medium">Route to clinic</label>
                            <Select value={clinicToAssign} onValueChange={setClinicToAssign}>
                                <SelectTrigger id="referral-clinic">
                                    <SelectValue placeholder="Not routed to a clinic" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Not routed to a clinic</SelectItem>
                                    {routableClinics?.map((clinic: { _id: string; name: string; city: string }) => (
                                        <SelectItem key={clinic._id} value={clinic._id}>
                                            {clinic.name}{clinic.city ? ` · ${clinic.city}` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">Only the selected clinic will see this referral in its dashboard.</p>
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

export default function AdminReferralsPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-500 animate-pulse">Loading inbound referrals...</div>}>
            <AdminReferralsContent />
        </Suspense>
    )
}
