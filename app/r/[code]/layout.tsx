import { ReactNode } from "react";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/utils";

type Props = { params: Promise<{ code: string }> };

// Partner referral links are made to be shared, so they get their own preview (robots.txt lets
// preview bots in). The page names no partner in its preview and is never indexed.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return {
    ...pageMetadata({
      title: "Get matched with a physiotherapist",
      description:
        "Get matched with a verified physiotherapist. Fast access to rehabilitation care through your health partner.",
      path: `/r/${code}`,
    }),
    alternates: null,
    robots: { index: false, follow: false },
  };
}

export default function ReferralLandingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-teal-500 selection:text-white">
      {children}
    </div>
  );
}
