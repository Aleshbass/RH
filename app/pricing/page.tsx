"use client";

import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, MapPin, Stethoscope, Award, Clock, Sparkles } from "lucide-react";
import Link from "next/link";
import { formatNaira } from "@/lib/pricing";
import { InteractivePricingCalculator } from "@/components/billing/InteractivePricingCalculator";

export default function PricingPage() {
    return (
        <div className="min-h-screen bg-[#FAFAFA]">
            {/* Hero Section */}
            <div className="bg-[#002B29] relative overflow-hidden py-24">
                <div className="absolute inset-0 opacity-10 background-pattern" />
                <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-4xl md:text-6xl font-black text-white mb-6 leading-tight font-display"
                    >
                        Transparent Pricing, <br />
                        <span className="text-teal-400">Tailored to You.</span>
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-teal-50 max-w-2xl mx-auto mb-10"
                    >
                        We calculate a fair, exact session rate based on your location, condition severity, and the physiotherapist's expertise. No hidden fees.
                    </motion.p>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-6 -mt-12 relative z-20">
                <InteractivePricingCalculator />
            </div>

            <div className="max-w-5xl mx-auto px-6 py-10">
                {/* The Formula */}
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-bold text-[#002B29] mb-4">How Your Price is Calculated</h2>
                    <p className="text-gray-600 max-w-2xl mx-auto">
                        Your session rate starts with our national baseline, carefully adjusted to reflect local travel costs and the specialized expertise required for your specific condition.
                    </p>
                </div>

                <div className="grid md:grid-cols-4 gap-4 mb-20">
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
                        <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                            <Clock className="w-6 h-6 text-gray-500" />
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">Base Rate</h3>
                        <p className="text-2xl font-black text-[#005B57] mb-2">₦15,000</p>
                        <p className="text-sm text-gray-500">Standard national baseline for all 60-minute sessions.</p>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center relative">
                        <div className="absolute top-1/2 -right-3 transform -translate-y-1/2 hidden md:block text-2xl text-gray-300 font-light">+</div>
                        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                            <MapPin className="w-6 h-6 text-blue-500" />
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">Location</h3>
                        <p className="text-2xl font-black text-blue-600 mb-2">+₦0 to ₦8k</p>
                        <p className="text-sm text-gray-500">Adjusted for local travel time and transportation costs.</p>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center relative">
                        <div className="absolute top-1/2 -right-3 transform -translate-y-1/2 hidden md:block text-2xl text-gray-300 font-light">+</div>
                        <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                            <Stethoscope className="w-6 h-6 text-red-500" />
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">Condition</h3>
                        <p className="text-2xl font-black text-red-600 mb-2">+₦0 to ₦9k</p>
                        <p className="text-sm text-gray-500">Additional equipment or specialized techniques required.</p>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
                        <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                            <Award className="w-6 h-6 text-purple-500" />
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">Expertise</h3>
                        <p className="text-2xl font-black text-purple-600 mb-2">+₦0 to ₦9k</p>
                        <p className="text-sm text-gray-500">Premium for senior or consultant-level specialists.</p>
                    </div>
                </div>

                {/* Detailed Breakdown */}
                <div className="grid md:grid-cols-3 gap-8 mb-20">
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="bg-blue-50 border-b border-blue-100 p-5">
                            <h3 className="font-bold text-blue-900 text-lg flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-blue-600" />
                                Location Tiers
                            </h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                                <div>
                                    <p className="font-semibold text-gray-900">Premium Locations</p>
                                    <p className="text-xs text-gray-500">Ikoyi, VI, Maitama, Asokoro</p>
                                </div>
                                <span className="font-bold text-blue-600">+₦8,000</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                                <div>
                                    <p className="font-semibold text-gray-900">Major Cities</p>
                                    <p className="text-xs text-gray-500">Lagos Mainland, Abuja Central</p>
                                </div>
                                <span className="font-bold text-blue-600">+₦5,000</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                                <div>
                                    <p className="font-semibold text-gray-900">Secondary Cities</p>
                                    <p className="text-xs text-gray-500">PH, Ibadan, Enugu, Kano</p>
                                </div>
                                <span className="font-bold text-blue-600">+₦2,000</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-semibold text-gray-900">Standard</p>
                                    <p className="text-xs text-gray-500">All other locations</p>
                                </div>
                                <span className="font-bold text-gray-400">+₦0</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="bg-red-50 border-b border-red-100 p-5">
                            <h3 className="font-bold text-red-900 text-lg flex items-center gap-2">
                                <Stethoscope className="w-5 h-5 text-red-600" />
                                Condition Types
                            </h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                                <div>
                                    <p className="font-semibold text-gray-900">Neurological</p>
                                    <p className="text-xs text-gray-500">Stroke, Spinal injury, CP</p>
                                </div>
                                <span className="font-bold text-red-600">+₦9,000</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                                <div>
                                    <p className="font-semibold text-gray-900">Advanced Care</p>
                                    <p className="text-xs text-gray-500">Post-surgery, Complex sports</p>
                                </div>
                                <span className="font-bold text-red-600">+₦4,000</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-semibold text-gray-900">Standard Care</p>
                                    <p className="text-xs text-gray-500">Back pain, Sprains, Arthritis</p>
                                </div>
                                <span className="font-bold text-gray-400">+₦0</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="bg-purple-50 border-b border-purple-100 p-5">
                            <h3 className="font-bold text-purple-900 text-lg flex items-center gap-2">
                                <Award className="w-5 h-5 text-purple-600" />
                                Expertise Levels
                            </h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                                <div>
                                    <p className="font-semibold text-gray-900">Consultant</p>
                                    <p className="text-xs text-gray-500">10+ years & specialist</p>
                                </div>
                                <span className="font-bold text-purple-600">+₦9,000</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                                <div>
                                    <p className="font-semibold text-gray-900">Senior Physio</p>
                                    <p className="text-xs text-gray-500">5-10 years experience</p>
                                </div>
                                <span className="font-bold text-purple-600">+₦7,000</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-semibold text-gray-900">Standard Physio</p>
                                    <p className="text-xs text-gray-500">1-4 years experience</p>
                                </div>
                                <span className="font-bold text-gray-400">+₦0</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Package Discounts */}
                <div className="bg-[#F0F8F7] rounded-3xl p-8 md:p-12 mb-20 flex flex-col md:flex-row items-center gap-10">
                    <div className="flex-1">
                        <div className="inline-flex items-center gap-2 bg-teal-100 text-[#005B57] px-4 py-2 rounded-full font-bold text-sm mb-6">
                            <Sparkles className="w-4 h-4" /> Validated Programs
                        </div>
                        <h2 className="text-3xl font-bold text-[#002e2c] mb-4">
                            Save up to 15% with Treatment Packages
                        </h2>
                        <p className="text-gray-700 mb-8 text-lg">
                            Recovery takes consistency. That's why physiotherapists on Rehabify offer bulk discounts when you commit to a full recovery plan upfront.
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-teal-200/50">
                                <p className="font-bold text-gray-900 uppercase text-xs tracking-wider mb-1">Starter</p>
                                <p className="text-xl font-bold text-[#005B57]">4 Sessions</p>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-teal-200/50 relative overflow-hidden">
                                <div className="absolute top-0 right-0 bg-teal-500 text-[10px] font-black uppercase tracking-wider px-2 py-1 text-white">Popular</div>
                                <p className="font-bold text-gray-900 uppercase text-xs tracking-wider mb-1">Complete</p>
                                <p className="text-xl font-bold text-[#005B57]">8 Sessions</p>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-teal-200/50">
                                <p className="font-bold text-gray-900 uppercase text-xs tracking-wider mb-1">Full Recovery</p>
                                <p className="text-xl font-bold text-[#005B57]">12 Sessions</p>
                            </div>
                        </div>
                    </div>
                    <div className="w-full md:w-1/3 space-y-4">
                        <div className="bg-white rounded-2xl p-6 shadow-sm">
                            <ul className="space-y-3">
                                <li className="flex gap-3 text-sm text-gray-600">
                                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                    <span>Lower per-session cost</span>
                                </li>
                                <li className="flex gap-3 text-sm text-gray-600">
                                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                    <span>Home exercise tracking</span>
                                </li>
                                <li className="flex gap-3 text-sm text-gray-600">
                                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                    <span>Free telehealth check-ins</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Platform Fee Notice */}
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center max-w-2xl mx-auto mb-20">
                    <h4 className="font-bold text-gray-900 mb-2">Our Transparent Booking Fee</h4>
                    <p className="text-sm text-gray-600">
                        In addition to the session rate, a simple ₦1,000 platform fee applies per booking. This covers fast matching, secure payments, video call infrastructure, and our 24/7 support guarantee. There are no hidden subscription costs.
                    </p>
                </div>

                {/* Final CTA Section */}
                <div className="grid md:grid-cols-2 gap-6 items-center">
                    <div className="bg-[#002B29] rounded-3xl p-8 text-center md:text-left flex flex-col items-center md:items-start text-white h-full relative overflow-hidden">
                        <div className="absolute top-0 right-0 opacity-10">
                            <Stethoscope className="w-48 h-48 -mr-10 -mt-10" />
                        </div>
                        <h3 className="text-2xl font-bold mb-3 relative z-10">Ready to start recovery?</h3>
                        <p className="text-teal-100 mb-8 relative z-10">Book an expert physiotherapist to visit your home or clinic today.</p>
                        <Link
                            href="/start-treatment"
                            className="inline-flex items-center justify-center h-12 px-6 rounded-full bg-teal-500 text-white font-bold hover:bg-teal-400 transition-colors mt-auto relative z-10 w-full sm:w-auto"
                        >
                            Book a Session
                        </Link>
                    </div>

                    <div className="bg-teal-50 border border-teal-100 rounded-3xl p-8 text-center md:text-left flex flex-col items-center md:items-start h-full relative overflow-hidden">
                        <div className="absolute bottom-0 right-0 opacity-5">
                            <Award className="w-48 h-48 -mr-10 -mb-10 text-teal-900" />
                        </div>
                        <h3 className="text-2xl font-bold text-[#002B29] mb-3 relative z-10">Are you a physiotherapist?</h3>
                        <p className="text-teal-800 mb-8 relative z-10">Join Rehabify to earn more, manage your sessions, and reach patients across Nigeria.</p>
                        <Link
                            href="/platform/physiotherapists"
                            className="inline-flex items-center justify-center h-12 px-6 rounded-full bg-white text-teal-900 font-bold hover:bg-gray-50 transition-colors border border-gray-200 mt-auto relative z-10 w-full sm:w-auto shadow-sm"
                        >
                            Learn about joining
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
