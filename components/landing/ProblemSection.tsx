"use client";

import { motion } from "framer-motion";

export function ProblemSection() {
    return (
        <section className="py-20 sm:py-24 bg-white">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-4xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#005b57] mb-4">
                            The Problem We&apos;re Solving
                        </span>
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-tight mb-6">
                            Stuck between pain and expensive treatment?
                        </h2>
                        <p className="text-lg md:text-xl text-gray-600 leading-relaxed mb-10">
                            You&apos;re not alone. Most Nigerians with back pain, sports injuries, or post-surgery needs face the same impossible choice:
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
                        {[
                            { emoji: "💸", text: "Spend expensively on private clinic visits" },
                            { emoji: "🏥", text: "Wait 2-6 weeks for hospital appointments" },
                            { emoji: "😣", text: "Just live with the pain" },
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: i * 0.1 }}
                                className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center"
                            >
                                <div className="text-3xl mb-3">{item.emoji}</div>
                                <p className="text-sm font-semibold text-red-700">{item.text}</p>
                            </motion.div>
                        ))}
                    </div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="bg-[#002e2c] rounded-2xl px-8 py-6 inline-block"
                    >
                        <p className="text-xl font-bold text-white">
                            There&apos;s a better way. ✓
                        </p>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
