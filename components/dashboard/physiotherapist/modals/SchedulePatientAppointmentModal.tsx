"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import CalendarBookingWidget, { type AvailableSlot } from "@/components/marketplace/CalendarBookingWidget";
import { BookingBottomSheet } from "@/components/booking/BookingBottomSheet";
import { SessionTypeOption } from "@/components/booking/SessionTypeOption";
import { SESSION_TYPES, type SessionType } from "@/components/booking/booking-shared";
import { toast } from "sonner";
import { playSound } from "@/lib/sounds";
import { formatKobo, getService, type ServiceMode } from "@/lib/rehabify-services";
import { cn } from "@/lib/utils";
import type { CareBillingMode, MarketplaceSettings, PayoutSchedule, ServiceQuote, TravelZone } from "@/lib/rehabify-api-types";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock, Home, Loader2, MapPin, Video, X } from "@/components/icons";

interface SchedulePatientAppointmentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    patientId: Id<"users">;
    patientName: string;
    physiotherapistId: Id<"users">;
    physiotherapistName: string;
    physiotherapistImage?: string;
    offersOnlineSessions?: boolean;
}

type BookingStep = "select-type" | "select-time" | "details" | "confirm";
type Mode = "telehealth" | "in-person";

/** A Rehabify service the physio can schedule for a patient who pays per session. */
type ScheduleService = {
    id: string;
    name: string;
    mode: ServiceMode;
    durationMinutes: number;
    durationLabel: string;
    summary: string;
    priceKobo: number;
    payoutKobo: number;
    travelApplies: boolean;
};

type HomeVisit = { zoneId: Id<"travelZones">; area: string };

const primaryButton =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-rh-lime px-5 text-[15px] font-semibold text-rh-ink shadow-sm transition-[filter,transform] hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-white dark:focus-visible:ring-offset-rh-ink";

const secondaryButton =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rh-ink/15 bg-white px-5 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-ink/[0.04] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:border-white/15 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]";

const iconButton =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-rh-ink/70 transition-colors hover:bg-rh-ink/[0.06] hover:text-rh-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white";

const fieldClass =
    "w-full rounded-xl border border-rh-ink/15 bg-white px-3.5 py-2.5 text-base text-rh-ink placeholder:text-rh-ink/40 transition-[border-color,box-shadow] focus:border-rh-ink focus:outline-none focus:ring-4 focus:ring-rh-lime/25 sm:text-sm dark:border-white/15 dark:bg-rh-ink-2 dark:text-white dark:placeholder:text-white/40 dark:focus:border-white/50";

const chipClass = "inline-flex items-center gap-1 rounded-full bg-rh-ink/[0.05] px-2.5 py-1 dark:bg-white/[0.07]";

/** The readable reason from a ConvexError, else the error's message. */
function errorMessage(error: unknown) {
    if (error instanceof ConvexError && typeof error.data === "string" && error.data.trim()) return error.data;
    return (error as Error)?.message || "Please try again.";
}

function ServiceChoice({
    service,
    selected,
    busy,
    onSelect,
}: {
    service: ScheduleService;
    selected: boolean;
    /** Another option was picked and the flow is moving on. */
    busy: boolean;
    onSelect: () => void;
}) {
    const reduceMotion = useReducedMotion();
    const ModeIcon = service.mode === "home" ? Home : Video;
    return (
        <motion.button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            disabled={busy && !selected}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            className={cn(
                "w-full rounded-2xl border p-4 text-left transition-[background-color,border-color,box-shadow,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime sm:p-5",
                selected
                    ? "border-rh-lime bg-rh-honeydew shadow-[0_0_0_1px_#00cd0f] dark:bg-rh-lime/10"
                    : "border-rh-ink/10 bg-white hover:border-rh-ink/30 dark:border-white/10 dark:bg-rh-ink-2 dark:hover:border-white/30",
                busy && !selected && "opacity-50"
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
                        {service.name}
                        {selected && <Check className="h-4 w-4 shrink-0 text-rh-lime" strokeWidth={3} aria-hidden />}
                    </h3>
                    <ul className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium text-rh-ink/70 dark:text-white/70">
                        <li className={chipClass}>
                            <Clock className="h-3.5 w-3.5" aria-hidden /> {service.durationLabel}
                        </li>
                        <li className={chipClass}>
                            <ModeIcon className="h-3.5 w-3.5" aria-hidden /> {service.mode === "home" ? "Home visit" : "Video call"}
                        </li>
                    </ul>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-base font-bold tabular-nums">
                        {service.travelApplies ? "From " : ""}
                        {formatKobo(service.priceKobo)}
                    </p>
                    <p className="text-xs tabular-nums text-rh-ink/55 dark:text-white/55">You earn {formatKobo(service.payoutKobo)}</p>
                </div>
            </div>
        </motion.button>
    );
}

function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** sm and up: centred dialog. Below: bottom sheet. */
function useIsDesktop() {
    const [isDesktop, setIsDesktop] = useState(false);
    useEffect(() => {
        const query = window.matchMedia("(min-width: 640px)");
        const update = () => setIsDesktop(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    return isDesktop;
}

export default function SchedulePatientAppointmentModal({
    open,
    onOpenChange,
    patientId,
    patientName,
    physiotherapistId,
    physiotherapistName,
    physiotherapistImage,
    offersOnlineSessions = true,
}: SchedulePatientAppointmentModalProps) {
    const reduceMotion = useReducedMotion();
    const isDesktop = useIsDesktop();
    const [step, setStep] = useState<BookingStep>("select-type");
    const [selectedSessionType, setSelectedSessionType] = useState<SessionType>(SESSION_TYPES[0]);
    const [pickedTypeId, setPickedTypeId] = useState<SessionType["id"] | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
    const [sessionMode, setSessionMode] = useState<Mode>("telehealth");
    const [notes, setNotes] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const typeTimer = useRef<number | null>(null);
    // Rehabify patients: a paid Rehabify service instead of a free appointment
    const [service, setService] = useState<ScheduleService | null>(null);
    const [pickedServiceId, setPickedServiceId] = useState<string | null>(null);
    const [visit, setVisit] = useState<HomeVisit | null>(null);
    const [address, setAddress] = useState("");
    const [scheduled, setScheduled] = useState<{ chargeKobo: number; holdExpiresAt: number } | null>(null);

    const createAppointment = useMutation(api.appointments.createAppointment);
    const scheduleFollowUp = useMutation(api.rehabifyFollowUps.scheduleRehabifyFollowUp);

    const billing = useQuery(api.rehabifyFollowUps.getCareBillingMode, open ? { patientId } : "skip") as CareBillingMode | null | undefined;
    const isRehabify = billing?.mode === "rehabify";
    const payoutSchedule = useQuery(api.serviceTariffs.getPayoutSchedule, isRehabify ? {} : "skip") as PayoutSchedule | null | undefined;
    const coverage = useQuery(api.marketplace.settings.getMyMarketplaceSettings, isRehabify ? {} : "skip") as MarketplaceSettings | null | undefined;
    const zones = useQuery(api.travelZones.listZones, isRehabify ? {} : "skip") as TravelZone[] | undefined;
    const quote = useQuery(
        api.marketplace.booking.getServiceQuote,
        isRehabify && service && (service.mode !== "home" || visit)
            ? { serviceId: service.id, zoneId: service.mode === "home" ? visit?.zoneId : undefined }
            : "skip"
    ) as ServiceQuote | undefined;

    // Only the services this physio offers: video, and home visits where they cover an area
    const services = useMemo<ScheduleService[]>(() => {
        if (!payoutSchedule || !coverage) return [];
        const offersHome = coverage.offersInPersonSessions && coverage.coveredZoneIds.length > 0;
        const rows = payoutSchedule.services.flatMap((row) => {
            const info = getService(row.id);
            if (!row.active || !info || (row.mode === "home" ? !offersHome : !coverage.offersOnlineSessions)) return [];
            // Treatment follows an assessment; the server refuses it until the patient has had one
            if (info.requiresPriorAssessment && billing?.assessed === false) return [];
            return [
                {
                    id: row.id,
                    name: row.name,
                    mode: row.mode,
                    durationMinutes: info.durationMinutes,
                    durationLabel: row.durationLabel,
                    summary: info.summary,
                    priceKobo: row.priceKobo,
                    payoutKobo: row.payoutKobo,
                    travelApplies: row.travelApplies,
                },
            ];
        });
        // Follow-ups are usually treatment, so list those first
        const isTreatment = (id: string) => Number(getService(id)?.kind === "treatment");
        return rows.sort((a, b) => isTreatment(b.id) - isTreatment(a.id));
    }, [payoutSchedule, coverage, billing?.assessed]);

    const coveredZones = useMemo(() => {
        const covered = new Set<string>((coverage?.coveredZoneIds ?? []) as string[]);
        return (zones ?? []).filter((zone) => covered.has(zone.id));
    }, [zones, coverage]);

    const servicesLoading = isRehabify && (payoutSchedule === undefined || coverage === undefined);
    const patientPrice = quote?.ok
        ? formatKobo(quote.chargeKobo)
        : service
          ? `${service.travelApplies ? "From " : ""}${formatKobo(service.priceKobo)}`
          : "";

    useEffect(
        () => () => {
            if (typeTimer.current) window.clearTimeout(typeTimer.current);
        },
        []
    );

    const reset = () => {
        if (typeTimer.current) window.clearTimeout(typeTimer.current);
        setStep("select-type");
        setSelectedSessionType(SESSION_TYPES[0]);
        setPickedTypeId(null);
        setSelectedSlot(null);
        setSessionMode("telehealth");
        setNotes("");
        setIsProcessing(false);
        setService(null);
        setPickedServiceId(null);
        setVisit(null);
        setAddress("");
        setScheduled(null);
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen && isProcessing) return;
        if (!newOpen) reset();
        onOpenChange(newOpen);
    };

    const handleSessionTypeSelect = (sessionType: SessionType) => {
        if (pickedTypeId) return;
        setPickedTypeId(sessionType.id);
        setSelectedSessionType(sessionType);
        // Let the selected state register before moving on.
        typeTimer.current = window.setTimeout(
            () => {
                setStep("select-time");
                setPickedTypeId(null);
            },
            reduceMotion ? 100 : 280
        );
    };

    const handleServiceSelect = (next: ScheduleService) => {
        if (pickedServiceId) return;
        setPickedServiceId(next.id);
        setService(next);
        typeTimer.current = window.setTimeout(
            () => {
                setStep("select-time");
                setPickedServiceId(null);
            },
            reduceMotion ? 100 : 280
        );
    };

    const goToDetails = () => {
        if (!selectedSlot) {
            toast.error("Please pick a time");
            return;
        }
        setStep("details");
    };

    const goBack = () => {
        if (step === "select-time") {
            setStep("select-type");
            setSelectedSlot(null);
        } else if (step === "details") {
            setStep("select-time");
        }
    };

    const handleRehabifyBooking = async (slot: AvailableSlot, chosen: ScheduleService) => {
        const isHome = chosen.mode === "home";
        if (isHome && !visit) {
            toast.error("Choose the patient’s area");
            return;
        }
        if (isHome && !address.trim()) {
            toast.error("Add the patient’s address for the home visit");
            return;
        }
        setIsProcessing(true);
        try {
            const result = await scheduleFollowUp({
                patientId,
                serviceId: chosen.id,
                slotStart: slot.start,
                zoneId: isHome ? visit?.zoneId : undefined,
                area: isHome ? visit?.area : undefined,
                patientAddress: isHome ? address.trim() : undefined,
                notes: notes.trim() || undefined,
            });
            setScheduled({ chargeKobo: result.chargeKobo, holdExpiresAt: result.holdExpiresAt });
            playSound("booked");
            toast.success(`Scheduled — ${patientName} pays to confirm within 24 hours`);
            setStep("confirm");
        } catch (error) {
            playSound("error");
            toast.error("Couldn't schedule the session", { description: errorMessage(error) });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBooking = async () => {
        if (!selectedSlot) {
            toast.error("Please pick a time");
            return;
        }
        if (isRehabify) {
            if (service) await handleRehabifyBooking(selectedSlot, service);
            return;
        }
        setIsProcessing(true);
        try {
            await createAppointment({
                patientId,
                startTime: selectedSlot.start,
                endTime: selectedSlot.end,
                serviceType: selectedSessionType.title,
                appointmentType: sessionMode,
                notesForTherapist: notes || undefined,
            });
            playSound("booked");
            toast.success("Appointment scheduled", {
                description: `${patientName} has been booked in.`,
            });
            setStep("confirm");
        } catch (error) {
            playSound("error");
            toast.error("Couldn't schedule the appointment", {
                description: errorMessage(error),
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const title =
        step === "select-type"
            ? `Book ${patientName}`
            : step === "select-time"
              ? "Pick a date & time"
              : step === "details"
                ? "Confirm details"
                : isRehabify
                  ? "Scheduled: pay to confirm"
                  : "Appointment booked";

    const canGoBack = step === "select-time" || step === "details";
    const sessionTitle = isRehabify && service ? service.name : selectedSessionType.title;
    const sessionMinutes = isRehabify && service ? service.durationMinutes : selectedSessionType.duration;

    return (
        <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
            <AnimatePresence>
                {open && (
                    <DialogPrimitive.Portal forceMount>
                        <DialogPrimitive.Overlay asChild forceMount>
                            <motion.div
                                className="fixed inset-0 z-50 bg-rh-ink/45 backdrop-blur-[2px] dark:bg-black/60"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                            />
                        </DialogPrimitive.Overlay>
                        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
                            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
                                <motion.div
                                    className={cn(
                                        "pointer-events-auto relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-rh-canvas text-rh-ink shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.5)] outline-none",
                                        "sm:max-h-[90dvh] sm:rounded-[28px] sm:shadow-[0_40px_100px_-30px_rgba(0,0,0,0.6)]",
                                        "dark:bg-rh-ink dark:text-white dark:ring-1 dark:ring-white/10",
                                        step === "select-time" ? "sm:max-w-5xl" : "sm:max-w-xl"
                                    )}
                                    initial={reduceMotion ? { opacity: 0 } : isDesktop ? { opacity: 0, scale: 0.97, y: 8 } : { y: "100%" }}
                                    animate={reduceMotion ? { opacity: 1 } : isDesktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
                                    exit={reduceMotion ? { opacity: 0 } : isDesktop ? { opacity: 0, scale: 0.97, y: 8 } : { y: "100%" }}
                                    transition={reduceMotion ? { duration: 0.15 } : { type: "spring", stiffness: 380, damping: 36 }}
                                >
                                    {/* Header */}
                                    <div className="flex shrink-0 items-center gap-2 border-b border-rh-ink/10 px-4 pb-3 pt-2 sm:px-6 sm:pt-4 dark:border-white/10">
                                        <div className="absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-rh-ink/15 sm:hidden dark:bg-white/20" aria-hidden />
                                        {canGoBack ? (
                                            <button type="button" onClick={goBack} className={iconButton} aria-label="Back">
                                                <ArrowLeft className="h-5 w-5" />
                                            </button>
                                        ) : (
                                            <span className="w-1" aria-hidden />
                                        )}
                                        <div className="min-w-0 flex-1 pt-3 sm:pt-0">
                                            <DialogPrimitive.Title className="truncate text-lg font-semibold tracking-tight">{title}</DialogPrimitive.Title>
                                            {step !== "select-type" && step !== "confirm" && (
                                                <p className="truncate text-sm text-rh-ink/60 dark:text-white/60">
                                                    {sessionTitle} · {sessionMinutes} min · {patientName}
                                                </p>
                                            )}
                                        </div>
                                        <DialogPrimitive.Close className={iconButton} aria-label="Close" disabled={isProcessing}>
                                            <X className="h-5 w-5" />
                                        </DialogPrimitive.Close>
                                    </div>

                                    {/* Body */}
                                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
                                        {step === "select-type" && (billing === undefined || servicesLoading) && (
                                            <div className="flex items-center justify-center gap-2 py-12 text-sm text-rh-ink/60 dark:text-white/60">
                                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
                                            </div>
                                        )}

                                        {step === "select-type" && isRehabify && !servicesLoading && (
                                            <div>
                                                <p className="mb-4 rounded-2xl bg-white p-4 text-sm text-rh-ink/70 ring-1 ring-rh-ink/[0.08] dark:bg-rh-ink-2 dark:text-white/70 dark:ring-white/10">
                                                    {patientName} came to you through Rehabify, so each session is paid at the standard Rehabify price.
                                                    They’ll have 24 hours to pay and confirm.
                                                </p>
                                                {services.length === 0 ? (
                                                    <p className="text-sm text-rh-ink/60 dark:text-white/60">
                                                        You don’t offer any Rehabify services yet. Turn on video sessions or home visits in{" "}
                                                        <Link
                                                            href="/dashboard/physiotherapist/settings/marketplace"
                                                            className="font-semibold text-rh-ink underline-offset-2 hover:underline dark:text-white"
                                                        >
                                                            Services &amp; coverage
                                                        </Link>
                                                        .
                                                    </p>
                                                ) : (
                                                    <>
                                                        <p className="mb-3 text-sm text-rh-ink/60 dark:text-white/60">Which service is this?</p>
                                                        <div className="space-y-2.5">
                                                            {services.map((option) => (
                                                                <ServiceChoice
                                                                    key={option.id}
                                                                    service={option}
                                                                    selected={pickedServiceId === option.id}
                                                                    busy={pickedServiceId !== null}
                                                                    onSelect={() => handleServiceSelect(option)}
                                                                />
                                                            ))}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {step === "select-type" && billing !== undefined && !isRehabify && (
                                            <div>
                                                <p className="mb-4 text-sm text-rh-ink/60 dark:text-white/60">What kind of session is this?</p>
                                                <div className="space-y-2.5">
                                                    {SESSION_TYPES.map((session) => (
                                                        <SessionTypeOption
                                                            key={session.id}
                                                            session={session}
                                                            selected={pickedTypeId === session.id}
                                                            busy={pickedTypeId !== null}
                                                            onSelect={() => handleSessionTypeSelect(session)}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {step === "select-time" && isRehabify && service && (
                                            <CalendarBookingWidget
                                                physiotherapistId={physiotherapistId}
                                                physiotherapistName={physiotherapistName}
                                                physiotherapistImage={physiotherapistImage}
                                                sessionDuration={service.durationMinutes}
                                                sessionTitle={service.name}
                                                sessionDescription={service.summary}
                                                offersOnlineSessions={service.mode === "virtual"}
                                                offersInPersonSessions={service.mode === "home"}
                                                prices={[{ label: "Patient pays", amount: patientPrice }]}
                                                selectedSlot={selectedSlot}
                                                onSlotSelect={setSelectedSlot}
                                                onContinue={goToDetails}
                                                continueLabel="Next"
                                                className="rounded-3xl shadow-sm"
                                            />
                                        )}

                                        {step === "select-time" && !isRehabify && (
                                            <CalendarBookingWidget
                                                physiotherapistId={physiotherapistId}
                                                physiotherapistName={physiotherapistName}
                                                physiotherapistImage={physiotherapistImage}
                                                sessionDuration={selectedSessionType.duration}
                                                sessionTitle={selectedSessionType.title}
                                                sessionDescription={selectedSessionType.description}
                                                offersOnlineSessions={offersOnlineSessions}
                                                selectedSlot={selectedSlot}
                                                onSlotSelect={setSelectedSlot}
                                                onContinue={goToDetails}
                                                continueLabel="Next"
                                                className="rounded-3xl shadow-sm"
                                            />
                                        )}

                                        {step === "details" && selectedSlot && (
                                            <div className="space-y-6" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
                                                <div className="rounded-2xl bg-white p-4 ring-1 ring-rh-ink/[0.08] dark:bg-rh-ink-2 dark:ring-white/10">
                                                    <p className="text-sm text-rh-ink/60 dark:text-white/60">
                                                        {isRehabify && service ? `${service.name} with ${patientName}` : `Appointment with ${patientName}`}
                                                    </p>
                                                    <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium">
                                                        <CalendarDays className="h-4 w-4 shrink-0 text-rh-ink/45 dark:text-white/45" aria-hidden />
                                                        {formatDate(selectedSlot.start)}
                                                    </p>
                                                    <p className="mt-0.5 pl-[22px] text-base font-semibold tabular-nums">
                                                        {formatTime(selectedSlot.start)} – {formatTime(selectedSlot.end)}
                                                    </p>
                                                </div>

                                                {isRehabify && service?.mode === "home" && (
                                                    <div className="space-y-4">
                                                        <div>
                                                            <label htmlFor="schedule-area" className="mb-1.5 block text-sm font-semibold">
                                                                Patient’s area
                                                            </label>
                                                            <select
                                                                id="schedule-area"
                                                                value={visit ? `${visit.zoneId}::${visit.area}` : ""}
                                                                onChange={(e) => {
                                                                    const [zoneId, ...rest] = e.target.value.split("::");
                                                                    setVisit(zoneId ? { zoneId: zoneId as Id<"travelZones">, area: rest.join("::") } : null);
                                                                }}
                                                                className={fieldClass}
                                                            >
                                                                <option value="">{zones === undefined ? "Loading areas…" : "Choose an area you cover"}</option>
                                                                {coveredZones.map((zone) => (
                                                                    <optgroup key={zone.id} label={`${zone.name}, ${zone.city}`}>
                                                                        {zone.areas.map((area) => (
                                                                            <option key={area} value={`${zone.id}::${area}`}>
                                                                                {area}
                                                                            </option>
                                                                        ))}
                                                                    </optgroup>
                                                                ))}
                                                            </select>
                                                            <p className="mt-1.5 text-xs text-rh-ink/55 dark:text-white/55">
                                                                Only the areas you cover are listed. Change them in Services &amp; coverage.
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <label htmlFor="schedule-address" className="mb-1.5 block text-sm font-semibold">
                                                                Address for the visit
                                                            </label>
                                                            <textarea
                                                                id="schedule-address"
                                                                value={address}
                                                                onChange={(e) => setAddress(e.target.value)}
                                                                placeholder="House number, street and any landmarks"
                                                                rows={2}
                                                                maxLength={500}
                                                                className={cn(fieldClass, "resize-none")}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {isRehabify && service && (
                                                    <div className="rounded-2xl bg-rh-honeydew p-4 ring-1 ring-rh-lime/40 dark:bg-rh-lime/10 dark:ring-rh-lime/25">
                                                        <p className="text-base font-semibold">
                                                            {quote?.ok
                                                                ? `The patient pays ${formatKobo(quote.chargeKobo)} to confirm`
                                                                : service.mode === "home"
                                                                  ? `The patient pays from ${formatKobo(service.priceKobo)} to confirm`
                                                                  : `The patient pays ${formatKobo(service.priceKobo)} to confirm`}
                                                        </p>
                                                        {quote?.ok && quote.travelSurchargeKobo > 0 && (
                                                            <p className="mt-0.5 text-xs tabular-nums text-rh-ink/60 dark:text-white/60">
                                                                Includes a {formatKobo(quote.travelSurchargeKobo)} travel charge for {quote.zoneName ?? "this area"}.
                                                            </p>
                                                        )}
                                                        <p className="mt-2 text-sm text-rh-ink/70 dark:text-white/70">
                                                            They’re asked to pay within 24 hours, and the time is held until then. You earn{" "}
                                                            {formatKobo(service.payoutKobo)}
                                                            {service.travelApplies ? " plus your share of travel" : ""} once the session is completed.
                                                        </p>
                                                    </div>
                                                )}

                                                {!isRehabify && (
                                                <fieldset>
                                                    <legend className="mb-2.5 text-sm font-semibold">Session mode</legend>
                                                    <div role="radiogroup" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                                        {(["telehealth", "in-person"] as const).map((mode) => {
                                                            const selected = sessionMode === mode;
                                                            const Icon = mode === "telehealth" ? Video : MapPin;
                                                            return (
                                                                <motion.button
                                                                    key={mode}
                                                                    type="button"
                                                                    role="radio"
                                                                    aria-checked={selected}
                                                                    onClick={() => setSessionMode(mode)}
                                                                    whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                                                                    className={cn(
                                                                        "flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime",
                                                                        selected
                                                                            ? "border-rh-lime bg-rh-honeydew shadow-[0_0_0_1px_#00cd0f] dark:bg-rh-lime/10"
                                                                            : "border-rh-ink/10 bg-white hover:border-rh-ink/30 dark:border-white/10 dark:bg-rh-ink-2 dark:hover:border-white/30"
                                                                    )}
                                                                >
                                                                    <span
                                                                        className={cn(
                                                                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                                                                            selected
                                                                                ? "bg-rh-ink text-rh-lime"
                                                                                : "bg-rh-ink/[0.06] text-rh-ink/70 dark:bg-white/[0.08] dark:text-white/70"
                                                                        )}
                                                                    >
                                                                        <Icon className="h-4 w-4" aria-hidden />
                                                                    </span>
                                                                    <span className="flex-1 text-sm font-semibold">
                                                                        {mode === "telehealth" ? "Video call" : "In person"}
                                                                    </span>
                                                                    <span
                                                                        aria-hidden
                                                                        className={cn(
                                                                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                                                                            selected ? "border-rh-lime bg-rh-lime text-rh-ink" : "border-rh-ink/20 dark:border-white/25"
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

                                                <div>
                                                    <label htmlFor="schedule-notes" className="mb-1.5 block text-sm font-semibold">
                                                        Notes <span className="font-normal text-rh-ink/50 dark:text-white/50">(optional)</span>
                                                    </label>
                                                    <textarea
                                                        id="schedule-notes"
                                                        value={notes}
                                                        onChange={(e) => setNotes(e.target.value)}
                                                        placeholder="Anything to remember for this session"
                                                        rows={3}
                                                        className={cn(fieldClass, "resize-none")}
                                                    />
                                                </div>

                                                <div className="grid grid-cols-[auto_1fr] gap-3">
                                                    <button type="button" onClick={goBack} className={secondaryButton} aria-label="Back">
                                                        <ArrowLeft className="h-4 w-4" />
                                                    </button>
                                                    <button type="button" onClick={handleBooking} disabled={isProcessing} className={primaryButton}>
                                                        {isProcessing ? (
                                                            <>
                                                                <Loader2 className="h-4 w-4 animate-spin" /> Scheduling…
                                                            </>
                                                        ) : isRehabify ? (
                                                            "Schedule and request payment"
                                                        ) : (
                                                            "Confirm appointment"
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {step === "confirm" && (
                                            <div className="mx-auto max-w-md py-4 text-center" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
                                                <motion.div
                                                    initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 18 }}
                                                    className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rh-lime"
                                                >
                                                    <Check className="h-8 w-8 text-rh-ink" strokeWidth={3} />
                                                </motion.div>
                                                <h2 className="text-2xl font-semibold tracking-tight">
                                                    {isRehabify ? `Scheduled for ${patientName}` : `${patientName} is booked in`}
                                                </h2>
                                                {isRehabify && scheduled && (
                                                    <p className="mt-2 text-sm text-rh-ink/70 dark:text-white/70">
                                                        They pay {formatKobo(scheduled.chargeKobo)} to confirm. We’ll hold the time until{" "}
                                                        {formatTime(scheduled.holdExpiresAt)} on{" "}
                                                        {new Date(scheduled.holdExpiresAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}.
                                                    </p>
                                                )}
                                                {selectedSlot && (
                                                    <div className="mt-5 rounded-2xl bg-white p-4 text-left ring-1 ring-rh-ink/[0.08] dark:bg-rh-ink-2 dark:ring-white/10">
                                                        <p className="text-sm text-rh-ink/60 dark:text-white/60">
                                                            {isRehabify && service
                                                                ? `${service.name} · ${service.mode === "home" ? "Home visit" : "Video call"}`
                                                                : `${selectedSessionType.title} · ${sessionMode === "telehealth" ? "Video call" : "In person"}`}
                                                        </p>
                                                        <p className="mt-1 font-medium">{formatDate(selectedSlot.start)}</p>
                                                        <p className="font-semibold tabular-nums">
                                                            {formatTime(selectedSlot.start)} – {formatTime(selectedSlot.end)}
                                                        </p>
                                                    </div>
                                                )}
                                                <p className="mt-5 text-sm text-rh-ink/60 dark:text-white/60">
                                                    {isRehabify
                                                        ? "The patient has been asked to pay. The session is confirmed once they do; if they don’t, the time is released."
                                                        : "The patient will get a notification with the session details."}
                                                </p>
                                                <button type="button" onClick={() => handleOpenChange(false)} className={cn(primaryButton, "mt-6 w-full")}>
                                                    Done
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Mobile: Continue slides up as soon as a time is picked */}
                                    {step === "select-time" && (
                                        <BookingBottomSheet open={Boolean(selectedSlot)} label="Selected time" placement="sticky" className="shrink-0">
                                            {selectedSlot && (
                                                <div>
                                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-ink/50 dark:text-white/50">
                                                        {sessionTitle} · {sessionMinutes} min
                                                    </p>
                                                    <p className="mt-1 text-base font-semibold">
                                                        {new Date(selectedSlot.start).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                                                        <span className="tabular-nums"> · {formatTime(selectedSlot.start)}</span>
                                                    </p>
                                                    <button type="button" onClick={goToDetails} className={cn(primaryButton, "mt-4 w-full")}>
                                                        Continue
                                                        <ArrowRight className="h-4 w-4" aria-hidden />
                                                    </button>
                                                </div>
                                            )}
                                        </BookingBottomSheet>
                                    )}
                                </motion.div>
                            </DialogPrimitive.Content>
                        </div>
                    </DialogPrimitive.Portal>
                )}
            </AnimatePresence>
        </DialogPrimitive.Root>
    );
}
