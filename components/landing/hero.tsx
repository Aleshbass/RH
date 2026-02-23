"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, PlayCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { NavbarButton } from '@/components/ui/resizable-navbar';
import HeroBackground from './HeroBackground';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@clerk/nextjs';

// For TanStack Query prefetching
import { useQueryClient } from '@tanstack/react-query';

export function LandingHero() {
  const { isSignedIn } = useAuth();
  // Use TanStack Query for prefetching
  const queryClient = useQueryClient();

  // Check if user is approved (only if signed in)
  const { isLoaded } = useAuth();
  // Fetch current user only when Clerk auth is fully loaded & the user is signed in
  const currentUser = useQuery(
    api.users.getMyUser,
    isLoaded && isSignedIn ? {} : "skip"
  );
  const approvalStatus = useQuery(
    api.users.getUserApprovalStatus,
    isLoaded && isSignedIn && currentUser ? {} : "skip"
  );

  // Determine if user can access dashboard
  const canAccessDashboard = isSignedIn && currentUser && (
    currentUser.role === "patient" ||
    currentUser.role === "family_member" ||
    currentUser.role === "admin" ||
    (approvalStatus?.status === "approved")
  );

  // Determine button text and href
  const getButtonProps = () => {
    if (!isSignedIn) {
      return { href: "/start-treatment", text: "Start Treatments" };
    }

    if (canAccessDashboard) {
      // Determine dashboard URL based on role
      if (currentUser?.role === "physiotherapist") {
        return { href: "/dashboard/physiotherapist", text: "Go to Dashboard" };
      } else if (currentUser?.role === "clinic_owner") {
        return { href: "/dashboard/clinic", text: "Go to Dashboard" };
      } else if (currentUser?.role === "admin") {
        return { href: "/dashboard/admin", text: "Go to Dashboard" };
      } else {
        return { href: "/dashboard", text: "Go to Dashboard" };
      }
    }

    // User is signed in but pending approval or not onboarded
    if (currentUser && !currentUser.onboarded) {
      return { href: "/role-selection", text: "Complete Setup" };
    }

    if (approvalStatus?.status === "pending_review") {
      return { href: "/dashboard", text: "View Application Status" };
    }

    return { href: "/dashboard", text: "Go to Dashboard" };
  };

  const buttonProps = getButtonProps();

  // Prefetch the target page on hover
  const prefetchTarget = () => {
    queryClient.prefetchQuery({
      queryKey: ['targetPageData', buttonProps.href],
      queryFn: () => Promise.resolve({
        prefetched: true,
        timestamp: Date.now()
      })
    });
  };

  return (
    <section className="relative min-h-screen overflow-hidden">
      <HeroBackground />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-16">
        <div className="flex flex-col lg:flex-row items-center justify-around lg:justify-between min-h-screen max-w-7xl mx-auto">
          {/* Left Content Area */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full lg:w-[42%] text-center lg:text-left pt-8 lg:pt-0 mb-8 lg:mb-0 order-2 lg:order-1"
          >
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-gray-900 mb-4 sm:mb-6">
              Move better. Live fully. Feel whole again.
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-gray-700 mb-6 sm:mb-8 font-sans">
              Quality health care shouldn&apos;t mean choosing between your health and your wallet. If you&apos;re recovering from injury, managing chronic pain, or improving performance, we connect you with verified physiotherapists in 60 seconds.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Link href={buttonProps.href} passHref>
                <NavbarButton
                  as="span"
                  variant="primary"
                  className="group bg-green-500 hover:bg-green-600 text-white font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-full inline-flex items-center transition-all duration-300 transform hover:scale-105"
                  onMouseEnter={prefetchTarget}
                >
                  <span className="mr-2">{buttonProps.text}</span>
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 group-hover:translate-x-1" />
                </NavbarButton>
              </Link>
              <Link href="#how-it-works" passHref>
                <span className="group inline-flex items-center gap-2 text-[#005b57] font-semibold py-3 px-6 rounded-full border-2 border-[#005b57]/20 hover:border-[#005b57]/40 transition-all duration-300 hover:bg-[#005b57]/5 cursor-pointer">
                  <PlayCircle className="w-5 h-5" />
                  <span>Learn How It Works</span>
                </span>
              </Link>
            </div>
          </motion.div>

          {/* Right Image Area - Mobile optimized */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="w-full lg:w-[50%] relative flex items-center justify-center h-[50vh] sm:h-[55vh] md:h-[60vh] lg:items-end lg:h-[calc(100vh-4rem)] lg:self-end order-1 lg:order-2"
          >
            <div className="relative w-full h-full flex items-end justify-center">
              <Image
                src="/logos/images/rehabify-hero-image.webp"
                alt="Healthcare professional"
                fill
                style={{ objectFit: "contain" }}
                className="max-h-[90%] max-w-[90%] lg:translate-y-[15vh]"
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                placeholder="blur"
                blurDataURL="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
