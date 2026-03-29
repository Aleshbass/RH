'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import {
    ShieldCheck, ShieldAlert, Clock, Search, Check, X, ChevronDown,
    FileText, Eye, Loader2, ArrowLeft, ExternalLink, User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';

type RegistrationStatus = 'pending' | 'verified' | 'rejected';

interface RegistryEntry {
    _id: Id<"physioRegistry">;
    fullName: string;
    email: string;
    phone: string;
    practiceName?: string;
    practiceAddress?: string;
    yearsOfExperience: number;
    licenseNumber: string;
    regulatoryBody: string;
    licenseCountry: string;
    licenseExpiryDate: string;
    specialties: string[];
    languages: string[];
    bio?: string;
    websiteUrl?: string;
    verificationStatus: string;
    rejectionReason?: string;
    verifiedAt?: number;
    submittedAt: number;
}

export default function PhysioRegistryAdminPage() {
    const [statusFilter, setStatusFilter] = useState<RegistrationStatus | undefined>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedId, setSelectedId] = useState<Id<"physioRegistry"> | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [showRejectDialog, setShowRejectDialog] = useState(false);

    const registrations = useQuery(api.physioRegistry.adminListRegistrations, {
        status: statusFilter,
    });

    const selectedEntry = useQuery(
        api.physioRegistry.adminGetRegistration,
        selectedId ? { id: selectedId } : 'skip'
    );

    const approve = useMutation(api.physioRegistry.adminApprove);
    const reject = useMutation(api.physioRegistry.adminReject);

    const [isActioning, setIsActioning] = useState(false);

    const handleApprove = async (id: Id<"physioRegistry">) => {
        setIsActioning(true);
        try {
            await approve({ id });
            toast.success("Registration approved!");
            setSelectedId(null);
        } catch (e: any) {
            toast.error(e.message || "Failed to approve");
        } finally {
            setIsActioning(false);
        }
    };

    const handleReject = async (id: Id<"physioRegistry">) => {
        if (!rejectionReason.trim()) {
            toast.error("Please provide a rejection reason");
            return;
        }
        setIsActioning(true);
        try {
            await reject({ id, reason: rejectionReason });
            toast.success("Registration rejected");
            setSelectedId(null);
            setShowRejectDialog(false);
            setRejectionReason('');
        } catch (e: any) {
            toast.error(e.message || "Failed to reject");
        } finally {
            setIsActioning(false);
        }
    };

    const filteredRegistrations = registrations?.filter((r: RegistryEntry) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return r.fullName.toLowerCase().includes(q) ||
            r.licenseNumber.toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q);
    });

    const statusCounts = {
        pending: registrations?.filter((r: RegistryEntry) => r.verificationStatus === 'pending').length || 0,
        verified: registrations?.filter((r: RegistryEntry) => r.verificationStatus === 'verified').length || 0,
        rejected: registrations?.filter((r: RegistryEntry) => r.verificationStatus === 'rejected').length || 0,
    };

    const statusBadge = (status: RegistrationStatus) => {
        const styles = {
            pending: 'bg-amber-100 text-amber-700',
            verified: 'bg-green-100 text-green-700',
            rejected: 'bg-red-100 text-red-700',
        };
        const icons = {
            pending: <Clock className="w-3 h-3" />,
            verified: <ShieldCheck className="w-3 h-3" />,
            rejected: <ShieldAlert className="w-3 h-3" />,
        };
        return (
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", styles[status])}>
                {icons[status]} {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
        );
    };

    // Detail view
    if (selectedId) {
        if (!selectedEntry) {
            return (
                <div className="p-6 max-w-4xl flex items-center justify-center min-h-[400px]">
                    <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                </div>
            );
        }

        return (
            <div className="p-6 max-w-4xl">
                <button
                    onClick={() => { setSelectedId(null); setShowRejectDialog(false); setRejectionReason(''); }}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to list
                </button>

                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex items-start gap-4">
                            {selectedEntry.profilePhotoUrl ? (
                                <img src={selectedEntry.profilePhotoUrl} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-gray-100" />
                            ) : (
                                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                                    <User className="w-7 h-7 text-gray-400" />
                                </div>
                            )}
                            <div>
                                <h2 className="text-xl font-bold text-[#002e2c]">{selectedEntry.fullName}</h2>
                                <p className="text-sm text-gray-500">{selectedEntry.email} · {selectedEntry.phone}</p>
                                <div className="mt-1">{statusBadge(selectedEntry.verificationStatus as RegistrationStatus)}</div>
                            </div>
                        </div>

                        {selectedEntry.verificationStatus === 'pending' && (
                            <div className="flex gap-2">
                                <Button
                                    onClick={() => handleApprove(selectedEntry._id)}
                                    disabled={isActioning}
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                    {isActioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" /> Approve</>}
                                </Button>
                                <Button
                                    onClick={() => setShowRejectDialog(true)}
                                    variant="outline"
                                    className="border-red-200 text-red-600 hover:bg-red-50"
                                >
                                    <X className="w-4 h-4 mr-1" /> Reject
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Rejection dialog */}
                    {showRejectDialog && (
                        <div className="mb-6 p-4 bg-red-50 rounded-xl border border-red-200">
                            <h4 className="text-sm font-semibold text-red-700 mb-2">Rejection Reason</h4>
                            <Textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Explain why this registration is being rejected..."
                                className="mb-3"
                            />
                            <div className="flex gap-2">
                                <Button
                                    onClick={() => handleReject(selectedEntry._id)}
                                    disabled={isActioning}
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                >
                                    {isActioning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Rejection'}
                                </Button>
                                <Button variant="ghost" onClick={() => { setShowRejectDialog(false); setRejectionReason(''); }}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}

                    {selectedEntry.rejectionReason && (
                        <div className="mb-6 p-4 bg-red-50 rounded-xl border border-red-200">
                            <h4 className="text-sm font-semibold text-red-700 mb-1">Rejection Reason</h4>
                            <p className="text-sm text-red-600">{selectedEntry.rejectionReason}</p>
                        </div>
                    )}

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-6 mb-6">
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider">Personal Info</h3>
                            <div className="space-y-2 text-sm">
                                <div><span className="text-gray-400">Full Name:</span> <strong>{selectedEntry.fullName}</strong></div>
                                <div><span className="text-gray-400">Email:</span> <strong>{selectedEntry.email}</strong></div>
                                <div><span className="text-gray-400">Phone:</span> <strong>{selectedEntry.phone}</strong></div>
                                {selectedEntry.practiceName && <div><span className="text-gray-400">Practice:</span> <strong>{selectedEntry.practiceName}</strong></div>}
                                {selectedEntry.practiceAddress && <div><span className="text-gray-400">Address:</span> <strong>{selectedEntry.practiceAddress}</strong></div>}
                                <div><span className="text-gray-400">Experience:</span> <strong>{selectedEntry.yearsOfExperience} years</strong></div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider">License Details</h3>
                            <div className="space-y-2 text-sm">
                                <div><span className="text-gray-400">License #:</span> <strong>{selectedEntry.licenseNumber}</strong></div>
                                <div><span className="text-gray-400">Regulatory Body:</span> <strong>{selectedEntry.regulatoryBody}</strong></div>
                                <div><span className="text-gray-400">Country:</span> <strong>{selectedEntry.licenseCountry}</strong></div>
                                <div><span className="text-gray-400">Expiry:</span> <strong>{selectedEntry.licenseExpiryDate}</strong></div>
                            </div>
                        </div>
                    </div>

                    {/* Specialties & Languages */}
                    {(selectedEntry.specialties.length > 0 || selectedEntry.languages.length > 0) && (
                        <div className="mb-6">
                            {selectedEntry.specialties.length > 0 && (
                                <div className="mb-3">
                                    <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider mb-2">Specialties</h3>
                                    <div className="flex flex-wrap gap-1.5">
                                        {selectedEntry.specialties.map((s: string) => (
                                            <span key={s} className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full text-xs border border-teal-100">{s}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedEntry.languages.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider mb-2">Languages</h3>
                                    <p className="text-sm text-gray-600">{selectedEntry.languages.join(', ')}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {selectedEntry.bio && (
                        <div className="mb-6">
                            <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider mb-2">Bio</h3>
                            <p className="text-sm text-gray-600">{selectedEntry.bio}</p>
                        </div>
                    )}

                    {/* Uploaded documents */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider">Uploaded Documents</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedEntry.licenseCertUrl && (
                                <a
                                    href={selectedEntry.licenseCertUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-teal-50 hover:border-teal-200 transition-colors"
                                >
                                    <FileText className="w-5 h-5 text-[#005b57]" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-800">License Certificate</p>
                                        <p className="text-xs text-gray-400">Click to view</p>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-gray-400" />
                                </a>
                            )}
                            {selectedEntry.photoIdUrl && (
                                <a
                                    href={selectedEntry.photoIdUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-teal-50 hover:border-teal-200 transition-colors"
                                >
                                    <FileText className="w-5 h-5 text-[#005b57]" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-800">Government Photo ID</p>
                                        <p className="text-xs text-gray-400">Click to view</p>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-gray-400" />
                                </a>
                            )}
                            {selectedEntry.insuranceUrl && (
                                <a
                                    href={selectedEntry.insuranceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-teal-50 hover:border-teal-200 transition-colors"
                                >
                                    <FileText className="w-5 h-5 text-[#005b57]" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-800">Proof of Insurance</p>
                                        <p className="text-xs text-gray-400">Click to view</p>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-gray-400" />
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400">
                        Submitted on {new Date(selectedEntry.submittedAt).toLocaleString()}
                        {selectedEntry.verifiedAt && ` · Verified on ${new Date(selectedEntry.verifiedAt).toLocaleString()}`}
                    </div>
                </div>
            </div>
        );
    }

    // List view
    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-[#002e2c]">Physio Registry</h1>
                    <p className="text-sm text-gray-500">Review and verify physiotherapist registrations</p>
                </div>
            </div>

            {/* Status tabs */}
            <div className="flex gap-2 mb-4">
                {(['pending', 'verified', 'rejected'] as RegistrationStatus[]).map(status => (
                    <button
                        key={status}
                        onClick={() => setStatusFilter(statusFilter === status ? undefined : status as any)}
                        className={cn(
                            "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                            statusFilter === status
                                ? status === 'pending' ? 'bg-amber-100 text-amber-700'
                                    : status === 'verified' ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        )}
                    >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                ))}
                <button
                    onClick={() => setStatusFilter(undefined)}
                    className={cn(
                        "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                        !statusFilter ? 'bg-[#005b57] text-white' : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                >
                    All
                </button>
            </div>

            {/* Search */}
            <div className="mb-6">
                <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, license number, or email..."
                    className="h-11 max-w-md"
                />
            </div>

            {/* Table */}
            {!registrations ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
            ) : filteredRegistrations && filteredRegistrations.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <ShieldAlert className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p>No registrations found</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                <th className="text-left py-3 px-4 font-medium text-gray-500">Name</th>
                                <th className="text-left py-3 px-4 font-medium text-gray-500">License #</th>
                                <th className="text-left py-3 px-4 font-medium text-gray-500">Body</th>
                                <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                                <th className="text-left py-3 px-4 font-medium text-gray-500">Submitted</th>
                                <th className="text-right py-3 px-4 font-medium text-gray-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRegistrations?.map((reg: RegistryEntry) => (
                                <tr
                                    key={reg._id}
                                    className="border-b border-gray-50 hover:bg-teal-50/30 transition-colors cursor-pointer"
                                    onClick={() => setSelectedId(reg._id)}
                                >
                                    <td className="py-3 px-4">
                                        <div className="font-medium text-[#002e2c]">{reg.fullName}</div>
                                        <div className="text-xs text-gray-400">{reg.email}</div>
                                    </td>
                                    <td className="py-3 px-4 font-mono text-xs">{reg.licenseNumber}</td>
                                    <td className="py-3 px-4 text-gray-600">{reg.regulatoryBody}</td>
                                    <td className="py-3 px-4">{statusBadge(reg.verificationStatus as RegistrationStatus)}</td>
                                    <td className="py-3 px-4 text-gray-500">
                                        {new Date(reg.submittedAt).toLocaleDateString()}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <Button variant="ghost" size="sm" className="text-[#005b57]">
                                            <Eye className="w-4 h-4 mr-1" /> Review
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
