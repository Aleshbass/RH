"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
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
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Loader2, MapPin, Video, X } from "lucide-react";

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

const primaryButton =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-rh-lime px-5 text-[15px] font-semibold text-rh-night shadow-[0_10px_24px_-12px_rgba(0,205,15,0.9)] transition-[filter,transform] hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-night focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-white dark:focus-visible:ring-offset-rh-ink";

const secondaryButton =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rh-night/15 bg-white px-5 text-[15px] font-semibold text-rh-night transition-colors hover:bg-rh-night/[0.04] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:border-white/15 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]";

const iconButton =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-rh-night/70 transition-colors hover:bg-rh-night/[0.06] hover:text-rh-night focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white";

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

    const createAppointment = useMutation(api.appointments.createAppointment);

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

    const handleBooking = async () => {
        if (!selectedSlot) {
            toast.error("Please pick a time");
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
                description: (error as Error)?.message || "Please try again.",
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
                : "Appointment booked";

    const canGoBack = step === "select-time" || step === "details";

    return (
        <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
            <AnimatePresence>
                {open && (
                    <DialogPrimitive.Portal forceMount>
                        <DialogPrimitive.Overlay asChild forceMount>
                            <motion.div
                                className="fixed inset-0 z-50 bg-rh-night/45 backdrop-blur-[2px] dark:bg-black/60"
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
                                        "pointer-events-auto relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-rh-canvas text-rh-night shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.5)] outline-none",
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
                                    <div className="flex shrink-0 items-center gap-2 border-b border-rh-night/10 px-4 pb-3 pt-2 sm:px-6 sm:pt-4 dark:border-white/10">
                                        <div className="absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-rh-night/15 sm:hidden dark:bg-white/20" aria-hidden />
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
                                                <p className="truncate text-sm text-rh-night/60 dark:text-white/60">
                                                    {selectedSessionType.title} · {selectedSessionType.duration} min · {patientName}
                                                </p>
                                            )}
                                        </div>
                                        <DialogPrimitive.Close className={iconButton} aria-label="Close" disabled={isProcessing}>
                                            <X className="h-5 w-5" />
                                        </DialogPrimitive.Close>
                                    </div>

                                    {/* Body */}
                                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
                                        {step === "select-type" && (
                                            <div>
                                                <p className="mb-4 text-sm text-rh-night/60 dark:text-white/60">What kind of session is this?</p>
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

                                        {step === "select-time" && (
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
                                                <div className="rounded-2xl bg-white p-4 ring-1 ring-rh-night/[0.08] dark:bg-rh-ink-2 dark:ring-white/10">
                                                    <p className="text-sm text-rh-night/60 dark:text-white/60">Appointment with {patientName}</p>
                                                    <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium">
                                                        <CalendarDays className="h-4 w-4 shrink-0 text-rh-night/45 dark:text-white/45" aria-hidden />
                                                        {formatDate(selectedSlot.start)}
                                                    </p>
                                                    <p className="mt-0.5 pl-[22px] text-base font-semibold tabular-nums">
                                                        {formatTime(selectedSlot.start)} – {formatTime(selectedSlot.end)}
                                                    </p>
                                                </div>

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
                                                                            : "border-rh-night/10 bg-white hover:border-rh-night/30 dark:border-white/10 dark:bg-rh-ink-2 dark:hover:border-white/30"
                                                                    )}
                                                                >
                                                                    <span
                                                                        className={cn(
                                                                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                                                                            selected
                                                                                ? "bg-rh-night text-rh-lime"
                                                                                : "bg-rh-night/[0.06] text-rh-night/70 dark:bg-white/[0.08] dark:text-white/70"
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
                                                                            selected ? "border-rh-lime bg-rh-lime text-rh-night" : "border-rh-night/20 dark:border-white/25"
                                                                        )}
                                                                    >
                                                                        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                                                                    </span>
                                                                </motion.button>
                                                            );
                                                        })}
                                                    </div>
                                                </fieldset>

                                                <div>
                                                    <label htmlFor="schedule-notes" className="mb-1.5 block text-sm font-semibold">
                                                        Notes <span className="font-normal text-rh-night/50 dark:text-white/50">(optional)</span>
                                                    </label>
                                                    <textarea
                                                        id="schedule-notes"
                                                        value={notes}
                                                        onChange={(e) => setNotes(e.target.value)}
                                                        placeholder="Anything to remember for this session"
                                                        rows={3}
                                                        className="w-full resize-none rounded-xl border border-rh-night/15 bg-white px-3.5 py-2.5 text-base text-rh-night placeholder:text-rh-night/40 transition-[border-color,box-shadow] focus:border-rh-night focus:outline-none focus:ring-4 focus:ring-rh-lime/25 sm:text-sm dark:border-white/15 dark:bg-rh-ink-2 dark:text-white dark:placeholder:text-white/40 dark:focus:border-white/50"
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
                                                    className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rh-lime shadow-[0_14px_30px_-12px_rgba(0,205,15,0.9)]"
                                                >
                                                    <Check className="h-8 w-8 text-rh-night" strokeWidth={3} />
                                                </motion.div>
                                                <h2 className="text-2xl font-semibold tracking-tight">{patientName} is booked in</h2>
                                                {selectedSlot && (
                                                    <div className="mt-5 rounded-2xl bg-white p-4 text-left ring-1 ring-rh-night/[0.08] dark:bg-rh-ink-2 dark:ring-white/10">
                                                        <p className="text-sm text-rh-night/60 dark:text-white/60">
                                                            {selectedSessionType.title} · {sessionMode === "telehealth" ? "Video call" : "In person"}
                                                        </p>
                                                        <p className="mt-1 font-medium">{formatDate(selectedSlot.start)}</p>
                                                        <p className="font-semibold tabular-nums">
                                                            {formatTime(selectedSlot.start)} – {formatTime(selectedSlot.end)}
                                                        </p>
                                                    </div>
                                                )}
                                                <p className="mt-5 text-sm text-rh-night/60 dark:text-white/60">
                                                    The patient will get a notification with the session details.
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
                                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-night/50 dark:text-white/50">
                                                        {selectedSessionType.title} · {selectedSessionType.duration} min
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
