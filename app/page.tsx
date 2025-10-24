"use client";

import { Authenticated, Unauthenticated } from "convex/react";
import dynamicImport from "next/dynamic";

import { LandingHero } from "@/components/landing/hero";
import { HomePageSEO } from "@/components/seo/HomePageSEO";

const RoleBasedFeatures = dynamicImport(() => import("@/components/landing/RoleBasedFeatures"));
const ConnectedCareSection = dynamicImport(() => import("@/components/landing/ConnectedCareSection"));
const RehabifyLearnSection = dynamicImport(
  () => import("@/components/landing/RehabifyLearnSection").then(m => m.RehabifyLearnSection)
);
const FAQ = dynamicImport(() => import('@/components/landing/FAQ'));

export const dynamic = 'force-static';


export default function Home() {
  return (
    <>
      <HomePageSEO />
      <main className="flex min-h-screen flex-col w-full">
        <Authenticated>
          <div className="-mt-12 sm:-mt-16 w-full"> {/* Negative margin to offset header */}
            <LandingHero />
            <ConnectedCareSection />
            <RoleBasedFeatures />
            <RehabifyLearnSection />
            <FAQ />
          </div>
        </Authenticated>
        
        <Unauthenticated>
          {/* Show the landing page for unauthenticated users */}
          <div className="-mt-12 sm:-mt-16 w-full"> {/* Negative margin to offset header */}
            <LandingHero />
            <ConnectedCareSection />
            <RoleBasedFeatures />
            <RehabifyLearnSection />
            <FAQ />
          </div>
        </Unauthenticated>
      </main>
    </>
  );
}
