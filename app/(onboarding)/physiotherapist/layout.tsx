'use client';

import { useEffect } from 'react';
import { useOnboardingStore } from '@/stores/onboardingStore';

/**
 * Wraps the physiotherapist application. Sending people who've already applied to the
 * dashboard is handled by the wizard itself, which knows whether a declined applicant is
 * coming back to resubmit.
 */
export default function PhysiotherapistOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data, setRole } = useOnboardingStore();

  useEffect(() => {
    if (!data.role) setRole('physiotherapist');
  }, [data.role, setRole]);

  return (
    <div className="min-h-screen bg-rh-canvas">
      {/* Header is handled by ConditionalLayout globally */}
      <main className="pb-12 pt-24">{children}</main>
    </div>
  );
}
