"use client";

import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import dynamicImport from "next/dynamic";

import { LandingHero } from "@/components/landing/hero";
import { FoundersCarousel } from "@/components/landing/FoundersCarousel";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { TrustSafety } from "@/components/landing/TrustSafety";
import { HomePageSEO } from "@/components/seo/HomePageSEO";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { DoctorsClinicsSection } from "@/components/landing/DoctorsClinicsSection";
import { SpeakToAPhysio } from "@/components/landing/SpeakToAPhysio";

const RoleBasedFeatures = dynamicImport(() => import("@/components/landing/RoleBasedFeatures"));
const ConnectedCareSection = dynamicImport(() => import("@/components/landing/ConnectedCareSection"));
const RehabifyLearnSection = dynamicImport(
  () => import("@/components/landing/RehabifyLearnSection").then(m => m.RehabifyLearnSection)
);
const FAQ = dynamicImport(() => import('@/components/landing/FAQ'));

export const dynamic = 'force-static';

const PageContent = () => (
  <div className="-mt-12 sm:-mt-16 w-full">
    <LandingHero />
    <ProblemSection />
    <HowItWorks />
    <RoleBasedFeatures />
    <ConnectedCareSection />
    <DoctorsClinicsSection />
    <FoundersCarousel />
    <SpeakToAPhysio />
    <RehabifyLearnSection />
    <TrustSafety />
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
