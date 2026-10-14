"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";
import {
    Loader2,
    Clock,
    ArrowRight,
    Banknote,
    ExternalLink,
    X,
    CheckCircle2,
    Phone,
    User,
    Mail,
    ChevronDown,
} from "lucide-react";

// Session type options for physiotherapy
const SESSION_TYPES = [
    {
        id: "initial",
        title: "Initial Consultation",
        description: "Comprehensive assessment & treatment plan",
        duration: 60,
    },
    {
        id: "followup",
        title: "Follow-up Session",
        description: "Standard therapy session",
        duration: 45,
    },
    {
        id: "quick",
        title: "Quick Check-in",
        description: "Brief progress review",
        duration: 30,
    },
];

// ── MediLoan Self-Service Widget ──────────────────────────────────────────────
type LoanFormState = "idle" | "open" | "submitting" | "success" | "error";

function MediLoanWidget({ physiotherapistName }: { physiotherapistName: string }) {
    const [state, setState] = useState<LoanFormState>("idle");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [gender, setGender] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setState("submitting");
        try {
            const res = await fetch("/api/myitura/loan-request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    email: email.trim() || undefined,
                    phone: phone.trim(),
                    gender: gender || undefined,
                    treatment: `Physiotherapy with ${physiotherapistName}`,
                    treatmentAmount: undefined, // patient doesn't specify amount here
                    physiotherapistName,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "Failed to submit loan request.");
            setState("success");
        } catch (err: any) {
            setError(err.message || "Something went wrong. Please try again.");
            setState("error");
        }
    };

    // ── Idle: collapsed trigger button ──
    if (state === "idle") {
        return (
            <div className="mt-6">
                <button
                    onClick={() => setState("open")}
                    className="w-full bg-white/[0.05] rounded-xl border border-emerald-800/40 p-5 text-left hover:border-emerald-600/50 transition-all group relative overflow-hidden"
                >
                    <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center group-hover:bg-emerald-500/25 transition-colors">
                                <Banknote className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="text-white font-semibold text-sm">
                                    Seek Loan from Our Partners — MediLoan
                                </h3>
                                <p className="text-emerald-400/70 text-xs">
                                    Get treated now, pay later · Powered by MyItura
                                </p>
                            </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-emerald-400/60 group-hover:text-emerald-400 transition-colors" />
                    </div>
                </button>
            </div>
        );
    }

    // ── Success state ──
    if (state === "success") {
        return (
            <div className="mt-6 bg-white/[0.05] rounded-xl border border-emerald-600/50 p-5">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-semibold text-sm">Request Received!</h3>
                        <p className="text-emerald-400/80 text-xs">The Rehabify team has been notified</p>
                    </div>
                </div>
                <p className="text-white/65 text-[13px] leading-relaxed">
                    Your MediLoan request has been submitted. The Rehabify Health team will review it and
                    initiate your loan. You&#39;ll receive an <span className="text-emerald-400 font-medium">SMS from MediLoan</span> with
                    a secure link to complete your application.
                </p>
                <p className="text-white/40 text-[11px] mt-3 leading-relaxed border-t border-white/10 pt-2">
                    All loan matters are handled by MediLoan (MyItura) — an independent third party. Rehabify Health does not manage loan repayments.
                </p>
            </div>
        );
    }

    // ── Open / submitting / error: application form ──
    return (
        <div className="mt-6 bg-white/[0.05] rounded-xl border border-emerald-700/40 p-5 relative overflow-hidden">
            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                            <Banknote className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-white font-semibold text-sm">Apply for MediLoan</h3>
                            <p className="text-emerald-400/70 text-xs">Independent financing by MyItura</p>
                        </div>
                    </div>
                    <button
                        onClick={() => { setState("idle"); setError(""); }}
                        className="text-white/50 hover:text-white/80 transition-colors p-1"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <p className="text-white/65 text-[13px] leading-relaxed mb-4">
                    Fill in your details and MediLoan will SMS you a secure link to complete your loan application.
                    You can specify the exact treatment amount directly inside MediLoan&#39;s app.
                </p>

                <form onSubmit={handleSubmit} className="space-y-3">
                    {/* Name row */}
                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="First name"
                                required
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                className="w-full bg-white/[0.06] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm placeholder:text-white/40 focus:border-emerald-600/60 focus:outline-none transition-colors"
                            />
                        </div>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Last name"
                                required
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                className="w-full bg-white/[0.06] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm placeholder:text-white/40 focus:border-emerald-600/60 focus:outline-none transition-colors"
                            />
                        </div>
                    </div>

                    {/* Phone */}
                    <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50 pointer-events-none" />
                        <input
                            type="tel"
                            placeholder="Phone number (e.g. 08012345678)"
                            required
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full bg-white/[0.06] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm placeholder:text-white/40 focus:border-emerald-600/60 focus:outline-none transition-colors"
                        />
                    </div>

                    {/* Email (optional) */}
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50 pointer-events-none" />
                        <input
                            type="email"
                            placeholder="Email address (optional)"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-white/[0.06] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm placeholder:text-white/40 focus:border-emerald-600/60 focus:outline-none transition-colors"
                        />
                    </div>

                    {/* Gender (optional) */}
                    <div className="relative">
                        <select
                            value={gender}
                            onChange={(e) => setGender(e.target.value)}
                            className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/65 focus:border-emerald-600/60 focus:outline-none transition-colors appearance-none"
                        >
                            <option value="">Gender (optional)</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Prefer not to say</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50 pointer-events-none" />
                    </div>

                    {/* Error */}
                    {error && (
                        <p className="text-red-400 text-xs bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={state === "submitting"}
                        className="w-full bg-white text-[#002e2c] hover:bg-emerald-50 disabled:opacity-60 disabled:cursor-not-allowed font-semibold py-2.5 rounded-lg text-sm transition-all flex items-center justify-center gap-2"
                    >
                        {state === "submitting" ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Sending Application...</>
                        ) : (
                            <><Banknote className="w-4 h-4" /> Apply for MediLoan</>
                        )}
                    </button>
                </form>

                {/* Legal disclaimer */}
                <p className="text-white/40 text-[10px] mt-3 leading-relaxed border-t border-white/10 pt-2">
                    MediLoan is a service by MyItura — an independent third party. Rehabify Health does not manage,
                    guarantee, or take responsibility for loan outcomes. All loan queries go directly to MediLoan.{" "}
                    <a
                        href="https://myitura.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-600 hover:text-emerald-500 inline-flex items-center gap-0.5"
                    >
                        myitura.com <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                </p>
            </div>
        </div>
    );
}

// Helper: check if a string looks like a valid Convex document ID
// Convex IDs are alphanumeric strings — slugs contain hyphens
function looksLikeConvexId(value: string): boolean {
    return /^[a-zA-Z0-9_]+$/.test(value) && value.length > 10;
}

// ── Main Booking Page ─────────────────────────────────────────────────────────
export default function PhysioBookingPage() {
    const params = useParams();
    const router = useRouter();
    const rawParam = params.physiotherapistId as string;

    // Determine if the URL param is a slug or a raw Convex ID
    const isRawId = looksLikeConvexId(rawParam);

    // Try resolving as a slug (skip if it already looks like a raw Convex ID)
    const slugResult = useQuery(
        api.marketplace.search.resolveBookingSlug,
        isRawId ? "skip" : { slug: rawParam }
    );

    // Determine the real userId:
    // - If it's a raw Convex ID, use it directly
    // - If slug resolved, use the resolved userId
    // - If slug lookup is still loading (undefined), we don't have an ID yet
    // - If slug lookup returned null (no match), there's no valid ID
    const resolvedUserId: Id<"users"> | null =
        isRawId
            ? (rawParam as Id<"users">)
            : slugResult?.userId ?? null;

    // Fetch physio profile — skip until we have a valid user ID
    const profile = useQuery(
        api.marketplace.search.getPhysiotherapistProfile,
        resolvedUserId ? { physiotherapistId: resolvedUserId } : "skip"
    );

    // Still loading: slug resolution in progress or profile query pending
    const isLoading =
        (!isRawId && slugResult === undefined) || // slug still resolving
        (resolvedUserId !== null && profile === undefined); // profile still loading

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#005b57] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-teal-300" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-[#005b57] flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    <div className="bg-[#00443e] rounded-xl border border-white/10 p-8 text-center">
                        <div className="w-16 h-16 rounded-full bg-white/[0.07] flex items-center justify-center mx-auto mb-6">
                            <svg className="w-8 h-8 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <h1 className="text-xl font-semibold text-white mb-2">Profile Not Available</h1>
                        <p className="text-white/65 text-sm mb-6 leading-relaxed">
                            This physiotherapist hasn&#39;t enabled their booking page yet.
                            <br />
                            <span className="text-white/50">
                                If you&#39;re the owner of this profile, please enable your profile on the marketplace to start accepting bookings.
                            </span>
                        </p>
                        <div className="space-y-3">
                            <a href="/dashboard/physiotherapist/settings/marketplace" className="block w-full py-3 px-4 bg-white text-[#002e2c] hover:bg-emerald-50 rounded-lg font-medium transition-colors text-center">
                                Enable My Profile
                            </a>
                        </div>
                    </div>
                    <div className="mt-6 text-center">
                        <p className="text-white/40 text-xs">Powered by</p>
                        <p className="text-white/50 text-sm font-medium">Rehabify Health</p>
                    </div>
                </div>
            </div>
        );
    }

    const handleSessionSelect = (duration: number) => {
        router.push(`/book/${rawParam}/${duration}`);
    };

    return (
        <div className="min-h-screen bg-[#005b57] flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Profile Card */}
                <div className="bg-[#00443e] rounded-xl border border-white/10 p-6 mb-6">
                    <div className="flex items-center gap-4 mb-2">
                        {profile.imageUrl ? (
                            <Image
                                src={profile.imageUrl}
                                alt={profile.fullName}
                                width={64}
                                height={64}
                                className="rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-[#005b57] flex items-center justify-center text-white text-xl font-bold">
                                {profile.fullName.split(" ").map((n: string) => n[0]).join("")}
                            </div>
                        )}
                    </div>
                    <h1 className="text-xl font-bold text-white mt-4">{profile.fullName}</h1>
                    {profile.specializations && profile.specializations.length > 0 && (
                        <p className="text-white/65 text-sm mt-1">
                            {profile.specializations.slice(0, 2).join(" • ")}
                        </p>
                    )}
                </div>

                {/* Session Types */}
                <div className="space-y-3">
                    {SESSION_TYPES.map((session) => (
                        <button
                            key={session.id}
                            onClick={() => handleSessionSelect(session.duration)}
                            className="w-full bg-[#00443e] border border-white/10 rounded-xl p-5 text-left hover:border-white/15 hover:bg-[#003d38] transition-all group"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-white font-semibold text-lg">{session.title}</h3>
                                    {session.description && (
                                        <p className="text-white/50 text-sm mt-1">{session.description}</p>
                                    )}
                                    <div className="flex items-center gap-1 mt-2 text-white/65">
                                        <Clock className="w-4 h-4" />
                                        <span className="text-sm">{session.duration}m</span>
                                    </div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-white/40 group-hover:text-teal-200 transition-colors" />
                            </div>
                        </button>
                    ))}
                </div>

                {/* MediLoan Patient Self-Service Widget */}
                <MediLoanWidget physiotherapistName={profile.fullName} />

                {/* Footer */}
                <div className="mt-8 text-center">
                    <p className="text-white/40 text-sm">Powered by</p>
                    <p className="text-white/65 font-medium">Rehabify Health</p>
                </div>
            </div>
        </div>
    );
}
