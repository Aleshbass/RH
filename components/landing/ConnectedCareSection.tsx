"use client";
import React from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { WobbleCard } from "../ui/wobble-card";
import { NavbarButton } from "../ui/resizable-navbar";

const ConnectedCareSection = () => {
  return (
    <section className="py-20 sm:py-24 bg-[#FAF6E7]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <WobbleCard
          containerClassName="rounded-3xl"
          className="bg-[#002e2c]"
        >
          <div className="flex flex-col lg:flex-row items-center justify-between gap-12 p-4 md:p-8">
            {/* Left side: Text content */}
            <div className="lg:w-1/2 text-center lg:text-left">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white font-sans mb-6">
                One Platform. Seamless Collaboration. Better Outcomes.
              </h2>
              <p className="text-lg text-gray-300 font-sans mb-10">
                Rehabify bridges the gap between clinic administration, physiotherapy expertise, and patient engagement. Our integrated ecosystem ensures everyone is connected, informed, and working towards the same goal: successful rehabilitation.
              </p>
              <NavbarButton
                href="/sign-up"
                variant="secondary"
                className="group bg-white hover:bg-gray-200 text-[#002e2c] font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-full inline-flex items-center transition-all duration-300 transform hover:scale-105"
              >
                <span className="mr-2">Get Started</span>
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </NavbarButton>
            </div>

            {/* Right side: Image */}
            <div className="lg:w-1/2 flex justify-center items-center mt-8 lg:mt-0">
              <Image
                src="/logos/images/physio-dashboard.webp"
                alt="Physiotherapist Dashboard - Rehabify Platform"
                width={600}
                height={400}
                className="rounded-lg shadow-2xl object-cover w-full h-auto"
              />
            </div>
          </div>
        </WobbleCard>
      </div>
    </section>
  );
};

export default ConnectedCareSection;
