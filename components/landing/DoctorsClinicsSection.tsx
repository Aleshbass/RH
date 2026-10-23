"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
    ArrowRight, 
    Send, 
    Check, 
    FileText, 
    Clock, 
    TrendingUp, 
    ShieldCheck, 
    Stethoscope, 
    Building2 
} from "@/components/icons";
import { WhatsApp } from "@/components/icons";
import Link from "next/link";

const WHATSAPP_REFERRAL_URL = `https://wa.me/2348061525811?text=${encodeURIComponent("Hi Joy! 👋🏾 I'd like to refer a patient through Rehabify.")}`;

export function DoctorsClinicsSection() {
    const [referralSent, setReferralSent] = useState(false);

    const handleSimulate = (e: React.FormEvent) => {
        e.preventDefault();
        setReferralSent(true);
        setTimeout(() => setReferralSent(false), 4000);
    };

    return (
        <section id="for-doctors" className="py-24 sm:py-32 bg-[#F8F9FA] relative overflow-hidden">
            {/* Background subtle grid & lighting inspired by Aceternity UI */}
            <div className="absolute inset-0 pointer-events-none">
                <div 
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `radial-gradient(#005b57 1px, transparent 1px)`,
                        backgroundSize: '24px 24px'
                    }}
                />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#005b57]/5 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-[450px] h-[450px] bg-emerald-500/5 rounded-full blur-[100px]" />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                
                {/* Header */}
                <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#005b57]/10 border border-[#005b57]/15 mb-5 shadow-sm"
                    >
                        <Stethoscope className="w-3.5 h-3.5 text-[#005b57]" />
                        <span className="text-xs font-bold uppercase tracking-widest text-[#005b57]">
                            For Doctors & Clinics
                        </span>
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-[1.15] mb-4 font-cal"
                    >
                        A referral system that{" "}
                        <span className="text-[#005b57]">actually works</span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-base sm:text-lg text-gray-600 font-sans max-w-2xl mx-auto leading-relaxed"
                    >
                        Refer in 30 seconds. Track patient recovery in real-time. Keep care seamless and closed-loop.
                    </motion.p>
                </div>

                {/* Aceternity Bento Grid for Referrals */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 max-w-6xl mx-auto mb-12">
                    
                    {/* ── CARD 1: Interactive 30-Second Referral Simulator (7 Cols) ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="lg:col-span-7 bg-white rounded-3xl p-7 sm:p-9 border border-gray-200/90 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgba(0,91,87,0.08)] transition-all duration-300 flex flex-col justify-between"
                    >
                        <div>
                            <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 font-cal">
                                1-Click Patient Referral
                            </h3>
                            <p className="text-gray-600 text-sm leading-relaxed mb-6 font-sans">
                                Send patient details in seconds. We instantly match them with verified physiotherapists and update your dashboard.
                            </p>

                            {/* UI Micro-Mockup: Referral Generator */}
                            <form onSubmit={handleSimulate} className="bg-[#FAF6E7]/80 rounded-2xl p-4 sm:p-5 border border-[#e8dfc8] space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div className="bg-white rounded-xl px-3 py-2 border border-gray-200/80">
                                        <span className="text-[10px] font-bold text-gray-400 block uppercase">Patient Name</span>
                                        <span className="text-xs font-bold text-gray-800">Tunde Adeleke</span>
                                    </div>
                                    <div className="bg-white rounded-xl px-3 py-2 border border-gray-200/80">
                                        <span className="text-[10px] font-bold text-gray-400 block uppercase">Condition</span>
                                        <span className="text-xs font-bold text-[#005b57]">Post-Op Knee Rehab</span>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="w-full flex items-center justify-center gap-2 bg-[#005b57] hover:bg-[#00443e] text-white py-2.5 rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.99]"
                                >
                                    {referralSent ? (
                                        <>
                                            <Check className="w-4 h-4 text-emerald-300" />
                                            <span>Referral Dispatched & Synced!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-3.5 h-3.5" />
                                            <span>Dispatch Instant WhatsApp Booking</span>
                                        </>
                                    )}
                                </button>

                                {referralSent && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center text-xs text-emerald-800 font-semibold"
                                    >
                                        ⚡ Booking link sent to patient · Therapist matched in Ikeja
                                    </motion.div>
                                )}
                            </form>
                        </div>

                        {/* Capability Badges */}
                        <div className="pt-5 mt-4 border-t border-gray-100 flex flex-wrap gap-2.5 text-xs font-medium">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#005b57]/[0.06] text-[#005b57] border border-[#005b57]/15">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#005b57]" />
                                Zero phone tag
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#005b57]/[0.06] text-[#005b57] border border-[#005b57]/15">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#005b57]" />
                                Automated follow-up
                            </span>
                        </div>
                    </motion.div>

                    {/* ── CARD 2: Closed-Loop Clinical Visibility with Cloudinary Image (5 Cols) ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.15 }}
                        className="lg:col-span-5 bg-white rounded-3xl p-7 sm:p-9 border border-gray-200/90 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgba(0,91,87,0.08)] transition-all duration-300 flex flex-col justify-between relative overflow-hidden group"
                    >
                        <div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2 font-cal">
                                Full Clinical Visibility
                            </h3>
                            <p className="text-gray-600 text-sm leading-relaxed mb-4 font-sans">
                                Get direct progress notes and discharge summaries so you always know your patient&apos;s recovery status.
                            </p>
                        </div>

                        {/* Cloudinary Image Integration with Doctor Notes overlay */}
                        <div className="relative rounded-2xl overflow-hidden h-44 sm:h-52 border border-black/5 shadow-inner mt-2 group/img">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="https://res.cloudinary.com/dubeogufg/image/upload/f_auto,q_auto/v1741105204/IMG_6327_ffervx.png"
                                alt="Physiotherapy session documentation"
                                className="w-full h-full object-cover object-center group-hover/img:scale-105 transition-transform duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                            
                            <div className="absolute bottom-3 left-3 right-3 text-white text-xs backdrop-blur-md bg-white/20 border border-white/30 rounded-xl px-3.5 py-2 flex items-center justify-between">
                                <span className="font-bold flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                    Clinical Summary Synced
                                </span>
                                <span className="text-emerald-300 font-semibold text-[11px]">Active Care</span>
                            </div>
                        </div>
                    </motion.div>

                </div>



                {/* Bottom Referral CTAs */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="text-center flex flex-col sm:flex-row items-center justify-center gap-4"
                >
                    <a
                        href={WHATSAPP_REFERRAL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex items-center gap-2.5 bg-[#005b57] hover:bg-[#00443e] text-white font-semibold py-4 px-8 rounded-full transition-all duration-300 shadow-lg shadow-[#005b57]/20 transform hover:-translate-y-0.5"
                    >
                        <WhatsApp className="w-5 h-5" />
                        <span>Refer a Patient on WhatsApp</span>
                        <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </a>

                    <Link
                        href="/clinic-owner"
                        className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 font-semibold py-4 px-8 rounded-full transition-all duration-300 shadow-sm"
                    >
                        <Building2 className="w-4 h-4 text-gray-600" />
                        <span>Onboard Your Clinic</span>
                    </Link>
                </motion.div>

            </div>
        </section>
    );
}
