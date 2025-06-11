"use client";
import React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ConnectedCareEcosystem } from "./ConnectedCareEcosystem";
import { BentoGrid, BentoCard } from "../ui/bento-grid";
import {
  Briefcase,
  Stethoscope,
  User,
  Users,
  ImageIcon,
  VideoIcon,
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
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#002e2c] font-pally leading-tight">
            A Platform Built for Everyone
          </h2>
          <p className="mt-4 text-lg md:text-xl text-gray-700 max-w-3xl mx-auto font-pally">
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

// Component for the Physiotherapist card with interchangeable media
const PhysiotherapistCardHeader = () => {
  const [isShowingVideo, setIsShowingVideo] = React.useState(false);

  return (
    <div className="relative w-full h-full">
      <AnimatePresence mode="wait">
        {isShowingVideo ? (
          <motion.video
            key="video"
            src="https://cdn-marketing.acuityscheduling.com/img/marketing/squarespace/v3/frontsite/feature-area/02.mp4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover rounded-xl absolute inset-0"
          />
        ) : (
          <motion.div
            key="image"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full absolute inset-0"
          >
            <Image
              src="https://i.pinimg.com/736x/2a/8f/88/2a8f88505ec66597dd0e7cf79de145bc.jpg"
              alt="Physiotherapist working with a patient"
              layout="fill"
              objectFit="cover"
              className="rounded-xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute bottom-2 right-2 flex space-x-2 z-10">
        <button
          onClick={() => setIsShowingVideo(false)}
          className={`p-2 rounded-full transition-colors backdrop-blur-sm ${
            !isShowingVideo
              ? "bg-white/50 text-black"
              : "bg-black/20 text-white"
          }`}
        >
          <ImageIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => setIsShowingVideo(true)}
          className={`p-2 rounded-full transition-colors backdrop-blur-sm ${
            isShowingVideo
              ? "bg-white/50 text-black"
              : "bg-black/20 text-white"
          }`}
        >
          <VideoIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};



const features = [
  {
    title: "For Clinic Owners",
    description: "Streamline operations with a powerful dashboard for managing your entire practice.",
    header: (
      <Image
        src="https://files.tryflowdrive.com/org-43506c5e-4dec-4c30-bb29-f21a60a6ad91/file-639b768e-e14d-4330-b91f-f442bb521388_form_routing.png"
        alt="Clinic management dashboard"
        width={500}
        height={300}
        className="w-full h-auto object-contain rounded-xl p-4 bg-white/80"
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
        src="https://cdn.sanity.io/images/599r6htc/regionalized/5ee6b7f438fa1f6a463a8c8f27cfa91f24ddb13f-1560x1248.png?w=908&q=75&fit=max&auto=format&dpr=2"
        alt="Patient using a tablet for their rehabilitation"
        width={500}
        height={500}
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
