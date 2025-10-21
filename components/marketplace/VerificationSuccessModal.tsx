"use client";

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BadgeCheck, Sparkles, Star } from "lucide-react";

interface VerificationSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: "monthly" | "12_month" | "yearly";
  amount: number;
}

export default function VerificationSuccessModal({
  isOpen,
  onClose,
  tier,
  amount,
}: VerificationSuccessModalProps) {
  useEffect(() => {
    if (isOpen) {
      // Trigger confetti animation
      triggerConfetti();
    }
  }, [isOpen]);

  const triggerConfetti = () => {
    // Simple confetti using DOM elements (no external library needed)
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function () {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);

      // Create confetti particles
      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement("div");
        particle.style.position = "fixed";
        particle.style.width = "10px";
        particle.style.height = "10px";
        particle.style.backgroundColor = [
          "#FF69B4",
          "#9333EA",
          "#005b57",
          "#FFD700",
          "#00CED1",
        ][Math.floor(Math.random() * 5)];
        particle.style.left = Math.random() * 100 + "%";
        particle.style.top = "-10px";
        particle.style.opacity = "1";
        particle.style.pointerEvents = "none";
        particle.style.zIndex = "9999";
        particle.style.borderRadius = "50%";
        particle.style.transition = "all 3s ease-out";

        document.body.appendChild(particle);

        // Animate
        setTimeout(() => {
          particle.style.top = "100vh";
          particle.style.left =
            randomInRange(0, 100) + "%";
          particle.style.opacity = "0";
          particle.style.transform = `rotate(${randomInRange(0, 360)}deg)`;
        }, 10);

        // Remove after animation
        setTimeout(() => {
          particle.remove();
        }, 3000);
      }
    }, 250);
  };

  const getTierDisplay = () => {
    switch (tier) {
      case "monthly":
        return "Monthly";
      case "12_month":
        return "12-Month";
      case "yearly":
        return "Yearly";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full blur-xl opacity-50 animate-pulse"></div>
              <div className="relative bg-gradient-to-r from-pink-500 to-purple-500 p-6 rounded-full">
                <BadgeCheck className="h-16 w-16 text-white" />
              </div>
              <Sparkles className="absolute -top-2 -right-2 h-8 w-8 text-yellow-400 animate-bounce" />
              <Star className="absolute -bottom-1 -left-1 h-6 w-6 text-yellow-400 animate-pulse" />
            </div>
          </div>
          
          <DialogTitle className="text-center text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
            🎉 Congratulations! 🎉
          </DialogTitle>
          
          <DialogDescription asChild>
            <div className="text-center space-y-4 pt-4">
              <div className="text-lg font-semibold text-gray-900">
                Your Verification Badge is Now Active!
              </div>
              
              <div className="bg-gradient-to-r from-pink-50 to-purple-50 p-4 rounded-lg border-2 border-pink-200">
                <div className="text-sm text-gray-600 mb-1">Plan Activated</div>
                <div className="text-xl font-bold text-gray-900">
                  {getTierDisplay()} Badge
                </div>
                <div className="text-sm text-gray-600 mt-2">
                  Amount Paid: <span className="font-semibold text-gray-900">₦{amount.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2 text-left text-sm text-gray-700">
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Your profile now displays a verified badge</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>You'll appear at the top of search results</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Patients will see you as a trusted provider</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Priority support is now available to you</span>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  onClick={onClose}
                  className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white h-11 text-base font-semibold shadow-lg"
                >
                  Continue to Dashboard
                </Button>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
