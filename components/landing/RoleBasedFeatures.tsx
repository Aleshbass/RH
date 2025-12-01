"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ConnectedCareEcosystem } from "./ConnectedCareEcosystem";
import { BentoGrid, BentoCard } from "../ui/bento-grid";
import {
  Briefcase,
  Stethoscope,
  User,
  Users,
} from "lucide-react";

const RoleBasedFeatures = () => {
  return (
    <section className="py-20 sm:py-24 bg-[#FAF6E7]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#002e2c] font-sans leading-tight">
            A Platform Built for Everyone
          </h2>
          <p className="mt-4 text-lg md:text-xl text-gray-700 max-w-3xl mx-auto font-sans">
            Rehabify is designed to meet the unique needs of every user in the physiotherapy ecosystem, fostering collaboration and better outcomes.
          </p>
        </motion.div>

        <BentoGrid className="lg:grid-cols-3">
          {features.map((feature, i) => (
            <BentoCard
              key={i}
              title={feature.title}
              description={feature.description}
              header={feature.header}
              icon={feature.icon}
              className={feature.className}
            />
          ))}
        </BentoGrid>
      </div>
    </section>
  );
};

// Component for the Physiotherapist card with video only
const PhysiotherapistCardHeader = () => {
  return (
    <div className="relative w-full h-full">
      <video
        src="https://cdn-marketing.acuityscheduling.com/img/marketing/squarespace/v3/frontsite/feature-area/02.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover rounded-xl"
      />
    </div>
  );
};



const features = [
  {
    title: "For Clinic Owners",
    description: "Streamline operations with a powerful dashboard for managing your entire practice.",
    header: (
      <Image
        src="/logos/images/clnics.webp"
        alt="Clinic management dashboard"
        width={600}
        height={400}
        className="w-full h-auto object-cover rounded-xl"
      />
    ),
    icon: <Briefcase className="h-6 w-6 text-[#005b57]" />,
    className: "lg:col-span-2 bg-green-50",
  },
  {
    title: "For Physiotherapists",
    description: "Deliver exceptional care with tools that streamline exercise prescription.",
    header: <PhysiotherapistCardHeader />,
    icon: <Stethoscope className="h-6 w-6 text-pink-900" />,
    className: "lg:col-span-1 bg-[#FFCFDC]",
  },
  {
    title: "For Patients",
    description: "Engage in your recovery with personalized plans and progress tracking.",
    header: (
      <Image
        src="/logos/images/analytics.webp"
        alt="Patient analytics and progress tracking"
        width={500}
        height={400}
        className="w-full h-full object-cover rounded-xl"
      />
    ),
    icon: <User className="h-6 w-6 text-yellow-900" />,
    className: "lg:col-span-1 bg-[#FFE682]",
  },

  {
    title: "Connected Care Ecosystem",
    description: "A unified platform connecting every stakeholder for seamless collaboration.",
    header: <ConnectedCareEcosystem />,
    icon: <Users className="h-6 w-6 text-teal-900" />,
    className: "lg:col-span-2 bg-[#F1FFE9]",
  },
];

export default RoleBasedFeatures;
