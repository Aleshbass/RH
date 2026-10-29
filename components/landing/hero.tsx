"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUp } from '@/components/icons';
import Link from 'next/link';
import Image from 'next/image';
import { FlipWords } from '@/components/ui/flip-words';
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp';

const TYPING_PHRASES = [
  "My back has been hurting for weeks...",
  "I had a stroke and need rehab...",
  "My knee hurts when I climb stairs...",
  "Ẹhin mi n dun mi lọpọlọpọ...",
  "I need a physiotherapist near me...",
  "Can you help with sports injuries?",
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

// The hero is for visitors: signed-in people reach their dashboard (or finish setting up)
// from the header's account button
export function LandingHero() {
  const whatsappUrl = joyWhatsAppUrl("Hi Joy! 👋🏾 I need help with my recovery.");

  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-rh-canvas pt-[140px] md:pt-[180px] lg:pt-[220px] pb-0 lg:pb-20 flex flex-col">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex-1 flex flex-col justify-end lg:justify-center">
        <div className="flex flex-col lg:flex-row items-center justify-between max-w-6xl mx-auto gap-12 lg:gap-16 w-full flex-1">

          {/* ── Left: Text Content ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full lg:w-[55%] text-center lg:text-left order-1 lg:pr-8"
          >

            <h1 className="text-[2.25rem] sm:text-5xl md:text-6xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-rh-ink mb-5 leading-[1.15]">
              <span className="block">Recovery at your</span>
              <span className="block mt-1 sm:mt-2 min-h-[1.2em]">
                <span className="relative inline-block">
                  <FlipWords words={["fingertips.", "doorstep.", "schedule.", "home."]} className="text-rh-ink font-extrabold !px-0" />
                  <span aria-hidden className="absolute -bottom-1 left-0 h-[0.12em] w-full rounded-full bg-rh-lime" />
                </span>
              </span>
            </h1>

            <p className="text-lg sm:text-xl md:text-2xl text-rh-ink/65 mb-8 font-medium max-w-lg mx-auto lg:mx-0">
              Tell Joy what hurts on WhatsApp. Get matched with a licensed physiotherapist within 24 hours.
            </p>

            {/* Primary CTA */}
            <div className="flex flex-col sm:flex-row items-center lg:items-start gap-3 mb-6">
              <Link href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
                <span className="bg-rh-lime hover:bg-rh-lime-deep text-rh-ink font-bold text-base sm:text-lg py-4 px-8 rounded-full flex items-center justify-center gap-2 transition-colors duration-300 w-full sm:w-auto">
                  Talk to Joy now
                  <ArrowRight className="w-5 h-5" />
                </span>
              </Link>
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
                <div className="bg-rh-ink px-4 py-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rh-lime flex items-center justify-center text-rh-ink font-bold text-lg flex-shrink-0">
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
