"use client";

import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import dynamicImport from "next/dynamic";

import { LandingHero } from "@/components/landing/hero";
import { ProofBand } from "@/components/landing/ProofBand";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { HomePageSEO } from "@/components/seo/HomePageSEO";
import { SpeakToAPhysio } from "@/components/landing/SpeakToAPhysio";
import { WhyRehabify } from "@/components/landing/WhyRehabify";
import { CareFormatSection } from "@/components/landing/CareFormatSection";
import { CostSection } from "@/components/landing/CostSection";
import { MskProgramSection } from "@/components/landing/MskProgramSection";

const PracticeTools = dynamicImport(() => import("@/components/landing/PracticeTools").then((m) => m.PracticeTools));
const FAQ = dynamicImport(() => import('@/components/landing/FAQ'));

export const dynamic = 'force-static';

// Patient journey first: proof, concerns, how it works, why Rehabify, where care happens, cost, questions.
// Professionals get one section near the end.
const PageContent = () => (
  <div className="-mt-12 sm:-mt-16 w-full bg-rh-canvas">
    <LandingHero />
    {/* Figures, testimonials and partners in one fixed-height band */}
    <ProofBand />
    <SpeakToAPhysio />
    <HowItWorks />
    {/* Deep ink break in the page: two reasons and the patient film */}
    <WhyRehabify />
    <CareFormatSection />
    <CostSection />
    {/* Only shows while an admin has an MSK Specialist cohort live (Admin › Learn) */}
    <MskProgramSection />
    <PracticeTools />
    <FAQ />
  </div>
);

export default function Home() {
  return (
    <>
      <HomePageSEO />
      <main className="flex min-h-screen flex-col w-full">
        <Authenticated>
          <PageContent />
        </Authenticated>

        <Unauthenticated>
          {/* Show the landing page for unauthenticated users */}
          <PageContent />
        </Unauthenticated>

        <AuthLoading>
          <PageContent />
        </AuthLoading>
      </main>
    </>
  );
}
