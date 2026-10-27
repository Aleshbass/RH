"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    BadgeCheck,
    CalendarDays,
    Home,
    Loader2,
    Lock,
    LogIn,
    Mail,
    Phone,
    User,
    Video,
} from "@/components/icons";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getReferralPublicCode } from "@/lib/referralCookie";
import { playSound } from "@/lib/sounds";
import { usableEmail } from "@/lib/auth/joyLoginEmail";
import { formatKobo, getService, isBookableServiceId, type BookableServiceId } from "@/lib/rehabify-services";
import { CHECKOUT_POLICIES, POLICIES, policyVersions } from "@/lib/policies";
import CalendarBookingWidget, { type AvailableSlot } from "@/components/marketplace/CalendarBookingWidget";
import { BookingShell, PoweredBy } from "@/components/booking/BookingShell";
import { BookingBottomSheet } from "@/components/booking/BookingBottomSheet";
import { PhysioHostCard } from "@/components/booking/PhysioHostCard";
import { ServiceOption } from "@/components/booking/ServiceOption";
import { NOT_LISTED, ServiceAreaPicker } from "@/components/booking/ServiceAreaPicker";
import {
    bookableServices,
    convexErrorMessage,
    initialsOf,
    isSlotError,
    looksLikeConvexId,
    parseServiceSegment,
    queryString,
    readTreatmentPrefs,
    servicePriceLabel,
    startMarketplaceCheckout,
    virtualAlternative,
    zoneCities,
    zoneForArea,
    type BookingProfile,
    type Catalogue,
    type ServiceQuote,
    type TravelZone,
    type TreatmentPrefs,
} from "@/components/booking/booking-shared";

type BookingStep = "service" | "area" | "time" | "details";

const STEP_LABELS: Record<BookingStep, string> = { service: "Service", area: "Area", time: "Time", details: "Details" };

/** api.rehabifyAccess.getMyAccess (the parts this page uses). */
type MyAccess = {
    award: {
        id: string;
        physiotherapistId: string;
        physiotherapistName: string;
        sessionsLeft: number;
        services: { id: string; name: string; assistedPriceKobo: number | null; standardPriceKobo: number }[];
    } | null;
} | null;

/** A booking in progress, restored after signing in. */
const PENDING_KEY = "pendingBooking";
/** The unpaid booking made by this tab, reused if payment has to be retried. */
const ATTEMPT_KEY = "rhBookingAttempt";
const HOLD_MS = 30 * 60 * 1000;

const fieldClass =
    "w-full rounded-xl border border-rh-night/15 bg-white px-3.5 py-2.5 text-base text-rh-night placeholder:text-rh-night/40 transition-[border-color,box-shadow] focus:border-rh-night focus:outline-none focus:ring-4 focus:ring-rh-lime/25 sm:text-sm";

const primaryButton =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-rh-lime px-5 text-[15px] font-semibold text-rh-night shadow-[0_10px_24px_-12px_rgba(0,205,15,0.9)] transition-[filter,transform] hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-night focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

const secondaryButton =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rh-night/15 bg-white px-5 text-[15px] font-semibold text-rh-night transition-colors hover:bg-rh-night/[0.04] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime";

const cardClass = "rounded-[28px] bg-white p-5 text-rh-night shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] sm:p-7";

// Slots are Lagos time (the physio's schedule), whatever zone the browser is in
function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
}

function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" });
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

function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
    return (
        <div
            role={tone === "error" ? "alert" : undefined}
            className={cn(
                "flex items-start gap-2.5 rounded-2xl p-4 text-sm ring-1 ring-inset",
                tone === "info" && "bg-rh-canvas/80 text-rh-night/80 ring-rh-night/[0.06]",
                tone === "warn" && "bg-amber-50 text-amber-950 ring-amber-200",
                tone === "error" && "bg-red-50 text-red-900 ring-red-200"
            )}
        >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 space-y-2">{children}</div>
        </div>
    );
}

function LoadingShell() {
    return (
        <BookingShell wide>
            <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-rh-lime" aria-label="Loading" />
            </div>
        </BookingShell>
    );
}

export default function BookingPage() {
    return (
        <Suspense fallback={<LoadingShell />}>
            <BookingFlow />
        </Suspense>
    );
}

function BookingFlow() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const reduceMotion = useReducedMotion();
    const { user, isSignedIn, isLoaded: userLoaded } = useUser();

    const rawParam = params.physiotherapistId as string;
    // A service id, or a legacy minutes value (/book/[id]/60) that preselects one
    const segment = useMemo(() => parseServiceSegment(params.duration as string | undefined), [params.duration]);
    const accessParam = searchParams.get("access") ?? "";
    const zoneParam = searchParams.get("zone") ?? "";
    const areaParam = searchParams.get("area") ?? "";

    const isRawId = looksLikeConvexId(rawParam);
    const slugResult = useQuery(api.marketplace.search.resolveBookingSlug, isRawId ? "skip" : { slug: rawParam }) as
        | { userId: Id<"users"> }
        | null
        | undefined;
    const physiotherapistId: Id<"users"> | null = isRawId ? (rawParam as Id<"users">) : slugResult?.userId ?? null;

    // State
    const [serviceId, setServiceId] = useState<BookableServiceId | null>(segment.serviceId);
    const [step, setStep] = useState<BookingStep>(() => {
        if (!segment.serviceId || segment.legacy) return "service";
        return getService(segment.serviceId)?.mode === "home" ? "area" : "time";
    });
    const [city, setCity] = useState("");
    const [area, setArea] = useState("");
    const [patientAddress, setPatientAddress] = useState("");
    const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
    const [notes, setNotes] = useState("");
    const [treatmentPrefs, setTreatmentPrefs] = useState<TreatmentPrefs | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    // "I agree" to the Booking and Payment policies, recorded with the booking (lib/policies.ts)
    const [agreed, setAgreed] = useState(false);
    const [bookingError, setBookingError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState<{ bookingId: string; key: string } | null>(null);
    const savedPrefsRef = useRef(false);
    const restoredRef = useRef(false);
    const prefilledRef = useRef(false);

    // Guest checkout (not signed in)
    const [guestEmail, setGuestEmail] = useState("");
    const [guestPhone, setGuestPhone] = useState("");
    const [guestName, setGuestName] = useState("");
    const [showGuestForm, setShowGuestForm] = useState(false);

    const profile = useQuery(
        api.marketplace.search.getPhysiotherapistProfile,
        physiotherapistId ? { physiotherapistId } : "skip"
    ) as BookingProfile | null | undefined;
    const catalogue = useQuery(api.serviceTariffs.getCatalogue) as Catalogue | undefined;

    const isHome = serviceId ? getService(serviceId)?.mode === "home" : false;
    const zones = useQuery(api.travelZones.listZones, isHome ? {} : "skip") as TravelZone[] | undefined;
    const myAccess = useQuery(api.rehabifyAccess.getMyAccess, isSignedIn && accessParam ? {} : "skip") as
        | MyAccess
        | undefined;

    const offeredServices = useMemo(
        () => bookableServices(catalogue?.services, profile?.servicesOffered ?? []),
        [catalogue, profile]
    );
    const service = offeredServices.find((s) => s.id === serviceId);

    const zone = isHome ? zoneForArea(zones, city, area) : null;
    const physioVisitsZone = Boolean(zone && profile?.coveredZoneIds?.includes(zone.id));

    // Rehabify Access: only the patient's own active award, with this physio, for this service
    const award = myAccess?.award && myAccess.award.id === accessParam ? myAccess.award : null;
    const awardService = award?.services.find((s) => s.id === serviceId) ?? null;
    const accessAwardId =
        award && award.physiotherapistId === physiotherapistId && awardService?.assistedPriceKobo != null && award.sessionsLeft > 0
            ? (award.id as Id<"accessAwards">)
            : undefined;

    const quote = useQuery(
        api.marketplace.booking.getServiceQuote,
        service && (!isHome || zone)
            ? { serviceId: service.id, ...(zone ? { zoneId: zone.id } : {}), ...(accessAwardId ? { accessAwardId } : {}) }
            : "skip"
    ) as ServiceQuote | undefined;
    const quoteOk = quote?.ok ? quote : null;

    const createBooking = useMutation(api.marketplace.booking.createServiceBooking);
    const guestCreateBooking = useMutation(api.marketplace.booking.guestCreateServiceBooking);
    const cancelUnpaid = useMutation(api.marketplace.booking.cancelUnpaidMarketplaceBooking);
    const saveTreatmentPrefs = useMutation(api.marketplace.matching.savePatientTreatmentPrefs);

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
            if (pending.physiotherapistId !== physiotherapistId || !isBookableServiceId(pending.serviceId)) return;
            setServiceId(pending.serviceId);
            if (typeof pending.notes === "string") setNotes(pending.notes);
            if (typeof pending.patientAddress === "string") setPatientAddress(pending.patientAddress);
            if (typeof pending.city === "string" && pending.city && typeof pending.area === "string") {
                setCity(pending.city);
                setArea(pending.area);
                prefilledRef.current = true;
            }
            if (pending.slot && pending.slot.start > Date.now()) {
                setSelectedSlot(pending.slot);
                setStep("details");
            } else {
                setStep(getService(pending.serviceId)?.mode === "home" ? "area" : "time");
            }
        } catch {
            // localStorage unavailable
        }
    }, [physiotherapistId]);

    // ── An unpaid booking from this tab (e.g. back from Paystack): pay for it rather than book twice ──
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(ATTEMPT_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (typeof saved?.bookingId === "string" && typeof saved?.key === "string" && Date.now() - saved.at < HOLD_MS) {
                setAttempt({ bookingId: saved.bookingId, key: saved.key });
            } else {
                sessionStorage.removeItem(ATTEMPT_KEY);
            }
        } catch {
            // sessionStorage unavailable
        }
    }, []);

    // Coming back from Paystack can restore this page from the back-forward cache mid-"Processing…"
    useEffect(() => {
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) setIsProcessing(false);
        };
        window.addEventListener("pageshow", onPageShow);
        return () => window.removeEventListener("pageshow", onPageShow);
    }, []);

    // ── Home visits: prefill the area from ?zone=&area= (from /get-care), or /start-treatment ──
    useEffect(() => {
        if (prefilledRef.current || !zones) return;
        prefilledRef.current = true;
        const match = (z: TravelZone, wanted: string) => z.areas.find((a) => a.toLowerCase() === wanted.trim().toLowerCase());
        const byParam = zones.find((z) => z.id === zoneParam);
        if (byParam) {
            setCity(byParam.city);
            const found = areaParam ? match(byParam, areaParam) : undefined;
            if (found) setArea(found);
            return;
        }
        const wanted = areaParam || readTreatmentPrefs()?.areaLabel || "";
        if (wanted) {
            for (const z of zones) {
                const found = match(z, wanted);
                if (found) {
                    setCity(z.city);
                    setArea(found);
                    return;
                }
            }
        }
        const cities = zoneCities(zones);
        if (cities.length === 1) setCity(cities[0]);
    }, [zones, zoneParam, areaParam]);

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
            }).catch(() => {
                // Non-critical: prefs only personalise future matching
            });
        }
    }, [isSignedIn, treatmentPrefs, saveTreatmentPrefs]);

    const isLoading =
        (!isRawId && slugResult === undefined) || (physiotherapistId !== null && profile === undefined) || catalogue === undefined;

    if (isLoading) return <LoadingShell />;

    if (!profile || !physiotherapistId) {
        return (
            <BookingShell>
                <div className="rounded-[28px] bg-white p-8 text-center text-rh-night">
                    <p className="mb-5 text-rh-night/70">This physiotherapist isn&#39;t taking bookings right now.</p>
                    <button type="button" onClick={() => router.push("/get-care")} className={secondaryButton}>
                        <ArrowLeft className="h-4 w-4" />
                        Find another physio
                    </button>
                </div>
            </BookingShell>
        );
    }

    const firstName = profile.firstName || profile.fullName.split(" ")[0];
    const addressReady = Boolean(zone && physioVisitsZone && patientAddress.trim());

    const activeStep: BookingStep = (() => {
        if (!service || step === "service") return "service";
        if (isHome && step !== "area" && !addressReady) return "area";
        if (!isHome && step === "area") return "time";
        if (step === "details" && !selectedSlot) return "time";
        return step;
    })();

    const pickerInFlow = segment.legacy || segment.serviceId !== serviceId || activeStep === "service";
    const stepIds: BookingStep[] = [...(pickerInFlow ? (["service"] as const) : []), ...(isHome ? (["area"] as const) : []), "time", "details"];
    const steps = stepIds.map((id) => STEP_LABELS[id]);
    const stepIndex = Math.max(0, stepIds.indexOf(activeStep));

    const currentQuery = queryString({
        access: accessParam,
        zone: zone?.id ?? zoneParam,
        area: area && area !== NOT_LISTED ? area : areaParam,
    });
    const signInHref = `/sign-in?redirect=${encodeURIComponent(`/book/${rawParam}/${serviceId ?? ""}${currentQuery}`)}`;
    const needsSignIn = Boolean(service?.requiresPriorAssessment || accessParam);
    const chargeKobo = quoteOk?.chargeKobo ?? null;

    const chooseService = (id: BookableServiceId) => {
        if (id !== serviceId) setSelectedSlot(null);
        setServiceId(id);
        setBookingError(null);
        setShowGuestForm(false);
        setStep(getService(id)?.mode === "home" ? "area" : "time");
    };

    const goToDetails = () => {
        if (!selectedSlot) {
            toast.error("Please pick a time");
            return;
        }
        setBookingError(null);
        setStep("details");
    };

    const backToTime = (message: string) => {
        playSound("error");
        toast.error("Please pick another time", { description: message });
        setSelectedSlot(null);
        setShowGuestForm(false);
        setIsProcessing(false);
        setStep("time");
    };

    const rememberAttempt = (next: { bookingId: string; key: string }) => {
        setAttempt(next);
        try {
            sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ ...next, at: Date.now() }));
        } catch {
            // Payment retries will just book again
        }
    };

    const forgetAttempt = () => {
        setAttempt(null);
        try {
            sessionStorage.removeItem(ATTEMPT_KEY);
        } catch {
            // sessionStorage unavailable
        }
    };

    const processBookingAndPay = async (email: string, phone?: string, name?: string) => {
        if (!service || !selectedSlot) {
            toast.error("Please pick a time");
            return;
        }
        if (isHome && !addressReady) {
            toast.error("Please add your area and address for the home visit.");
            setStep("area");
            return;
        }

        setIsProcessing(true);
        setBookingError(null);
        const key = [
            physiotherapistId,
            service.id,
            selectedSlot.start,
            zone?.id ?? "",
            isHome ? area : "",
            isHome ? patientAddress.trim() : "",
            accessAwardId ?? "",
            email.toLowerCase(),
        ].join("|");

        try {
            let bookingId = attempt?.key === key ? attempt.bookingId : null;
            if (!bookingId) {
                // A different booking from this tab is still holding a time: let it go
                if (attempt && isSignedIn) {
                    cancelUnpaid({ bookingId: attempt.bookingId as Id<"marketplaceBookings"> }).catch(() => {});
                    forgetAttempt();
                }
                const bookingArgs = {
                    physiotherapistId,
                    serviceId: service.id,
                    slotStart: selectedSlot.start,
                    ...(isHome && zone ? { zoneId: zone.id, area, patientAddress: patientAddress.trim() } : {}),
                    ...(accessAwardId ? { accessAwardId } : {}),
                    patientNotes: notes.trim() || undefined,
                    // Partner referral-link code (validated server-side; first partner wins)
                    referralPublicCode: getReferralPublicCode(),
                    acceptedPolicies: policyVersions(CHECKOUT_POLICIES),
                };
                const result = (isSignedIn
                    ? await createBooking(bookingArgs)
                    : await guestCreateBooking({ ...bookingArgs, guestEmail: email, guestPhone: phone, guestName: name })) as {
                    bookingId: Id<"marketplaceBookings">;
                };
                bookingId = result.bookingId as string;
                rememberAttempt({ bookingId, key });
            }

            const checkout = await startMarketplaceCheckout({ bookingId, email, phone, name });
            if (checkout.ok) {
                window.location.href = checkout.url;
                return;
            }
            if (checkout.reason === "slot_taken" || checkout.reason === "too_late") {
                forgetAttempt();
                backToTime(checkout.message);
                return;
            }
            if (checkout.reason === "cancelled" || checkout.reason === "not_found" || /cancelled|not found/i.test(checkout.message)) {
                forgetAttempt();
            }
            playSound("error");
            setBookingError(checkout.message);
            toast.error("Payment didn't start", { description: checkout.message });
            setIsProcessing(false);
        } catch (error) {
            const message = convexErrorMessage(error, "We couldn't create the booking. Please try again.");
            if (isSlotError(message)) {
                backToTime(message);
                return;
            }
            playSound("error");
            setBookingError(message);
            toast.error("Booking failed", { description: message });
            setIsProcessing(false);
        }
    };

    const handleBooking = async () => {
        if (isSignedIn) {
            // Patients from Joy have only a placeholder login address until they add their own
            const email = usableEmail(user);
            if (!email) {
                toast.error("Add an email address to your account first, so we can send your receipt.");
                return;
            }
            await processBookingAndPay(email, user?.primaryPhoneNumber?.phoneNumber || undefined, user?.fullName || user?.firstName || undefined);
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
                    serviceId,
                    slot: selectedSlot,
                    notes,
                    city,
                    area,
                    patientAddress,
                })
            );
        } catch {
            // Booking just won't be restored
        }
    };

    const changeServiceLink = (
        <Link
            href={`/book/${rawParam}${queryString({ access: accessParam })}`}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-white/75 ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
        >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All services
        </Link>
    );

    const stepHeader = (title: string) => (
        <div className="mb-5 flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <StepDots steps={steps} current={stepIndex} />
        </div>
    );

    // ── Step: choose a service (legacy links, or a service this physio doesn't offer) ──
    if (activeStep === "service" || !service) {
        const requested = serviceId ? catalogue?.services.find((s) => s.id === serviceId) : undefined;
        return (
            <BookingShell topRight={changeServiceLink}>
                <PhysioHostCard profile={profile} tone="dark" />
                <motion.div
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
                    className={cn(cardClass, "mt-8")}
                >
                    {stepHeader("Choose a service")}
                    {requested && !service && (
                        <div className="mb-4">
                            <Notice tone="warn">
                                <p>
                                    {firstName} doesn&#39;t offer {requested.name.toLowerCase()} right now. Choose another service or{" "}
                                    <Link
                                        href={`/get-care${queryString({ service: requested.id })}`}
                                        className="font-semibold underline underline-offset-4 hover:no-underline"
                                    >
                                        find a physiotherapist who does
                                    </Link>
                                    .
                                </p>
                            </Notice>
                        </div>
                    )}
                    {offeredServices.length === 0 ? (
                        <p className="text-sm text-rh-night/65">{profile.fullName} isn&#39;t taking bookings right now.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {offeredServices.map((option) => (
                                <ServiceOption
                                    key={option.id}
                                    service={option}
                                    selected={option.id === service?.id}
                                    highlight={option.id === "recovery_consultation" ? "Not sure where to start?" : undefined}
                                    onSelect={() => chooseService(option.id as BookableServiceId)}
                                />
                            ))}
                        </div>
                    )}
                    {service && (
                        <button type="button" onClick={() => chooseService(service.id as BookableServiceId)} className={cn(primaryButton, "mt-5 w-full")}>
                            Continue with {service.shortName.toLowerCase()}
                            <ArrowRight className="h-4 w-4" aria-hidden />
                        </button>
                    )}
                    <p className="mt-4 text-xs leading-relaxed text-rh-night/55">
                        You&#39;ll see the exact price before you pay. Your booking is confirmed once paid.
                    </p>
                </motion.div>
                <PoweredBy />
            </BookingShell>
        );
    }

    const videoAlternative = virtualAlternative(service.id);
    const videoAlternativeOffered = videoAlternative ? offeredServices.some((s) => s.id === videoAlternative) : false;

    // ── Step: where should we visit? (home services) ──
    if (activeStep === "area") {
        const notCovered = (
            <Notice tone="warn">
                <p className="font-semibold">We don&#39;t cover your area for home visits yet — book a video session or contact us.</p>
                <div className="flex flex-wrap gap-2">
                    {videoAlternative && videoAlternativeOffered && (
                        <button
                            type="button"
                            onClick={() => chooseService(videoAlternative)}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-rh-night px-3.5 text-sm font-semibold text-white transition-colors hover:bg-rh-night/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
                        >
                            <Video className="h-4 w-4" aria-hidden />
                            Book a video session
                        </button>
                    )}
                    <Link
                        href="/support"
                        className="inline-flex min-h-10 items-center rounded-xl border border-amber-300 bg-white px-3.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100"
                    >
                        Contact us
                    </Link>
                </div>
            </Notice>
        );

        return (
            <BookingShell topRight={changeServiceLink}>
                <motion.div
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
                    className={cardClass}
                >
                    {stepHeader("Where should we visit?")}
                    <p className="mb-5 text-sm text-rh-night/65">
                        {service.name} with {profile.fullName} at your home. Choose your area so we can confirm the travel charge.
                    </p>

                    <ServiceAreaPicker
                        zones={zones}
                        city={city}
                        area={area}
                        onChange={(next) => {
                            setCity(next.city);
                            setArea(next.area);
                        }}
                        notCovered={notCovered}
                    />

                    {zone && !physioVisitsZone && (
                        <div className="mt-4">
                            <Notice tone="warn">
                                <p>
                                    {firstName} doesn&#39;t visit {area} yet.{" "}
                                    <Link
                                        href={`/get-care${queryString({ service: service.id, zone: zone.id, area })}`}
                                        className="font-semibold underline underline-offset-4 hover:no-underline"
                                    >
                                        See physiotherapists who do
                                    </Link>
                                    {videoAlternative && videoAlternativeOffered && (
                                        <>
                                            {" "}or{" "}
                                            <button
                                                type="button"
                                                onClick={() => chooseService(videoAlternative)}
                                                className="font-semibold underline underline-offset-4 hover:no-underline"
                                            >
                                                book a video session with {firstName}
                                            </button>
                                        </>
                                    )}
                                    .
                                </p>
                            </Notice>
                        </div>
                    )}

                    {zone && physioVisitsZone && (
                        <div className="mt-5 space-y-5">
                            <div className="rounded-2xl border border-rh-night/10 p-4">
                                {quote === undefined ? (
                                    <p className="flex items-center gap-2 text-sm text-rh-night/60">
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the price for {area}…
                                    </p>
                                ) : quoteOk ? (
                                    <dl className="space-y-1.5 text-sm">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <dt className="text-rh-night/70">{service.shortName}</dt>
                                            <dd className="font-semibold tabular-nums">{formatKobo(quoteOk.basePriceKobo)}</dd>
                                        </div>
                                        {quoteOk.travelSurchargeKobo > 0 && (
                                            <div className="flex items-baseline justify-between gap-3">
                                                <dt className="text-rh-night/70">Travel charge ({quoteOk.zoneName ?? zone.name})</dt>
                                                <dd className="font-semibold tabular-nums">{formatKobo(quoteOk.travelSurchargeKobo)}</dd>
                                            </div>
                                        )}
                                        <div className="flex items-baseline justify-between gap-3 border-t border-rh-night/10 pt-2">
                                            <dt className="font-semibold">You pay</dt>
                                            <dd className="text-lg font-bold tabular-nums">{formatKobo(quoteOk.chargeKobo)}</dd>
                                        </div>
                                    </dl>
                                ) : (
                                    <p className="text-sm text-red-700">{quote.ok ? "" : quote.message}</p>
                                )}
                            </div>
                            <div>
                                <label htmlFor="address" className="mb-1.5 block text-sm font-semibold">
                                    Your address <span className="text-red-600">*</span>
                                </label>
                                <textarea
                                    id="address"
                                    value={patientAddress}
                                    onChange={(e) => setPatientAddress(e.target.value)}
                                    placeholder="House number, street, landmarks and anything the physio should know"
                                    className={cn(fieldClass, "resize-none")}
                                    rows={3}
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <div className="mt-6 grid grid-cols-[auto_1fr] gap-3">
                        {pickerInFlow ? (
                            <button type="button" onClick={() => setStep("service")} className={secondaryButton} aria-label="Back">
                                <ArrowLeft className="h-4 w-4" />
                            </button>
                        ) : (
                            <Link href={`/book/${rawParam}${queryString({ access: accessParam })}`} className={secondaryButton} aria-label="Back">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        )}
                        <button type="button" onClick={() => setStep("time")} disabled={!addressReady || !quoteOk} className={primaryButton}>
                            Choose a time
                            <ArrowRight className="h-4 w-4" aria-hidden />
                        </button>
                    </div>
                </motion.div>
                <PoweredBy />
            </BookingShell>
        );
    }

    const priceRows = quoteOk
        ? [
              ...(quoteOk.travelSurchargeKobo > 0
                  ? [
                        { label: service.shortName, amount: formatKobo(quoteOk.basePriceKobo) },
                        { label: "Travel charge", amount: formatKobo(quoteOk.travelSurchargeKobo) },
                    ]
                  : []),
              { label: quoteOk.assisted ? "You pay (Access rate)" : "You pay", amount: formatKobo(quoteOk.chargeKobo) },
          ]
        : [{ label: "Price", amount: servicePriceLabel(service) }];

    const where = isHome ? `Home visit · ${area}, ${city}` : "Video call";
    const WhereIcon = isHome ? Home : Video;

    // ── Step: pick a time ──
    if (activeStep === "time") {
        return (
            <BookingShell wide topRight={changeServiceLink} className={selectedSlot ? "pb-56 lg:pb-14" : undefined}>
                <CalendarBookingWidget
                    physiotherapistId={physiotherapistId}
                    physiotherapistName={profile.fullName}
                    physiotherapistImage={profile.imageUrl}
                    sessionDuration={service.durationMinutes}
                    sessionTitle={service.name}
                    sessionDescription={service.summary}
                    offersOnlineSessions={!isHome}
                    offersInPersonSessions={isHome}
                    host={<PhysioHostCard profile={profile} tone="light" />}
                    prices={priceRows}
                    sidebarFooter={
                        <div className="mt-4 space-y-3 text-sm">
                            {quoteOk?.assisted && (
                                <p className="inline-flex items-center gap-1.5 rounded-full bg-rh-lime/15 px-2.5 py-1 text-xs font-semibold text-rh-night dark:text-rh-lime">
                                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Rehabify Access rate
                                </p>
                            )}
                            {isHome && (
                                <p className="flex items-start gap-2 text-rh-night/70 dark:text-white/65">
                                    <Home className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                                    <span className="min-w-0 flex-1">
                                        {area}, {city}{" "}
                                        <button
                                            type="button"
                                            onClick={() => setStep("area")}
                                            className="font-semibold text-rh-night underline-offset-4 hover:underline dark:text-rh-lime"
                                        >
                                            Change
                                        </button>
                                    </span>
                                </p>
                            )}
                            <p className="text-xs text-rh-night/55 dark:text-white/50">All-inclusive. Your booking is confirmed once paid.</p>
                        </div>
                    }
                    selectedSlot={selectedSlot}
                    onSlotSelect={setSelectedSlot}
                    onContinue={goToDetails}
                    continueLabel="Next"
                />
                <PoweredBy />

                <BookingBottomSheet open={Boolean(selectedSlot)} label="Selected time">
                    {selectedSlot && (
                        <div className="text-rh-night dark:text-white">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-night/50 dark:text-white/50">
                                        {service.shortName} · {service.durationMinutes} min
                                    </p>
                                    <p className="mt-1 truncate text-base font-semibold">
                                        {new Date(selectedSlot.start).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" })}
                                        <span className="tabular-nums"> · {formatTime(selectedSlot.start)}</span>
                                    </p>
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="text-lg font-bold tabular-nums">
                                        {chargeKobo !== null ? formatKobo(chargeKobo) : servicePriceLabel(service)}
                                    </p>
                                    <p className="text-[11px] text-rh-night/55 dark:text-white/55">all-inclusive</p>
                                </div>
                            </div>
                            <button type="button" onClick={goToDetails} className={cn(primaryButton, "mt-4 w-full")}>
                                Continue
                                <ArrowRight className="h-4 w-4" aria-hidden />
                            </button>
                        </div>
                    )}
                </BookingBottomSheet>
            </BookingShell>
        );
    }

    // ── Step: details, price and payment ──
    if (!selectedSlot) return null;

    const accessNote = (() => {
        if (!accessParam || !isSignedIn || myAccess === undefined) return null;
        if (!award) return "We couldn't find an active Rehabify Access arrangement on your account. You can still book at the standard price.";
        if (award.physiotherapistId !== physiotherapistId) return `Your Rehabify Access rate is for sessions with ${award.physiotherapistName}.`;
        if (!awardService || awardService.assistedPriceKobo == null) return "Your Rehabify Access rate doesn't cover this service, so the standard price applies.";
        if (award.sessionsLeft <= 0) return "You've used all the sessions in your Rehabify Access arrangement, so the standard price applies.";
        return null;
    })();

    const payLabel = chargeKobo !== null ? `Book and pay ${formatKobo(chargeKobo)}` : "Book and pay";
    // With ?access=, wait for the award so the booking isn't made at the standard price by mistake
    const accessLoading = Boolean(accessParam && isSignedIn && myAccess === undefined);
    const canPay = Boolean(quoteOk) && userLoaded && !isProcessing && !accessLoading && agreed;

    const summary = (
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
                    {service.name} <span className="font-normal text-rh-night/55">with {profile.fullName}</span>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-rh-night/75">
                    <CalendarDays className="h-4 w-4 shrink-0 text-rh-night/45" aria-hidden />
                    {formatDate(selectedSlot.start)}
                </p>
                <p className="mt-0.5 pl-[22px] text-sm font-semibold tabular-nums text-rh-night">
                    {formatTime(selectedSlot.start)} – {formatTime(selectedSlot.end)}
                    <span className="font-normal text-rh-night/55"> · {service.durationMinutes} min</span>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-rh-night/75">
                    <WhereIcon className="h-4 w-4 shrink-0 text-rh-night/45" aria-hidden />
                    <span className="min-w-0 truncate">{where}</span>
                </p>
            </div>
            <button
                type="button"
                onClick={() => {
                    setShowGuestForm(false);
                    setStep("time");
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-rh-night underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
            >
                Change
            </button>
        </div>
    );

    return (
        <BookingShell topRight={changeServiceLink}>
            <motion.div
                key="details"
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
                className={cardClass}
            >
                {stepHeader("Your details")}

                {summary}

                <div className="mt-6 space-y-6">
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

                    {/* Price */}
                    <div className="rounded-2xl border border-rh-night/10 p-4">
                        {quoteOk?.assisted && (
                            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-rh-lime/15 px-2.5 py-1 text-xs font-semibold text-rh-night">
                                <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Rehabify Access rate · {formatKobo(quoteOk.basePriceKobo)}
                            </p>
                        )}
                        {quote === undefined ? (
                            <p className="flex items-center gap-2 text-sm text-rh-night/60">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the price…
                            </p>
                        ) : quoteOk ? (
                            <dl className="space-y-2 text-sm">
                                <div className="flex items-baseline justify-between gap-3">
                                    <dt className="text-rh-night/70">{service.name}</dt>
                                    <dd className="shrink-0 font-semibold tabular-nums">
                                        {quoteOk.assisted && service.priceKobo > quoteOk.basePriceKobo && (
                                            <s className="mr-1.5 font-normal text-rh-night/45">{formatKobo(service.priceKobo)}</s>
                                        )}
                                        {formatKobo(quoteOk.basePriceKobo)}
                                    </dd>
                                </div>
                                {quoteOk.travelSurchargeKobo > 0 && (
                                    <div className="flex items-baseline justify-between gap-3">
                                        <dt className="text-rh-night/70">Travel charge ({quoteOk.zoneName ?? zone?.name})</dt>
                                        <dd className="shrink-0 font-semibold tabular-nums">{formatKobo(quoteOk.travelSurchargeKobo)}</dd>
                                    </div>
                                )}
                                <div className="flex items-baseline justify-between gap-3 border-t border-rh-night/10 pt-3">
                                    <dt className="font-semibold">You pay</dt>
                                    <dd className="text-2xl font-bold tabular-nums">{formatKobo(quoteOk.chargeKobo)}</dd>
                                </div>
                                <p className="text-right text-xs text-rh-night/55">All-inclusive. No extra fees at checkout.</p>
                            </dl>
                        ) : (
                            <p className="text-sm text-red-700">{quote.ok ? "" : quote.message}</p>
                        )}
                    </div>

                    {accessNote && (
                        <Notice>
                            <p>{accessNote}</p>
                        </Notice>
                    )}

                    {bookingError && (
                        <Notice tone="error">
                            <p>{bookingError}</p>
                            {service.requiresPriorAssessment && /assessment/i.test(bookingError) && (
                                <Link
                                    href={`/book/${rawParam}${offeredServices.some((s) => s.id === "virtual_assessment") ? "/virtual_assessment" : ""}`}
                                    className="inline-flex font-semibold underline underline-offset-4 hover:no-underline"
                                >
                                    Book an assessment
                                </Link>
                            )}
                            {!isSignedIn && /sign in/i.test(bookingError) && (
                                <Link
                                    href={signInHref}
                                    onClick={rememberBookingForSignIn}
                                    className="inline-flex font-semibold underline underline-offset-4 hover:no-underline"
                                >
                                    Sign in
                                </Link>
                            )}
                        </Notice>
                    )}

                    {!(needsSignIn && userLoaded && !isSignedIn) && (
                        <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-rh-canvas/80 p-4 text-sm ring-1 ring-inset ring-rh-night/[0.06]">
                            <input
                                type="checkbox"
                                checked={agreed}
                                onChange={(e) => setAgreed(e.target.checked)}
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-rh-night/30 accent-rh-ink"
                            />
                            <span className="text-rh-night/75">
                                I agree to the{" "}
                                {CHECKOUT_POLICIES.map((id, i) => (
                                    <span key={id}>
                                        {i > 0 && " and "}
                                        <a
                                            href={POLICIES[id].href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-semibold text-rh-night underline underline-offset-4 hover:no-underline"
                                        >
                                            {POLICIES[id].title}
                                        </a>
                                    </span>
                                ))}
                                .
                            </span>
                        </label>
                    )}
                    {needsSignIn && userLoaded && !isSignedIn ? (
                        <div className="space-y-3 rounded-2xl bg-rh-canvas/80 p-4 ring-1 ring-inset ring-rh-night/[0.06] sm:p-5">
                            <p className="text-sm font-semibold">Sign in to book</p>
                            <p className="text-sm text-rh-night/65">
                                {service.requiresPriorAssessment
                                    ? `${service.name} follows an assessment, so we need to check your records first.`
                                    : "Sign in to use your Rehabify Access rate."}
                            </p>
                            <Link href={signInHref} onClick={rememberBookingForSignIn} className={cn(primaryButton, "w-full")}>
                                <LogIn className="h-4 w-4" aria-hidden />
                                Sign in to continue
                            </Link>
                            {service.requiresPriorAssessment && (
                                <p className="text-center text-xs text-rh-night/55">
                                    New to Rehabify?{" "}
                                    <Link href={`/book/${rawParam}`} className="font-semibold text-rh-night underline underline-offset-4 hover:no-underline">
                                        Book an assessment first
                                    </Link>
                                </p>
                            )}
                        </div>
                    ) : showGuestForm && !isSignedIn ? (
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
                            <button type="button" onClick={handleGuestPay} disabled={!canPay || !guestEmail.trim()} className={cn(primaryButton, "w-full")}>
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                                    </>
                                ) : (
                                    <>
                                        <Lock className="h-4 w-4" aria-hidden /> {payLabel}
                                    </>
                                )}
                            </button>
                            <p className="text-center text-xs text-rh-night/55">
                                Have an account?{" "}
                                <Link href={signInHref} onClick={rememberBookingForSignIn} className="font-semibold text-rh-night underline underline-offset-4 hover:no-underline">
                                    Sign in instead
                                </Link>
                            </p>
                        </motion.div>
                    ) : (
                        <div className="grid grid-cols-[auto_1fr] gap-3">
                            <button type="button" onClick={() => setStep("time")} className={secondaryButton} aria-label="Back">
                                <ArrowLeft className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={handleBooking} disabled={!canPay} className={primaryButton}>
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                                    </>
                                ) : isSignedIn ? (
                                    <>
                                        <Lock className="h-4 w-4" aria-hidden />
                                        {payLabel}
                                    </>
                                ) : (
                                    <>
                                        Continue to payment
                                        <ArrowRight className="h-4 w-4" aria-hidden />
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    <div className="space-y-1.5 text-center text-xs text-rh-night/50">
                        <p>Your time is held for 30 minutes while you pay. Your booking is confirmed once paid.</p>
                        <p className="flex items-center justify-center gap-1.5">
                            <Lock className="h-3.5 w-3.5" aria-hidden />
                            Secure payment by Paystack
                        </p>
                    </div>
                </div>
            </motion.div>
            <PoweredBy />
        </BookingShell>
    );
}
