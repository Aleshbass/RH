'use client';

import Image from 'next/image';
import { SignUp } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ChevronRight, Home } from "lucide-react";

export default function CustomSignUp() {
  
  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        type: "spring",
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
      className="min-h-screen flex flex-col bg-[#FAF6E7] p-4 sm:p-6"
    >
      {/* Breadcrumb navigation */}
      <div className="w-full max-w-6xl mx-auto mb-10 pt-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/"><Home className="h-4 w-4" /></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Sign Up</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      
      <div className="flex-1 flex items-center justify-center">
      {/* Main container with split layout on desktop */}
      <div className="w-full max-w-6xl flex flex-col lg:flex-row bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Left side - Image container (hidden on mobile, shown on desktop) */}
        <div className="hidden lg:block lg:w-1/2 bg-[#E3DFD2] relative">
          {/* Placeholder for the image - will be replaced with actual image */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-8">
              <div className="text-[#005b57] text-xl font-medium mb-2">Image Coming Soon</div>
              <p className="text-[#002e2c]">Your rehabilitation journey starts here</p>
            </div>
          </div>
        </div>
        
        {/* Right side - Form container */}
        <motion.div 
          className="w-full lg:w-1/2 flex items-center justify-center min-h-[500px] p-8"
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="w-full text-center mb-6">
            <Image 
              src="/logos/favicon/apple-touch-icon.png" 
              alt="Rehabify Health" 
              width={80} 
              height={80} 
              className="mx-auto"
            />
            <h1 className="mt-4 text-3xl font-bold text-[#002e2c]">Join Rehabify Health</h1>
            <p className="mt-2 text-[#005b57]">Create your account to get started</p>
          </div>
          
          <div className="relative max-w-md mx-auto">
            <SignUp 
              appearance={{
                elements: {
                  card: "bg-transparent shadow-none p-0",
                  headerTitle: "text-[#002e2c] text-2xl",
                  headerSubtitle: "text-[#005b57]",
                  formButtonPrimary: 
                    "bg-gradient-to-r from-[#002e2c] to-[#005b57] hover:opacity-90 text-white font-medium py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-[#00cd0f] focus:ring-offset-2",
                  formFieldInput: 
                    "block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50",
                  footerActionLink: "text-[#005b57] hover:text-[#00cd0f]",
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