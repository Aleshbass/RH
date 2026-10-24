import { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partner Portal | Rehabify Health Developer & Hospital Dashboard",
  description:
    "Enterprise Partner Portal for HMOs, hospitals, clinics, and developers to manage patient referrals, track care journeys, configure API keys, and monitor webhooks.",
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
    <div className="min-h-screen bg-[#FAF6E7] text-[#002e2c] selection:bg-[#005b57] selection:text-white font-sans antialiased">
      {children}
    </div>
  );
}
