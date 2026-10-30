"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import {
    Banknote,
    CheckCircle2,
    ChevronDown,
    ExternalLink,
    Loader2,
    Mail,
    Phone,
    User,
    X,
} from "@/components/icons";
import { PhysioHostCard } from "@/components/booking/PhysioHostCard";
import { BookingShell, PoweredBy } from "@/components/booking/BookingShell";
import { PublicProof } from "@/components/outcomes/PublicProof";
import { ServiceOption } from "@/components/booking/ServiceOption";
import {
    bookableServices,
    looksLikeConvexId,
    type BookingProfile,
    type Catalogue,
} from "@/components/booking/booking-shared";

// ── MediLoan Self-Service Widget ──────────────────────────────────────────────
type LoanFormState = "idle" | "open" | "submitting" | "success" | "error";

const loanField =
    "w-full rounded-xl border border-white/10 bg-white/[0.06] py-2.5 pl-9 pr-3 text-base text-white placeholder:text-white/40 sm:text-sm transition-colors focus:border-rh-lime/60 focus:outline-none focus:ring-2 focus:ring-rh-lime/25";

function MediLoanWidget({ physiotherapistName, physiotherapistId }: { physiotherapistName: string; physiotherapistId?: string }) {
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
                    physiotherapistId,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "Failed to submit loan request.");
            setState("success");
        } catch (err) {
            setError((err as Error)?.message || "Something went wrong. Please try again.");
            setState("error");
        }
    };

    if (state === "idle") {
        return (
            <button
                type="button"
                onClick={() => setState("open")}
                className="group mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition-colors hover:border-white/20 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
            >
                <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rh-lime/15">
                        <Banknote className="h-5 w-5 text-rh-lime" />
                    </span>
                    <span>
                        <span className="block text-sm font-semibold text-white">Spread the cost with MediLoan</span>
                        <span className="block text-xs text-white/55">Get treated now, pay later · by MyItura</span>
                    </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-white/50 transition-colors group-hover:text-white" />
            </button>
        );
    }

    if (state === "success") {
        return (
            <div className="mt-4 rounded-2xl border border-rh-lime/40 bg-white/[0.05] p-5">
                <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rh-lime/20">
                        <CheckCircle2 className="h-5 w-5 text-rh-lime" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-white">Request received</h3>
                        <p className="text-xs text-white/60">The Rehabify team has been notified</p>
                    </div>
                </div>
                <p className="text-[13px] leading-relaxed text-white/70">
                    We&#39;ll review your MediLoan request and start the loan. You&#39;ll get an{" "}
                    <span className="font-medium text-rh-lime">SMS from MediLoan</span> with a secure link to finish your application.
                </p>
                <p className="mt-3 border-t border-white/10 pt-2 text-[11px] leading-relaxed text-white/45">
                    All loan matters are handled by MediLoan (MyItura), an independent third party. Rehabify Health does not manage loan repayments.
                </p>
            </div>
        );
    }

    return (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] p-5">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rh-lime/15">
                        <Banknote className="h-5 w-5 text-rh-lime" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-white">Apply for MediLoan</h3>
                        <p className="text-xs text-white/55">Independent financing by MyItura</p>
                    </div>
                </div>
                <button
                    type="button"
                    aria-label="Close"
                    onClick={() => {
                        setState("idle");
                        setError("");
                    }}
                    className="rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            <p className="mb-4 text-[13px] leading-relaxed text-white/65">
                Fill in your details and MediLoan will SMS you a secure link to complete your loan application.
                You can set the exact treatment amount inside MediLoan&#39;s app.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div className="relative">
                        <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
                        <input type="text" placeholder="First name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={loanField} />
                    </div>
                    <div className="relative">
                        <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
                        <input type="text" placeholder="Last name" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={loanField} />
                    </div>
                </div>
                <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
                    <input type="tel" placeholder="Phone number (e.g. 08012345678)" required value={phone} onChange={(e) => setPhone(e.target.value)} className={loanField} />
                </div>
                <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
                    <input type="email" placeholder="Email address (optional)" value={email} onChange={(e) => setEmail(e.target.value)} className={loanField} />
                </div>
                <div className="relative">
                    <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white/70 transition-colors focus:border-rh-lime/60 focus:outline-none focus:ring-2 focus:ring-rh-lime/25"
                    >
                        <option value="">Gender (optional)</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Prefer not to say</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
                </div>

                {error && (
                    <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>
                )}

                <button
                    type="submit"
                    disabled={state === "submitting"}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-rh-lime py-2.5 text-sm font-semibold text-rh-night transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {state === "submitting" ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Sending application…
                        </>
                    ) : (
                        <>
                            <Banknote className="h-4 w-4" /> Apply for MediLoan
                        </>
                    )}
                </button>
            </form>

            <p className="mt-3 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-white/45">
                MediLoan is a service by MyItura, an independent third party. Rehabify Health does not manage,
                guarantee, or take responsibility for loan outcomes. All loan queries go directly to MediLoan.{" "}
                <a href="https://myitura.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-rh-lime hover:underline">
                    myitura.com <ExternalLink className="h-2.5 w-2.5" />
                </a>
            </p>
        </div>
    );
}

// ── Main Booking Page ─────────────────────────────────────────────────────────
export default function PhysioBookingPage() {
    const params = useParams();
    const router = useRouter();
    const reduceMotion = useReducedMotion();
    const rawParam = params.physiotherapistId as string;
    const isRawId = looksLikeConvexId(rawParam);

    const slugResult = useQuery(api.marketplace.search.resolveBookingSlug, isRawId ? "skip" : { slug: rawParam }) as
        | { userId: Id<"users"> }
        | null
        | undefined;

    const resolvedUserId: Id<"users"> | null = isRawId ? (rawParam as Id<"users">) : slugResult?.userId ?? null;

    const profile = useQuery(
        api.marketplace.search.getPhysiotherapistProfile,
        resolvedUserId ? { physiotherapistId: resolvedUserId } : "skip"
    ) as BookingProfile | null | undefined;

    const catalogue = useQuery(api.serviceTariffs.getCatalogue) as Catalogue | undefined;

    const searchParams = useSearchParams();
    // Keep ?access=, ?zone=, ?area= etc. on the way to the next step
    const search = searchParams.toString() ? `?${searchParams.toString()}` : "";

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const navTimer = useRef<number | null>(null);

    const services = useMemo(
        () => bookableServices(catalogue?.services, profile?.servicesOffered ?? []),
        [catalogue, profile]
    );

    useEffect(() => {
        for (const service of services) router.prefetch(`/book/${rawParam}/${service.id}${search}`);
    }, [router, rawParam, services, search]);

    useEffect(() => {
        // Restored from the back-forward cache: let the patient pick again.
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) setSelectedId(null);
        };
        window.addEventListener("pageshow", onPageShow);
        return () => {
            window.removeEventListener("pageshow", onPageShow);
            if (navTimer.current) window.clearTimeout(navTimer.current);
        };
    }, []);

    const isLoading =
        (!isRawId && slugResult === undefined) || (resolvedUserId !== null && profile === undefined) || catalogue === undefined;

    if (isLoading) {
        return (
            <BookingShell>
                <div className="animate-pulse" aria-label="Loading booking page">
                    <div className="flex items-center gap-4">
                        <div className="h-[72px] w-[72px] rounded-full bg-white/10" />
                        <div className="space-y-2">
                            <div className="h-5 w-44 rounded-full bg-white/10" />
                            <div className="h-4 w-28 rounded-full bg-white/10" />
                        </div>
                    </div>
                    <div className="mt-6 h-16 rounded-2xl bg-white/[0.06]" />
                    <div className="mt-8 space-y-3 rounded-[28px] bg-white/[0.06] p-5">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-28 rounded-2xl bg-white/[0.06]" />
                        ))}
                    </div>
                </div>
            </BookingShell>
        );
    }

    if (!profile) {
        return (
            <BookingShell>
                <div className="rounded-[28px] bg-white p-8 text-center text-rh-night shadow-[0_30px_80px_-30px_rgba(0,0,0,0.55)]">
                    <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-rh-canvas">
                        <User className="h-8 w-8 text-rh-night/50" />
                    </div>
                    <h1 className="mb-2 text-xl font-semibold">Booking page not available</h1>
                    <p className="mb-6 text-sm leading-relaxed text-rh-night/65">
                        This physiotherapist isn&#39;t taking online bookings yet.
                        <br />
                        <span className="text-rh-night/50">
                            If this is your profile, finish your marketplace setup to start accepting bookings.
                        </span>
                    </p>
                    <Link
                        href="/dashboard/physiotherapist/settings/marketplace"
                        className="block w-full rounded-xl bg-rh-night px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-rh-teal-deep"
                    >
                        Set up my profile
                    </Link>
                </div>
                <PoweredBy />
            </BookingShell>
        );
    }

    const handleServiceSelect = (serviceId: string) => {
        if (selectedId) return;
        setSelectedId(serviceId);
        // Let the selected state register before moving on.
        navTimer.current = window.setTimeout(
            () => router.push(`/book/${rawParam}/${serviceId}${search}`),
            reduceMotion ? 120 : 340
        );
    };

    return (
        <BookingShell>
            <PhysioHostCard profile={profile} tone="dark" size="lg" />

            <section
                className="mt-8 rounded-[28px] bg-white p-3 text-rh-night shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] ring-1 ring-white/10 sm:p-4"
                aria-labelledby="services-heading"
            >
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-2 pb-3 pt-2 sm:px-3">
                    <h2 id="services-heading" className="text-lg font-semibold tracking-tight">
                        Choose a service
                    </h2>
                    <p className="text-xs text-rh-night/55">You&#39;ll see the exact price before you pay</p>
                </div>
                {services.length === 0 ? (
                    <p className="px-2 pb-4 text-sm text-rh-night/65 sm:px-3">
                        {profile.fullName} isn&#39;t taking bookings right now.{" "}
                        <Link href="/get-care" className="font-semibold text-rh-night underline underline-offset-4 hover:no-underline">
                            Find another physiotherapist
                        </Link>
                    </p>
                ) : (
                    <div className="space-y-2.5">
                        {services.map((service) => (
                            <ServiceOption
                                key={service.id}
                                service={service}
                                highlight={service.id === "recovery_consultation" ? "Not sure where to start?" : undefined}
                                selected={selectedId === service.id}
                                busy={selectedId !== null}
                                onSelect={() => handleServiceSelect(service.id)}
                            />
                        ))}
                    </div>
                )}
                <p className="px-2 pb-2 pt-4 text-xs leading-relaxed text-rh-night/55 sm:px-3">
                    Prices are all-inclusive. Home visits add a travel charge for your area, shown before you pay. Your
                    booking is confirmed once paid.
                </p>
            </section>

            {resolvedUserId && <PublicProof physiotherapistId={resolvedUserId as Id<"users">} className="mt-4" />}

            <MediLoanWidget physiotherapistName={profile.fullName} physiotherapistId={resolvedUserId ?? undefined} />

            <PoweredBy />
        </BookingShell>
    );
}
