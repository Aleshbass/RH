'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RehabifyLoader } from '@/components/brand/RehabifyLoader';

/**
 * Older invitation links used /clinic-invite. Every clinic invitation is now handled
 * by /staff-invite, which signs the person in, accepts, and opens the clinic dashboard.
 */
export default function ClinicInviteRedirect() {
  const params = useParams();
  const router = useRouter();
  const code = params?.code as string | undefined;

  useEffect(() => {
    if (code) router.replace(`/staff-invite/${encodeURIComponent(code)}`);
  }, [code, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <RehabifyLoader size={64} label="Opening invitation" />
    </div>
  );
}
