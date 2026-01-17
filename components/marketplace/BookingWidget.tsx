"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SmartDatetimeInput } from "@/components/ui/date-time-input";
import { toast } from "sonner";
import { Loader2, Info, Video, Users, Calendar, ExternalLink } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

interface BookingWidgetProps {
  profile: {
    id: Id<"users">;
    fullName: string;
    initialConsultRate: number;
    hourlyRate: number;
    packageRates: Array<{
      sessions: number;
      price: number;
      description?: string;
    }>;
    offersOnlineSessions: boolean;
    offersInPersonSessions: boolean;
    availabilitySchedule?: any;
  };
}

type SessionType = "initial_consult" | "follow_up" | "package";

// Patient pays only the session fee
// Fees are deducted from physiotherapist's earnings on the backend

export default function BookingWidget({ profile }: BookingWidgetProps) {
  const { user, isSignedIn } = useUser();
  const router = useRouter();

  const [sessionType, setSessionType] = useState<SessionType>("initial_consult");
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    profile.offersOnlineSessions ? true : false
  );
  const [selectedDateTime, setSelectedDateTime] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);


  const createBooking = useMutation(api.marketplace.booking.createMarketplaceBooking);

  // Determine session price
  const getSessionPrice = (): number => {
    if (sessionType === "initial_consult") {
      return profile.initialConsultRate || profile.hourlyRate;
    } else if (sessionType === "follow_up") {
      return profile.hourlyRate;
    } else if (sessionType === "package" && selectedPackage !== null) {
      return profile.packageRates[selectedPackage]?.price || 0;
    }
    return 0;
  };

  const sessionPrice = getSessionPrice();
  const sessionPriceKobo = Math.round(sessionPrice * 100); // Convert to kobo

  const handleBooking = async () => {
    // Check authentication
    if (!isSignedIn) {
      toast.error("Sign in required", {
        description: "Please sign in to book a session",
      });
      router.push("/sign-in?redirect=/find-a-physio/" + profile.id);
      return;
    }

    // Validate date and time
    if (!selectedDateTime) {
      toast.error("Select date and time", {
        description: "Please choose a preferred session date and time to continue.",
      });
      return;
    }

    // Validate session type
    if (!sessionPrice || sessionPrice <= 0) {
      toast.error("Invalid selection", {
        description: "Please select a valid session type",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Create booking (pending payment)
      const result = await createBooking({
        physiotherapistId: profile.id,
        sessionType:
          sessionType === "initial_consult"
            ? "initial_consult"
            : sessionType === "follow_up"
              ? "follow_up"
              : "package",
        sessionDate: selectedDateTime.getTime(),
        sessionDuration: 60, // Default 60 minutes
        isOnline,
        serviceAmount: sessionPriceKobo, // in kobo
        patientNotes: notes || undefined,
      });

      toast.success("Booking created", {
        description: "Redirecting to payment...",
      });

      // Initialize Paystack payment - patient pays session fee only
      initializePaystack(result.bookingId, sessionPrice);
    } catch (error: any) {
      console.error("Booking error:", error);
      toast.error("Booking failed", {
        description: error.message || "Failed to create booking. Please try again.",
      });
      setIsProcessing(false);
    }
  };

  const initializePaystack = (bookingId: Id<"marketplaceBookings">, amount: number) => {
    const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

    if (!paystackKey) {
      toast.error("Configuration error", {
        description: "Payment system is not configured",
      });
      setIsProcessing(false);
      return;
    }

    // @ts-ignore - Paystack is loaded via script tag
    const handler = PaystackPop.setup({
      key: paystackKey,
      email: user?.primaryEmailAddress?.emailAddress || "",
      amount: Math.round(amount * 100), // Paystack expects amount in kobo
      currency: "NGN",
      ref: `MARKETPLACE_${bookingId}_${Date.now()}`,
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
        // Payment successful - verify and finalize booking server-side
        toast("Payment successful! Finalizing booking...", { duration: 1500 });

        fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: response?.reference }),
        })
          .then(() => {
            // Navigate to confirmation page; webhook/verify ensures completion
            router.push(`/marketplace/booking-confirmation?bookingId=${bookingId}`);
          })
          .catch(() => {
            // Navigate anyway; webhook may complete shortly
            router.push(`/marketplace/booking-confirmation?bookingId=${bookingId}`);
          })
          .finally(() => {
            setIsProcessing(false);
          });
      },
      onClose: () => {
        // User closed payment modal
        toast.info("Payment cancelled", {
          description: "You can complete payment later from your appointments",
        });
        setIsProcessing(false);
      },
    });

    handler.openIframe();
  };

  const formatAvailability = (schedule: any) => {
    if (!schedule) return null;
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const availableDays = days.filter(day => schedule[day]?.isOpen);

    if (availableDays.length === 0) return <p className="text-sm text-gray-500">No availability set</p>;

    return (
      <div className="space-y-1">
        {availableDays.map(day => {
          const slots = schedule[day].slots;
          return (
            <div key={day} className="flex justify-between text-sm">
              <span className="capitalize text-gray-600">{day}</span>
              <span className="font-medium text-gray-900">
                {slots.map((slot: any, i: number) => (
                  <span key={i}>
                    {slot.start} - {slot.end}
                    {i < slots.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Book a Session</CardTitle>
        <CardDescription>Choose your session type and schedule</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Calendar Booking Link */}
        <Button
          variant="outline"
          onClick={() => router.push(`/book/${profile.id}/60`)}
          className="w-full border-[#005b57] text-[#005b57] hover:bg-[#005b57] hover:text-white"
        >
          <Calendar className="w-4 h-4 mr-2" />
          View Full Calendar
          <ExternalLink className="w-3 h-3 ml-2" />
        </Button>

        {/* Session Type Selection */}
        <div>
          <Label className="text-base font-semibold mb-3 block">
            Session Type
          </Label>
          <RadioGroup value={sessionType} onValueChange={(v) => setSessionType(v as SessionType)}>
            {profile.initialConsultRate > 0 && (
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:border-[#005b57] transition-colors">
                <RadioGroupItem value="initial_consult" id="initial" />
                <Label htmlFor="initial" className="flex-1 cursor-pointer">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Initial Consultation</span>
                    <span className="font-bold text-[#005b57]">
                      ₦{profile.initialConsultRate.toLocaleString()}
                    </span>
                  </div>
                </Label>
              </div>
            )}

            {profile.hourlyRate > 0 && (
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:border-[#005b57] transition-colors">
                <RadioGroupItem value="follow_up" id="followup" />
                <Label htmlFor="followup" className="flex-1 cursor-pointer">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Follow-up Session</span>
                    <span className="font-bold text-[#005b57]">
                      ₦{profile.hourlyRate.toLocaleString()}
                    </span>
                  </div>
                </Label>
              </div>
            )}

            {profile.packageRates.map((pkg, idx) => (
              <div
                key={idx}
                className="flex items-center space-x-2 p-3 border rounded-lg hover:border-[#005b57] transition-colors"
              >
                <RadioGroupItem
                  value="package"
                  id={`package-${idx}`}
                  onClick={() => setSelectedPackage(idx)}
                />
                <Label htmlFor={`package-${idx}`} className="flex-1 cursor-pointer">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{pkg.sessions} Sessions</span>
                      {pkg.description && (
                        <p className="text-xs text-gray-600 mt-1">{pkg.description}</p>
                      )}
                    </div>
                    <span className="font-bold text-[#005b57]">
                      ₦{pkg.price.toLocaleString()}
                    </span>
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Session Mode */}
        {profile.offersOnlineSessions && profile.offersInPersonSessions && (
          <div>
            <Label className="text-base font-semibold mb-3 block">
              Session Mode
            </Label>
            <RadioGroup
              value={isOnline ? "online" : "in-person"}
              onValueChange={(v) => setIsOnline(v === "online")}
            >
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="online" id="online" />
                <Label htmlFor="online" className="flex items-center gap-2 cursor-pointer">
                  <Video className="h-4 w-4" />
                  <span>Online/Video Session</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg">
                <RadioGroupItem value="in-person" id="in-person" />
                <Label htmlFor="in-person" className="flex items-center gap-2 cursor-pointer">
                  <Users className="h-4 w-4" />
                  <span>In-Person Session</span>
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Availability Display */}
        {profile.availabilitySchedule && (
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
            <Label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">
              Weekly Availability
            </Label>
            {formatAvailability(profile.availabilitySchedule)}
          </div>
        )}

        {/* Date & Time Selection */}
        <div>
          <Label className="text-base font-semibold mb-3 block">
            Preferred Date & Time
          </Label>
          <SmartDatetimeInput
            value={selectedDateTime}
            onValueChange={setSelectedDateTime}
            placeholder="Select date and time for your session"
            showCalendar={true}
            showTimePicker={true}
            className="w-full"
          />
          {!selectedDateTime && (
            <p className="mt-2 text-xs text-gray-500">
              Select a date and time to enable Book & Pay
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <Label htmlFor="notes" className="text-base font-semibold mb-2 block">
            Additional Notes (Optional)
          </Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tell the physiotherapist about your condition or any special requirements..."
            rows={3}
            className="resize-none"
          />
        </div>

        {/* Session Fee - Patient pays only the session fee */}
        {sessionPrice > 0 && (
          <div className="bg-gradient-to-br from-[#005b57]/5 to-pink-50 rounded-lg p-5 border-2 border-[#005b57]/20">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Session Fee</p>
                <p className="text-xs text-gray-500">Pay only the session amount</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold bg-gradient-to-r from-[#005b57] to-pink-600 bg-clip-text text-transparent">
                  ₦{sessionPrice.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Info Banner */}
        <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-blue-900">
            Your booking will be confirmed after payment. The physiotherapist will contact you to finalize the session details.
          </p>
        </div>

        {/* Book Button */}
        <Button
          onClick={handleBooking}
          disabled={isProcessing || !selectedDateTime || !sessionPrice || sessionPrice <= 0}
          className="w-full h-12 text-base bg-[#005b57] hover:bg-[#00443e]"
        >
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </span>
          ) : (
            `Book & Pay ₦${sessionPrice.toLocaleString()}`
          )}
        </Button>

        {!isSignedIn && (
          <p className="text-xs text-center text-gray-500">
            You'll be asked to sign in before completing payment
          </p>
        )}
      </CardContent>
    </Card>
  );
}
