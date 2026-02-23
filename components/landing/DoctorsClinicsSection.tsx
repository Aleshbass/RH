"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const benefits = [
    "One-click referrals (30 seconds, patient gets booking link automatically)",
    "Earn per patient (passive income on every successful referral)",
    "See what happens (outcomes tracking — attended, improved, completed treatment)",
    "Keep patients in your care ecosystem (closed-loop communication)",
];

export function DoctorsClinicsSection() {
    return (
        <section className="py-20 sm:py-24 bg-white">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-6xl mx-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        {/* Left: Text */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
                        >
                            <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#005b57] mb-4">
                                For Doctors &amp; Clinics
                            </span>
                            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-4">
                                Finally, a referral system that actually works
                            </h2>
                            <p className="text-lg text-gray-600 mb-8">
                                Your patients need physiotherapy. You want to help, but you don&apos;t have time to research providers, make calls, or wonder if they ever showed up. Refer through Rehabify:
                            </p>
                            <ul className="space-y-4 mb-10">
                                {benefits.map((benefit, i) => (
                                    <motion.li
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.4, delay: i * 0.08 }}
                                        className="flex items-start gap-3"
                                    >
                                        <div className="mt-1 w-5 h-5 rounded-full bg-[#e6f0ef] flex items-center justify-center shrink-0">
                                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                                <path d="M2 5l2 2 4-4" stroke="#005b57" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                        <span className="text-gray-700">{benefit}</span>
                                    </motion.li>
                                ))}
                            </ul>
                            <Link
                                href="/find-a-physio"
                                className="group inline-flex items-center gap-2 bg-[#002e2c] hover:bg-[#004a46] text-white font-semibold py-3.5 px-8 rounded-full transition-all duration-300 hover:scale-105 shadow-lg shadow-[#002e2c]/20"
                            >
                                <span>Become a Partner</span>
                                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                            </Link>
                        </motion.div>

                        {/* Right: Stats card */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className="flex flex-col gap-5"
                        >
                            {[
                                { stat: "60-90%", label: "of patients self-refer chaotically with no structured pathway" },
                                { stat: "30s", label: "is all it takes to refer a patient through Rehabify" },
                                { stat: "100%", label: "closed-loop feedback — you see if they attended and improved" },
                            ].map((item, i) => (
                                <div
                                    key={i}
                                    className="bg-[#FAF6E7] border border-[#002e2c]/10 rounded-2xl p-6 flex items-center gap-6"
                                >
                                    <div className="text-4xl font-bold text-[#005b57] shrink-0 w-24 text-center">
                                        {item.stat}
                                    </div>
                                    <p className="text-gray-700 text-sm leading-relaxed">{item.label}</p>
                                </div>
                            ))}
                        </motion.div>
                    </div>
                </div>
            </div>
        </section>
    );
}
