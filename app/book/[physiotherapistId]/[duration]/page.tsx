"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import {
    Loader2,
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    Video,
    Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import CalendarBookingWidget from "@/components/marketplace/CalendarBookingWidget";
import { toast } from "sonner";

type BookingStep = "select-time" | "details" | "confirm";

// Session info based on duration
function getSessionInfo(duration: number) {
    if (duration <= 30) {
        return { title: "Quick Check-in", description: "Brief progress review" };
    }
    if (duration <= 45) {
        return { title: "Follow-up Session", description: "Standard therapy session" };
    }
    return { title: "Initial Consultation", description: "Comprehensive assessment & treatment plan" };
}

export default function BookingPage() {
    const params = useParams();
    const router = useRouter();
    const { user, isSignedIn } = useUser();

    const physiotherapistId = params.physiotherapistId as Id<"users">;
    const durationParam = params.duration as string;
    const sessionDuration = durationParam ? parseInt(durationParam) : 60;

    // Get session title and description based on duration
    const sessionInfo = useMemo(() => getSessionInfo(sessionDuration), [sessionDuration]);

    // State
    const [step, setStep] = useState<BookingStep>("select-time");
    const [selectedSlot, setSelectedSlot] = useState<{
        start: number;
        end: number;
        duration: number;
    } | null>(null);
    const [sessionMode, setSessionMode] = useState<"online" | "in-person">(
        "online"
    );
    const [notes, setNotes] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    // Fetch profile
    const profile = useQuery(api.marketplace.search.getPhysiotherapistProfile, {
        physiotherapistId,
    });

    // Create booking mutation
    const createBooking = useMutation(
        api.marketplace.booking.createMarketplaceBooking
    );

    // Complete booking mutation (for free sessions)
    const completeBooking = useMutation(
        api.marketplace.booking.completeMarketplaceBooking
    );

    if (profile === undefined) {
        return (
            <div className="min-h-screen bg-[#121212] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-[#121212] flex items-center justify-center">
                <div className="text-center">
                    <p className="text-gray-400 mb-4">Physiotherapist not found</p>
                    <Button
                        onClick={() => router.push("/find-a-physio")}
                        variant="outline"
                        className="border-gray-700 text-gray-300 hover:bg-gray-800"
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Search
                    </Button>
                </div>
            </div>
        );
    }

    const handleSlotSelect = (slot: {
        start: number;
        end: number;
        duration: number;
    }) => {
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
        if (step === "details") {
            setStep("select-time");
        } else if (step === "confirm") {
            setStep("details");
        }
    };

    const handleBooking = async () => {
        if (!isSignedIn) {
            // Save booking state to localStorage and redirect to sign in
            localStorage.setItem(
                "pendingBooking",
                JSON.stringify({
                    physiotherapistId,
                    slot: selectedSlot,
                    sessionMode,
                    notes,
                })
            );
            router.push(
                `/sign-in?redirect=/book/${physiotherapistId}/${sessionDuration}`
            );
            return;
        }

        if (!selectedSlot) {
            toast.error("Please select a time slot");
            return;
        }

        setIsProcessing(true);

        try {
            // Calculate session price - allow free if not set
            const sessionPrice = profile.hourlyRate || 0;

            const result = await createBooking({
                physiotherapistId,
                sessionType: "follow_up",
                sessionDate: selectedSlot.start,
                sessionDuration,
                isOnline: sessionMode === "online",
                serviceAmount: Math.round(sessionPrice * 100), // in kobo
                patientNotes: notes || undefined,
            });

            // For free sessions, skip payment and complete booking directly
            if (sessionPrice === 0) {
                toast.success("Booking confirmed!");
                // Complete the free booking
                await completeBooking({
                    bookingId: result.bookingId,
                    paymentReference: `FREE_${result.bookingId}_${Date.now()}`,
                });
                setStep("confirm");
                setIsProcessing(false);
                return;
            }

            // Initialize Paystack payment for paid sessions
            initializePaystack(result.bookingId, sessionPrice);
        } catch (error: any) {
            console.error("Booking error:", error);
            toast.error("Booking failed", {
                description:
                    error.message || "Failed to create booking. Please try again.",
            });
            setIsProcessing(false);
        }
    };

    const initializePaystack = (
        bookingId: Id<"marketplaceBookings">,
        amount: number
    ) => {
        const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

        if (!paystackKey) {
            toast.error("Payment system is not configured");
            setIsProcessing(false);
            return;
        }

        // @ts-ignore - Paystack is loaded via script tag
        const handler = PaystackPop.setup({
            key: paystackKey,
            email: user?.primaryEmailAddress?.emailAddress || "",
            amount: Math.round(amount * 100),
            currency: "NGN",
            ref: `BOOKING_${bookingId}_${Date.now()}`,
            metadata: {
                custom_fields: [
                    {
                        display_name: "Booking ID",
                        variable_name: "booking_id",
                        value: bookingId,
                    },
                    {
                        display_name: "Booking Type",
                        variable_name: "booking_type",
                        value: "marketplace",
                    },
                ],
            },
            callback: (response: any) => {
                toast.success("Payment successful! Finalizing booking...");

                fetch("/api/payments/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reference: response?.reference }),
                })
                    .then(() => {
                        setStep("confirm");
                    })
                    .catch(() => {
                        setStep("confirm");
                    })
                    .finally(() => {
                        setIsProcessing(false);
                    });
            },
            onClose: () => {
                toast.info("Payment cancelled");
                setIsProcessing(false);
            },
        });

        handler.openIframe();
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
        <div className="min-h-screen bg-[#121212] flex flex-col">
            <main className="flex-1 flex items-center justify-center px-4 py-8">
                {/* Step: Select Time */}
                {step === "select-time" && (
                    <div className="w-full max-w-5xl space-y-6">
                        <CalendarBookingWidget
                            physiotherapistId={physiotherapistId}
                            physiotherapistName={profile.fullName}
                            physiotherapistImage={profile.imageUrl}
                            sessionDuration={sessionDuration}
                            sessionTitle={sessionInfo.title}
                            sessionDescription={sessionInfo.description}
                            offersOnlineSessions={profile.offersOnlineSessions}
                            timezone="Africa/Lagos"
                            onSlotSelect={handleSlotSelect}
                        />

                        {/* Continue Button */}
                        {selectedSlot && (
                            <div className="flex justify-end">
                                <Button
                                    onClick={goToDetails}
                                    className="bg-teal-600 hover:bg-teal-700 text-white px-8"
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
                    <div className="max-w-lg mx-auto">
                        <div className="bg-[#1a1a1a] rounded-xl p-6 border border-gray-800">
                            <h2 className="text-xl font-semibold text-white mb-6">
                                Booking Details
                            </h2>

                            {/* Selected Time Summary */}
                            <div className="bg-gray-800 rounded-lg p-4 mb-6">
                                <p className="text-gray-400 text-sm mb-1">Selected Time</p>
                                <p className="text-white font-medium">
                                    {formatDate(selectedSlot.start)}
                                </p>
                                <p className="text-teal-400">
                                    {formatTime(selectedSlot.start)} -{" "}
                                    {formatTime(selectedSlot.end)}
                                </p>
                            </div>

                            {/* Session Mode */}
                            {profile.offersOnlineSessions &&
                                profile.offersInPersonSessions && (
                                    <div className="mb-6">
                                        <Label className="text-gray-300 mb-3 block">
                                            Session Mode
                                        </Label>
                                        <RadioGroup
                                            value={sessionMode}
                                            onValueChange={(v) =>
                                                setSessionMode(v as "online" | "in-person")
                                            }
                                            className="space-y-3"
                                        >
                                            <div
                                                className={`flex items-center space-x-3 p-4 rounded-lg border ${sessionMode === "online"
                                                    ? "border-teal-500 bg-teal-500/10"
                                                    : "border-gray-700 bg-gray-800"
                                                    }`}
                                            >
                                                <RadioGroupItem
                                                    value="online"
                                                    id="online"
                                                    className="border-gray-600"
                                                />
                                                <Label
                                                    htmlFor="online"
                                                    className="flex items-center gap-2 cursor-pointer text-white"
                                                >
                                                    <Video className="h-4 w-4 text-teal-400" />
                                                    Online (Video Call)
                                                </Label>
                                            </div>
                                            <div
                                                className={`flex items-center space-x-3 p-4 rounded-lg border ${sessionMode === "in-person"
                                                    ? "border-teal-500 bg-teal-500/10"
                                                    : "border-gray-700 bg-gray-800"
                                                    }`}
                                            >
                                                <RadioGroupItem
                                                    value="in-person"
                                                    id="in-person"
                                                    className="border-gray-600"
                                                />
                                                <Label
                                                    htmlFor="in-person"
                                                    className="flex items-center gap-2 cursor-pointer text-white"
                                                >
                                                    <Users className="h-4 w-4 text-blue-400" />
                                                    In-Person
                                                </Label>
                                            </div>
                                        </RadioGroup>
                                    </div>
                                )}

                            {/* Notes */}
                            <div className="mb-6">
                                <Label htmlFor="notes" className="text-gray-300 mb-2 block">
                                    Additional Notes (Optional)
                                </Label>
                                <Textarea
                                    id="notes"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Tell the physiotherapist about your condition..."
                                    className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 resize-none"
                                    rows={4}
                                />
                            </div>

                            {/* Price Summary */}
                            <div className="bg-gray-800 rounded-lg p-4 mb-6">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Session Fee</span>
                                    <span className="text-xl font-bold text-white">
                                        {profile.hourlyRate ? `₦${profile.hourlyRate.toLocaleString()}` : 'Free'}
                                    </span>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <Button
                                    onClick={goBack}
                                    variant="outline"
                                    className="flex-1 border-gray-300 bg-white text-black hover:bg-gray-100"
                                >
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Back
                                </Button>
                                <Button
                                    onClick={handleBooking}
                                    disabled={isProcessing}
                                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Processing...
                                        </>
                                    ) : !profile.hourlyRate ? (
                                        isSignedIn ? "Book Now" : "Sign In & Book"
                                    ) : isSignedIn ? (
                                        "Confirm & Pay"
                                    ) : (
                                        "Sign In & Pay"
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step: Confirmation */}
                {step === "confirm" && (
                    <div className="max-w-lg mx-auto text-center">
                        <div className="bg-[#1a1a1a] rounded-xl p-8 border border-gray-800">
                            <div className="w-16 h-16 bg-teal-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle2 className="w-8 h-8 text-white" />
                            </div>

                            <h2 className="text-2xl font-bold text-white mb-2">
                                Booking Confirmed!
                            </h2>
                            <p className="text-gray-400 mb-6">
                                Your session with {profile.fullName} has been scheduled.
                            </p>

                            {selectedSlot && (
                                <div className="bg-gray-800 rounded-lg p-4 mb-6 text-left">
                                    <p className="text-gray-400 text-sm mb-1">Session Time</p>
                                    <p className="text-white font-medium">
                                        {formatDate(selectedSlot.start)}
                                    </p>
                                    <p className="text-teal-400">
                                        {formatTime(selectedSlot.start)} -{" "}
                                        {formatTime(selectedSlot.end)}
                                    </p>
                                </div>
                            )}

                            <p className="text-sm text-gray-500 mb-6">
                                You will receive a confirmation email with the session details
                                and meeting link.
                            </p>

                            <Button
                                onClick={() => router.push("/dashboard/patient/appointments")}
                                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                            >
                                View My Appointments
                            </Button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
