'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    ArrowRight, 
    ShieldCheck, 
    Clock, 
    Activity, 
    MessageSquare, 
    UserCheck, 
    Calendar,
    ChevronRight,
    MapPin
} from '@/components/icons';
import { WhatsApp } from '@/components/icons';

const WHATSAPP_URL = `https://wa.me/2348061525811?text=${encodeURIComponent("Hi Joy! 👋🏾 I need help with my recovery.")}`;

const SYMPTOM_TAGS = [
    { label: "Lower Back Pain", active: true },
    { label: "Knee / Joint Pain", active: false },
    { label: "Post-Stroke Rehab", active: false },
    { label: "Sports Injury", active: false },
    { label: "Neck & Shoulder", active: false },
];

export function HowItWorks() {
    const [selectedSymptom, setSelectedSymptom] = useState(0);
    const [activeTab, setActiveTab] = useState(1);

    return (
        <section id="how-it-works" className="py-24 sm:py-32 bg-[#FBF9F5] relative overflow-hidden">
            {/* Background subtle grid and ambient lighting inspired by Aceternity UI */}
            <div className="absolute inset-0 pointer-events-none">
                <div 
                    className="absolute inset-0 opacity-[0.035]"
                    style={{
                        backgroundImage: `radial-gradient(#005b57 1px, transparent 1px)`,
                        backgroundSize: '24px 24px'
                    }}
                />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-px bg-gradient-to-r from-transparent via-[#005b57]/20 to-transparent" />
                <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-[#005b57]/5 rounded-full blur-[100px]" />
                <div className="absolute bottom-1/4 left-0 w-[450px] h-[450px] bg-emerald-500/5 rounded-full blur-[100px]" />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                {/* Header Section */}
                <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-24">
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-[#005b57]/10 border border-[#005b57]/15 mb-5 shadow-sm"
                    >
                        <span className="text-xs font-bold uppercase tracking-widest text-[#005b57]">
                            How Rehabify Works
                        </span>
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-[1.15] mb-5 font-cal"
                    >
                        From pain to full recovery in{" "}
                        <span className="text-[#005b57] relative">
                            3 simple steps
                            <svg className="absolute -bottom-2 left-0 w-full h-2 text-[#005b57]/30" viewBox="0 0 100 8" preserveAspectRatio="none">
                                <path d="M0 7 C 30 0, 70 0, 100 7" stroke="currentColor" strokeWidth="2.5" fill="transparent"/>
                            </svg>
                        </span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-base sm:text-lg text-gray-600 leading-relaxed font-sans max-w-2xl mx-auto"
                    >
                        No waiting weeks in crowded hospitals. Get matched with a verified specialist and start your treatment today.
                    </motion.p>
                </div>

                {/* 3 Step Interactive Bento Showcase (Aceternity UI Pattern) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
                    
                    {/* ── STEP 1: Assessment ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="group relative rounded-3xl bg-white p-6 sm:p-8 border border-gray-200/90 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgba(0,91,87,0.08)] transition-all duration-300 flex flex-col justify-between"
                    >
                        <div>
                            {/* Step Badge */}
                            <div className="flex items-center justify-between mb-6">
                                <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-[#005b57] text-white font-bold text-sm shadow-md shadow-[#005b57]/20">
                                    01
                                </span>
                                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    Step 1 · 60s Intake
                                </span>
                            </div>

                            <h3 className="text-2xl font-bold text-gray-900 mb-2 font-cal group-hover:text-[#005b57] transition-colors">
                                Tell us what hurts
                            </h3>
                            <p className="text-sm text-gray-600 leading-relaxed mb-6 font-sans">
                                Answer a few simple questions in plain words. No confusing medical terms needed.
                            </p>

                            {/* UI Micro-Mockup: Symptom Tag Selector */}
                            <div className="bg-[#FAF6E7]/80 rounded-2xl p-4 border border-[#eadeca] space-y-3 mb-6">
                                <div className="flex items-center justify-between text-xs font-semibold text-gray-600">
                                    <span className="flex items-center gap-1.5 text-[#005b57]">
                                        <MessageSquare className="w-3.5 h-3.5" /> What needs attention?
                                    </span>
                                    <span className="text-[11px] text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full font-bold">
                                        Quick Select
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {SYMPTOM_TAGS.map((tag, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setSelectedSymptom(idx)}
                                            className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                                                selectedSymptom === idx
                                                    ? 'bg-[#005b57] text-white shadow-sm scale-[1.02]'
                                                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200/60'
                                            }`}
                                        >
                                            {tag.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="bg-white rounded-xl p-2.5 border border-gray-100 flex items-center justify-between text-xs text-gray-600">
                                    <span className="text-gray-500">Duration: <strong className="text-gray-800">2 weeks</strong></span>
                                    <span className="text-[#005b57] font-semibold">Triage Ready ✓</span>
                                </div>
                            </div>
                        </div>

                        {/* Feature Highlights */}
                        <div className="pt-4 border-t border-gray-100 space-y-2">
                            <div className="flex items-center gap-2 text-xs text-neutral-600 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#005b57]" />
                                <span>Takes under 60 seconds</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-neutral-600 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#005b57]" />
                                <span>Voice note & local language friendly</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── STEP 2: Instant Match ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="group relative rounded-3xl bg-white p-6 sm:p-8 border-2 border-[#005b57]/30 shadow-[0_12px_36px_rgba(0,91,87,0.09)] hover:shadow-[0_24px_48px_rgba(0,91,87,0.14)] transition-all duration-300 flex flex-col justify-between relative overflow-hidden"
                    >
                        {/* Top highlight ribbon */}
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-[#005b57] to-teal-400" />

                        <div>
                            {/* Step Badge */}
                            <div className="flex items-center justify-between mb-6">
                                <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-[#005b57] text-white font-bold text-sm shadow-md shadow-[#005b57]/20">
                                    02
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                    <ShieldCheck className="w-3.5 h-3.5" /> Vetted
                                </span>
                            </div>

                            <h3 className="text-2xl font-bold text-gray-900 mb-2 font-cal group-hover:text-[#005b57] transition-colors">
                                Get matched instantly
                            </h3>
                            <p className="text-sm text-gray-600 leading-relaxed mb-6 font-sans">
                                We pair you with an MRTBN-licensed physiotherapist based on your condition and location.
                            </p>

                            {/* UI Micro-Mockup: Specialist Match Card */}
                            <div className="bg-gradient-to-b from-gray-50 to-white rounded-2xl p-4 border border-gray-200/90 shadow-sm space-y-3 mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-full bg-[#002e2c] text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                                        CN
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <h4 className="text-sm font-bold text-gray-900 truncate">Dr. Chidera N.</h4>
                                            <span className="text-[10px] bg-[#005b57] text-white px-1.5 py-0.2 rounded font-semibold">MRTBN</span>
                                        </div>
                                        <p className="text-xs text-gray-500 truncate">Orthopedic & Spine Specialist</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs text-gray-600">
                                    <div className="flex items-center gap-1">
                                        <MapPin className="w-3.5 h-3.5 text-[#005b57]" />
                                        <span className="truncate">Home / Clinic</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-emerald-700 font-semibold">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>Available Today</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Feature Highlights */}
                        <div className="pt-4 border-t border-gray-100 space-y-2">
                            <div className="flex items-center gap-2 text-xs text-neutral-600 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#005b57]" />
                                <span>Verified MRTBN licensing check</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-neutral-600 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#005b57]" />
                                <span>Transparent fixed pricing upfront</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── STEP 3: Guided Recovery ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="group relative rounded-3xl bg-white p-6 sm:p-8 border border-gray-200/90 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgba(0,91,87,0.08)] transition-all duration-300 flex flex-col justify-between"
                    >
                        <div>
                            {/* Step Badge */}
                            <div className="flex items-center justify-between mb-6">
                                <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-[#005b57] text-white font-bold text-sm shadow-md shadow-[#005b57]/20">
                                    03
                                </span>
                                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    Step 3 · Recovery
                                </span>
                            </div>

                            <h3 className="text-2xl font-bold text-gray-900 mb-2 font-cal group-hover:text-[#005b57] transition-colors">
                                Book & recover with Joy
                            </h3>
                            <p className="text-sm text-gray-600 leading-relaxed mb-6 font-sans">
                                Attend sessions and stay on track between appointments with Joy, your daily WhatsApp recovery companion.
                            </p>

                            {/* UI Micro-Mockup: WhatsApp Companion Card */}
                            <div className="bg-[#EFEAE2] rounded-2xl p-3.5 border border-[#dfd7cc] shadow-sm space-y-2.5 mb-6">
                                <div className="flex items-center gap-2 pb-2 border-b border-black/5">
                                    <div className="w-6 h-6 rounded-full bg-[#008069] flex items-center justify-center text-white text-[11px] font-bold">
                                        J
                                    </div>
                                    <span className="text-xs font-bold text-gray-800">Joy · Rehabify Companion</span>
                                    <span className="ml-auto text-[10px] text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">Active</span>
                                </div>
                                <div className="bg-white rounded-xl rounded-tl-sm p-2.5 text-xs text-gray-800 shadow-sm leading-snug">
                                    👋 Good morning! Time for your 12-min back exercise set. Send a video if you need form check!
                                </div>
                                <div className="bg-[#D9FDD3] rounded-xl rounded-tr-sm p-2 text-xs text-gray-800 shadow-sm ml-auto max-w-[85%] text-right font-medium">
                                    Done! Feeling much less pain today 🙏
                                </div>
                            </div>
                        </div>

                        {/* Feature Highlights */}
                        <div className="pt-4 border-t border-gray-100 space-y-2">
                            <div className="flex items-center gap-2 text-xs text-neutral-600 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#005b57]" />
                                <span>Daily exercise reminders via WhatsApp</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-neutral-600 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#005b57]" />
                                <span>Continuous therapist supervision</span>
                            </div>
                        </div>
                    </motion.div>

                </div>

                {/* Bottom Trust Highlights & WhatsApp CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="mt-16 sm:mt-20 text-center"
                >
                    <div className="inline-flex flex-wrap items-center justify-center gap-6 sm:gap-10 mb-8 text-xs sm:text-sm font-semibold text-gray-600">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-[#005b57]" />
                            <span>Matched in under 24 hours</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-[#005b57]" />
                            <span>MRTBN licensed practitioners</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-[#005b57]" />
                            <span>No upfront hospital registration fees</span>
                        </div>
                    </div>

                    <div>
                        <a
                            href={WHATSAPP_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex items-center gap-3 bg-[#005b57] hover:bg-[#004744] text-white font-semibold text-base sm:text-lg py-4 px-8 sm:px-10 rounded-full transition-all duration-300 shadow-xl shadow-[#005b57]/25 hover:shadow-2xl hover:shadow-[#005b57]/35 transform hover:-translate-y-0.5 active:scale-98"
                        >
                            <WhatsApp className="w-6 h-6 text-white" />
                            <span>Get Matched With a Physio on WhatsApp</span>
                            <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1.5" />
                        </a>
                        <p className="mt-3.5 text-xs sm:text-sm text-gray-500 font-medium">
                            Direct, instant response · Available across Nigeria
                        </p>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
