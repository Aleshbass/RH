"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import CalendarBookingWidget from "@/components/marketplace/CalendarBookingWidget";
import { toast } from "sonner";
import {
    Loader2,
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    Clock,
    Video,
    Users,
} from "lucide-react";

interface AvailableSlot {
    start: number;
    end: number;
    duration: number;
}

// Session type options
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
    const [step, setStep] = useState<BookingStep>("select-type");
    const [selectedSessionType, setSelectedSessionType] = useState(SESSION_TYPES[0]);
    const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
    const [sessionMode, setSessionMode] = useState<"telehealth" | "in-person">("telehealth");
    const [notes, setNotes] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    const userTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

    const createAppointment = useMutation(api.appointments.createAppointment);

    // Reset state when modal closes
    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setStep("select-type");
            setSelectedSessionType(SESSION_TYPES[0]);
            setSelectedSlot(null);
            setSessionMode("telehealth");
            setNotes("");
            setIsProcessing(false);
        }
        onOpenChange(newOpen);
    };

    const handleSessionTypeSelect = (sessionType: typeof SESSION_TYPES[0]) => {
        setSelectedSessionType(sessionType);
        setStep("select-time");
    };

    const handleSlotSelect = (slot: AvailableSlot) => {
        setSelectedSlot(slot);
    };

    const goToDetails = () => {
        if (!selectedSlot) {
            toast.error("Please select a time slot");
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
        } else if (step === "confirm") {
            setStep("details");
        }
    };

    const handleBooking = async () => {
        if (!selectedSlot) {
            toast.error("Please select a time slot");
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

            toast.success("Appointment scheduled!", {
                description: `Appointment with ${patientName} has been confirmed.`,
            });

            setStep("confirm");
        } catch (error: any) {
            console.error("Booking error:", error);
            toast.error("Failed to schedule appointment", {
                description: error.message || "Please try again.",
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0">
                {/* Step: Select Session Type */}
                {step === "select-type" && (
                    <div className="p-6">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-semibold">
                                Schedule Appointment with {patientName}
                            </DialogTitle>
                        </DialogHeader>

                        <p className="text-gray-500 text-sm mt-2 mb-6">
                            Select a session type to continue
                        </p>

                        <div className="space-y-3">
                            {SESSION_TYPES.map((session) => (
                                <button
                                    key={session.id}
                                    onClick={() => handleSessionTypeSelect(session)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-5 text-left hover:border-[#005b57] hover:bg-gray-100 transition-all group"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-gray-900 font-semibold text-lg">
                                                {session.title}
                                            </h3>
                                            <p className="text-gray-500 text-sm mt-1">
                                                {session.description}
                                            </p>
                                            <div className="flex items-center gap-1 mt-2 text-gray-400">
                                                <Clock className="w-4 h-4" />
                                                <span className="text-sm">{session.duration}m</span>
                                            </div>
                                        </div>
                                        <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-[#005b57] transition-colors" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step: Select Time */}
                {step === "select-time" && (
                    <div className="p-6">
                        <DialogHeader className="mb-4">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={goBack}
                                    className="h-8 w-8"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                <DialogTitle className="text-xl font-semibold">
                                    Select Date & Time
                                </DialogTitle>
                            </div>
                        </DialogHeader>

                        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">
                                <strong>{selectedSessionType.title}</strong> • {selectedSessionType.duration}m • {patientName}
                            </p>
                        </div>

                        <CalendarBookingWidget
                            physiotherapistId={physiotherapistId}
                            physiotherapistName={physiotherapistName}
                            physiotherapistImage={physiotherapistImage}
                            sessionDuration={selectedSessionType.duration}
                            sessionTitle={selectedSessionType.title}
                            sessionDescription={selectedSessionType.description}
                            offersOnlineSessions={offersOnlineSessions}
                            timezone={userTimezone}
                            onSlotSelect={handleSlotSelect}
                        />

                        {/* Continue Button */}
                        {selectedSlot && (
                            <div className="flex justify-end mt-6">
                                <Button
                                    onClick={goToDetails}
                                    className="bg-[#005b57] hover:bg-[#00443e] text-white px-8"
                                >
                                    Continue
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* Step: Details */}
                {step === "details" && selectedSlot && (
                    <div className="p-6">
                        <DialogHeader className="mb-4">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={goBack}
                                    className="h-8 w-8"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                <DialogTitle className="text-xl font-semibold">
                                    Confirm Details
                                </DialogTitle>
                            </div>
                        </DialogHeader>

                        <div className="max-w-lg mx-auto space-y-6">
                            {/* Selected Time Summary */}
                            <div className="bg-gray-50 rounded-lg p-4">
                                <p className="text-gray-500 text-sm mb-1">Appointment with {patientName}</p>
                                <p className="text-gray-900 font-medium">
                                    {formatDate(selectedSlot.start)}
                                </p>
                                <p className="text-[#005b57] font-semibold">
                                    {formatTime(selectedSlot.start)} - {formatTime(selectedSlot.end)}
                                </p>
                                <p className="text-sm text-gray-500 mt-1">
                                    {selectedSessionType.title} • {selectedSessionType.duration}m
                                </p>
                            </div>

                            {/* Session Mode */}
                            <div>
                                <Label className="text-gray-700 mb-3 block font-medium">
                                    Session Mode
                                </Label>
                                <RadioGroup
                                    value={sessionMode}
                                    onValueChange={(v) =>
                                        setSessionMode(v as "telehealth" | "in-person")
                                    }
                                    className="space-y-3"
                                >
                                    <div
                                        className={`flex items-center space-x-3 p-4 rounded-lg border cursor-pointer ${sessionMode === "telehealth"
                                            ? "border-[#005b57] bg-[#005b57]/5"
                                            : "border-gray-200 bg-white hover:bg-gray-50"
                                            }`}
                                        onClick={() => setSessionMode("telehealth")}
                                    >
                                        <RadioGroupItem
                                            value="telehealth"
                                            id="telehealth"
                                            className="border-gray-400"
                                        />
                                        <Label
                                            htmlFor="telehealth"
                                            className="flex items-center gap-2 cursor-pointer text-gray-900"
                                        >
                                            <Video className="h-4 w-4 text-[#005b57]" />
                                            Telehealth (Video Call)
                                        </Label>
                                    </div>
                                    <div
                                        className={`flex items-center space-x-3 p-4 rounded-lg border cursor-pointer ${sessionMode === "in-person"
                                            ? "border-[#005b57] bg-[#005b57]/5"
                                            : "border-gray-200 bg-white hover:bg-gray-50"
                                            }`}
                                        onClick={() => setSessionMode("in-person")}
                                    >
                                        <RadioGroupItem
                                            value="in-person"
                                            id="in-person"
                                            className="border-gray-400"
                                        />
                                        <Label
                                            htmlFor="in-person"
                                            className="flex items-center gap-2 cursor-pointer text-gray-900"
                                        >
                                            <Users className="h-4 w-4 text-blue-500" />
                                            In-Person
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            {/* Notes */}
                            <div>
                                <Label htmlFor="notes" className="text-gray-700 mb-2 block font-medium">
                                    Notes (Optional)
                                </Label>
                                <Textarea
                                    id="notes"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Add any notes for this appointment..."
                                    className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 resize-none"
                                    rows={3}
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 pt-4">
                                <Button
                                    onClick={goBack}
                                    variant="outline"
                                    className="flex-1"
                                >
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Back
                                </Button>
                                <Button
                                    onClick={handleBooking}
                                    disabled={isProcessing}
                                    className="flex-1 bg-[#005b57] hover:bg-[#00443e] text-white"
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Scheduling...
                                        </>
                                    ) : (
                                        "Confirm Appointment"
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step: Confirmation */}
                {step === "confirm" && (
                    <div className="p-6">
                        <div className="max-w-md mx-auto text-center py-8">
                            <div className="w-16 h-16 bg-[#005b57] rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle2 className="w-8 h-8 text-white" />
                            </div>

                            <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                Appointment Scheduled!
                            </h2>
                            <p className="text-gray-500 mb-6">
                                Your appointment with {patientName} has been confirmed.
                            </p>

                            {selectedSlot && (
                                <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                                    <p className="text-gray-500 text-sm mb-1">Session Time</p>
                                    <p className="text-gray-900 font-medium">
                                        {formatDate(selectedSlot.start)}
                                    </p>
                                    <p className="text-[#005b57] font-semibold">
                                        {formatTime(selectedSlot.start)} - {formatTime(selectedSlot.end)}
                                    </p>
                                </div>
                            )}

                            <p className="text-sm text-gray-500 mb-6">
                                The patient will receive a confirmation notification with the session details.
                            </p>

                            <Button
                                onClick={() => handleOpenChange(false)}
                                className="w-full bg-[#005b57] hover:bg-[#00443e] text-white"
                            >
                                Done
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
