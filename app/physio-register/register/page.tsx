'use client';

import dynamic from 'next/dynamic';

const PhysioRegisterWizard = dynamic(
    () => import('@/components/physio-register/PhysioRegisterWizard'),
    { ssr: false }
);

export default function PhysioRegisterRegisterPage() {
    return (
        <main className="min-h-screen bg-gradient-to-b from-white via-teal-50/30 to-white pt-24 pb-16">
            <PhysioRegisterWizard />
        </main>
    );
}
