'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowRight, X, FileText, Clock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const incompleteItems = [
    { icon: Shield, label: 'Credentials', description: 'Certification board & license expiry' },
    { icon: Clock, label: 'Availability', description: 'Set your weekly schedule' },
    { icon: FileText, label: 'Documents', description: 'Upload professional documents' },
];

export function OnboardingResumeBanner() {
    const currentUser = useQuery(api.users.getMyUser);
    const [isDismissed, setIsDismissed] = useState(false);
    const router = useRouter();

    // Only show for physiotherapists who skipped onboarding
    if (!currentUser || currentUser.role !== 'physiotherapist' || !currentUser.onboardingSkipped || isDismissed) {
        return null;
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="relative mb-6 rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-sm overflow-hidden"
            >
                {/* Decorative accent */}
                <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-amber-400 to-orange-400 rounded-l-2xl" />

                {/* Dismiss button */}
                <button
                    onClick={() => setIsDismissed(true)}
                    className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    aria-label="Dismiss"
                >
                    <X className="w-4 h-4" />
                </button>

                <div className="pl-3">
                    {/* Header */}
                    <div className="flex items-start gap-3 mb-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-gray-900">
                                Complete Your Profile
                            </h3>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Finish your onboarding to get approved, appear on the marketplace, and start receiving patients.
                            </p>
                        </div>
                    </div>

                    {/* Incomplete items */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                        {incompleteItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <div
                                    key={item.label}
                                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/70 border border-gray-100"
                                >
                                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                                        <Icon className="w-4 h-4 text-amber-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{item.label}</p>
                                        <p className="text-xs text-gray-500 truncate">{item.description}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* CTA buttons */}
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={() => router.push('/physiotherapist?resume=true')}
                            className="bg-amber-500 hover:bg-amber-600 text-white h-10 rounded-xl shadow-sm"
                        >
                            Complete Profile
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                        <button
                            onClick={() => setIsDismissed(true)}
                            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                        >
                            Remind me later
                        </button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
