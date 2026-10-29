import { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partner & Referral Portal | Rehabify Health",
  description:
    "Partner Portal for referring doctors, HMOs, hospitals, clinics and developers: refer patients, track their care, configure API keys and monitor webhooks.",
  keywords: [
    "Rehabify Partner Portal",
    "Physiotherapy API",
    "HMO Referrals",
    "Hospital Integration",
    "Developer Dashboard",
  ],
  // Signed-in partner workspace: keep it out of search results (the public page is /partnerships)
  robots: { index: false, follow: false },
};

export default function PartnerPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-rh-canvas text-rh-ink selection:bg-rh-lime selection:text-rh-ink font-sans antialiased">
      {children}
    </div>
  );
}
