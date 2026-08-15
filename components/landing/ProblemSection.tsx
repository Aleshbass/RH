"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const WHATSAPP_URL = `https://wa.me/2348061525811?text=${encodeURIComponent("Hi Joy! 👋🏾 I need help with my recovery.")}`;

const STATS = [
  {
    value: "235M",
    label: "Nigerians",
    detail: "with limited access to rehab care",
  },
  {
    value: "<2,500",
    label: "Physiotherapists",
    detail: "serving the entire country",
  },
  {
    value: "6 weeks",
    label: "Average wait",
    detail: "for a hospital appointment",
  },
  {
    value: "60%",
    label: "Turn to painkillers",
    detail: "instead of getting treated",
  },
];

export function ProblemSection() {
  return (
    <section className="relative overflow-hidden bg-[#0a0f0d]" id="the-reality">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row min-h-[600px] lg:min-h-[680px]">

          {/* ── Left/Top: Content ── */}
          <div className="w-full lg:w-[54%] flex flex-col justify-center px-6 sm:px-10 lg:px-16 py-14 sm:py-16 lg:py-20 z-10">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 text-sm font-medium tracking-wide uppercase">
                  The Reality
                </span>
              </div>

              {/* Heading — concise */}
              <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-white mb-5 tracking-tight leading-[1.15] font-cal">
                Pain shouldn&apos;t be{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  a life sentence.
                </span>
              </h2>

              <p className="text-gray-400 text-base sm:text-lg leading-relaxed mb-8 sm:mb-10 max-w-lg">
                Millions lack access to physiotherapy — not because solutions don&apos;t exist, but because they can&apos;t reach them.
              </p>
            </motion.div>

            {/* ── Stats Grid ── */}
            <div className="grid grid-cols-2 gap-x-6 sm:gap-x-8 gap-y-6 sm:gap-y-8 mb-8 sm:mb-10">
              {STATS.map((stat, idx) => (
                <motion.div
                  key={stat.value}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.15 + idx * 0.1 }}
                  className="group"
                >
                  <p className="text-3xl sm:text-4xl font-bold text-emerald-400 mb-1 tracking-tight group-hover:text-emerald-300 transition-colors">
                    {stat.value}
                  </p>
                  <p className="text-white font-semibold text-sm mb-0.5">
                    {stat.label}
                  </p>
                  <p className="text-gray-500 text-xs leading-snug">
                    {stat.detail}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.5 }}
            >
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 px-7 rounded-full transition-all duration-300 shadow-lg shadow-emerald-900/30 hover:shadow-emerald-900/40 transform hover:-translate-y-0.5"
              >
                <span>Get Help Today</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
              </a>
            </motion.div>
          </div>

          {/* ── Right/Bottom: Image with Smooth Blend Gradient ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative w-full lg:w-[46%] min-h-[380px] sm:min-h-[460px] lg:min-h-full overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://res.cloudinary.com/dubeogufg/image/upload/f_auto,q_auto/v1741105202/IMG_6328_a4bxtu.png"
              alt="Rehabify physiotherapist providing care to a patient"
              className="absolute inset-0 w-full h-full object-cover object-center"
              loading="eager"
            />
            {/* Gradient overlays to smoothly blend with #0a0f0d dark background on all edges */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f0d] via-transparent to-[#0a0f0d]/60 lg:bg-gradient-to-r lg:from-[#0a0f0d] lg:via-transparent lg:to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0f0d] via-transparent to-[#0a0f0d] lg:hidden" />

            {/* Floating badge on image */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="absolute bottom-8 left-6 right-6"
            >
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl px-5 py-4 shadow-xl">
                <p className="text-white font-semibold text-base sm:text-lg leading-snug">
                  Real care. Real therapists.
                  <span className="text-emerald-400"> Real recovery.</span>
                </p>
              </div>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
