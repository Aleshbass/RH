"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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
import PackageSelector, { type SimplePackageBreakdown } from "@/components/marketplace/PackageSelector";
import { toast } from "sonner";
import { formatNaira } from "@/lib/pricing";

type BookingStep = "select-time" | "select-package" | "details" | "confirm";

// Treatment prefs from onboarding flow
interface TreatmentPrefs {
    cityKey: string;
    areaIndex?: number;
    areaLabel: string;
    conditionLabel: string;
    conditionLevel: string;
    sessionRate: number;
    timestamp: number;
}

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
    const savedPrefsRef = useRef(false);
    const [treatmentPrefs, setTreatmentPrefs] = useState<TreatmentPrefs | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Package selection state
    const [selectedPackage, setSelectedPackage] = useState<1 | 4 | 8 | 12>(1);
    const [packageBreakdown, setPackageBreakdown] = useState<SimplePackageBreakdown | null>(null);

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

    // Save treatment prefs mutation
    const saveTreatmentPrefs = useMutation(
        api.marketplace.matching.savePatientTreatmentPrefs
    );

    // Get the physio's discount percent (default to 7% if not set)
    const discountPercent = useMemo(() => {
        if (!profile) return 7;
        return (profile as any).packageDiscountPercent || 7;
    }, [profile]);

    // Session rate: prefer formula-calculated rate from patient onboarding,
    // fall back to physio's manually-set rate if no prefs exist
    const sessionRate = useMemo(() => {
        // Use the formula-based rate from /start-treatment onboarding
        if (treatmentPrefs?.sessionRate && treatmentPrefs.sessionRate > 0) {
            return treatmentPrefs.sessionRate;
        }
        // Fallback: use physio's profile rate
        if (!profile) return 0;
        return profile.hourlyRate || 0;
    }, [treatmentPrefs, profile]);

    // ── Load treatment prefs from localStorage (from /start-treatment) ──
    useEffect(() => {
        try {
            const stored = localStorage.getItem("treatmentPrefs");
            if (stored) {
                const prefs = JSON.parse(stored) as TreatmentPrefs;
                // Only use if less than 24 hours old
                if (Date.now() - prefs.timestamp < 24 * 60 * 60 * 1000) {
                    setTreatmentPrefs(prefs);
                    // Auto-populate notes with condition if notes are empty
                    if (!notes && prefs.conditionLabel) {
                        setNotes(`Condition: ${prefs.conditionLabel}`);
                    }
                }
            }

            // Also check for pending booking (returned from sign-in redirect)
            const pendingBooking = localStorage.getItem("pendingBooking");
            if (pendingBooking) {
                const pending = JSON.parse(pendingBooking);
                if (pending.physiotherapistId === physiotherapistId) {
                    // Restore booking state
                    if (pending.slot) setSelectedSlot(pending.slot);
                    if (pending.sessionMode) setSessionMode(pending.sessionMode);
                    if (pending.notes) setNotes(pending.notes);
                    if (pending.selectedPackage) setSelectedPackage(pending.selectedPackage);
                    if (pending.packageBreakdown) setPackageBreakdown(pending.packageBreakdown);
                    if (pending.slot) setStep("details");
                }
                localStorage.removeItem("pendingBooking");
            }
        } catch {
            // localStorage may not be available
        }
    }, []);

    // ── Save treatment prefs to DB after sign-in ──
    useEffect(() => {
        if (
            isSignedIn &&
            treatmentPrefs &&
            !savedPrefsRef.current &&
            treatmentPrefs.cityKey &&
            treatmentPrefs.areaIndex !== undefined
        ) {
            savedPrefsRef.current = true;
            saveTreatmentPrefs({
                cityKey: treatmentPrefs.cityKey,
                areaIndex: treatmentPrefs.areaIndex,
                areaLabel: treatmentPrefs.areaLabel,
                conditionLabel: treatmentPrefs.conditionLabel,
                conditionLevel: treatmentPrefs.conditionLevel,
                sessionRate: treatmentPrefs.sessionRate,
            }).catch((err) => {
                console.error("Failed to save treatment prefs:", err);
            });
        }
    }, [isSignedIn, treatmentPrefs, saveTreatmentPrefs]);

    // Initialize default package breakdown when profile loads
    useEffect(() => {
        if (sessionRate > 0 && !packageBreakdown) {
            setPackageBreakdown({
                sessions: 1,
                sessionRate,
                discountPercent: 0,
                discountedRate: sessionRate,
                total: sessionRate,
                normalTotal: sessionRate,
                saves: 0,
            });
        }
    }, [sessionRate, packageBreakdown]);

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

    const goToPackageSelection = () => {
        if (!selectedSlot) {
            toast.error("Please select a time slot");
            return;
        }
        setStep("select-package");
    };

    const goToDetails = () => {
        setStep("details");
    };

    const goBack = () => {
        if (step === "select-package") {
            setStep("select-time");
        } else if (step === "details") {
            setStep("select-package");
        } else if (step === "confirm") {
            setStep("details");
        }
    };

    const handlePackageSelect = (pkg: 1 | 4 | 8 | 12, breakdown: SimplePackageBreakdown) => {
        setSelectedPackage(pkg);
        setPackageBreakdown(breakdown);
    };

    const initializeFlutterwavePayment = async (
        bookingId: Id<"marketplaceBookings">,
        amount: number
    ) => {
        // Validate email before proceeding
        const userEmail = user?.primaryEmailAddress?.emailAddress;
        if (!userEmail) {
            throw new Error("Email address is required for payment");
        }

        // Call our API to create a Flutterwave payment link
        const response = await fetch("/api/payments/flutterwave/initialize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                bookingId,
                amount,
                email: userEmail,
                name: user?.fullName || user?.firstName || "Customer",
                redirectUrl: `${window.location.origin}/payment/callback`,
            }),
        });

        // Check HTTP status before parsing JSON
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Payment initialization failed:", response.status, errorText);
            throw new Error(`Payment initialization failed: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success && data.paymentUrl) {
            // Redirect to Flutterwave payment page
            window.location.href = data.paymentUrl;
        } else {
            throw new Error(data.error || "Failed to initialize payment");
        }
    };

    const packageLabels: Record<number, string> = {
        1: "Single Session",
        4: "Starter Package",
        8: "Complete Care",
        12: "Full Recovery",
    };
    const packageName = packageLabels[selectedPackage] || "Package";

    const handleBooking = async () => {
        if (!isSignedIn) {
            // Save booking state + treatment prefs + package data to localStorage and redirect to sign in
            localStorage.setItem(
                "pendingBooking",
                JSON.stringify({
                    physiotherapistId,
                    slot: selectedSlot,
                    sessionMode,
                    notes,
                    treatmentPrefs,
                    selectedPackage,
                    packageBreakdown,
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

        const totalAmount = packageBreakdown?.total || profile.initialConsultRate || profile.hourlyRate || 0;
        if (totalAmount > 0 && !user?.primaryEmailAddress?.emailAddress) {
            toast.error("Email address is required for payment");
            return;
        }

        setIsProcessing(true);

        try {
            const result = await createBooking({
                physiotherapistId,
                sessionType: selectedPackage === 1 ? "initial_consult" : "package",
                sessionDate: selectedSlot.start,
                sessionDuration,
                isOnline: sessionMode === "online",
                serviceAmount: Math.round(totalAmount * 100), // in kobo — full package total
                patientNotes: notes ? `${notes}\n\nPackage: ${packageName} (${selectedPackage} sessions)` : `Package: ${packageName} (${selectedPackage} sessions)`,
                // Package metadata — persisted in Convex, used to auto-create treatment plan
                packageSessions: selectedPackage,
                packageDiscountPercent: discountPercent,
                conditionLabel: treatmentPrefs?.conditionLabel,
                conditionLevel: treatmentPrefs?.conditionLevel,
            });

            // For free sessions, skip payment and complete booking directly
            if (totalAmount === 0) {
                toast.success("Booking confirmed!");
                await completeBooking({
                    bookingId: result.bookingId,
                    paymentReference: `FREE_${result.bookingId}_${Date.now()}`,
                });
                setStep("confirm");
                setIsProcessing(false);
                return;
            }

            // Initialize Flutterwave payment for paid sessions
            await initializeFlutterwavePayment(result.bookingId, totalAmount);
        } catch (error: any) {
            console.error("Booking error:", error);
            toast.error("Booking failed", {
                description:
                    error.message || "Failed to create booking. Please try again.",
            });
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
                                    onClick={goToPackageSelection}
                                    className="bg-teal-600 hover:bg-teal-700 text-white px-8"
                                >
                                    Continue
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* Step: Select Package */}
                {step === "select-package" && selectedSlot && (
                    <div className="max-w-lg mx-auto w-full">
                        <div className="bg-[#1a1a1a] rounded-xl p-5 sm:p-6 border border-gray-800">
                            {/* Physio header mini */}
                            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-800">
                                {profile.imageUrl && (
                                    <Image
                                        src={profile.imageUrl}
                                        alt={profile.fullName}
                                        width={40}
                                        height={40}
                                        className="rounded-full object-cover"
                                    />
                                )}
                                <div>
                                    <p className="text-sm font-medium text-white">
                                        {profile.fullName}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {formatDate(selectedSlot.start)} · {formatTime(selectedSlot.start)}
                                    </p>
                                </div>
                            </div>

                            {/* Package Selector */}
                            <PackageSelector
                                sessionRate={sessionRate}
                                discountPercent={discountPercent}
                                selectedPackage={selectedPackage}
                                onSelect={handlePackageSelect}
                            />

                            {/* Action Buttons */}
                            <div className="flex gap-3 mt-6">
                                <Button
                                    onClick={goBack}
                                    variant="outline"
                                    className="flex-1 border-gray-300 bg-white text-black hover:bg-gray-100"
                                >
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Back
                                </Button>
                                <Button
                                    onClick={goToDetails}
                                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
                                >
                                    Continue
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step: Details */}
                {step === "details" && selectedSlot && (
                    <div className="max-w-lg mx-auto w-full">
                        <div className="bg-[#1a1a1a] rounded-xl p-5 sm:p-6 border border-gray-800">
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
                            <div className="bg-gray-800 rounded-lg p-4 mb-6 space-y-2">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <span className="text-gray-300 text-sm font-medium">
                                            {packageName}
                                        </span>
                                        <span className="text-gray-500 text-xs ml-2">
                                            {selectedPackage} session{selectedPackage > 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <span className="text-xl font-bold text-white">
                                        {packageBreakdown
                                            ? formatNaira(packageBreakdown.total)
                                            : sessionRate > 0
                                                ? formatNaira(sessionRate)
                                                : "Free"
                                        }
                                    </span>
                                </div>
                                {packageBreakdown && packageBreakdown.saves > 0 && (
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-green-400">You save</span>
                                        <span className="text-green-400 font-medium">
                                            {formatNaira(packageBreakdown.saves)}
                                        </span>
                                    </div>
                                )}
                                {selectedPackage > 1 && packageBreakdown && (
                                    <p className="text-[11px] text-gray-500">
                                        {formatNaira(Math.round(packageBreakdown.total / selectedPackage))}/session average
                                    </p>
                                )}

                                {/* Change plan link */}
                                <button
                                    type="button"
                                    onClick={() => setStep("select-package")}
                                    className="text-teal-400 text-xs hover:text-teal-300 underline pt-1"
                                >
                                    Change plan
                                </button>
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
                                    ) : !sessionRate ? (
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
                                Your {packageName.toLowerCase()} with {profile.fullName} has been scheduled.
                            </p>

                            {selectedSlot && (
                                <div className="bg-gray-800 rounded-lg p-4 mb-6 text-left">
                                    <p className="text-gray-400 text-sm mb-1">First Session</p>
                                    <p className="text-white font-medium">
                                        {formatDate(selectedSlot.start)}
                                    </p>
                                    <p className="text-teal-400">
                                        {formatTime(selectedSlot.start)} -{" "}
                                        {formatTime(selectedSlot.end)}
                                    </p>
                                    {selectedPackage > 1 && (
                                        <p className="text-gray-500 text-sm mt-2">
                                            + {selectedPackage - 1} more sessions to be scheduled
                                        </p>
                                    )}
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
