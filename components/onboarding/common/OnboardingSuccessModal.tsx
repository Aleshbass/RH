'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ArrowRight, ShieldCheck, FileText, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface OnboardingSuccessModalProps {
    isOpen: boolean;
    userRole: 'physiotherapist' | 'clinic_owner';
    onContinue: () => void;
}

export default function OnboardingSuccessModal({
    isOpen,
    userRole,
    onContinue
}: OnboardingSuccessModalProps) {
    const router = useRouter();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-gray-100"
            >
                <div className="p-8 text-center">
                    <div className="mx-auto mb-6 h-20 w-20 bg-teal-50 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="h-10 w-10 text-teal-600" />
                    </div>

                    <h2 className="text-2xl font-bold text-gray-900 mb-3">
                        Application Submitted!
                    </h2>

                    <p className="text-gray-600 mb-8 leading-relaxed">
                        Thank you for completing your profile. Your account is currently
                        <span className="font-semibold text-teal-700"> under review</span>.
                        Our team is vetting your credentials to ensure the highest standards for Rehabify Health.
                        You will be notified once your account is approved.
                    </p>

                    <div className="bg-gray-50 rounded-xl p-6 mb-8 text-left space-y-4">
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">
                            While you wait
                        </h3>

                        <a href="/payouts-policy" target="_blank" className="flex items-center p-3 bg-white rounded-lg border border-gray-100 hover:border-teal-200 transition-colors group">
                            <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center mr-3 group-hover:bg-blue-100 transition-colors">
                                <CreditCard className="h-4 w-4 text-blue-600" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">Payouts & Payment Policy</p>
                                <p className="text-xs text-gray-500">Learn how you get paid</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-teal-600 transition-colors" />
                        </a>

                        <a href="/privacy-policy" target="_blank" className="flex items-center p-3 bg-white rounded-lg border border-gray-100 hover:border-teal-200 transition-colors group">
                            <div className="h-8 w-8 bg-purple-50 rounded-lg flex items-center justify-center mr-3 group-hover:bg-purple-100 transition-colors">
                                <ShieldCheck className="h-4 w-4 text-purple-600" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">Privacy Policy</p>
                                <p className="text-xs text-gray-500">How we protect your data</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-teal-600 transition-colors" />
                        </a>
                    </div>

                    <Button
                        onClick={onContinue}
                        className="w-full h-12 text-lg bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/20 transition-all"
                    >
                        Explore Platform
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}
