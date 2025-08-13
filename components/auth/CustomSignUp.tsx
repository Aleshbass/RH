'use client';

import Image from 'next/image';
import { SignUp } from "@clerk/clerk-react";
import { motion, Variants } from "framer-motion";


export default function CustomSignUp() {
  
  const fadeIn: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        type: "spring" as const,
        stiffness: 100,
        damping: 15
      }
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeIn}
      className="min-h-screen flex flex-col bg-[#FAF6E7] px-4 sm:px-6 lg:px-8 py-6 pt-20"
    >
      
      <div className="flex-1 flex items-center justify-center">
      {/* Main container with split layout on desktop */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Left side - Image container (hidden on mobile, shown on desktop) */}
        <div className="relative hidden lg:block">
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
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/20" aria-hidden="true" />
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

        
        {/* Right side - Form container */}
        <motion.div 
          className="w-full flex flex-col items-center justify-center py-8 px-6 sm:px-10 lg:px-12"
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
        >
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

          </div>
          
          <div className="relative w-full max-w-sm mx-auto">
            <SignUp 
              appearance={{
                elements: {
                  card: "bg-transparent shadow-none p-0",
                  headerTitle: "text-[#002e2c] text-2xl",
                  headerSubtitle: "text-[#005b57]",
                  formButtonPrimary: 
                    "h-12 bg-gradient-to-r from-[#002e2c] to-[#005b57] hover:opacity-90 text-white font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-[#005b57]/30",
                  formFieldInput: 
                    "h-12 text-base block w-full rounded-md border border-gray-300 focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20",
                  formFieldLabel: "text-[#002e2c] font-medium",
                  socialButtonsBlockButton: "h-12",
                  footerActionLink: "text-[#005b57] hover:text-[#00443e]",
                },
              }}
              redirectUrl="/role-selection"
              signInUrl="/sign-in"
            />
          </div>
        </motion.div>
      </div>
      </div>
    </motion.div>
  );
}