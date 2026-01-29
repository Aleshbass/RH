'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function PhysiotherapistSettingsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to profile settings by default
    router.replace('/dashboard/physiotherapist/settings/profile');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
        <p className="text-gray-400">Loading settings...</p>
      </div>
    </div>
  );
}