'use client';

import { motion } from 'framer-motion';
import { MessageCircleQuestion, Zap, CalendarCheck, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const steps = [
    {
        id: 1,
        number: '01',
        title: 'Tell us what hurts',
        description: 'Quick 60-second questionnaire about your condition, location, and needs.',
        icon: MessageCircleQuestion,
    },
    {
        id: 2,
        number: '02',
        title: 'We match you instantly',
        description: 'Our smart algorithm finds verified physiotherapists near you who specialise in exactly what you need.',
        icon: Zap,
    },
    {
        id: 3,
        number: '03',
        title: 'Book and recover',
        description: 'Choose your physio, book sessions (or save with packages), and track your progress digitally. Your physio gets updates. You get better.',
        icon: CalendarCheck,
    },
];

export function HowItWorks() {
    return (
        <section id="how-it-works" className="py-24 bg-white relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none">
                <div className="absolute top-20 left-10 w-72 h-72 bg-green-50 rounded-full blur-3xl opacity-50" />
                <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-50" />
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                {/* Header */}
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight mb-6">
                            How Rehabify <span className="text-[#005b57]">Works</span>
                        </h2>
                        <p className="text-lg text-gray-600 mb-8">
                            Three simple steps to get you on the path to recovery. No waiting lists, no confusion, just care.
                        </p>
                    </motion.div>
                </div>

                {/* Steps */}
                <div className="relative max-w-5xl mx-auto">
                    {/* Connecting Line (Desktop) */}
                    <div className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-gray-100 -z-10">
                        <motion.div
                            initial={{ scaleX: 0, originX: 0 }}
                            whileInView={{ scaleX: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 1, delay: 0.5 }}
                            className="h-full bg-gradient-to-r from-transparent via-[#005b57]/20 to-transparent"
                        />
                    </div>

                    <div className="relative">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
                            className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8"
                        >
                            {steps.map((step) => (
                                <div
                                    key={step.id}
                                    className="relative group"
                                >
                                    {/* Step Number Badge */}
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#005b57] px-4 py-1.5 rounded-full text-xs font-bold text-white z-20 shadow-md">
                                        {step.number}
                                    </div>

                                    {/* Card */}
                                    <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all duration-300 h-full text-center group-hover:-translate-y-1">
                                        <div className="w-16 h-16 mx-auto bg-[#e6f0ef] rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                            <step.icon className="w-8 h-8 text-[#005b57]" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                                        <p className="text-gray-600 leading-relaxed">{step.description}</p>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    </div>

                    {/* CTA */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="text-center mt-12"
                    >
                        <Link href="/start-treatment" className="group inline-flex items-center gap-2 bg-[#005b57] hover:bg-[#004a46] text-white font-semibold py-3.5 px-8 rounded-full transition-all duration-300 transform hover:scale-105 shadow-lg shadow-[#005b57]/20">
                            <span>Get Matched Now</span>
                            <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
                        </Link>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
