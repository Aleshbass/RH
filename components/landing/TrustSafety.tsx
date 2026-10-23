'use client';

import { motion } from 'framer-motion';
import { ShieldCheck, Lock, CreditCard, Headphones } from '@/components/icons';

const features = [
    {
        title: 'Verified Specialists',
        description: 'Every physiotherapist on our platform undergoes a rigorous verification process to ensure you receive top-tier care.',
        icon: ShieldCheck,
        color: 'bg-blue-50 text-blue-600',
    },
    {
        title: 'Secure Payments',
        description: 'Transactions are processed securely via Paystack, with bank-grade encryption protecting your financial data.',
        icon: CreditCard,
        color: 'bg-green-50 text-green-600',
    },
    {
        title: 'Data Privacy',
        description: 'Your health information is encrypted and stored securely, adhering to strict data privacy standards.',
        icon: Lock,
        color: 'bg-purple-50 text-purple-600',
    },
    {
        title: '24/7 Support',
        description: 'Our dedicated support team is always available to assist you with bookings, payments, or any inquiries.',
        icon: Headphones,
        color: 'bg-orange-50 text-orange-600',
    },
];

export function TrustSafety() {
    return (
        <section className="py-24 bg-white relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(#005b57_1px,transparent_1px)] [background-size:20px_20px]" />
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#005b57]/[0.06] border border-[#005b57]/15 mb-6">
                            <ShieldCheck className="w-4 h-4 text-[#005b57]" />
                            <span className="text-xs font-semibold text-[#005b57] tracking-wide uppercase">Safety First</span>
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
                            Your Trust is Our <span className="text-[#005b57]">Priority</span>
                        </h2>
                        <p className="text-lg text-gray-600">
                            We've built a secure ecosystem where you can focus on recovery while we handle the rest with industry-leading standards.
                        </p>
                    </motion.div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {features.map((feature, index) => (
                        <motion.div
                            key={feature.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="group relative bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1"
                        >
                            <div className={`w-14 h-14 rounded-xl ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                                <feature.icon className="w-7 h-7" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-3 group-hover:text-[#005b57] transition-colors">
                                {feature.title}
                            </h3>
                            <p className="text-sm text-gray-600 leading-relaxed">
                                {feature.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
