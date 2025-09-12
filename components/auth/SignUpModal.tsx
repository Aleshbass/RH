'use client';

import React from 'react';
import Image from 'next/image';
import { SignUp } from "@clerk/clerk-react";
import { motion } from "framer-motion";

interface SignUpModalProps {
  onSwitchToSignIn: () => void;
}

export function SignUpModal({ onSwitchToSignIn }: SignUpModalProps) {
  return (
    <div className="w-full h-[600px] grid grid-cols-1 lg:grid-cols-2">
      {/* Left side - Image container with fixed height */}
      <div className="relative hidden lg:block h-[600px] w-full">
        <div className="absolute inset-0 h-[600px] w-full">
          <Image
            src="/logos/images/Group 469272 (1).webp"
            alt="Rehabify Health - Sign up"
            fill
            className="object-cover"
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            placeholder="blur"
            blurDataURL="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/20 h-[600px] w-full" aria-hidden="true" />
        
        {/* Logo overlay on image */}
        <div className="absolute top-8 left-8 right-8">
          <Image 
            src="/logos/favicon/apple-touch-icon.png" 
            alt="Rehabify Health" 
            width={48} 
            height={48} 
            className="bg-white/10 backdrop-blur-sm rounded-lg p-2"
          />
        </div>
        
        <div className="absolute bottom-8 left-8 right-8 text-white">
          <h2 className="text-3xl font-bold">Create Your Account</h2>
          <p className="mt-2 text-lg text-white/90">Your rehabilitation journey starts here</p>
        </div>
      </div>

      {/* Right side - Form container with fixed dimensions */}
      <div className="flex flex-col items-center justify-center py-8 px-6 sm:px-10 lg:px-12 h-[600px] w-full">
        {/* Mobile-only branding */}
        <div className="w-full mb-8 lg:hidden">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Image 
              src="/logos/favicon/apple-touch-icon.png" 
              alt="Rehabify Health" 
              width={48} 
              height={48} 
            />
            <h1 className="text-2xl font-bold text-[#002e2c]">Join Rehabify Health</h1>
          </div>
          <p className="text-center text-sm text-[#005b57]">Start your journey today</p>
        </div>
        
        {/* Form container with consistent height */}
        <motion.div 
          className="relative w-full max-w-sm mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          {/* Clerk SignUp component with stable container */}
          <div className="h-[400px] flex flex-col justify-center">
            <SignUp 
              appearance={{
                elements: {
                  card: "bg-transparent shadow-none p-0 w-full",
                  headerTitle: "text-[#002e2c] text-2xl font-bold mb-2",
                  headerSubtitle: "text-[#005b57] mb-6",
                  formButtonPrimary: 
                    "h-12 bg-gradient-to-r from-[#002e2c] to-[#005b57] hover:opacity-90 text-white font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-[#005b57]/30 transition-all duration-200",
                  formFieldInput: 
                    "h-12 text-base block w-full rounded-md border border-gray-300 focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-all duration-200",
                  formFieldLabel: "text-[#002e2c] font-medium mb-2",
                  socialButtonsBlockButton: "h-12 transition-all duration-200 hover:scale-[1.02]",
                  footerActionLink: "text-[#005b57] hover:text-[#00443e] transition-colors duration-200",
                  formFieldInputShowPasswordButton: "text-[#005b57] hover:text-[#00443e]",
                  identityPreviewEditButton: "text-[#005b57] hover:text-[#00443e]",
                  formResendCodeLink: "text-[#005b57] hover:text-[#00443e]",
                  otpCodeFieldInput: "border-gray-300 focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20",
                  formFieldSuccessText: "text-green-600",
                  formFieldErrorText: "text-red-600",
                  alert: "border-red-200 bg-red-50 text-red-800",
                  alertText: "text-red-800",
                  // Ensure consistent spacing
                  form: "space-y-4",
                  socialButtons: "space-y-3 mb-6",
                  dividerRow: "my-6",
                  dividerText: "text-gray-500",
                  dividerLine: "border-gray-300",
                },
                layout: {
                  socialButtonsPlacement: "top",
                  showOptionalFields: true,
                },
              }}
              redirectUrl="/role-selection"
              signInUrl="#"
              afterSignUpUrl="/role-selection"
              afterSignInUrl="/dashboard"
            />
          </div>
          
          {/* Custom switch to sign in link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <button
                onClick={onSwitchToSignIn}
                className="text-[#005b57] hover:text-[#00443e] font-medium transition-colors duration-200 hover:underline"
              >
                Sign in here
              </button>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
