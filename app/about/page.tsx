"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
    ArrowRight,
    Heart,
    Building2,
    Stethoscope,
    ShieldCheck,
    Users,
    Target,
    Eye,
    Zap,
    CheckCircle2,
    Mail,
    Phone,
    Clock,
    Send,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faXTwitter,
    faLinkedin,
    faInstagram,
    faYoutube,
} from "@fortawesome/free-brands-svg-icons";

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
const broken = [
    {
        num: "1",
        title: "The Referral System Collapsed",
        text: "60-90% of patients self-refer chaotically. Doctors have no structured pathway to send patients to physiotherapists. When referrals happen, it's scribbled phone numbers on prescription pads. Zero feedback on what happens next.",
    },
    {
        num: "2",
        title: "The Workforce Is Leaving",
        text: "A large proportion of Nigerian physiotherapists emigrate. Why? Not just for better pay — but better patient flow.",
    },
    {
        num: "3",
        title: "The Market Can't Clear",
        text: "There is massive demand and a qualified supply, but zero marketplace infrastructure to connect them efficiently. Result: patients suffer with untreated pain, and enormous value evaporates.",
    },
];

const values = [
    {
        icon: Heart,
        title: "Obsessed with patient outcomes",
        text: "Success isn't a completed transaction; it's a patient who gets back to their life.",
    },
    {
        icon: Building2,
        title: "We build infrastructure",
        text: "We're solving the system problem that has existed for decades.",
    },
    {
        icon: Stethoscope,
        title: "Clinical credibility first",
        text: "Every decision — product, partnerships, policy — runs through: 'Would this be good for my patient?'",
    },
    {
        icon: Eye,
        title: "Healthcare transparency",
        text: "Patients and providers both see exactly what they pay and earn.",
    },
    {
        icon: Users,
        title: "Empower providers",
        text: "Physiotherapists set their own rates, control their schedules, and keep ownership of patient relationships.",
    },
];

const differentiators = [
    {
        icon: Stethoscope,
        title: "We're Not Tech Founders Playing in Healthcare",
        text: "We ARE healthcare. We've treated hundreds of patients. We understand patient psychology, provider challenges, and clinical quality because we live it.",
    },
    {
        icon: Target,
        title: "We Fix System Problems, Not Individual Symptoms",
        text: "Other platforms help you 'find a physio.' We're rebuilding the broken referral infrastructure that's kept 70% of Nigerians in untreated pain.",
    },
    {
        icon: ShieldCheck,
        title: "We Verify What Others Can't",
        text: "We built a verification system — documents, clinical interview, and peer review — that actually works at scale.",
    },
];

const clinicalChecks = [
    "Licensed by Medical Rehabilitation Therapists Board of Nigeria (MRTBN)",
    "University-trained with verified degree certificates",
    "Clinically interviewed by our team (we're physiotherapists too)",
    "Peer-reviewed by existing verified providers",
    "Continuously rated by real patients",
    "Required to maintain CPD (Continuing Professional Development)",
];

// ── Page ──────────────────────────────────────────
export default function AboutPage() {
    const [email, setEmail] = useState("");
    const [activeTab, setActiveTab] = useState<"patients" | "physios" | "doctors">("patients");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [subscribeStatus, setSubscribeStatus] = useState<"success" | "error" | null>(null);

    const handleSubscribe = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSubscribeStatus(null);
        // TODO: Replace with real subscribe API
        setTimeout(() => {
            setIsSubmitting(false);
            setSubscribeStatus("success");
            setEmail("");
        }, 1500);
    };

    return (
        <div className="bg-white">
            {/* ── Hero ── */}
            <section className="relative bg-[#002e2c] text-white overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#002e2c] via-[#003d3a] to-[#005b57] opacity-80" />
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-24 sm:py-32 text-center">
                    <FadeIn>
                        <span className="inline-block text-xs font-bold uppercase tracking-widest text-green-400 mb-4">
                            About Rehabify
                        </span>
                        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight max-w-4xl mx-auto mb-6">
                            Transform How You Access Quality Physiotherapy
                        </h1>
                        <p className="text-lg sm:text-xl text-gray-300 max-w-3xl mx-auto">
                            Our mission is to fix Nigeria&apos;s broken healthcare referral
                            system — making quality, affordable physiotherapy accessible to
                            every Nigerian who needs it.
                        </p>
                    </FadeIn>
                </div>
            </section>

            {/* ── The Problem ── */}
            <section className="py-20 sm:py-24 bg-gray-50">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
                    <FadeIn>
                        <div className="text-center mb-14">
                            <span className="text-xs font-bold uppercase tracking-widest text-red-500">
                                The Problem
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
                                60 million Nigerians wake up in pain every day
                            </h2>
                            <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
                                Most never get help because the system to connect them
                                doesn&apos;t work. Here&apos;s what&apos;s broken:
                            </p>
                        </div>
                    </FadeIn>
                    <div className="space-y-6">
                        {broken.map((item, i) => (
                            <FadeIn key={item.num} delay={i * 0.1}>
                                <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 flex gap-5">
                                    <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-lg shrink-0">
                                        {item.num}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg mb-1">
                                            {item.title}
                                        </h3>
                                        <p className="text-gray-600">{item.text}</p>
                                    </div>
                                </div>
                            </FadeIn>
                        ))}
                    </div>
                    <FadeIn delay={0.3}>
                        <div className="text-center mt-10">
                            <div className="inline-block bg-[#002e2c] text-white font-bold py-3 px-8 rounded-full text-lg">
                                We&apos;re fixing this. ✓
                            </div>
                        </div>
                    </FadeIn>
                </div>
            </section>

            {/* ── Our Story ── */}
            <section className="py-20 sm:py-24">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
                    <FadeIn>
                        <span className="text-xs font-bold uppercase tracking-widest text-[#005b57]">
                            Our Story
                        </span>
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2 mb-8">
                            Rehabify&apos;s Story
                        </h2>
                    </FadeIn>
                    <FadeIn delay={0.1}>
                        <div className="prose prose-lg text-gray-600 max-w-none space-y-4">
                            <p>
                                Two Ibadan-trained physiotherapists got sick of watching the same
                                scene play out: A patient with debilitating back pain getting
                                another prescription for painkillers because the doctor
                                didn&apos;t know where to refer them for physiotherapy.
                            </p>
                            <p>
                                Down the hall, the physiotherapy department was half-empty in
                                some places and overburdened in others. The disconnect was
                                absurd.
                            </p>
                            <p>
                                Mary and Abass knew there had to be a better way. They&apos;d
                                spent 10+ years combined treating patients and had seen patients
                                choose pain over clinic fees. The problem was infrastructure.{" "}
                                <strong>So they built it.</strong>
                            </p>
                            <p>
                                Rehabify launched in January 2026 as Nigeria&apos;s first
                                three-sided rehabilitation healthcare platform — connecting{" "}
                                <strong>patients</strong> who need physiotherapy,{" "}
                                <strong>physiotherapists</strong> who need patients, and{" "}
                                <strong>doctors</strong> who need a reliable referral pathway.
                            </p>
                        </div>
                    </FadeIn>
                </div>
            </section>

            {/* ── What Makes Us Different ── */}
            <section className="py-20 sm:py-24 bg-[#FAF6E7]">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
                    <FadeIn>
                        <div className="text-center mb-14">
                            <span className="text-xs font-bold uppercase tracking-widest text-[#005b57]">
                                What Makes Us Different
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
                                Built by clinicians, for clinicians
                            </h2>
                        </div>
                    </FadeIn>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {differentiators.map((item, i) => {
                            const Icon = item.icon;
                            return (
                                <FadeIn key={item.title} delay={i * 0.1}>
                                    <div className="bg-white rounded-2xl p-6 border border-gray-100 h-full">
                                        <div className="w-12 h-12 rounded-xl bg-[#e6f0ef] flex items-center justify-center mb-4">
                                            <Icon className="w-6 h-6 text-[#005b57]" />
                                        </div>
                                        <h3 className="font-bold text-gray-900 mb-2">
                                            {item.title}
                                        </h3>
                                        <p className="text-gray-600 text-sm leading-relaxed">
                                            {item.text}
                                        </p>
                                    </div>
                                </FadeIn>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── Our Values ── */}
            <section className="py-20 sm:py-24">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
                    <FadeIn>
                        <div className="text-center mb-14">
                            <span className="text-xs font-bold uppercase tracking-widest text-[#005b57]">
                                Our Values
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
                                What drives everything we do
                            </h2>
                        </div>
                    </FadeIn>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {values.map((v, i) => {
                            const Icon = v.icon;
                            return (
                                <FadeIn key={v.title} delay={i * 0.08}>
                                    <div className="flex gap-4 p-5 rounded-2xl bg-gray-50 border border-gray-100">
                                        <Icon className="w-5 h-5 text-[#005b57] mt-0.5 shrink-0" />
                                        <div>
                                            <p className="font-semibold text-gray-900 text-sm">
                                                {v.title}
                                            </p>
                                            <p className="text-gray-500 text-sm mt-1">{v.text}</p>
                                        </div>
                                    </div>
                                </FadeIn>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── What We Offer (Tabs) ── */}
            <section className="py-20 sm:py-24 bg-gray-50">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
                    <FadeIn>
                        <div className="text-center mb-10">
                            <span className="text-xs font-bold uppercase tracking-widest text-[#005b57]">
                                What We Offer
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
                                Solutions for everyone in the care chain
                            </h2>
                        </div>
                    </FadeIn>

                    {/* Tab buttons */}
                    <div className="flex justify-center gap-2 mb-8">
                        {(
                            [
                                { key: "patients", label: "For Patients", icon: Heart },
                                { key: "physios", label: "For Physiotherapists", icon: Stethoscope },
                                { key: "doctors", label: "For Doctors", icon: Building2 },
                            ] as const
                        ).map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                aria-label={`Tab: ${label}`}
                                aria-pressed={activeTab === key}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all cursor-pointer ${activeTab === key
                                    ? "bg-[#005b57] text-white shadow-lg shadow-[#005b57]/20"
                                    : "bg-white text-gray-600 border border-gray-200 hover:border-[#005b57]"
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="hidden sm:inline">{label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Tab content */}
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8"
                    >
                        {activeTab === "patients" && (
                            <div className="space-y-4">
                                <h3 className="font-bold text-xl text-gray-900">For Patients</h3>
                                {[
                                    ["Smart Matching", "60-second questionnaire → verified physiotherapist matches → transparent pricing → book in 24 hours"],
                                    ["Fair, Dynamic Pricing", "Pricing based on location, condition complexity, and provider experience."],
                                    ["Progress Tracking", "Digital session notes, exercise videos, objective measurements, recovery timelines — all in one app."],
                                    ["Package Savings", "Book sessions together, save up to 15%, and guarantee your schedule."],
                                ].map(([title, desc]) => (
                                    <div key={title} className="flex gap-3">
                                        <CheckCircle2 className="w-5 h-5 text-[#005b57] mt-0.5 shrink-0" />
                                        <div>
                                            <p className="font-semibold text-gray-900 text-sm">{title}</p>
                                            <p className="text-gray-500 text-sm">{desc}</p>
                                        </div>
                                    </div>
                                ))}
                                <Link href="/start-treatment" className="inline-flex items-center gap-2 text-[#005b57] font-semibold text-sm mt-2 hover:underline">
                                    Start Treatment <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        )}
                        {activeTab === "physios" && (
                            <div className="space-y-4">
                                <h3 className="font-bold text-xl text-gray-900">For Physiotherapists</h3>
                                {[
                                    ["Consistent Patient Flow", "No more marketing costs. Verified referrals matched to your expertise."],
                                    ["Practice Management Suite", "Scheduling, session notes, payment processing, and patient communication — all automated."],
                                    ["Full Pricing Control", "You set your rates, your package discounts, and we match the right patients."],
                                ].map(([title, desc]) => (
                                    <div key={title} className="flex gap-3">
                                        <CheckCircle2 className="w-5 h-5 text-[#005b57] mt-0.5 shrink-0" />
                                        <div>
                                            <p className="font-semibold text-gray-900 text-sm">{title}</p>
                                            <p className="text-gray-500 text-sm">{desc}</p>
                                        </div>
                                    </div>
                                ))}
                                <Link href="/sign-up" className="inline-flex items-center gap-2 text-[#005b57] font-semibold text-sm mt-2 hover:underline">
                                    Join Our Network <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        )}
                        {activeTab === "doctors" && (
                            <div className="space-y-4">
                                <h3 className="font-bold text-xl text-gray-900">For Doctors &amp; Referring Partners</h3>
                                {[
                                    ["30-Second Referral", "Log in → enter patient info → we match them to verified physios → patient gets booking link automatically."],
                                    ["Passive Income", "Earn per patient referred. No overhead, no admin burden."],
                                    ["Closed-Loop Outcomes", "See if your patient attended sessions, completed treatment, and actually got better."],
                                    ["EMR Integration", "Works alongside your existing practice management systems."],
                                ].map(([title, desc]) => (
                                    <div key={title} className="flex gap-3">
                                        <CheckCircle2 className="w-5 h-5 text-[#005b57] mt-0.5 shrink-0" />
                                        <div>
                                            <p className="font-semibold text-gray-900 text-sm">{title}</p>
                                            <p className="text-gray-500 text-sm">{desc}</p>
                                        </div>
                                    </div>
                                ))}
                                <Link href="/sign-up" className="inline-flex items-center gap-2 text-[#005b57] font-semibold text-sm mt-2 hover:underline">
                                    Become a Partner <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        )}
                    </motion.div>
                </div>
            </section>

            {/* ── Partners ── */}
            <section className="py-20 sm:py-24">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
                    <FadeIn>
                        <div className="text-center mb-12">
                            <span className="text-xs font-bold uppercase tracking-widest text-[#005b57]">
                                Our Trusted Partners
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
                                Together, we&apos;re building better healthcare
                            </h2>
                        </div>
                    </FadeIn>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <FadeIn>
                            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center">
                                <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <Zap className="w-7 h-7 text-blue-600" />
                                </div>
                                <h3 className="font-bold text-gray-900">AwaDOC</h3>
                                <p className="text-sm text-gray-500 mt-1">Telemedicine Platform</p>
                                <p className="text-sm text-gray-600 mt-3">
                                    100+ doctors referring patients for physiotherapy rehabilitation
                                </p>
                            </div>
                        </FadeIn>
                        <FadeIn delay={0.1}>
                            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center">
                                <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <Zap className="w-7 h-7 text-purple-600" />
                                </div>
                                <h3 className="font-bold text-gray-900">MyItura</h3>
                                <p className="text-sm text-gray-500 mt-1">Teleconsultation Infrastructure</p>
                                <p className="text-sm text-gray-600 mt-3">
                                    Enabling remote assessments for patients in rural areas
                                </p>
                            </div>
                        </FadeIn>
                    </div>
                </div>
            </section>

            {/* ── Clinical Team ── */}
            <section className="py-20 sm:py-24 bg-[#002e2c] text-white">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
                    <FadeIn>
                        <div className="text-center mb-12">
                            <span className="text-xs font-bold uppercase tracking-widest text-green-400">
                                Quality Standards
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-bold mt-2">
                                Every physiotherapist on Rehabify is:
                            </h2>
                        </div>
                    </FadeIn>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {clinicalChecks.map((check, i) => (
                            <FadeIn key={check} delay={i * 0.06}>
                                <div className="flex items-start gap-3 bg-white/10 rounded-xl p-4">
                                    <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                                    <p className="text-sm text-gray-200">{check}</p>
                                </div>
                            </FadeIn>
                        ))}
                    </div>
                    <FadeIn delay={0.3}>
                        <p className="text-center text-gray-400 mt-8 text-sm">
                            We hold ourselves to the same standards we demand from our
                            network.
                        </p>
                    </FadeIn>
                </div>
            </section>

            {/* ── CTA + Contact ── */}
            <section className="py-20 sm:py-24">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
                    <FadeIn>
                        <div className="text-center mb-12">
                            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
                                Start Your Health Journey Now
                            </h2>
                            <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
                                Whether you&apos;re a patient in pain, a physiotherapist
                                building your practice, or a doctor looking for reliable
                                referral pathways — we&apos;re here.
                            </p>
                            <div className="flex flex-wrap justify-center gap-3 mt-8">
                                <Link
                                    href="/start-treatment"
                                    className="bg-[#005b57] text-white font-semibold py-3 px-6 rounded-full hover:bg-[#004a46] transition-all hover:scale-105"
                                >
                                    Find a Physio
                                </Link>
                                <Link
                                    href="/sign-up"
                                    className="bg-white text-[#005b57] font-semibold py-3 px-6 rounded-full border-2 border-[#005b57] hover:bg-[#005b57] hover:text-white transition-all"
                                >
                                    Join Our Network
                                </Link>
                                <Link
                                    href="/sign-up"
                                    className="bg-white text-[#005b57] font-semibold py-3 px-6 rounded-full border-2 border-[#005b57] hover:bg-[#005b57] hover:text-white transition-all"
                                >
                                    Become a Partner
                                </Link>
                            </div>
                        </div>
                    </FadeIn>

                    {/* Contact grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
                        {[
                            { icon: Phone, label: "Patient Support", value: "+234-810-1157557" },
                            { icon: Mail, label: "Provider Inquiries", value: "partners@rehabify.ng" },
                            { icon: Mail, label: "General Questions", value: "hello@rehabify.ng" },
                            { icon: Clock, label: "Office Hours", value: "Mon-Fri 8AM-6PM WAT" },
                        ].map((item) => {
                            const Icon = item.icon;
                            return (
                                <FadeIn key={item.label}>
                                    <div className="bg-gray-50 rounded-2xl p-5 text-center">
                                        <Icon className="w-5 h-5 text-[#005b57] mx-auto mb-2" />
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                            {item.label}
                                        </p>
                                        <p className="text-sm font-semibold text-gray-900 mt-1">
                                            {item.value}
                                        </p>
                                    </div>
                                </FadeIn>
                            );
                        })}
                    </div>

                    {/* Newsletter */}
                    <FadeIn delay={0.2}>
                        <div className="mt-14 bg-[#FAF6E7] rounded-2xl p-6 sm:p-8 text-center">
                            <h3 className="font-bold text-gray-900 text-lg mb-2">
                                Join Our Community
                            </h3>
                            <p className="text-gray-600 text-sm mb-6 max-w-lg mx-auto">
                                Subscribe for recovery tips, provider spotlights, and
                                healthcare system insights.
                            </p>
                            <form
                                onSubmit={handleSubscribe}
                                className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
                            >
                                <input
                                    type="email"
                                    required
                                    placeholder="your@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isSubmitting}
                                    className="flex-1 px-4 py-3 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] text-sm disabled:opacity-70 disabled:bg-gray-50"
                                />
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="bg-[#005b57] text-white font-semibold px-6 py-3 rounded-full hover:bg-[#004a46] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? (
                                        <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4" />
                                    )}
                                    {isSubmitting ? "Subscribing..." : "Subscribe"}
                                </button>
                            </form>
                            {subscribeStatus === "success" && (
                                <p className="text-sm mt-3 text-green-600 font-medium tracking-wide">
                                    Thanks for subscribing!
                                </p>
                            )}
                            {subscribeStatus === "error" && (
                                <p className="text-sm mt-3 text-red-600 font-medium tracking-wide">
                                    Subscription failed. Please try again.
                                </p>
                            )}
                            <div className="flex justify-center gap-5 mt-6">
                                {[
                                    { icon: faLinkedin, href: "#", label: "LinkedIn" },
                                    { icon: faXTwitter, href: "#", label: "X" },
                                    { icon: faInstagram, href: "#", label: "Instagram" },
                                    { icon: faYoutube, href: "#", label: "YouTube" },
                                ].map((s) => (
                                    <button
                                        key={s.label}
                                        type="button"
                                        aria-label={s.label}
                                        onClick={(e) => { e.preventDefault(); /* TODO: Add real social links */ }}
                                        className="text-gray-400 hover:text-[#005b57] transition-colors cursor-pointer"
                                    >
                                        <FontAwesomeIcon icon={s.icon} size="lg" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </FadeIn>
                </div>
            </section>
        </div>
    );
}
