"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, HelpCircle } from "lucide-react";

interface VerificationFailureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
  errorMessage?: string;
}

export default function VerificationFailureModal({
  isOpen,
  onClose,
  onRetry,
  errorMessage,
}: VerificationFailureModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500 rounded-full blur-xl opacity-30 animate-pulse"></div>
              <div className="relative bg-red-100 p-6 rounded-full">
                <AlertCircle className="h-16 w-16 text-red-600" />
              </div>
            </div>
          </div>
          
          <DialogTitle className="text-center text-2xl font-bold text-gray-900">
            Payment Failed
          </DialogTitle>
          
          <DialogDescription asChild>
            <div className="text-center space-y-4 pt-4">
              <div className="text-base text-gray-700">
                We couldn't process your verification badge payment.
              </div>

              {errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="text-sm text-red-800">{errorMessage}</div>
                </div>
              )}

              <div className="bg-gray-50 p-4 rounded-lg text-left space-y-2 text-sm text-gray-700">
                <div className="font-semibold text-gray-900 mb-2">Common reasons:</div>
                <div className="flex items-start gap-2">
                  <span>•</span>
                  <span>Insufficient funds in your account</span>
                </div>
                <div className="flex items-start gap-2">
                  <span>•</span>
                  <span>Card payment was declined</span>
                </div>
                <div className="flex items-start gap-2">
                  <span>•</span>
                  <span>Network connection issue</span>
                </div>
                <div className="flex items-start gap-2">
                  <span>•</span>
                  <span>Payment window was closed</span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <Button
                  onClick={onRetry}
                  className="w-full bg-gradient-to-r from-[#005b57] to-pink-600 hover:from-[#00443e] hover:to-pink-700 text-white h-11 text-base font-semibold"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>

                <Button
                  onClick={onClose}
                  variant="outline"
                  className="w-full h-11"
                >
                  Cancel
                </Button>
              </div>

              <div className="pt-2 flex items-center justify-center gap-2 text-sm text-gray-600">
                <HelpCircle className="h-4 w-4" />
                <span>
                  Need help? Contact{" "}
                  <a href="mailto:support@physioaroundme.com" className="text-[#005b57] font-medium hover:underline">
                    support@physioaroundme.com
                  </a>
                </span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
