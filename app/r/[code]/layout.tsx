import { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rehabify Health — Partner Referral",
  description:
    "Get matched with a verified physiotherapist. Fast access to rehabilitation care through your health partner.",
  // Personal referral links must not be indexed (crawler visits would also skew link stats).
  robots: { index: false, follow: false },
};

export default function ReferralLandingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-teal-500 selection:text-white">
      {children}
    </div>
  );
}
