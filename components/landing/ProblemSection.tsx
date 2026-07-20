"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Briefcase, GraduationCap, Pill, Users } from "lucide-react";

const REALITY_CARDS = [
  {
    number: "01",
    title: "Missed work",
    description:
      "Pain forces people off work for days, weeks, sometimes permanently — with no income and no path back.",
    icon: Briefcase,
  },
  {
    number: "02",
    title: "Lost opportunities",
    description:
      "Students miss exams. Traders lose their spot. Breadwinners stay home. The financial cost of untreated pain is invisible but real.",
    icon: GraduationCap,
  },
  {
    number: "03",
    title: "Dependency on medication",
    description:
      "Painkillers, herbs, and local remedies manage the symptom. Nothing fixes the cause. The cycle continues.",
    icon: Pill,
  },
  {
    number: "04",
    title: "No alternatives",
    description:
      "Less than 2,500 physiotherapists for 235 million people. For most Nigerians, specialist care simply does not exist.",
    icon: Users,
  },
];

export function ProblemSection() {
  return (
    <section className="relative py-20 sm:py-28 overflow-hidden" id="the-reality">
      {/* Deep green background — matches MediLoan */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0f0d] via-[#0d1a14] to-[#0a0f0d]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(16,185,129,0.08)_0%,transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(20,184,166,0.06)_0%,transparent_50%)]" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
            <AlertTriangle className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-400 text-sm font-medium tracking-wide uppercase">
              The Reality
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight leading-tight">
            Millions of Nigerians are living in pain.{" "}
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Not because there is no solution.
            </span>{" "}
            <br className="hidden sm:block" />
            Because they cannot reach one.
          </h2>
        </motion.div>

        {/* ── Bento Grid Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {REALITY_CARDS.map((card, idx) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.number}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="group relative bg-[#111916]/60 backdrop-blur-sm border border-emerald-900/30 rounded-2xl p-6 hover:border-emerald-500/40 transition-all duration-300 hover:shadow-[0_0_30px_-10px_rgba(16,185,129,0.15)]"
              >
                {/* Step number watermark */}
                <span className="text-emerald-500/30 text-5xl font-black absolute top-4 right-5 select-none group-hover:text-emerald-500/50 transition-colors">
                  {card.number}
                </span>

                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                  <Icon className="w-5 h-5 text-emerald-400" />
                </div>

                <h3 className="text-white font-semibold text-lg mb-2">
                  {card.title}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {card.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
