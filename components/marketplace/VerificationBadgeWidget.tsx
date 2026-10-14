"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, Check, Clock } from "lucide-react";
import { toast } from "sonner";
import VerificationSuccessModal from "./VerificationSuccessModal";
import VerificationFailureModal from "./VerificationFailureModal";

interface VerificationBadgeWidgetProps {
  currentStatus: {
    status: "none" | "verified" | "pro_verified";
    tier?: "monthly" | "12_month" | "yearly";
    paidAt?: number;
    expiresAt?: number;
    verificationFee?: number;
    autoRenew?: boolean;
  };
}

const BADGE_PRICING = {
  monthly: { price: 3000, duration: "30 days", savings: null },
  "12_month": { price: 30000, duration: "12 months", savings: "Save ₦6,000" },
  yearly: { price: 36000, duration: "12 months", savings: "Best value" },
};

export default function VerificationBadgeWidget({
  currentStatus,
}: VerificationBadgeWidgetProps) {
  const [selectedTier, setSelectedTier] = useState<"monthly" | "12_month" | "yearly">("monthly");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [purchaseData, setPurchaseData] = useState<{
    tier: "monthly" | "12_month" | "yearly";
    amount: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const purchaseBadge = useMutation(api.marketplace.verification.purchaseVerificationBadge);

  const handlePurchase = async () => {
    setIsProcessing(true);

    try {
      const result = await purchaseBadge({
        tier: selectedTier,
      });

      toast.success("Purchase initiated", {
        description: "Redirecting to payment...",
      });

      // Initialize Paystack payment
      initializePaystack(result.transactionId, result.amount);
    } catch (error: any) {
      console.error("Error purchasing badge:", error);
      toast.error("Error", {
        description: error.message || "Failed to initiate purchase. Please try again.",
      });
      setIsProcessing(false);
    }
  };

  const initializePaystack = (transactionId: string, amount: number) => {
    const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

    if (!paystackKey) {
      toast.error("Configuration error", {
        description: "Payment system is not configured",
      });
      setIsProcessing(false);
      return;
    }

    // Get user email from Clerk
    const userEmail = (window as any).Clerk?.user?.primaryEmailAddress?.emailAddress || "";

    // @ts-ignore - Paystack is loaded via script tag
    const handler = PaystackPop.setup({
      key: paystackKey,
      email: userEmail,
      amount: Math.round(amount * 100), // Paystack expects amount in kobo
      currency: "NGN",
      ref: `VERIFICATION_${transactionId}_${Date.now()}`,
      metadata: {
        custom_fields: [
          {
            display_name: "Transaction ID",
            variable_name: "transaction_id",
            value: transactionId,
          },
          {
            display_name: "Transaction Type",
            variable_name: "transaction_type",
            value: "verification_badge",
          },
        ],
      },
      callback: (response: any) => {
        // Client-side verification (logger fixed, no worker issues now)
        toast("Payment successful! Verifying...", { duration: 1500 });

        fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: response?.reference }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data?.success) {
              toast.success("Verification complete", {
                description: "Your verification badge is now active.",
                duration: 2000,
              });
              setTimeout(() => {
                window.location.reload();
              }, 2000);
            } else {
              setErrorMessage(
                data?.message ||
                  "Verification failed. If you were charged, your badge will activate shortly."
              );
              setShowFailureModal(true);
              setIsProcessing(false);
            }
          })
          .catch((err: any) => {
            console.error("Verification error:", err);
            setErrorMessage(
              err?.message || "Network error during verification. Please try again."
            );
            setShowFailureModal(true);
            setIsProcessing(false);
          });
      },
      onClose: () => {
        // User closed payment modal - Show failure modal
        setErrorMessage("Payment was cancelled. You can try again anytime.");
        setShowFailureModal(true);
        setIsProcessing(false);
      },
    });

    handler.openIframe();
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getDaysRemaining = (expiresAt: number) => {
    const days = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  // If already verified, show status
  if (currentStatus.status !== "none" && currentStatus.expiresAt) {
    const daysRemaining = getDaysRemaining(currentStatus.expiresAt);
    const isExpiringSoon = daysRemaining <= 7;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-[#005b57]/5 border border-[#005b57]/20 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="bg-[#005b57] p-2 rounded-full">
              <BadgeCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-[#00443e]">
                Verified Badge Active
              </p>
              <p className="text-sm text-[#005b57]">
                {currentStatus.tier === "monthly" && "Monthly Plan"}
                {currentStatus.tier === "12_month" && "12-Month Plan"}
                {currentStatus.tier === "yearly" && "Yearly Plan"}
              </p>
            </div>
          </div>
          <Badge variant={isExpiringSoon ? "destructive" : "secondary"}>
            {daysRemaining} days left
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Activated</p>
            <p className="font-semibold">
              {currentStatus.paidAt && formatDate(currentStatus.paidAt)}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Expires</p>
            <p className="font-semibold">
              {formatDate(currentStatus.expiresAt)}
            </p>
          </div>
        </div>

        {isExpiringSoon && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              <strong>Reminder:</strong> Your verification badge expires in {daysRemaining} days.
              Renew now to maintain your verified status and ranking.
            </p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => {
                toast("Renewal flow will be implemented in next phase");
              }}
            >
              Renew Now
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Show purchase options
  return (
    <>
      <VerificationSuccessModal
        isOpen={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          window.location.reload(); // Reload to show new badge status
        }}
        tier={purchaseData?.tier || "monthly"}
        amount={purchaseData?.amount || 0}
      />

      <VerificationFailureModal
        isOpen={showFailureModal}
        onClose={() => setShowFailureModal(false)}
        onRetry={handlePurchase}
        errorMessage={errorMessage}
      />

      <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-2">Select Your Plan</h3>
        <p className="text-sm text-gray-600">
          Verified physiotherapists rank higher in search results and build more trust
        </p>
      </div>

      {/* Pricing Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(BADGE_PRICING).map(([tier, details]) => {
          const isSelected = selectedTier === tier;
          return (
            <div
              key={tier}
              onClick={() => setSelectedTier(tier as any)}
              className={`
                relative p-4 border-2 rounded-lg cursor-pointer transition-all
                ${isSelected ? "border-[#005b57] bg-[#005b57]/5" : "border-gray-200 hover:border-gray-300"}
              `}
            >
              {details.savings && (
                <Badge className="absolute -top-2 -right-2 bg-amber-500">
                  {details.savings}
                </Badge>
              )}

              <div className="text-center">
                <p className="text-sm font-medium text-gray-600 capitalize">
                  {tier.replace("_", "-")}
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  ₦{details.price.toLocaleString()}
                </p>
                <p className="text-sm text-gray-600 mt-1">{details.duration}</p>

                {isSelected && (
                  <div className="mt-3 flex items-center justify-center gap-1 text-[#005b57]">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-medium">Selected</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Benefits */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-semibold mb-3">What You Get:</h4>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span>Verified badge ✓ displayed on your profile</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span>Rank first in search results (verified profiles appear at top)</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span>Build trust with patients browsing the marketplace</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span>Increase profile views and booking conversions</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span>Priority support from our team</span>
          </li>
        </ul>
      </div>

      {/* Purchase Button */}
      <Button
        onClick={handlePurchase}
        disabled={isProcessing}
        className="w-full bg-[#005b57] hover:bg-[#00443e] h-12 text-base"
      >
        {isProcessing ? (
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 animate-spin" />
            Processing...
          </span>
        ) : (
          <span>
            Purchase{" "}
            {selectedTier.charAt(0).toUpperCase() + selectedTier.slice(1).replace("_", "-")}{" "}
            Badge - ₦{BADGE_PRICING[selectedTier].price.toLocaleString()}
          </span>
        )}
      </Button>

      <p className="text-xs text-center text-gray-500">
        Secure payment powered by Paystack. Cancel anytime.
      </p>
    </div>
    </>
  );
}
