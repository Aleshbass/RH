"use client";
import React from "react";
import { motion } from "framer-motion";
import {
  BadgePercent,
  ShieldCheck,
  Clock,
  Activity,
  Package,
  Stethoscope,
} from "lucide-react";

const benefits = [
  {
    title: "40-60% Cheaper",
    description: "Fair, transparent pricing based on your location, condition complexity, and provider experience.",
    icon: BadgePercent,
    color: "bg-green-50 text-green-600",
  },
  {
    title: "Verified Physiotherapists Only",
    description: "Every provider passes our 3-tier verification: document check, clinical interview, and peer review. Licensed by MRTBN, experienced, and rated by real patients.",
    icon: ShieldCheck,
    color: "bg-blue-50 text-blue-600",
  },
  {
    title: "Book in Under 24 Hours",
    description: "No more 2-6 week hospital waiting lists. Get matched today, start treatment immediately.",
    icon: Clock,
    color: "bg-orange-50 text-orange-600",
  },
  {
    title: "Track Your Recovery",
    description: "Digital progress tracking, exercise videos, session notes, and direct messaging with your physiotherapist — all in one place.",
    icon: Activity,
    color: "bg-purple-50 text-purple-600",
  },
  {
    title: "Packages That Save You Money",
    description: "Book 4-8 sessions together and save. Prepay, lock in your schedule, and focus on getting better.",
    icon: Package,
    color: "bg-yellow-50 text-yellow-700",
  },
  {
    title: "For Physiotherapists Too",
    description: "Turn your empty calendar into a thriving practice. Get consistent patient referrals, practice management tools, and full pricing control.",
    icon: Stethoscope,
    color: "bg-pink-50 text-pink-600",
  },
];

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
            Why Patients Choose Rehabify
          </h2>
          <p className="mt-4 text-lg md:text-xl text-gray-700 max-w-3xl mx-auto font-sans">
            We&apos;re solving the impossible choice between expensive treatment and living with pain. Here&apos;s how.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <div className={`w-14 h-14 rounded-xl ${benefit.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <benefit.icon className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-3 group-hover:text-[#005b57] transition-colors">
                {benefit.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {benefit.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RoleBasedFeatures;
