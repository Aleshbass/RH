"use client";

import { Authenticated, Unauthenticated } from "convex/react";

import { LandingHero } from "@/components/landing/hero";
import RoleBasedFeatures from "@/components/landing/RoleBasedFeatures";
import ConnectedCareSection from "@/components/landing/ConnectedCareSection";
import { RehabifyLearnSection } from "@/components/landing/RehabifyLearnSection";
import FAQ from '@/components/landing/FAQ';


export default function Home() {
  return (
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
  );
}
