"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    Check,
    Loader2,
    Lock,
    Mail,
    MapPin,
    Phone,
    User,
    Video,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { calculatePaystackInboundGrossAmount } from "@/lib/pricing";
import { getReferralPublicCode } from "@/lib/referralCookie";
import { playSound } from "@/lib/sounds";
import CalendarBookingWidget, { type AvailableSlot } from "@/components/marketplace/CalendarBookingWidget";
import { BookingShell, PoweredBy } from "@/components/booking/BookingShell";
import { BookingBottomSheet } from "@/components/booking/BookingBottomSheet";
import { PhysioHostCard } from "@/components/booking/PhysioHostCard";
import { PACKAGE_LABELS, PackagePicker, calcPackage, type PackageSize } from "@/components/booking/PackagePicker";
import {
    bookingPricing,
    formatNaira,
    initialsOf,
    looksLikeConvexId,
    priceRows,
    readTreatmentPrefs,
    sessionTypeForDuration,
    singleSessionPrice,
    type BookingProfile,
    type SessionMode,
    type TreatmentPrefs,
} from "@/components/booking/booking-shared";

type BookingStep = "select-time" | "select-package" | "details" | "confirm";

const PENDING_KEY = "pendingBooking";

const fieldClass =
    "w-full rounded-xl border border-rh-night/15 bg-white px-3.5 py-2.5 text-base text-rh-night placeholder:text-rh-night/40 transition-[border-color,box-shadow] focus:border-rh-night focus:outline-none focus:ring-4 focus:ring-rh-lime/25 sm:text-sm";

const primaryButton =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-rh-lime px-5 text-[15px] font-semibold text-rh-night shadow-[0_10px_24px_-12px_rgba(0,205,15,0.9)] transition-[filter,transform] hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-night focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

const secondaryButton =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rh-night/15 bg-white px-5 text-[15px] font-semibold text-rh-night transition-colors hover:bg-rh-night/[0.04] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime";

function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function StepDots({ steps, current }: { steps: string[]; current: number }) {
    return (
        <ol className="flex items-center gap-1.5" aria-label={`Step ${current + 1} of ${steps.length}`}>
            {steps.map((label, index) => (
                <li key={label} className="flex items-center gap-1.5">
                    <span
                        className={cn(
                            "h-1.5 rounded-full transition-all duration-300",
                            index < current && "w-4 bg-rh-night/40",
                            index === current && "w-7 bg-rh-lime",
                            index > current && "w-4 bg-rh-night/10"
                        )}
                        aria-hidden
                    />
                    <span className="sr-only">
                        {label}
                        {index === current ? " (current)" : ""}
                    </span>
                </li>
            ))}
        </ol>
    );
}

export default function BookingPage() {
    const params = useParams();
    const router = useRouter();
    const reduceMotion = useReducedMotion();
    const { user, isSignedIn } = useUser();

    const rawParam = params.physiotherapistId as string;
    const durationParam = params.duration as string;
    const parsedDuration = durationParam ? parseInt(durationParam, 10) : 60;
    const sessionDuration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 60;
    const sessionInfo = useMemo(() => sessionTypeForDuration(sessionDuration), [sessionDuration]);

    const isRawId = looksLikeConvexId(rawParam);
    const slugResult = useQuery(api.marketplace.search.resolveBookingSlug, isRawId ? "skip" : { slug: rawParam }) as
        | { userId: Id<"users"> }
        | null
        | undefined;
    const physiotherapistId: Id<"users"> | null = isRawId ? (rawParam as Id<"users">) : slugResult?.userId ?? null;

    // State
    const [step, setStep] = useState<BookingStep>("select-time");
    const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
    const [sessionMode, setSessionMode] = useState<SessionMode>("online");
    const [notes, setNotes] = useState("");
    const [patientAddress, setPatientAddress] = useState("");
    const [treatmentPrefs, setTreatmentPrefs] = useState<TreatmentPrefs | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedPackage, setSelectedPackage] = useState<PackageSize>(1);
    const savedPrefsRef = useRef(false);
    const restoredRef = useRef(false);

    // Guest checkout (not signed in)
    const [guestEmail, setGuestEmail] = useState("");
    const [guestPhone, setGuestPhone] = useState("");
    const [guestName, setGuestName] = useState("");
    const [showGuestForm, setShowGuestForm] = useState(false);

    const profile = useQuery(
        api.marketplace.search.getPhysiotherapistProfile,
        physiotherapistId ? { physiotherapistId } : "skip"
    ) as BookingProfile | null | undefined;
    const revenueSettings = useQuery(api.platformSettings.getPlatformRevenueSettings) as
        | { paystackFeeBearerInbound?: string }
        | undefined;

    const createBooking = useMutation(api.marketplace.booking.createMarketplaceBooking);
    const guestCreateBooking = useMutation(api.marketplace.booking.guestCreateMarketplaceBooking);
    const confirmFreeBooking = useMutation(api.marketplace.booking.confirmFreeMarketplaceBooking);
    const saveTreatmentPrefs = useMutation(api.marketplace.matching.savePatientTreatmentPrefs);

    // ── Pricing (mirrors resolveServiceAmountKobo on the server) ──
    const pricing = useMemo(() => bookingPricing(profile, treatmentPrefs?.sessionRate), [profile, treatmentPrefs]);
    const packagesAvailable = pricing.kind === "package";
    const discountPercent = profile?.packageDiscountPercent || 7;
    const effectivePackage: PackageSize = packagesAvailable ? selectedPackage : 1;
    const packageBreakdown = pricing.kind === "package" ? calcPackage(pricing.sessionRate, effectivePackage, discountPercent) : null;
    const packageName = PACKAGE_LABELS[effectivePackage];

    /** Naira amount sent to the server: 0 lets the server charge the physio's standard rate. */
    const amountToSend = packageBreakdown ? packageBreakdown.total : pricing.kind === "initial" ? pricing.sessionRate : 0;
    /** What the patient pays before any processing fee. */
    const displayBase = packageBreakdown ? packageBreakdown.total : singleSessionPrice(pricing, sessionMode);

    const patientBearsFee = revenueSettings?.paystackFeeBearerInbound === "patient";
    const feeSurcharge = useMemo(() => {
        if (!patientBearsFee || amountToSend <= 0) return { grossNaira: 0, feeNaira: 0, applies: false };
        const { grossKobo, feeKobo } = calculatePaystackInboundGrossAmount(Math.round(amountToSend * 100));
        return { grossNaira: Math.round(grossKobo / 100), feeNaira: Math.round(feeKobo / 100), applies: feeKobo > 0 };
    }, [patientBearsFee, amountToSend]);
    const totalToPay = feeSurcharge.applies ? feeSurcharge.grossNaira : displayBase;

    const offersOnline = profile?.offersOnlineSessions ?? true;
    const offersInPerson = profile?.offersInPersonSessions ?? false;
    const prices = useMemo(() => priceRows(pricing, offersOnline, offersInPerson), [pricing, offersOnline, offersInPerson]);

    // ── Treatment prefs from /start-treatment ──
    useEffect(() => {
        const prefs = readTreatmentPrefs();
        if (prefs) {
            setTreatmentPrefs(prefs);
            if (prefs.conditionLabel) setNotes((current) => current || `Condition: ${prefs.conditionLabel}`);
        }
    }, []);

    // ── Restore a booking in progress after signing in ──
    useEffect(() => {
        if (restoredRef.current || !physiotherapistId) return;
        restoredRef.current = true;
        try {
            const stored = localStorage.getItem(PENDING_KEY);
            if (!stored) return;
            localStorage.removeItem(PENDING_KEY);
            const pending = JSON.parse(stored);
            if (pending.physiotherapistId !== physiotherapistId || pending.sessionDuration !== sessionDuration) return;
            if (pending.slot && pending.slot.start > Date.now()) {
                setSelectedSlot(pending.slot);
                setStep("details");
            }
            if (pending.sessionMode === "online" || pending.sessionMode === "in-person") setSessionMode(pending.sessionMode);
            if (typeof pending.notes === "string") setNotes(pending.notes);
            if (typeof pending.patientAddress === "string") setPatientAddress(pending.patientAddress);
            if ([1, 4, 8, 12].includes(pending.selectedPackage)) setSelectedPackage(pending.selectedPackage);
        } catch {
            // localStorage unavailable
        }
    }, [physiotherapistId, sessionDuration]);

    // Coming Back from Paystack can restore this page from the back-forward cache mid-"Processing…"
    useEffect(() => {
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) setIsProcessing(false);
        };
        window.addEventListener("pageshow", onPageShow);
        return () => window.removeEventListener("pageshow", onPageShow);
    }, []);

    // Physios who only see patients in person
    useEffect(() => {
        if (profile && profile.offersOnlineSessions === false && profile.offersInPersonSessions) setSessionMode("in-person");
    }, [profile]);

    // ── Save treatment prefs to DB after sign-in ──
    useEffect(() => {
        if (isSignedIn && treatmentPrefs && !savedPrefsRef.current && treatmentPrefs.cityKey && treatmentPrefs.areaIndex !== undefined) {
            savedPrefsRef.current = true;
            saveTreatmentPrefs({
                cityKey: treatmentPrefs.cityKey,
                areaIndex: treatmentPrefs.areaIndex,
                areaLabel: treatmentPrefs.areaLabel,
                conditionLabel: treatmentPrefs.conditionLabel,
                conditionLevel: treatmentPrefs.conditionLevel,
                sessionRate: treatmentPrefs.sessionRate,
            }).catch(() => {
                // Non-critical: prefs only personalise future matching
            });
        }
    }, [isSignedIn, treatmentPrefs, saveTreatmentPrefs]);

    const isLoading = (!isRawId && slugResult === undefined) || (physiotherapistId !== null && profile === undefined);

    if (isLoading) {
        return (
            <BookingShell wide>
                <div className="flex min-h-[50vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-rh-lime" aria-label="Loading" />
                </div>
            </BookingShell>
        );
    }

    if (!profile || !physiotherapistId) {
        return (
            <BookingShell>
                <div className="rounded-[28px] bg-white p-8 text-center text-rh-night">
                    <p className="mb-5 text-rh-night/70">This physiotherapist isn&#39;t taking bookings right now.</p>
                    <button type="button" onClick={() => router.push("/find-a-physio")} className={secondaryButton}>
                        <ArrowLeft className="h-4 w-4" />
                        Find another physio
                    </button>
                </div>
            </BookingShell>
        );
    }

    const steps = packagesAvailable ? ["Time", "Plan", "Details"] : ["Time", "Details"];
    const stepIndex = step === "select-time" ? 0 : step === "select-package" ? 1 : steps.length - 1;
    const modeLabel = sessionMode === "online" ? "Video call" : "In person";

    const goNext = () => {
        if (!selectedSlot) {
            toast.error("Please pick a time");
            return;
        }
        setStep(packagesAvailable ? "select-package" : "details");
    };

    const goBack = () => {
        setShowGuestForm(false);
        if (step === "select-package") setStep("select-time");
        else if (step === "details") setStep(packagesAvailable ? "select-package" : "select-time");
    };

    const initializePaystackPayment = async (
        bookingId: Id<"marketplaceBookings">,
        amountNaira: number,
        email: string,
        phone?: string,
        name?: string,
        feeBreakdown?: { baseAmount: number; processingFee: number; feeBearer: string }
    ) => {
        const response = await fetch("/api/payments/marketplace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                bookingId,
                amount: amountNaira, // informational — the route charges the booking's own amount
                email,
                phone: phone || null,
                name: name || null,
                ...(feeBreakdown || {}),
            }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success || !data.authorization_url) {
            throw new Error(data?.error || "We couldn't start the payment. Please try again.");
        }
        window.location.href = data.authorization_url;
    };

    const processBookingAndPay = async (email: string, phone?: string, name?: string) => {
        if (!selectedSlot) {
            toast.error("Please pick a time");
            return;
        }
        if (sessionMode === "in-person" && !patientAddress.trim()) {
            toast.error("Please add your address for the home visit.");
            return;
        }

        setIsProcessing(true);
        try {
            const packageNote = `Package: ${packageName} (${effectivePackage} session${effectivePackage > 1 ? "s" : ""})`;
            const bookingArgs = {
                physiotherapistId,
                sessionType: effectivePackage === 1 ? "initial_consult" : "package",
                sessionDate: selectedSlot.start,
                sessionDuration,
                isOnline: sessionMode === "online",
                serviceAmount: Math.round((feeSurcharge.applies ? feeSurcharge.grossNaira : amountToSend) * 100), // kobo
                patientNotes: notes ? `${notes}\n\n${packageNote}` : packageNote,
                packageSessions: effectivePackage,
                packageDiscountPercent: discountPercent,
                patientAddress: sessionMode === "in-person" ? patientAddress : undefined,
                conditionLabel: treatmentPrefs?.conditionLabel,
                conditionLevel: treatmentPrefs?.conditionLevel,
                // Partner referral-link code (validated server-side; first partner wins)
                referralPublicCode: getReferralPublicCode(),
            };

            const result = (isSignedIn
                ? await createBooking(bookingArgs)
                : await guestCreateBooking({ ...bookingArgs, guestEmail: email, guestPhone: phone, guestName: name })) as {
                bookingId: Id<"marketplaceBookings">;
                fees?: { serviceAmount: number };
            };

            // Free session — only when the server priced the booking at zero
            if (result.fees?.serviceAmount === 0) {
                await confirmFreeBooking({ bookingId: result.bookingId });
                playSound("booked");
                toast.success("Booking confirmed!");
                setStep("confirm");
                setIsProcessing(false);
                return;
            }

            const chargedNaira = result.fees?.serviceAmount ? result.fees.serviceAmount / 100 : totalToPay;
            const feeBreakdown = feeSurcharge.applies
                ? { baseAmount: amountToSend, processingFee: feeSurcharge.feeNaira, feeBearer: "patient" }
                : undefined;
            await initializePaystackPayment(result.bookingId, chargedNaira, email, phone, name, feeBreakdown);
        } catch (error) {
            const err = error as { data?: unknown; message?: string };
            playSound("error");
            toast.error("Booking failed", {
                description:
                    (typeof err?.data === "string" ? err.data : undefined) || err?.message || "We couldn't create the booking. Please try again.",
            });
            setIsProcessing(false);
        }
    };

    const handleBooking = async () => {
        if (!selectedSlot) {
            toast.error("Please pick a time");
            return;
        }
        if (sessionMode === "in-person" && !patientAddress.trim()) {
            toast.error("Please add your address for the home visit.");
            return;
        }
        if (isSignedIn) {
            const email = user?.primaryEmailAddress?.emailAddress;
            if (!email) {
                toast.error("No email address found on your account.");
                return;
            }
            await processBookingAndPay(email, undefined, user?.fullName || user?.firstName || undefined);
        } else {
            setShowGuestForm(true);
        }
    };

    const handleGuestPay = async () => {
        if (!guestEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
            toast.error("Please enter a valid email address.");
            return;
        }
        await processBookingAndPay(guestEmail.trim(), guestPhone.trim() || undefined, guestName.trim() || undefined);
    };

    const rememberBookingForSignIn = () => {
        try {
            localStorage.setItem(
                PENDING_KEY,
                JSON.stringify({
                    physiotherapistId,
                    sessionDuration,
                    slot: selectedSlot,
                    sessionMode,
                    notes,
                    patientAddress,
                    selectedPackage: effectivePackage,
                })
            );
        } catch {
            // Booking just won't be restored
        }
    };

    const signInHref = `/sign-in?redirect=${encodeURIComponent(`/book/${rawParam}/${sessionDuration}`)}`;
    const ctaLabel = totalToPay > 0 ? (isSignedIn ? `Confirm & pay ${formatNaira(totalToPay)}` : "Continue to payment") : "Book now";

    // ── Shared summary for the later steps ──
    const summary = selectedSlot && (
        <div className="flex items-start gap-3.5 rounded-2xl bg-rh-canvas/80 p-4 ring-1 ring-inset ring-rh-night/[0.06]">
            {profile.imageUrl ? (
                <Image
                    src={profile.imageUrl}
                    alt={profile.fullName}
                    width={44}
                    height={44}
                    unoptimized
                    className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-rh-night/10"
                />
            ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rh-night text-sm font-semibold text-white" aria-hidden>
                    {initialsOf(profile.fullName)}
                </div>
            )}
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-rh-night">
                    {sessionInfo.title} <span className="font-normal text-rh-night/55">with {profile.fullName}</span>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-rh-night/75">
                    <CalendarDays className="h-4 w-4 shrink-0 text-rh-night/45" aria-hidden />
                    {formatDate(selectedSlot.start)}
                </p>
                <p className="mt-0.5 pl-[22px] text-sm font-semibold tabular-nums text-rh-night">
                    {formatTime(selectedSlot.start)} – {formatTime(selectedSlot.end)}
                    <span className="font-normal text-rh-night/55"> · {sessionDuration} min</span>
                </p>
            </div>
            <button
                type="button"
                onClick={() => {
                    setShowGuestForm(false);
                    setStep("select-time");
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-rh-night underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
            >
                Change
            </button>
        </div>
    );

    const changeSessionLink = (
        <Link
            href={`/book/${rawParam}`}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-white/75 ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
        >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All sessions
        </Link>
    );

    // ── Step: pick a time ──
    if (step === "select-time") {
        return (
            <BookingShell wide topRight={changeSessionLink} className={selectedSlot ? "pb-56 lg:pb-14" : undefined}>
                <CalendarBookingWidget
                    physiotherapistId={physiotherapistId}
                    physiotherapistName={profile.fullName}
                    physiotherapistImage={profile.imageUrl}
                    sessionDuration={sessionDuration}
                    sessionTitle={sessionInfo.title}
                    sessionDescription={sessionInfo.description}
                    offersOnlineSessions={offersOnline}
                    offersInPersonSessions={offersInPerson}
                    host={<PhysioHostCard profile={profile} tone="light" />}
                    prices={prices}
                    selectedSlot={selectedSlot}
                    onSlotSelect={setSelectedSlot}
                    onContinue={goNext}
                    continueLabel="Next"
                />
                <PoweredBy />

                <BookingBottomSheet open={Boolean(selectedSlot)} label="Selected time">
                    {selectedSlot && (
                        <div className="text-rh-night dark:text-white">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-night/50 dark:text-white/50">
                                        {sessionInfo.title} · {sessionDuration} min
                                    </p>
                                    <p className="mt-1 truncate text-base font-semibold">
                                        {new Date(selectedSlot.start).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                                        <span className="tabular-nums"> · {formatTime(selectedSlot.start)}</span>
                                    </p>
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="text-lg font-bold tabular-nums">
                                        {formatNaira(singleSessionPrice(pricing, sessionMode))}
                                    </p>
                                    <p className="text-[11px] text-rh-night/55 dark:text-white/55">
                                        {pricing.kind === "standard" && offersOnline && offersInPerson && pricing.video !== pricing.inPerson
                                            ? `video · ${formatNaira(pricing.inPerson)} in person`
                                            : "per session"}
                                    </p>
                                </div>
                            </div>
                            <button type="button" onClick={goNext} className={cn(primaryButton, "mt-4 w-full")}>
                                Continue
                                <ArrowRight className="h-4 w-4" aria-hidden />
                            </button>
                        </div>
                    )}
                </BookingBottomSheet>
            </BookingShell>
        );
    }

    // ── Step: confirmed (free sessions) ──
    if (step === "confirm") {
        return (
            <BookingShell>
                <div className="rounded-[28px] bg-white p-6 text-center text-rh-night shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] sm:p-8">
                    <motion.div
                        initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 18 }}
                        className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-rh-lime shadow-[0_14px_30px_-12px_rgba(0,205,15,0.9)]"
                    >
                        <Check className="h-8 w-8 text-rh-night" strokeWidth={3} />
                    </motion.div>
                    <h2 className="text-2xl font-semibold tracking-tight">You&#39;re booked</h2>
                    <p className="mt-2 text-rh-night/65">
                        Your {packageName.toLowerCase()} with {profile.fullName} is scheduled.
                    </p>
                    <div className="mt-6 text-left">{summary}</div>
                    {effectivePackage > 1 && (
                        <p className="mt-3 text-sm text-rh-night/55">+ {effectivePackage - 1} more sessions to schedule with your physio</p>
                    )}
                    <p className="mt-6 text-sm text-rh-night/55">We&#39;ve emailed you the details and the meeting link.</p>
                    <button type="button" onClick={() => router.push("/dashboard/patient/appointments")} className={cn(primaryButton, "mt-6 w-full")}>
                        View my appointments
                    </button>
                </div>
                <PoweredBy />
            </BookingShell>
        );
    }

    // ── Steps: plan and details ──
    return (
        <BookingShell topRight={changeSessionLink}>
            <motion.div
                key={step}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
                className="rounded-[28px] bg-white p-5 text-rh-night shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] sm:p-7"
            >
                <div className="mb-5 flex items-center justify-between gap-3">
                    <h1 className="text-xl font-semibold tracking-tight">{step === "select-package" ? "Choose your plan" : "Your details"}</h1>
                    <StepDots steps={steps} current={stepIndex} />
                </div>

                {summary}

                {step === "select-package" && packageBreakdown && pricing.kind === "package" && (
                    <>
                        <p className="mb-3 mt-6 text-sm text-rh-night/60">
                            Book one session or save with a package. Each session is {formatNaira(pricing.sessionRate)}.
                        </p>
                        <PackagePicker
                            sessionRate={pricing.sessionRate}
                            discountPercent={discountPercent}
                            selected={effectivePackage}
                            onSelect={setSelectedPackage}
                        />
                        <div className="mt-6 grid grid-cols-[auto_1fr] gap-3">
                            <button type="button" onClick={goBack} className={secondaryButton} aria-label="Back">
                                <ArrowLeft className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => setStep("details")} className={primaryButton}>
                                Continue · {formatNaira(packageBreakdown.total)}
                                <ArrowRight className="h-4 w-4" aria-hidden />
                            </button>
                        </div>
                    </>
                )}

                {step === "details" && selectedSlot && (
                    <div className="mt-6 space-y-6">
                        {/* Session mode */}
                        {offersOnline && offersInPerson && (
                            <fieldset>
                                <legend className="mb-2.5 text-sm font-semibold">How would you like to meet?</legend>
                                <div role="radiogroup" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                    {(["online", "in-person"] as const).map((mode) => {
                                        const selected = sessionMode === mode;
                                        const Icon = mode === "online" ? Video : MapPin;
                                        return (
                                            <motion.button
                                                key={mode}
                                                type="button"
                                                role="radio"
                                                aria-checked={selected}
                                                onClick={() => setSessionMode(mode)}
                                                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                                                className={cn(
                                                    "flex items-center gap-3 rounded-2xl border p-4 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2",
                                                    selected
                                                        ? "border-rh-lime bg-rh-honeydew shadow-[0_0_0_1px_#00cd0f]"
                                                        : "border-rh-night/10 hover:border-rh-night/30"
                                                )}
                                            >
                                                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", selected ? "bg-rh-night text-rh-lime" : "bg-rh-night/[0.06] text-rh-night/70")}>
                                                    <Icon className="h-4 w-4" aria-hidden />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-sm font-semibold">{mode === "online" ? "Video call" : "In person"}</span>
                                                    <span className="block text-xs text-rh-night/55">
                                                        {mode === "online" ? "From anywhere" : "Home visit at your address"}
                                                        {pricing.kind === "standard" && ` · ${formatNaira(mode === "online" ? pricing.video : pricing.inPerson)}`}
                                                    </span>
                                                </span>
                                                <span
                                                    aria-hidden
                                                    className={cn(
                                                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                                                        selected ? "border-rh-lime bg-rh-lime text-rh-night" : "border-rh-night/20"
                                                    )}
                                                >
                                                    {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                                                </span>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </fieldset>
                        )}

                        {sessionMode === "in-person" && (
                            <div>
                                <label htmlFor="address" className="mb-1.5 block text-sm font-semibold">
                                    Your address <span className="text-red-600">*</span>
                                </label>
                                <textarea
                                    id="address"
                                    value={patientAddress}
                                    onChange={(e) => setPatientAddress(e.target.value)}
                                    placeholder="Street, apartment number, landmarks and anything the physio should know"
                                    className={cn(fieldClass, "resize-none")}
                                    rows={3}
                                    required
                                />
                            </div>
                        )}

                        <div>
                            <label htmlFor="notes" className="mb-1.5 block text-sm font-semibold">
                                Anything we should know? <span className="font-normal text-rh-night/50">(optional)</span>
                            </label>
                            <textarea
                                id="notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Tell the physiotherapist about your pain or condition"
                                className={cn(fieldClass, "resize-none")}
                                rows={3}
                            />
                        </div>

                        {/* Price summary */}
                        <div className="rounded-2xl border border-rh-night/10 p-4">
                            <dl className="space-y-2 text-sm">
                                <div className="flex items-baseline justify-between gap-3">
                                    <dt className="text-rh-night/70">
                                        {effectivePackage > 1 ? `${packageName} · ${effectivePackage} sessions` : `${sessionInfo.title} · ${modeLabel}`}
                                    </dt>
                                    <dd className="font-semibold tabular-nums">{formatNaira(displayBase)}</dd>
                                </div>
                                {packageBreakdown && packageBreakdown.saves > 0 && (
                                    <div className="flex items-baseline justify-between gap-3 text-emerald-700">
                                        <dt>Package saving ({packageBreakdown.discountPercent}%)</dt>
                                        <dd className="font-semibold tabular-nums">−{formatNaira(packageBreakdown.saves)}</dd>
                                    </div>
                                )}
                                {feeSurcharge.applies && (
                                    <div className="flex items-baseline justify-between gap-3">
                                        <dt className="text-rh-night/70">Payment processing (Paystack)</dt>
                                        <dd className="font-semibold tabular-nums">{formatNaira(feeSurcharge.feeNaira)}</dd>
                                    </div>
                                )}
                                <div className="flex items-baseline justify-between gap-3 border-t border-rh-night/10 pt-3">
                                    <dt className="font-semibold">Total</dt>
                                    <dd className="text-2xl font-bold tabular-nums">{formatNaira(totalToPay)}</dd>
                                </div>
                            </dl>
                            {packagesAvailable && (
                                <button
                                    type="button"
                                    onClick={() => setStep("select-package")}
                                    className="mt-2 rounded text-xs font-semibold text-rh-night underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
                                >
                                    Change plan
                                </button>
                            )}
                        </div>

                        {/* Guest checkout */}
                        {showGuestForm && !isSignedIn && (
                            <motion.div
                                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-4 rounded-2xl bg-rh-canvas/80 p-4 ring-1 ring-inset ring-rh-night/[0.06] sm:p-5"
                            >
                                <div>
                                    <p className="text-sm font-semibold">Quick checkout</p>
                                    <p className="text-xs text-rh-night/55">No account needed. We&#39;ll send your booking to this email.</p>
                                </div>
                                <div>
                                    <label htmlFor="guestName" className="mb-1.5 block text-xs font-semibold">Full name <span className="font-normal text-rh-night/50">(optional)</span></label>
                                    <div className="relative">
                                        <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-night/40" />
                                        <input id="guestName" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your full name" autoComplete="name" className={cn(fieldClass, "pl-10")} />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="guestEmail" className="mb-1.5 block text-xs font-semibold">Email <span className="text-red-600">*</span></label>
                                    <div className="relative">
                                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-night/40" />
                                        <input id="guestEmail" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={cn(fieldClass, "pl-10")} />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="guestPhone" className="mb-1.5 block text-xs font-semibold">Phone <span className="font-normal text-rh-night/50">(optional)</span></label>
                                    <div className="relative">
                                        <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-night/40" />
                                        <input id="guestPhone" type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="080xxxxxxxx" autoComplete="tel" className={cn(fieldClass, "pl-10")} />
                                    </div>
                                </div>
                                <button type="button" onClick={handleGuestPay} disabled={isProcessing || !guestEmail.trim()} className={cn(primaryButton, "w-full")}>
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                                        </>
                                    ) : totalToPay > 0 ? (
                                        <>
                                            <Lock className="h-4 w-4" aria-hidden /> Pay {formatNaira(totalToPay)}
                                        </>
                                    ) : (
                                        "Book now"
                                    )}
                                </button>
                                <p className="text-center text-xs text-rh-night/55">
                                    Have an account?{" "}
                                    <Link href={signInHref} onClick={rememberBookingForSignIn} className="font-semibold text-rh-night underline underline-offset-4 hover:no-underline">
                                        Sign in instead
                                    </Link>
                                </p>
                            </motion.div>
                        )}

                        {!showGuestForm && (
                            <div className="grid grid-cols-[auto_1fr] gap-3">
                                <button type="button" onClick={goBack} className={secondaryButton} aria-label="Back">
                                    <ArrowLeft className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleBooking}
                                    disabled={isProcessing || (sessionMode === "in-person" && !patientAddress.trim())}
                                    className={primaryButton}
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                                        </>
                                    ) : (
                                        <>
                                            {totalToPay > 0 && <Lock className="h-4 w-4" aria-hidden />}
                                            {ctaLabel}
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-rh-night/50">
                            <Lock className="h-3.5 w-3.5" aria-hidden />
                            Secure payment by Paystack
                        </p>
                    </div>
                )}
            </motion.div>
            <PoweredBy />
        </BookingShell>
    );
}
