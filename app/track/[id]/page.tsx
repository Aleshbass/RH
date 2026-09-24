"use client";

import React, { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrackPageProps {
  params: Promise<{ id: string }>;
}

export default function PatientTrackPage({ params }: TrackPageProps) {
  const resolvedParams = use(params);
  const identifier = decodeURIComponent(resolvedParams.id || "").trim();

  const referral = useQuery(
    api.partners.getReferralDetails,
    identifier ? { identifier } : "skip"
  );

  const [copied, setCopied] = React.useState(false);

  const copyTrackingCode = () => {
    if (!referral?.trackingCode) return;
    navigator.clipboard.writeText(`START ${referral.trackingCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (referral === undefined) {
    return (
      <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-md p-10 bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-800 text-center space-y-3">
          <div className="w-6 h-6 border-2 border-neutral-900 dark:border-neutral-100 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Loading Patient Care Record
          </h2>
          <p className="text-xs text-neutral-500">
            Retrieving clinical status for #{identifier}
          </p>
        </div>
      </div>
    );
  }

  if (referral === null) {
    return (
      <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-lg p-10 bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-800 space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
              Lookup Error
            </p>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
              Referral record not found
            </h1>
            <p className="text-sm text-neutral-500 leading-relaxed pt-1">
              No referral matches the identifier{" "}
              <span className="font-mono text-neutral-900 dark:text-neutral-100">
                {identifier}
              </span>
              . Please verify the code or contact your care coordinator.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <Button
              asChild
              variant="outline"
              className="rounded-lg text-sm font-medium border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300"
            >
              <Link href="/track">Search Another Reference</Link>
            </Button>
            <Button
              asChild
              className="rounded-lg text-sm font-medium bg-emerald-800 hover:bg-emerald-900 text-white"
            >
              <a
                href="https://wa.me/2348061525811?text=Hello%20Rehabify,%20I%20need%20assistance%20tracking%20my%20referral"
                target="_blank"
                rel="noreferrer"
              >
                Contact Care Desk
              </a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Determine active milestone step:
  // 1. Referral Logged
  // 2. Intake & Triage
  // 3. Physio Matched
  // 4. Care Sessions
  // 5. Discharged
  let currentStep = 1;
  if (
    referral.status === "contacted" ||
    referral.status === "intake_started" ||
    referral.status === "intake_completed" ||
    referral.status === "consent_pending"
  ) {
    currentStep = 2;
  } else if (
    referral.status === "booked" ||
    referral.status === "qualified"
  ) {
    currentStep = 3;
  } else if (
    referral.status === "in_treatment" ||
    referral.status === "treatment_active" ||
    referral.status === "attended"
  ) {
    currentStep = 4;
  } else if (
    referral.status === "completed" ||
    referral.status === "closed" ||
    referral.status === "paid_out"
  ) {
    currentStep = 5;
  }

  const completedSessions = referral.sessions.completed || 0;
  const totalSessions = referral.sessions.total || 4;
  const progressPercent = Math.min(100, Math.round((completedSessions / totalSessions) * 100));

  const steps = [
    {
      step: 1,
      title: "Referral Logged",
      desc: "Received from partner platform",
    },
    {
      step: 2,
      title: "Intake & Triage",
      desc: "Clinical evaluation on WhatsApp",
    },
    {
      step: 3,
      title: "Physio Matched",
      desc: "MRTBN therapist assigned",
    },
    {
      step: 4,
      title: "Care Sessions",
      desc: `${completedSessions} of ${totalSessions} completed`,
    },
    {
      step: 5,
      title: "Discharged",
      desc: "Outcome report delivered",
    },
  ];

  const whatsappIntakeUrl = `https://wa.me/2348061525811?text=${encodeURIComponent(
    `START ${referral.trackingCode} - Hello Joy, I'm ready to start my physiotherapy intake.`
  )}`;

  const whatsappResumeUrl = `https://wa.me/2348061525811?text=${encodeURIComponent(
    `START ${referral.trackingCode} - Continuing my physiotherapy intake.`
  )}`;

  const whatsappSupportUrl = `https://wa.me/2348061525811?text=${encodeURIComponent(
    `START ${referral.trackingCode} - Support Inquiry`
  )}`;

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] text-neutral-900 dark:text-neutral-50 py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top Navigation */}
        <div className="flex items-center justify-between">
          <Link
            href="/track"
            className="inline-flex items-center text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Lookup Different Reference
          </Link>
          <span className="text-xs font-medium text-neutral-500 flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block mr-1.5" />
            Live Tracking
          </span>
        </div>

        {/* Primary Care Overview Card */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-800 p-8 space-y-8">
          {/* Header & Patient Details */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
              <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                Patient Care Journey
              </p>
              <div className="flex items-center gap-3 text-xs text-neutral-500 font-mono">
                <span>Ref: {referral.trackingCode}</span>
                {referral.partnerExternalId && (
                  <span>• Partner ID: {referral.partnerExternalId}</span>
                )}
              </div>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {referral.patient.firstName} {referral.patient.lastName.slice(0, 1)}.
              </h1>
              <p className="text-sm text-neutral-500 mt-1">
                {referral.clinicalNotes.condition || "Physical Rehabilitation"} — {referral.patient.city || "Lagos"}
              </p>
            </div>
          </div>

          {/* Editorial Step Tracker */}
          <div className="pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 sm:gap-2">
              {steps.map((s) => {
                const isCompleted = currentStep > s.step;
                const isCurrent = currentStep === s.step;

                return (
                  <div key={s.step} className="flex flex-col space-y-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      {isCompleted ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center">
                          <Check className="w-3.5 h-3.5 mr-0.5" />
                          Step {s.step}
                        </span>
                      ) : isCurrent ? (
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                          Step {s.step}
                        </span>
                      ) : (
                        <span className="text-neutral-400">
                          Step {s.step}
                        </span>
                      )}
                    </div>

                    <h2
                      className={`text-sm ${
                        isCurrent
                          ? "font-semibold text-neutral-900 dark:text-neutral-100"
                          : isCompleted
                          ? "font-medium text-neutral-700 dark:text-neutral-300"
                          : "font-normal text-neutral-400"
                      }`}
                    >
                      {s.title}
                    </h2>

                    <p className="text-xs text-neutral-500 leading-tight">
                      {s.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Minimal Progress Line */}
          <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-neutral-600 dark:text-neutral-400">
                Prescribed Therapy Progress
              </span>
              <span className="font-mono text-neutral-500">
                {completedSessions} of {totalSessions} Sessions ({progressPercent}%)
              </span>
            </div>
            <div className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-700 dark:bg-emerald-600 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Action Panel for Step 1: Start Triage */}
        {currentStep === 1 && (
          <div className="bg-[#f4f8f5] dark:bg-[#0d1712] rounded-2xl p-8 space-y-4 border border-emerald-950/5 dark:border-emerald-500/10">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                Action Required — Step 2 of 5
              </p>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Start your clinical triage on WhatsApp with Joy
              </h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-2xl">
                Send a message to our AI care coordinator to verify your symptoms and location. Sending this message links your referral and advances this tracker in real time.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Button
                asChild
                className="h-10 px-5 rounded-lg text-sm font-medium bg-emerald-800 hover:bg-emerald-900 text-white transition-colors"
              >
                <a href={whatsappIntakeUrl} target="_blank" rel="noreferrer">
                  Open WhatsApp
                </a>
              </Button>
              <Button
                variant="outline"
                onClick={copyTrackingCode}
                className="h-10 px-4 rounded-lg text-sm font-medium border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-700" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1.5 text-neutral-500" />
                    Copy Code: {referral.trackingCode}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Action Panel for Step 2: Triage in Progress */}
        {currentStep === 2 && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-800 p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                Current Status
              </p>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
                Clinical triage in progress
              </h2>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Joy and our dispatch desk are processing your intake details to assign a licensed therapist.
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              className="shrink-0 h-9 px-4 rounded-lg text-xs font-medium border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200"
            >
              <a href={whatsappResumeUrl} target="_blank" rel="noreferrer">
                Resume WhatsApp Chat
              </a>
            </Button>
          </div>
        )}

        {/* Two-Column Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Assigned Physiotherapist */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-800 p-8 space-y-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                Care Team
              </p>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50 mt-1">
                Assigned Physiotherapist
              </h2>
            </div>

            {referral.assignedPhysiotherapist ? (
              <div className="space-y-2 pt-1">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    {referral.assignedPhysiotherapist.name}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    License: {referral.assignedPhysiotherapist.licenseNumber}
                  </p>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                    {referral.assignedPhysiotherapist.specialization}
                  </p>
                </div>
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 pt-1">
                  MRTBN Licensed & Verified
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 pt-1">
                <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Matching licensed physiotherapist
                </h3>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Our dispatch desk is currently matching the closest certified therapist in {referral.patient.city || "your area"}. You will be notified directly once confirmed.
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-400">Care Coordinator</span>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  Rehabify Clinical Dispatch
                </span>
              </div>
              {referral.sessions.nextSessionAt && (
                <div className="flex justify-between">
                  <span className="text-neutral-400">Next Scheduled Session</span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {new Date(referral.sessions.nextSessionAt).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Referral Metadata */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-800 p-8 space-y-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                Documentation
              </p>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50 mt-1">
                Referral Details
              </h2>
            </div>

            <div className="space-y-3 text-xs pt-1">
              <div className="flex justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-400">Referring Partner</span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {referral.partnerId || referral.clinicalNotes.referringDoctor || "Direct Partner Referral"}
                </span>
              </div>
              <div className="flex justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-400">Partner Reference</span>
                <span className="font-mono text-neutral-700 dark:text-neutral-300">
                  {referral.partnerExternalId || "N/A"}
                </span>
              </div>
              <div className="flex justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-400">Billing Mode</span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200 capitalize">
                  {referral.billingMode.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-400">Date Received</span>
                <span className="text-neutral-700 dark:text-neutral-300">
                  {new Date(referral.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                asChild
                variant="ghost"
                className="h-8 px-3 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                <a href={whatsappSupportUrl} target="_blank" rel="noreferrer">
                  Support on WhatsApp
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
