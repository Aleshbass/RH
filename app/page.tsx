"use client";

import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import dynamicImport from "next/dynamic";

import { LandingHero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { TrustSafety } from "@/components/landing/TrustSafety";
import { HomePageSEO } from "@/components/seo/HomePageSEO";
import { DoctorsClinicsSection } from "@/components/landing/DoctorsClinicsSection";
import { ClinicOnboardingSection } from "@/components/landing/ClinicOnboardingSection";
import { SpeakToAPhysio } from "@/components/landing/SpeakToAPhysio";
import { ForInstitutionsSection } from "@/components/landing/ForInstitutionsSection";
import { MediloanBanner } from "@/components/landing/MediloanBanner";
import { MskProgramSection } from "@/components/landing/MskProgramSection";

const RoleBasedFeatures = dynamicImport(() => import("@/components/landing/RoleBasedFeatures"));
const ConnectedCareSection = dynamicImport(() => import("@/components/landing/ConnectedCareSection"));
const FAQ = dynamicImport(() => import('@/components/landing/FAQ'));

export const dynamic = 'force-static';

const PageContent = () => (
  <div className="-mt-12 sm:-mt-16 w-full">
    <LandingHero />
    {/* Only shows while an admin has an MSK Specialist cohort live (Admin › Learn) */}
    <MskProgramSection />
    <SpeakToAPhysio />
    <MediloanBanner />
    <HowItWorks />
    <RoleBasedFeatures />
    <ConnectedCareSection />
    <DoctorsClinicsSection />
    <ClinicOnboardingSection />
    <ForInstitutionsSection />
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
