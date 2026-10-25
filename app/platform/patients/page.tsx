"use client";

import PlatformPageLayout, { type PlatformFeature } from "@/components/platform/PlatformPageLayout";

const FEATURES: PlatformFeature[] = [
  { title: "Talk to Joy", description: "Tell Joy what's wrong on WhatsApp to get started." },
  { title: "A licensed physiotherapist", description: "Every Rehabify physio is licensed by the MRTBN." },
  { title: "Clinic, home or online", description: "See your physio where it suits you, depending on your needs and area." },
  { title: "Exercises with 3D demonstrations", description: "Follow your exercise programme with clear 3D demonstrations." },
  { title: "Your patient portal", description: "See your appointments and message your physio in one place." },
  { title: "Pay later with MediLoan", description: "Spread the cost with MediLoan, subject to approval." },
];

export default function PatientsPage() {
  return (
    <PlatformPageLayout
      title="Start your recovery on WhatsApp."
      description="Tell Joy what hurts and get matched with an MRTBN-licensed physiotherapist, usually within 24 hours."
      features={FEATURES}
      featuresTitle="How Rehabify works for you"
      ctaText="Start your recovery"
      ctaLink="/start-treatment"
      image={{
        src: "/logos/images/Group 469272 (1).webp",
        alt: "A Rehabify physiotherapist treating a patient",
        position: "center 15%",
      }}
      closingTitle="Ready to feel better?"
      closingText="Start today and Joy will guide you through the next steps."
    />
  );
}
