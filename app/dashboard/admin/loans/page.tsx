"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
    WalletCards, Clock, CheckCircle, XCircle, BanknoteIcon,
    Loader2, RefreshCw, AlertCircle, ChevronRight, Phone, Mail, User
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── Status config ──────────────────────────────────────────────────────────────
const LOAN_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    initiated: { label: "SMS Sent",     variant: "outline" },
    pending:   { label: "Applying",     variant: "secondary" },
    approved:  { label: "Approved",     variant: "default" },
    disbursed: { label: "Disbursed",    variant: "default" },
    declined:  { label: "Declined",     variant: "destructive" },
    expired:   { label: "Expired",      variant: "outline" },
    failed:    { label: "Failed",       variant: "destructive" },
    repaid:    { label: "Fully Repaid", variant: "default" },
};

const REQUEST_STATUS: Record<string, { label: string; color: string }> = {
    pending:   { label: "Awaiting Action",  color: "bg-amber-100 text-amber-700 border-amber-200" },
    initiated: { label: "Loan Initiated",   color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    cancelled: { label: "Cancelled",        color: "bg-gray-100 text-gray-600 border-gray-200" },
};

// ── Initiate loan modal ────────────────────────────────────────────────────────
interface InitiateModalProps {
    request: any;
    onClose: () => void;
    onSuccess: () => void;
}

function InitiateModal({ request, onClose, onSuccess }: InitiateModalProps) {
    const [amount, setAmount] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleInitiate = async () => {
        const amountKobo = Math.round(parseFloat(amount) * 100);
        if (!amount || isNaN(amountKobo) || amountKobo <= 0) {
            setError("Please enter a valid treatment amount in Naira.");
            return;
        }
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/myitura/initiate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    loanRequestId: request._id,
                    firstName: request.patientFirstName,
                    lastName: request.patientLastName,
                    phoneNumber: request.patientPhone,
                    email: request.patientEmail,
                    treatment: request.treatment,
                    treatmentAmount: amountKobo,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "Failed to initiate loan.");
            onSuccess();
        } catch (err: any) {
            setError(err.message || "Failed to initiate loan. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5">
                    <h2 className="text-white font-bold text-lg">Initiate MediLoan</h2>
                    <p className="text-emerald-100 text-sm mt-1">
                        This will call the MyItura SDK. The patient will receive an SMS application link automatically.
                    </p>
                </div>

                {/* Patient Summary */}
                <div className="px-6 py-4 bg-gray-50 border-b">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-semibold text-gray-800">
                                {request.patientFirstName} {request.patientLastName}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-600">{request.patientPhone}</span>
                        </div>
                        {request.patientEmail && (
                            <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-600">{request.patientEmail}</span>
                            </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1 pl-6">Treatment: {request.treatment}</p>
                    </div>
                </div>

                {/* Amount input */}
                <div className="px-6 py-5 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Treatment Amount (₦) <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">₦</span>
                            <input
                                type="number"
                                placeholder="e.g. 50000"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                            />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Enter the full treatment amount in Nigerian Naira.</p>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                            <p className="text-red-600 text-sm">{error}</p>
                        </div>
                    )}

                    {/* Warning */}
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-amber-700 text-xs leading-relaxed">
                            This action is irreversible. Once initiated, MyItura will send an SMS to the patient and the loan process begins.
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 pb-5 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleInitiate}
                        disabled={loading || !amount}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Initiating...</>
                        ) : (
                            <>Initiate Loan <ChevronRight className="w-4 h-4" /></>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Admin Loans Page ──────────────────────────────────────────────────────
type TabId = "requests" | "applications";

export default function AdminLoansPage() {
    const [activeTab, setActiveTab] = useState<TabId>("requests");
    const [initiatingRequest, setInitiatingRequest] = useState<any | null>(null);
    const [successId, setSuccessId] = useState<string | null>(null);

    const cancelLoanRequest = useMutation(api.mediloan.cancelLoanRequest);

    // Queries
    const pendingRequests = useQuery(api.mediloan.getAllLoanRequests, { status: "pending" });
    const allRequests     = useQuery(api.mediloan.getAllLoanRequests, {});
    const loans           = useQuery(api.mediloan.getAllLoans);

    const isLoading = pendingRequests === undefined || loans === undefined;

    // Stats
    const pendingCount   = pendingRequests?.length ?? 0;
    const totalLoans     = loans?.length ?? 0;
    const approvedLoans  = loans?.filter((l: any) => l.status === "approved" || l.status === "disbursed").length ?? 0;
    const disbursedValue = loans?.filter((l: any) => l.status === "disbursed" || l.status === "repaid")
        .reduce((s: number, l: any) => s + l.amount, 0) ?? 0;

    const handleCancelRequest = async (requestId: Id<"loanRequests">) => {
        if (!confirm("Cancel this loan request?")) return;
        await cancelLoanRequest({ requestId, adminNotes: "Dismissed by admin" });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">MediLoan Management</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Review patient loan requests and initiate loans via MyItura on their behalf.
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
                        <p className="text-xs text-gray-400 mt-0.5">Awaiting your action</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Initiated</CardTitle>
                        <WalletCards className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalLoans}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Approved / Disbursed</CardTitle>
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-600">{approvedLoans}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Disbursed Value</CardTitle>
                        <BanknoteIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">₦{(disbursedValue / 100).toLocaleString()}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <nav className="flex gap-6">
                    {[
                        { id: "requests" as TabId, label: "Loan Requests", count: pendingCount },
                        { id: "applications" as TabId, label: "Initiated Loans", count: totalLoans },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                                activeTab === tab.id
                                    ? "border-emerald-600 text-emerald-700"
                                    : "border-transparent text-gray-500 hover:text-gray-700"
                            }`}
                        >
                            {tab.label}
                            {tab.id === "requests" && tab.count > 0 && (
                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                </div>
            ) : (
                <>
                    {/* ── Loan Requests Tab ── */}
                    {activeTab === "requests" && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Patient Loan Requests</CardTitle>
                                <CardDescription>
                                    Patients who submitted a MediLoan interest form. Review and click
                                    <strong> "Initiate Loan"</strong> to call the MyItura SDK — the patient will receive an SMS automatically.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                                            <tr>
                                                <th className="px-5 py-3 font-semibold">Patient</th>
                                                <th className="px-5 py-3 font-semibold">Treatment</th>
                                                <th className="px-5 py-3 font-semibold">Submitted</th>
                                                <th className="px-5 py-3 font-semibold">Status</th>
                                                <th className="px-5 py-3 font-semibold">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {allRequests?.map((req: any) => {
                                                const statusCfg = REQUEST_STATUS[req.status] || REQUEST_STATUS.pending;
                                                const isJustInitiated = successId === req._id;
                                                return (
                                                    <tr key={req._id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-5 py-4">
                                                            <div className="font-semibold text-gray-900">
                                                                {req.patientFirstName} {req.patientLastName}
                                                            </div>
                                                            <div className="text-xs text-gray-400 mt-0.5">{req.patientPhone}</div>
                                                            {req.patientEmail && (
                                                                <div className="text-xs text-gray-400">{req.patientEmail}</div>
                                                            )}
                                                        </td>
                                                        <td className="px-5 py-4 text-gray-600 max-w-[200px]">
                                                            <p className="truncate">{req.treatment}</p>
                                                        </td>
                                                        <td className="px-5 py-4 text-gray-400 whitespace-nowrap text-xs">
                                                            {new Date(req.createdAt).toLocaleDateString("en-NG", {
                                                                day: "numeric", month: "short", year: "numeric",
                                                            })}
                                                            <br />
                                                            {new Date(req.createdAt).toLocaleTimeString("en-NG", {
                                                                hour: "2-digit", minute: "2-digit",
                                                            })}
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusCfg.color}`}>
                                                                {isJustInitiated ? "✓ Initiated" : statusCfg.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            {req.status === "pending" && (
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => setInitiatingRequest(req)}
                                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
                                                                    >
                                                                        <BanknoteIcon className="w-3.5 h-3.5" />
                                                                        Initiate Loan
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleCancelRequest(req._id)}
                                                                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 text-xs font-medium rounded-lg transition-colors"
                                                                    >
                                                                        <XCircle className="w-3.5 h-3.5" />
                                                                        Dismiss
                                                                    </button>
                                                                </div>
                                                            )}
                                                            {req.status === "initiated" && (
                                                                <span className="text-xs text-emerald-600 font-medium">
                                                                    SMS sent to patient
                                                                </span>
                                                            )}
                                                            {req.status === "cancelled" && (
                                                                <span className="text-xs text-gray-400">Dismissed</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {(!allRequests || allRequests.length === 0) && (
                                                <tr>
                                                    <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                                                        <Clock className="w-8 h-8 mx-auto mb-3 text-gray-200" />
                                                        <p>No loan requests yet.</p>
                                                        <p className="text-xs mt-1">When a patient submits a MediLoan request on a booking page, it will appear here.</p>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ── Initiated Loans Tab ── */}
                    {activeTab === "applications" && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Initiated Loan Applications</CardTitle>
                                <CardDescription>
                                    Loans formally submitted to MyItura. Status updates arrive automatically via webhook.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                                            <tr>
                                                <th className="px-5 py-3 font-semibold">Patient</th>
                                                <th className="px-5 py-3 font-semibold">Treatment</th>
                                                <th className="px-5 py-3 font-semibold">Amount</th>
                                                <th className="px-5 py-3 font-semibold">Status</th>
                                                <th className="px-5 py-3 font-semibold">SDK Ref</th>
                                                <th className="px-5 py-3 font-semibold">Initiated</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {loans?.map((loan: any) => {
                                                const statusCfg = LOAN_STATUS[loan.status] || { label: loan.status, variant: "outline" as const };
                                                return (
                                                    <tr key={loan._id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-5 py-4">
                                                            <div className="font-semibold text-gray-900">
                                                                {loan.patientFirstName} {loan.patientLastName}
                                                            </div>
                                                            <div className="text-xs text-gray-400 mt-0.5">{loan.patientPhone}</div>
                                                        </td>
                                                        <td className="px-5 py-4 text-gray-600 max-w-[200px] truncate">
                                                            {loan.treatment}
                                                        </td>
                                                        <td className="px-5 py-4 font-semibold text-gray-900">
                                                            ₦{(loan.amount / 100).toLocaleString()}
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                                                            {loan.repaymentStatus && (
                                                                <div className="text-xs text-gray-400 mt-1">
                                                                    Repayment: {loan.repaymentStatus}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-5 py-4 font-mono text-xs text-gray-400">
                                                            {loan.myituraSdkRef || "—"}
                                                        </td>
                                                        <td className="px-5 py-4 text-gray-400 whitespace-nowrap text-xs">
                                                            {loan.createdAt
                                                                ? new Date(loan.createdAt).toLocaleDateString("en-NG", {
                                                                    day: "numeric", month: "short", year: "numeric",
                                                                })
                                                                : "—"}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {(!loans || loans.length === 0) && (
                                                <tr>
                                                    <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                                                        <BanknoteIcon className="w-8 h-8 mx-auto mb-3 text-gray-200" />
                                                        <p>No loans initiated yet.</p>
                                                        <p className="text-xs mt-1">Initiate a loan from the "Loan Requests" tab.</p>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}

            {/* Initiate Modal */}
            {initiatingRequest && (
                <InitiateModal
                    request={initiatingRequest}
                    onClose={() => setInitiatingRequest(null)}
                    onSuccess={() => {
                        setSuccessId(initiatingRequest._id);
                        setInitiatingRequest(null);
                    }}
                />
            )}
        </div>
    );
}
