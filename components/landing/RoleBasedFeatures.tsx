"use client";

import React from "react";
import { motion } from "framer-motion";
import { 
  ShieldCheck, 
  Clock, 
  BadgePercent, 
  ArrowRight, 
  TrendingDown, 
  Activity 
} from "lucide-react";
import { IconBrandWhatsapp } from "@tabler/icons-react";

const WHATSAPP_URL = `https://wa.me/2348061525811?text=${encodeURIComponent("Hi Joy! 👋🏾 I need help with my recovery.")}`;

export default function RoleBasedFeatures() {
  return (
    <section className="py-24 sm:py-32 bg-[#FFCFDC] relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-rose-300/60 to-transparent" />
        <div className="absolute top-20 left-10 w-96 h-96 bg-white/30 rounded-full blur-3xl opacity-60" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-rose-200/50 rounded-full blur-3xl opacity-70" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center px-4 py-1.5 rounded-full bg-white/80 border border-white shadow-sm backdrop-blur-md mb-5"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-[#005b57]">
              The Rehabify Advantage
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-[1.15] mb-4 font-cal"
          >
            Why patients choose <span className="text-[#005b57]">Rehabify</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-base sm:text-lg text-gray-800 font-medium max-w-2xl mx-auto leading-relaxed"
          >
            High hospital fees and months-long waitlists shouldn’t stand between you and getting better.
          </motion.p>
        </div>

        {/* Aceternity-Style Asymmetric Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-12 gap-6 lg:gap-8 max-w-6xl mx-auto">
          
          {/* ── CARD 1: 100% Verified Therapists with Stylish Cloudinary Image (Col Span 7) ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-7 bg-white/90 hover:bg-white backdrop-blur-md rounded-3xl p-7 sm:p-9 border border-white/90 shadow-[0_10px_35px_-12px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_45px_-15px_rgba(0,0,0,0.12)] transition-all duration-300 flex flex-col justify-between group relative overflow-hidden"
          >
            <div className="relative z-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold mb-4">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>3-Tier Clinical Verification</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 font-cal">
                100% MRTBN-Licensed Specialists
              </h3>
              <p className="text-[#005b57] text-sm font-semibold mb-6">
                Matched in Under 24 Hours
              </p>
            </div>

            {/* Stylish Image Integration */}
            <div className="relative rounded-2xl overflow-hidden h-52 sm:h-64 border border-black/5 shadow-inner mt-2 group/img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://res.cloudinary.com/dubeogufg/image/upload/f_auto,q_auto/v1741105202/IMG_6326_nmmqal.png"
                alt="Rehabify physiotherapist in clinic"
                className="w-full h-full object-cover object-center group-hover/img:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              
              {/* Floating Pill Badge over Image */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white text-xs backdrop-blur-md bg-white/20 border border-white/30 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-bold">Verified Practitioners Active</span>
                </div>
                <span className="text-white/90 font-medium">Home & Clinic Care</span>
              </div>
            </div>
          </motion.div>

          {/* ── CARD 2: Transparent Fair Pricing (Col Span 5) ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="lg:col-span-5 bg-white/90 hover:bg-white backdrop-blur-md rounded-3xl p-7 sm:p-9 border border-white/90 shadow-[0_10px_35px_-12px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_45px_-15px_rgba(0,0,0,0.12)] transition-all duration-300 flex flex-col justify-between group"
          >
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 text-[#005b57] border border-teal-200 text-xs font-bold mb-4">
                <BadgePercent className="w-4 h-4 text-[#005b57]" />
                <span>Fair Healthcare Pricing</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 font-cal">
                40–60% Lower Than Private Hospitals
              </h3>
              <p className="text-[#005b57] text-sm font-semibold mb-6">
                Active Recovery & Joy WhatsApp Tracking
              </p>
            </div>

            {/* Micro Graphic: Cost Comparison Banner */}
            <div className="bg-[#FAF6E7] rounded-2xl p-5 border border-[#e8dfc8] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Average Hospital Fee</span>
                <span className="text-xs text-gray-400 line-through font-semibold">₦25,000+ / session</span>
              </div>
              <div className="flex items-center justify-between text-[#005b57] font-bold">
                <span className="text-sm">Rehabify Direct Care</span>
                <span className="text-lg text-emerald-700 font-extrabold">From ₦8,000</span>
              </div>
              <div className="pt-2 border-t border-gray-200/80 flex items-center gap-2 text-xs text-emerald-800 font-semibold">
                <TrendingDown className="w-4 h-4 text-emerald-600" />
                <span>Save up to 20% more on treatment packages</span>
              </div>
            </div>
          </motion.div>

          {/* ── CARD 3: 24-Hour Fast Booking (Col Span 5) ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:col-span-5 bg-white/90 hover:bg-white backdrop-blur-md rounded-3xl p-7 sm:p-9 border border-white/90 shadow-[0_10px_35px_-12px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_45px_-15px_rgba(0,0,0,0.12)] transition-all duration-300 flex flex-col justify-between group"
          >
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-orange-800 border border-orange-200 text-xs font-bold mb-4">
                <Clock className="w-4 h-4 text-orange-600" />
                <span>Rapid Access</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2 font-cal">
                Matched in Under 24 Hours
              </h3>
            </div>

            {/* Quick Timeline pill */}
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold text-gray-800">Same-Day Slots Active</span>
              </div>
              <span className="text-[#005b57] font-bold">Book Instantly →</span>
            </div>
          </motion.div>

          {/* ── CARD 4: Guided Recovery & Joy Companion (Col Span 7) ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="lg:col-span-7 bg-white/90 hover:bg-white backdrop-blur-md rounded-3xl p-7 sm:p-9 border border-white/90 shadow-[0_10px_35px_-12px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_45px_-15px_rgba(0,0,0,0.12)] transition-all duration-300 flex flex-col justify-between group"
          >
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold mb-4">
                <Activity className="w-4 h-4 text-rose-600" />
                <span>Continuous Supervision</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2 font-cal">
                Active Recovery & Joy WhatsApp Tracking
              </h3>
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm text-neutral-800 font-medium bg-white/90 rounded-xl p-3 border border-rose-100 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#005b57]" />
                <span>AI posture form check</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs sm:text-sm text-neutral-800 font-medium bg-white/90 rounded-xl p-3 border border-rose-100 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#005b57]" />
                <span>Direct physio chat line</span>
              </div>
            </div>
          </motion.div>

        </div>

        {/* Bottom WhatsApp CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="text-center mt-14 sm:mt-18"
        >
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-3 bg-[#005b57] hover:bg-[#00443e] text-white font-semibold text-base sm:text-lg py-4 px-8 sm:px-10 rounded-full transition-all duration-300 shadow-xl shadow-[#005b57]/25 hover:shadow-2xl hover:shadow-[#005b57]/35 transform hover:-translate-y-0.5"
          >
            <IconBrandWhatsapp className="w-6 h-6 text-white" />
            <span>Get Started on WhatsApp</span>
            <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1.5" />
          </a>
          <p className="mt-3.5 text-xs sm:text-sm font-medium text-gray-700">
            Free initial triage · Speak with a care coordinator today
          </p>
        </motion.div>

      </div>
    </section>
  );
}
