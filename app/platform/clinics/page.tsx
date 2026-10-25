"use client";

import PlatformPageLayout, { type PlatformFeature } from "@/components/platform/PlatformPageLayout";
import { MARKETING_VIDEOS } from "@/lib/marketingVideos";

const FEATURES: PlatformFeature[] = [
  { title: "Guided clinic setup", description: "Create your clinic profile in a few guided steps." },
  { title: "Staff roles", description: "Invite your clinicians and choose which pages each role can open." },
  { title: "Assign patients", description: "Give each patient to the right clinician, and reassign when you need to." },
  { title: "Team appointments", description: "See every appointment across your clinic in one place." },
  { title: "Invoices and payouts", description: "Invoice patients and keep track of what your clinic is paid." },
  { title: "Monthly reports", description: "Revenue, visits, patients and team numbers at a glance." },
];

export default function ClinicsPage() {
  return (
    <PlatformPageLayout
      title="Your team, patients and payments in one place."
      description="Set up your clinic, bring in your clinicians and keep every appointment and invoice together."
      features={FEATURES}
      featuresTitle="What your clinic gets"
      ctaText="Register your clinic"
      ctaLink="/sign-up?as=clinic_owner"
      videoUrl={MARKETING_VIDEOS.clinic}
      videoTitle="Rehabify for clinics"
      image={{
        src: "https://res.cloudinary.com/dubeogufg/image/upload/f_auto,q_auto/v1741105204/IMG_6328_a4bxtu.png",
        alt: "A physiotherapist treating a patient in a clinic",
        unoptimized: true,
      }}
      closingTitle="Bring your clinic onto Rehabify."
      closingText="Register your clinic, or talk to our team first."
    />
  );
}
