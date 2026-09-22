"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function MediloanBanner() {
  return (
    <section className="py-16 sm:py-20 bg-gradient-to-b from-[#0a0f0d] to-[#0d1a14] relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(16,185,129,0.08)_0%,transparent_60%)]" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-emerald-400 mb-4">
            Healthcare Financing Partner
          </span>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
            Get Treated Now,{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Pay Later
            </span>
          </h2>

          <p className="text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed mb-8">
            Don&apos;t let cost delay your recovery. Through our partner{" "}
            <span className="text-emerald-400 font-semibold">MediLoan</span>,
            you can access physiotherapy treatment now and pay at your own pace.
          </p>

          <Link
            href="/payment"
            className="group inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 px-8 rounded-full transition-all duration-300 shadow-lg shadow-emerald-900/30 hover:shadow-emerald-900/40 transform hover:-translate-y-0.5"
          >
            <span>Learn More About Financing</span>
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
