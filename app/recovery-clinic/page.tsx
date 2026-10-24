"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowRight,
    CheckCircle2,
    ShieldCheck,
    Clock,
    Users,
    Activity,
    Award,
    Crown,
    Check,
    Brain,
    Heart,
    Bone,
    Dumbbell,
    Baby,
    ChevronDown,
    Plus,
    Minus,
} from "@/components/icons";
import Link from "next/link";

// ── Fade-in wrapper ──────────────────────────────
function FadeIn({
    children,
    delay = 0,
    className = "",
}: {
    children: React.ReactNode;
    delay?: number;
    className?: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

// ── Data ──────────────────────────────────────────
const services = [
    {
        icon: Bone,
        title: "Orthopaedic Rehabilitation",
        desc: "Back pain, joint injuries, fractures, post-surgery recovery, arthritis management",
        tag: "Most Popular",
    },
    {
        icon: Brain,
        title: "Neurological Rehabilitation",
        desc: "Stroke recovery, spinal cord injury, cerebral palsy, Parkinson's, traumatic brain injury",
        tag: "Specialized",
    },
    {
        icon: Dumbbell,
        title: "Sports Medicine",
        desc: "ACL tears, rotator cuff, sprains & strains, return-to-play protocols, performance optimization",
        tag: null,
    },
    {
        icon: Heart,
        title: "Cardiopulmonary",
        desc: "Post-cardiac surgery, COPD management, breathing exercises, chest physiotherapy",
        tag: null,
    },
    {
        icon: Baby,
        title: "Paediatric Therapy",
        desc: "Developmental delays, cerebral palsy, scoliosis, post-surgical paediatric care",
        tag: null,
    },
    {
        icon: Activity,
        title: "Pain Management",
        desc: "Chronic pain conditions, fibromyalgia, myofascial pain, headache & migraine therapy",
        tag: null,
    },
];

const steps = [
    {
        num: "1",
        title: "Tell Us What You Need",
        desc: "Tell us about your location, condition, and preferences in under 60 seconds.",
    },
    {
        num: "2",
        title: "Get Matched & See Your Price",
        desc: "We calculate your session rate based on your location and condition. No hidden fees, no surprises.",
    },
    {
        num: "3",
        title: "Choose Your Physio",
        desc: "Browse verified physiotherapist profiles, read patient reviews, and pick the right fit for you.",
    },
    {
        num: "4",
        title: "Book & Start Recovery",
        desc: "Select a date, book your session (or a money-saving package), and begin your recovery journey.",
    },
];

const verificationTiers = [
    {
        level: "Verified",
        color: "bg-rh-mint text-rh-teal",
        badge: Check,
        requirements: [
            "MRTBN Licensed",
            "University degree verified",
            "Background check passed",
            "Profile completed",
        ],
    },
    {
        level: "Elite",
        color: "bg-rh-peach text-rh-amber",
        badge: Award,
        requirements: [
            "All Verified requirements",
            "Strong session history and patient ratings",
            "Specialty certification verified",
            "Several years of clinical experience",
        ],
    },
    {
        level: "Master Clinician",
        color: "bg-rh-teal text-white",
        badge: Crown,
        requirements: [
            "All Elite requirements",
            "Extensive session history and excellent patient ratings",
            "Extensive clinical experience",
            "Published research or clinical trainer",
        ],
    },
];

const faqData = [
    {
        q: "How do I know the physiotherapist is qualified?",
        a: "Every physiotherapist on Rehabify goes through our verification process: MRTBN license check, degree verification, clinical interview by our team (we're physiotherapists too), and ongoing patient reviews.",
    },
    {
        q: "Can I do sessions at home or online?",
        a: "Many of our physiotherapists offer both in-person (at your home or their clinic) and virtual sessions via our telehealth integration. You can filter by session type when choosing your physio.",
    },
    {
        q: "How does pricing work?",
        a: "Your session rate is calculated based on your location, condition complexity, and the physiotherapist's experience level. Prices are transparent — you see your rate before you commit. Packages of 4, 8, or 12 sessions save you up to 15%.",
    },
    {
        q: "What if I'm not happy with my physiotherapist?",
        a: "If it's not the right fit after your first session, we'll rematch you at no extra cost. Your satisfaction and recovery are our priority.",
    },
    {
        q: "Do you serve my city?",
        a: "We currently serve all major Nigerian cities including Lagos, Abuja, Port Harcourt, Ibadan, Kano, Enugu, Benin City, Calabar, and many more across all geopolitical zones. If your city isn't listed, select 'Other Location' and we'll do our best to match you.",
    },
];

// ── Page ──────────────────────────────────────────
export default function RecoveryClinicPage() {
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    return (
        <div className="bg-white">
            {/* ── Hero ── */}
            <section className="relative bg-gradient-to-br from-[#002e2c] via-[#003d3a] to-[#005b57] text-white overflow-hidden">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center relative z-10">
                    <FadeIn>
                        <span className="inline-block text-xs font-bold uppercase tracking-widest text-green-400 mb-4">
                            Recovery Clinic
                        </span>
                        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight max-w-4xl mx-auto mb-6">
                            Expert Physiotherapy, Matched to You
                        </h1>
                        <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto mb-10">
                            Verified physiotherapists. Transparent pricing. Real outcomes. Get
                            matched in 60 seconds — start your recovery today.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Link
                                href="/start-treatment"
                                className="group bg-white text-[#005b57] font-bold py-3.5 px-8 rounded-full inline-flex items-center justify-center gap-2 transition-all hover:scale-105 shadow-lg"
                            >
                                Start Treatment
                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                            </Link>
                            <Link
                                href="#how-it-works"
                                className="border-2 border-white/30 text-white font-semibold py-3.5 px-8 rounded-full inline-flex items-center justify-center gap-2 transition-all hover:bg-white/10"
                            >
                                See How It Works
                            </Link>
                        </div>
                    </FadeIn>
                </div>
            </section>

            {/* ── Services Grid ── */}
            <section className="py-20 sm:py-24">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
                    <FadeIn>
                        <div className="text-center mb-14">
                            <span className="text-xs font-bold uppercase tracking-widest text-[#005b57]">
                                Our Services
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
                                Find the Right Care
                            </h2>
                            <p className="text-gray-600 mt-3 max-w-xl mx-auto">
                                Whatever your condition, we have verified specialists ready to
                                help.
                            </p>
                        </div>
                    </FadeIn>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {services.map((svc, i) => {
                            const Icon = svc.icon;
                            return (
                                <FadeIn key={svc.title} delay={i * 0.08}>
                                    <div className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-[#005b57]/30 hover:shadow-lg transition-all duration-300 h-full flex flex-col">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="w-12 h-12 rounded-xl bg-[#e6f0ef] flex items-center justify-center group-hover:bg-[#005b57] transition-colors duration-300">
                                                <Icon className="w-6 h-6 text-[#005b57] group-hover:text-white transition-colors duration-300" />
                                            </div>
                                            {svc.tag && (
                                                <span className="text-[10px] font-bold uppercase tracking-widest bg-[#FAF6E7] text-[#005b57] px-2.5 py-1 rounded-full">
                                                    {svc.tag}
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="font-bold text-gray-900 mb-2">
                                            {svc.title}
                                        </h3>
                                        <p className="text-sm text-gray-500 leading-relaxed flex-1">
                                            {svc.desc}
                                        </p>
                                    </div>
                                </FadeIn>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── How It Works ── */}
            <section id="how-it-works" className="py-20 sm:py-24 bg-gray-50">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
                    <FadeIn>
                        <div className="text-center mb-14">
                            <span className="text-xs font-bold uppercase tracking-widest text-[#005b57]">
                                How It Works
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
                                From pain to progress in 4 steps
                            </h2>
                        </div>
                    </FadeIn>
                    <div className="space-y-4">
                        {steps.map((step, i) => (
                            <FadeIn key={step.num} delay={i * 0.1}>
                                <div className="bg-white rounded-2xl border border-gray-200 p-6 flex gap-5 items-start">
                                    <div className="w-10 h-10 rounded-full bg-[#005b57] text-white flex items-center justify-center font-bold text-sm shrink-0">
                                        {step.num}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 mb-1">
                                            {step.title}
                                        </h3>
                                        <p className="text-sm text-gray-600">{step.desc}</p>
                                    </div>
                                </div>
                            </FadeIn>
                        ))}
                    </div>
                    <FadeIn delay={0.4}>
                        <div className="text-center mt-10">
                            <Link
                                href="/start-treatment"
                                className="group inline-flex items-center gap-2 bg-[#005b57] text-white font-semibold py-3.5 px-8 rounded-full transition-all hover:bg-[#004a46] hover:scale-105 shadow-lg shadow-[#005b57]/20"
                            >
                                Start Now — It&apos;s Free
                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                            </Link>
                        </div>
                    </FadeIn>
                </div>
            </section>

            {/* ── Verification Tiers ── */}
            <section className="py-20 sm:py-24">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
                    <FadeIn>
                        <div className="text-center mb-14">
                            <span className="text-xs font-bold uppercase tracking-widest text-[#005b57]">
                                Trust &amp; Safety
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
                                3-Tier Verification System
                            </h2>
                            <p className="text-gray-600 mt-3 max-w-xl mx-auto">
                                Every physiotherapist earns their badge. No shortcuts.
                            </p>
                        </div>
                    </FadeIn>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {verificationTiers.map((tier, i) => (
                            <FadeIn key={tier.level} delay={i * 0.1}>
                                <div className="bg-white border border-gray-200 rounded-2xl p-6 h-full">
                                    <div className="flex items-center gap-3 mb-4">
                                        <span
                                            className={`w-10 h-10 rounded-full ${tier.color} flex items-center justify-center`}
                                        >
                                            <tier.badge className="h-4 w-4" />
                                        </span>
                                        <h3 className="font-bold text-gray-900">{tier.level}</h3>
                                    </div>
                                    <ul className="space-y-2">
                                        {tier.requirements.map((req) => (
                                            <li
                                                key={req}
                                                className="flex items-start gap-2 text-sm text-gray-600"
                                            >
                                                <CheckCircle2 className="w-4 h-4 text-[#005b57] mt-0.5 shrink-0" />
                                                {req}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </FadeIn>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FAQ ── */}
            <section className="py-20 sm:py-24 bg-gray-50">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
                    <FadeIn>
                        <div className="text-center mb-12">
                            <span className="text-xs font-bold uppercase tracking-widest text-[#005b57]">
                                FAQs
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
                                Common Questions
                            </h2>
                        </div>
                    </FadeIn>
                    <div className="space-y-3">
                        {faqData.map((item, i) => (
                            <FadeIn key={i} delay={i * 0.05}>
                                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                                    <button
                                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                        className="w-full flex justify-between items-center p-5 text-left cursor-pointer"
                                    >
                                        <span className="font-semibold text-gray-900 text-sm pr-4">
                                            {item.q}
                                        </span>
                                        {openFaq === i ? (
                                            <Minus className="w-4 h-4 text-[#005b57] shrink-0" />
                                        ) : (
                                            <Plus className="w-4 h-4 text-gray-400 shrink-0" />
                                        )}
                                    </button>
                                    <AnimatePresence>
                                        {openFaq === i && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <p className="px-5 pb-5 text-sm text-gray-600 leading-relaxed">
                                                    {item.a}
                                                </p>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </FadeIn>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Bottom CTA ── */}
            <section className="py-20 sm:py-24 bg-[#002e2c] text-white">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-3xl">
                    <FadeIn>
                        <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                            Your Recovery Starts Here
                        </h2>
                        <p className="text-gray-300 mb-8 max-w-xl mx-auto">
                            Stop living with pain. Get matched with a verified
                            physiotherapist, see transparent pricing, and start your recovery
                            — all in under 2 minutes.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Link
                                href="/start-treatment"
                                className="group bg-white text-[#005b57] font-bold py-3.5 px-8 rounded-full inline-flex items-center justify-center gap-2 transition-all hover:scale-105"
                            >
                                Start Treatment Now
                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                            </Link>
                            <Link
                                href="/about"
                                className="border-2 border-white/30 text-white font-semibold py-3.5 px-8 rounded-full inline-flex items-center justify-center transition-all hover:bg-white/10"
                            >
                                Learn About Us
                            </Link>
                        </div>
                    </FadeIn>
                </div>
            </section>
        </div>
    );
}
