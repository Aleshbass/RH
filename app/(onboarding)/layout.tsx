import type { Metadata } from 'next';
import { NOINDEX_METADATA } from '@/lib/seo/utils';

// Sign-up steps (/physiotherapist, /patient, /doctor, /clinic-owner, /role-selection...) are per-user forms.
export const metadata: Metadata = NOINDEX_METADATA;

export default function OnboardingGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
