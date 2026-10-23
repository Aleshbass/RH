'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Building2,
  Users,
  Calendar,
  CreditCard,
  Share2,
  ShieldCheck,
  ArrowRight,
  Eye,
  FileText,
  Clock,
  Zap,
  ChevronRight,
  Check,
  Lock,
  ArrowUpRight
} from '@/components/icons'
import { Button } from '@/components/ui/button'

export function ClinicOnboardingSection() {
  const [activeTab, setActiveTab] = useState<'appointments' | 'ehr' | 'billing'>('appointments')

  const clinicPillars = [
    {
      icon: Users,
      tag: 'EHR & Records',
      title: 'Patient Clinical EHR',
      description: 'Comprehensive medical histories, standardized SOAP assessment templates, attachments, and lifetime care history.',
      pill: 'Paperless Charts',
    },
    {
      icon: Calendar,
      tag: 'Practice Flow',
      title: 'Smart Scheduling',
      description: 'Coordinate clinician caseloads across multiple rooms, manage in-clinic & virtual sessions, and eliminate double-booking.',
      pill: 'SMS & WhatsApp Sync',
    },
    {
      icon: CreditCard,
      tag: 'Instant Settlement',
      title: 'Paystack Net Billing',
      description: 'Issue one-click invoice links with automated 90% net clinic payouts directly into your business bank account.',
      pill: '90% Net Clinic Share',
    },
    {
      icon: Share2,
      tag: 'Growth Inbound',
      title: 'Hospital Referrals',
      description: 'Receive verified patient referrals from orthopedic surgeons and hospital doctors across the connected network.',
      pill: 'Closed-Loop Matching',
    },
  ]

  return (
    <section id="for-clinics" className="py-24 sm:py-32 bg-[#F5F5F7] dark:bg-[#09090B] relative overflow-hidden transition-colors">
      {/* Apple Subtle Ambient Lighting */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[850px] h-[400px] bg-gradient-to-b from-[#005b57]/[0.08] dark:from-[#005b57]/[0.15] to-transparent rounded-full blur-[140px]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 dark:bg-[#18181B]/90 backdrop-blur-md border border-black/[0.06] dark:border-white/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.03)] mb-4"
          >
            <Building2 className="w-3.5 h-3.5 text-[#005b57] dark:text-[#38b2ac]" />
            <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 tracking-wider uppercase">
              Clinic OS for Physical Rehabilitation
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="text-3xl sm:text-5xl font-semibold tracking-[-0.03em] text-neutral-950 dark:text-white leading-[1.12] mb-5 font-cal"
          >
            The operating system for{' '}
            <span className="text-[#005b57] dark:text-[#38b2ac]">modern physiotherapy clinics</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-base sm:text-lg text-neutral-600 dark:text-neutral-400 leading-relaxed font-normal"
          >
            A calm, fluid workspace designed for rehabilitation teams. Coordinate digital health records, staff rosters, Paystack settlements, and hospital referral inflows from one place.
          </motion.p>
        </div>

        {/* 4 Pillars Modular Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-14">
          {clinicPillars.map((pillar, idx) => {
            const Icon = pillar.icon
            return (
              <motion.div
                key={pillar.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: 0.08 * idx }}
                className="group relative bg-white/80 dark:bg-[#141416]/80 backdrop-blur-md rounded-2xl p-6 sm:p-7 border border-black/[0.06] dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)] hover:border-[#005b57]/20 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[#005b57]/[0.08] dark:bg-[#005b57]/[0.2] text-[#005b57] dark:text-[#38b2ac] flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                      {pillar.tag}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold tracking-[-0.01em] text-neutral-950 dark:text-white mb-2">
                    {pillar.title}
                  </h3>

                  <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    {pillar.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-black/[0.04] dark:border-white/[0.05] flex items-center justify-between">
                  <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                    {pillar.pill}
                  </span>
                  <div className="w-1.5 h-1.5 rounded-full bg-[#005b57] opacity-60 group-hover:opacity-100 transition-opacity" />
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* ── Apple-Grade Interactive Clinic Onboarding & Specimen Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="relative rounded-3xl sm:rounded-[2.5rem] bg-white/90 dark:bg-[#151518]/90 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.1] shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.35)] p-6 sm:p-10 lg:p-12 overflow-hidden"
        >
          {/* Top highlight bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#005b57]/40 to-transparent" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left: Narrative & Direct Actions (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Refined Live Status Eyebrow */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#005b57]/[0.08] dark:bg-[#005b57]/20 border border-[#005b57]/20 text-[#005b57] dark:text-[#38b2ac] text-xs font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#005b57] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#005b57]" />
                </span>
                <span className="tracking-wide">Instant Setup · Live Preview Available</span>
              </div>

              {/* Title & Description with Optical Typography */}
              <div className="space-y-3">
                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-[-0.03em] text-neutral-950 dark:text-white leading-[1.15]">
                  Onboard your clinic in under 5 minutes
                </h3>

                <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 leading-relaxed font-normal max-w-xl">
                  Start setting up your practice profile now. You can preview the full dashboard immediately while your license documents are reviewed by our clinical board.
                </p>
              </div>

              {/* Trust & Compliance Tray (Elegantly Designed Micro-Badges) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-100/70 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-white/[0.06]">
                  <ShieldCheck className="w-4 h-4 text-[#005b57] dark:text-[#38b2ac] shrink-0" />
                  <div className="leading-tight">
                    <span className="block text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Regulatory</span>
                    <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">MRTBN Compliant</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-100/70 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-white/[0.06]">
                  <Building2 className="w-4 h-4 text-[#005b57] dark:text-[#38b2ac] shrink-0" />
                  <div className="leading-tight">
                    <span className="block text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Escrow</span>
                    <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Paystack Verified</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-100/70 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-white/[0.06]">
                  <Zap className="w-4 h-4 text-[#005b57] dark:text-[#38b2ac] shrink-0" />
                  <div className="leading-tight">
                    <span className="block text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Settlements</span>
                    <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Instant Net Payouts</span>
                  </div>
                </div>
              </div>

              {/* Fluid Action Buttons (Apple Pointer-Down Tactile Feedback) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <Button
                  asChild
                  className="h-12 px-7 rounded-full text-xs font-medium text-white bg-[#005b57] hover:bg-[#00443e] active:scale-[0.97] transition-all duration-100 shadow-[0_6px_20px_rgba(0,91,87,0.25)] border-0"
                >
                  <Link href="/clinic-owner" className="inline-flex items-center justify-center gap-2">
                    <span>Onboard Your Clinic</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="h-12 px-6 rounded-full text-xs font-medium bg-neutral-100/80 hover:bg-neutral-200/80 dark:bg-neutral-800/70 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-black/[0.08] dark:border-white/[0.1] active:scale-[0.97] transition-all duration-100"
                >
                  <Link href="/dashboard/clinic" className="inline-flex items-center justify-center gap-2">
                    <Eye className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                    <span>Preview Clinic Dashboard</span>
                  </Link>
                </Button>
              </div>
            </div>

            {/* Right: Live Interactive Clinic Dashboard Specimen (5 cols) */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-[#FAFAFA] dark:bg-[#111113] p-4 sm:p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
                {/* Specimen Header & Window Controls */}
                <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-black/[0.05] dark:border-white/[0.06]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
                    <span className="ml-2 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      Victoria Island Physio Center
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    Preview Sandbox
                  </span>
                </div>

                {/* Quick Specimen Metrics */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-white dark:bg-[#1A1A1D] rounded-xl p-2.5 border border-black/[0.04] dark:border-white/[0.05]">
                    <span className="block text-[10px] text-neutral-400">Active Patients</span>
                    <span className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums">48</span>
                  </div>
                  <div className="bg-white dark:bg-[#1A1A1D] rounded-xl p-2.5 border border-black/[0.04] dark:border-white/[0.05]">
                    <span className="block text-[10px] text-neutral-400">Net Disbursed</span>
                    <span className="text-sm font-semibold text-[#005b57] dark:text-[#38b2ac] tabular-nums">₦2.45M</span>
                  </div>
                  <div className="bg-white dark:bg-[#1A1A1D] rounded-xl p-2.5 border border-black/[0.04] dark:border-white/[0.05]">
                    <span className="block text-[10px] text-neutral-400">Retention</span>
                    <span className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums">98.2%</span>
                  </div>
                </div>

                {/* Interactive Specimen Tabs */}
                <div className="flex items-center gap-1 p-1 bg-neutral-200/50 dark:bg-neutral-800/60 rounded-xl mb-3">
                  <button
                    onClick={() => setActiveTab('appointments')}
                    className={`flex-1 text-[11px] font-medium py-1.5 rounded-lg transition-all ${
                      activeTab === 'appointments'
                        ? 'bg-white dark:bg-[#202024] text-neutral-900 dark:text-white shadow-xs'
                        : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                    }`}
                  >
                    Appointments
                  </button>
                  <button
                    onClick={() => setActiveTab('ehr')}
                    className={`flex-1 text-[11px] font-medium py-1.5 rounded-lg transition-all ${
                      activeTab === 'ehr'
                        ? 'bg-white dark:bg-[#202024] text-neutral-900 dark:text-white shadow-xs'
                        : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                    }`}
                  >
                    Clinical EHR
                  </button>
                  <button
                    onClick={() => setActiveTab('billing')}
                    className={`flex-1 text-[11px] font-medium py-1.5 rounded-lg transition-all ${
                      activeTab === 'billing'
                        ? 'bg-white dark:bg-[#202024] text-neutral-900 dark:text-white shadow-xs'
                        : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                    }`}
                  >
                    Settlements
                  </button>
                </div>

                {/* Tab Preview Panes */}
                <div className="min-h-[140px] bg-white dark:bg-[#17171A] rounded-xl p-3 border border-black/[0.04] dark:border-white/[0.05] text-xs">
                  <AnimatePresence mode="wait">
                    {activeTab === 'appointments' && (
                      <motion.div
                        key="appointments"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-2"
                      >
                        <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-white/[0.03]">
                          <div>
                            <span className="font-medium text-neutral-800 dark:text-neutral-200 block">Folake Adebayo</span>
                            <span className="text-[11px] text-neutral-400">Post-Op ACL Rehab · Room 2</span>
                          </div>
                          <span className="text-[11px] font-medium text-[#005b57] dark:text-[#38b2ac]">09:30 AM</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-white/[0.03]">
                          <div>
                            <span className="font-medium text-neutral-800 dark:text-neutral-200 block">Chukwudi Eze</span>
                            <span className="text-[11px] text-neutral-400">Lumbar Traction · Room 1</span>
                          </div>
                          <span className="text-[11px] font-medium text-neutral-500">11:15 AM</span>
                        </div>
                      </motion.div>
                    )}

                    {activeTab === 'ehr' && (
                      <motion.div
                        key="ehr"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-2"
                      >
                        <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-white/[0.03]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-neutral-800 dark:text-neutral-200">SOAP Assessment Sync</span>
                            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">MRTBN Compliant</span>
                          </div>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-normal">
                            Range of motion evaluated at 115°. Home exercise program updated via WhatsApp patient portal.
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {activeTab === 'billing' && (
                      <motion.div
                        key="billing"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-2"
                      >
                        <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-white/[0.03]">
                          <div>
                            <span className="font-medium text-neutral-800 dark:text-neutral-200 block">Paystack Direct Net</span>
                            <span className="text-[11px] text-neutral-400">Settled to GTBank · Instant</span>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-600 tabular-nums">+₦135,000</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-neutral-500 px-1 pt-1">
                          <span>Rehabify Escrow Fee (10%)</span>
                          <span className="tabular-nums">-₦15,000</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Footer preview direct link */}
                <div className="mt-3 text-center">
                  <Link
                    href="/dashboard/clinic"
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#005b57] dark:text-[#38b2ac] hover:underline"
                  >
                    <span>Click to open full clinic dashboard preview</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default ClinicOnboardingSection

