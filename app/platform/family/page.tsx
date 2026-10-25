"use client";

import PlatformPageLayout, { type PlatformFeature } from "@/components/platform/PlatformPageLayout";

const FEATURES: PlatformFeature[] = [
  { title: "Sign up as a caregiver", description: "Tell us who the care is for when you create your account." },
  { title: "Start with Joy", description: "Tell Joy about your loved one on WhatsApp to get started." },
  { title: "A licensed physiotherapist", description: "They're matched with an MRTBN-licensed physio, usually within 24 hours." },
  { title: "Care where it suits them", description: "Clinic, home or online visits, depending on their needs and area." },
  { title: "Updates with their permission", description: "With their consent, Joy can tell you how their care is going." },
  { title: "Pay later with MediLoan", description: "Spread the cost with MediLoan, subject to approval." },
];

export default function FamilyPage() {
  return (
    <PlatformPageLayout
      title="Arrange physio for someone you love."
      description="Set up physiotherapy for a family member and stay involved in their recovery."
      features={FEATURES}
      featuresTitle="How it works for families"
      ctaText="Get started"
      ctaLink="/sign-up?as=family"
      image={{
        src: "/logos/images/platform.jpeg",
        alt: "A physiotherapist working with an older patient in a wheelchair",
        position: "40% center",
      }}
      closingTitle="Arrange care for your loved one."
      closingText="Create a caregiver account, or talk to our team first."
    />
  );
}
