"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUp, Check } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@clerk/nextjs';
import HeroBackground from './HeroBackground';
import { AnimatedTooltip } from '@/components/ui/animated-tooltip';
import { FlipWords } from '@/components/ui/flip-words';

const TYPING_PHRASES = [
  "My back has been hurting for weeks...",
  "I had a stroke and need rehab...",
  "My knee hurts when I climb stairs...",
  "Ẹhin mi n dun mi lọpọlọpọ...",
  "I need a physiotherapist near me...",
  "Can you help with sports injuries?",
];

const socialProofPeople = [
  {
    id: 1,
    name: "Amaka O.",
    designation: "Recovered from back pain",
    image:
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=250&q=80",
  },
  {
    id: 2,
    name: "Dr. Chidera N.",
    designation: "Physiotherapist, Lekki",
    image:
      "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=250&q=80",
  },
  {
    id: 3,
    name: "Fatima A.",
    designation: "Post-stroke recovery",
    image:
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=250&q=80",
  },
  {
    id: 4,
    name: "Emeka I.",
    designation: "Sports injury rehab",
    image:
      "https://images.unsplash.com/photo-1507152832244-10d45c7eda57?auto=format&fit=crop&w=250&q=80",
  },
  {
    id: 5,
    name: "Ngozi U.",
    designation: "Knee recovery",
    image:
      "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=250&q=80",
  },
  {
    id: 6,
    name: "Tunde B.",
    designation: "Physiotherapist, Ikeja",
    image:
      "https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?auto=format&fit=crop&w=250&q=80",
  },
];

function TypingAnimation() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentPhrase = TYPING_PHRASES[phraseIndex];

  useEffect(() => {
    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          if (charIndex < currentPhrase.length) {
            setCharIndex((prev) => prev + 1);
          } else {
            // Pause at end, then start deleting
            setTimeout(() => setIsDeleting(true), 1800);
          }
        } else {
          if (charIndex > 0) {
            setCharIndex((prev) => prev - 1);
          } else {
            setIsDeleting(false);
            setPhraseIndex((prev) => (prev + 1) % TYPING_PHRASES.length);
          }
        }
      },
      isDeleting ? 30 : 60
    );
    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, currentPhrase]);

  return (
    <span className="whitespace-nowrap">
      {currentPhrase.slice(0, charIndex)}
      <span className="inline-block w-[2px] h-[14px] bg-[#999] ml-[1px] align-middle animate-pulse" />
    </span>
  );
}

export function LandingHero() {
  const { isSignedIn, isLoaded } = useAuth();

  const currentUser = useQuery(
    api.users.getMyUser,
    isLoaded && isSignedIn ? {} : "skip"
  );
  const approvalStatus = useQuery(
    api.users.getUserApprovalStatus,
    isLoaded && isSignedIn && currentUser ? {} : "skip"
  );

  // Check if the user has a partner association
  const partnerData = useQuery(
    api.partners.getCurrentUserPartner,
    isLoaded && isSignedIn ? {} : "skip"
  );

  const canAccessDashboard = isSignedIn && currentUser && (
    currentUser.role === "patient" ||
    currentUser.role === "family_member" ||
    currentUser.role === "admin" ||
    (approvalStatus?.status === "approved")
  );

  const getDashboardProps = () => {
    if (!isSignedIn) return null;

    if (canAccessDashboard) {
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

    if (currentUser && !currentUser.onboarded) {
      // If user has a partner association (signed up via partner portal),
      // direct them to the partner portal instead of role-selection
      if (partnerData?.isAuthenticated && (partnerData.status === "no_partner" || partnerData.partner)) {
        return { href: "/partners/portal", text: "Go to Partner Portal" };
      }

      // Only show "Complete Setup" if the user has a role (meaning they
      // started the onboarding flow but didn't finish)
      if (currentUser.role) {
        return { href: "/role-selection", text: "Complete Setup" };
      }

      // User has no role and no partner intent — show "Get Started" to pick a path
      return { href: "/role-selection", text: "Get Started" };
    }

    if (approvalStatus?.status === "pending_review") {
      return { href: "/dashboard", text: "View Application Status" };
    }

    return { href: "/dashboard", text: "Go to Dashboard" };
  };

  const dashboardProps = getDashboardProps();

  const whatsappNumber = "2348061525811";
  const whatsappPreMessage = "Hi Joy! 👋🏾 I need help with my recovery.";
  const whatsappMessage = encodeURIComponent(whatsappPreMessage);
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-[#F5F0EA] pt-[140px] md:pt-[180px] lg:pt-[220px] pb-0 lg:pb-20 flex flex-col">
      <HeroBackground />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex-1 flex flex-col justify-end lg:justify-center">
        <div className="flex flex-col lg:flex-row items-center justify-between max-w-6xl mx-auto gap-12 lg:gap-16 w-full flex-1">

          {/* ── Left: Text Content ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full lg:w-[55%] text-center lg:text-left order-1 lg:pr-8"
          >

            <h1 className="text-[2.25rem] sm:text-5xl md:text-6xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-[#1A1A1A] mb-5 leading-[1.15]">
              <span className="block">Recovery at your</span>
              <span className="block mt-1 sm:mt-2 min-h-[1.2em]">
                <FlipWords words={["fingertips.", "doorstep.", "schedule.", "home."]} className="text-[#005b57] font-extrabold !px-0" />
              </span>
            </h1>

            <p className="text-lg sm:text-xl md:text-2xl text-[#555] mb-8 font-medium max-w-lg mx-auto lg:mx-0">
              Tell Joy what hurts. Get matched with a verified specialist, same day, on WhatsApp.
            </p>

            {/* Primary CTA */}
            <div className="flex flex-col sm:flex-row items-center lg:items-start gap-3 mb-6">
              <Link href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
                <span className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-base sm:text-lg py-4 px-8 rounded-2xl flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/30 transform hover:-translate-y-0.5 w-full sm:w-auto">
                  Talk to Joy now
                  <ArrowRight className="w-5 h-5" />
                </span>
              </Link>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center lg:justify-start gap-4">
              {dashboardProps && (
                <Link href={dashboardProps.href} className="w-full sm:w-auto">
                  <span className="flex items-center justify-center text-white bg-emerald-600 hover:bg-emerald-500 font-semibold py-3 px-6 rounded-xl transition-all duration-300 shadow-md shadow-emerald-900/10 w-full text-sm">
                    {dashboardProps.text}
                  </span>
                </Link>
              )}
            </div>

            {/* Social Proof — Animated Tooltips */}
            <div className="flex flex-col items-center lg:items-start gap-3 mt-8">
              <div className="flex flex-row items-center">
                <AnimatedTooltip items={socialProofPeople} />
              </div>
              <p className="text-sm text-[#777] font-medium">
                Trusted by <span className="text-[#1A1A1A] font-semibold">500+</span> Nigerians recovering today
              </p>
            </div>
          </motion.div>

          {/* ── Right: Image (Mobile) & WhatsApp Chat Mockup (Desktop) ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="w-full lg:w-[45%] flex justify-center lg:justify-end order-2 mt-auto lg:-mt-12 lg:mb-0"
          >
            {/* Mobile Image */}
            <div className="w-full max-w-[400px] lg:hidden relative rounded-t-3xl overflow-hidden shadow-2xl translate-y-[1px]">
              <Image 
                src="/logos/images/rehabify-hero-image.webp" 
                alt="Rehabify Patient Recovery" 
                width={500} 
                height={500}
                className="w-full h-[280px] sm:h-[320px] object-cover object-top mix-blend-multiply"
                priority
              />
            </div>

            {/* Desktop WhatsApp Widget */}
            <div className="w-full max-w-[380px] sm:max-w-[400px] hidden lg:block">
              {/* Phone frame */}
              <div className="bg-[#EFEAE2] rounded-[2rem] overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border-[5px] border-[#E8E3DB] text-left">

                {/* WhatsApp header */}
                <div className="bg-[#008069] px-4 py-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#E8A54F] flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-sm">
                    J
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-white font-bold text-[15px] leading-tight truncate">Joy · Rehabify</h3>
                    <p className="text-white/80 text-[11px] font-medium">Online · AI-powered · speaks your language</p>
                  </div>
                </div>

                {/* Chat body */}
                <div className="p-4 space-y-3 bg-[#EFEAE2] min-h-[280px] flex flex-col justify-end">

                  {/* Joy message */}
                  <div className="bg-white rounded-2xl rounded-tl-sm p-3 max-w-[88%] shadow-sm">
                    <p className="text-[#111b21] text-[14px] leading-snug">
                      Hello. I&apos;m Joy. Tell me what&apos;s been bothering you in English, Yoruba, Igbo, or Hausa.
                    </p>
                    <p className="text-[10px] text-[#999] text-right mt-1">9:01 AM</p>
                  </div>

                  {/* User reply */}
                  <div className="bg-[#D9FDD3] rounded-2xl rounded-tr-sm p-3 max-w-[75%] ml-auto shadow-sm">
                    <p className="text-[#111b21] text-[14px] leading-snug">
                      My lower back has been hurting for weeks
                    </p>
                    <p className="text-[10px] text-[#53bdeb] text-right mt-1 font-medium">9:02 AM ✓✓</p>
                  </div>

                  {/* Joy follow-up */}
                  <div className="bg-white rounded-2xl rounded-tl-sm p-3 max-w-[88%] shadow-sm">
                    <p className="text-[#111b21] text-[14px] leading-snug">
                      I&apos;m here. Tell me more about what you&apos;re feeling.
                    </p>
                    <p className="text-[10px] text-[#999] text-right mt-1">9:02 AM</p>
                  </div>

                  {/* Input bar with typing animation */}
                  <div className="flex items-center gap-2 pt-2">
                    <div className="bg-white rounded-full flex-1 px-4 py-2.5 text-[13px] text-[#999] shadow-sm overflow-hidden">
                      <TypingAnimation />
                    </div>
                    <div className="w-9 h-9 rounded-full bg-[#D5D0C8] flex items-center justify-center flex-shrink-0">
                      <ArrowUp className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
