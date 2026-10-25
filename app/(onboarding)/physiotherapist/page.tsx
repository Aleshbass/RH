'use client';

import { Suspense } from 'react';
import PhysiotherapistOnboardingWizard from '@/components/onboarding/physiotherapist/PhysiotherapistOnboardingWizard';

export default function PhysiotherapistOnboardingPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-rh-canvas text-rh-ink/60">Loading onboarding...</div>}>
            <PhysiotherapistOnboardingWizard />
        </Suspense>
    );
}
