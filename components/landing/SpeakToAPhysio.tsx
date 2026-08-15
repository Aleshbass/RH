"use client";

import { motion } from "framer-motion";

const conditions = [
    "Back Pain & Neck Stiffness",
    "Sports Injuries & Recovery",
    "Post-Surgery Rehabilitation",
    "Stroke Recovery & Neuro Cases",
    "Arthritis & Joint Pain",
    "Pregnancy-Related Pain",
    "Work-Related Injuries",
    "Posture Correction",
    "Chronic Pain Management",
    "Mobility After Accidents",
];

const getWhatsAppUrl = (condition?: string) => {
    const text = condition 
        ? `Hi! 👋🏾\nI need help with physiotherapy for: ${condition}. Can you match me with a specialist?`
        : `Hi! 👋🏾\nI'd like to speak with a verified physiotherapist. Can you help me get started?`;
    return `https://wa.me/2348061525811?text=${encodeURIComponent(text)}`;
};

export function SpeakToAPhysio() {
    return (
        <section className="py-20 sm:py-24 bg-[#002e2c]">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-4xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <span className="inline-block text-xs font-bold uppercase tracking-widest text-green-400 mb-4">
                            We Can Help
                        </span>
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
                            Speak to a Physio For:
                        </h2>
                        <p className="text-gray-400 mb-10">
                            Whatever you&apos;re dealing with, our verified physiotherapists have seen it before and treated it successfully.
                        </p>
                    </motion.div>

                    <div className="flex flex-wrap justify-center gap-3 mb-12">
                        {conditions.map((condition, i) => (
                            <motion.div
                                key={condition}
                                initial={{ opacity: 0, scale: 0.9 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.3, delay: i * 0.05 }}
                            >
                                <a
                                    href={getWhatsAppUrl(condition)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 text-white text-sm font-medium px-5 py-2.5 rounded-full transition-all duration-200 hover:scale-105 cursor-pointer"
                                >
                                    {condition}
                                </a>
                            </motion.div>
                        ))}
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                    >
                        <a
                            href={getWhatsAppUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 px-10 rounded-full transition-all duration-300 hover:scale-105 shadow-lg shadow-emerald-500/30"
                        >
                            Find Your Physio on WhatsApp
                        </a>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
