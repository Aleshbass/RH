'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Search, Calendar, Activity, Stethoscope, CheckCircle, CreditCard, TrendingUp } from 'lucide-react';

const steps = {
    patients: [
        {
            id: 1,
            title: 'Create Your Profile',
            description: 'Sign up in seconds and tell us about your physiotherapy needs.',
            icon: User,
        },
        {
            id: 2,
            title: 'Find a Specialist',
            description: 'Browse verified physiotherapists filtered by location and specialty.',
            icon: Search,
        },
        {
            id: 3,
            title: 'Book & Recover',
            description: 'Schedule appointments and track your recovery journey seamlessly.',
            icon: Activity,
        },
    ],
    physios: [
        {
            id: 1,
            title: 'Join the Network',
            description: 'Create your professional profile and upload your credentials.',
            icon: Stethoscope,
        },
        {
            id: 2,
            title: 'Get Verified',
            description: 'Pass our vetting process to earn the trust of thousands of patients.',
            icon: CheckCircle,
        },
        {
            id: 3,
            title: 'Grow Your Practice',
            description: 'Manage bookings, payments, and patient records all in one place.',
            icon: TrendingUp,
        },
    ],
};

export function HowItWorks() {
    const [activeTab, setActiveTab] = useState<'patients' | 'physios'>('patients');

    return (
        <section className="py-24 bg-white relative overflow-hidden">
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
                            Healthcare Made <span className="text-[#005b57]">Simple</span>
                        </h2>
                        <p className="text-lg text-gray-600 mb-8">
                            Whether you're seeking care or providing it, Rehabify streamlines the entire process so you can focus on what matters most.
                        </p>
                    </motion.div>

                    {/* Toggle */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="inline-flex bg-gray-100 p-1.5 rounded-full relative"
                    >
                        <div className="absolute inset-0 rounded-full pointer-events-none" />
                        <button
                            onClick={() => setActiveTab('patients')}
                            className={`relative px-8 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 z-10 ${activeTab === 'patients' ? 'text-white' : 'text-gray-600 hover:text-gray-900'
                                }`}
                        >
                            {activeTab === 'patients' && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute inset-0 bg-[#005b57] rounded-full shadow-md"
                                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <span className="relative z-10">For Patients</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('physios')}
                            className={`relative px-8 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 z-10 ${activeTab === 'physios' ? 'text-white' : 'text-gray-600 hover:text-gray-900'
                                }`}
                        >
                            {activeTab === 'physios' && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute inset-0 bg-[#005b57] rounded-full shadow-md"
                                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <span className="relative z-10">For Specialists</span>
                        </button>
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
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.5 }}
                                className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8"
                            >
                                {steps[activeTab].map((step) => (
                                    <div
                                        key={step.id}
                                        className="relative group"
                                    >
                                        {/* Step Number Badge */}
                                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-white px-3 py-1 rounded-full border border-gray-100 shadow-sm text-xs font-bold text-[#005b57] z-20">
                                            Step 0{step.id}
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
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </section>
    );
}
