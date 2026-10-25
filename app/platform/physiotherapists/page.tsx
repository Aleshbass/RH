"use client";

import PlatformPageLayout, { type PlatformFeature } from "@/components/platform/PlatformPageLayout";
import { MARKETING_VIDEOS } from "@/lib/marketingVideos";

const FEATURES: PlatformFeature[] = [
  { title: "Patients matched to you", description: "We match patients to you, with no marketing costs." },
  { title: "Patient workspace", description: "History, SOAP notes and the care plan for each patient in one place." },
  { title: "Care plan templates", description: "Start a care plan from one of your saved templates." },
  { title: "3D exercise library", description: "Build exercise programmes your patients follow with 3D demonstrations." },
  { title: "Video calls and messages", description: "See patients online and stay in touch between visits." },
  { title: "Calendar and availability", description: "Set your working hours and see your week at a glance." },
  { title: "Invoices and fixed payouts", description: "Invoice at Rehabify's standard prices and earn a fixed payout per completed session." },
  { title: "MSK Specialist Program", description: "Sharpen your MSK skills in our live, cohort-based course." },
];

export default function PhysiotherapistsPage() {
  return (
    <PlatformPageLayout
      title="More space for the care you give."
      description="Rehabify matches you with patients and gives you the tools to treat them, follow up and get paid."
      features={FEATURES}
      featuresTitle="What you get with Rehabify"
      ctaText="Join as a physio"
      ctaLink="/sign-up?as=physiotherapist"
      videoUrl={MARKETING_VIDEOS.physiotherapist}
      videoTitle="Rehabify for physiotherapists"
      image={{
        src: "/logos/images/Group 469272.webp",
        alt: "A Rehabify physiotherapist coaching a patient through an exercise",
        position: "center 18%",
      }}
      closingTitle="Join Rehabify's care network."
      closingText="Apply online. We review every application before you start seeing patients."
    />
  );
}
