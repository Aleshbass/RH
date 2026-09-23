"use client";

import React, { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  CheckCircle2,
  Clock,
  Calendar,
  Phone,
  ShieldCheck,
  Stethoscope,
  Activity,
  ArrowLeft,
  MessageSquare,
  Search,
  AlertCircle,
  FileCheck,
  Building2,
  UserCheck,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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
    setTimeout(() => setCopied(false), 2500);
  };

  if (referral === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md p-8 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 text-center">
          <div className="w-12 h-12 rounded-full border-4 border-teal-500 border-t-transparent animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Fetching Care Tracker...
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Looking up live care status for #{identifier}
          </p>
        </div>
      </div>
    );
  }

  if (referral === null) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-lg p-8 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Referral Record Not Found
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            No referral was found matching reference or code:{" "}
            <span className="font-mono font-semibold text-slate-900 dark:text-white">
              {identifier}
            </span>
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="outline">
              <Link href="/track">
                <Search className="w-4 h-4 mr-2" />
                Search Another ID
              </Link>
            </Button>
            <Button asChild className="bg-teal-600 hover:bg-teal-700 text-white">
              <a
                href="https://wa.me/2348061525811?text=Hello%20Rehabify,%20I%20need%20help%20tracking%20my%20referral"
                target="_blank"
                rel="noreferrer"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Contact Care Desk
              </a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Determine active milestone step
  // 1. Referral Received
  // 2. Joy WhatsApp Intake
  // 3. Therapist Matched
  // 4. In Treatment
  // 5. Completed / Discharged
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

  const progressPercent = Math.min(
    100,
    Math.round(
      ((referral.sessions.completed || 0) / (referral.sessions.total || 4)) * 100
    )
  );

  const steps = [
    {
      step: 1,
      title: "Referral Logged",
      desc: "Received from partner platform",
      done: currentStep >= 1,
    },
    {
      step: 2,
      title: "Intake & Triage",
      desc: "Care team triage via WhatsApp / Phone",
      done: currentStep >= 2,
    },
    {
      step: 3,
      title: "Physio Matched",
      desc: "Licensed MRTBN therapist assigned",
      done: currentStep >= 3,
    },
    {
      step: 4,
      title: "Care Sessions",
      desc: `${referral.sessions.completed} of ${referral.sessions.total} sessions done`,
      done: currentStep >= 4,
    },
    {
      step: 5,
      title: "Discharged",
      desc: "Outcome report delivered",
      done: currentStep >= 5,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 py-10 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/track"
            className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Lookup Different Reference
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-teal-600 bg-teal-50 dark:bg-teal-950/60 px-2.5 py-1 rounded-full border border-teal-200 dark:border-teal-800">
              LIVE TRACKING
            </span>
          </div>
        </div>

        {/* Hero Card */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardDescription className="text-xs uppercase tracking-wider font-semibold text-teal-600">
                  Patient Care Journey
                </CardDescription>
                <CardTitle className="text-2xl font-bold mt-1">
                  {referral.patient.firstName} {referral.patient.lastName.slice(0, 1)}.
                </CardTitle>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Condition:{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {referral.clinicalNotes.condition || "Physical Rehabilitation"}
                  </span>
                  {" • "}
                  Location:{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {referral.patient.city || "Lagos"}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:self-start">
                <Badge variant="outline" className="font-mono text-xs px-3 py-1 bg-slate-50 dark:bg-slate-800">
                  {referral.trackingCode}
                </Badge>
                {referral.partnerExternalId && (
                  <Badge className="bg-teal-600 hover:bg-teal-700 text-white text-xs px-3 py-1 font-mono">
                    Partner Ref: {referral.partnerExternalId}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {/* Horizontal Timeline */}
            <div className="relative mt-4 mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {steps.map((s) => (
                  <div
                    key={s.step}
                    className={`flex flex-col items-center text-center p-3 rounded-xl transition-all ${
                      s.done
                        ? "bg-teal-500/10 border border-teal-500/30 text-teal-700 dark:text-teal-300"
                        : "bg-slate-100 dark:bg-slate-800/50 text-slate-400 border border-transparent"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1.5 ${
                        s.done
                          ? "bg-teal-600 text-white"
                          : "bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {s.done ? <CheckCircle2 className="w-4 h-4" /> : s.step}
                    </div>
                    <span className="text-xs font-semibold">{s.title}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                      {s.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Session Progress Meter */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200/80 dark:border-slate-700/60">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <Activity className="w-4 h-4 text-teal-600" />
                  Prescribed Therapy Progress
                </span>
                <span className="font-mono text-xs font-bold text-teal-600">
                  {referral.sessions.completed} / {referral.sessions.total} Sessions ({progressPercent}%)
                </span>
              </div>
              <Progress value={progressPercent} className="h-2.5 bg-slate-200 dark:bg-slate-700" />
            </div>
          </CardContent>
        </Card>

        {/* Real-time WhatsApp Intake Action Card */}
        {currentStep === 1 && (
          <Card className="border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-slate-900 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 w-32 h-32 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none" />
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-xl">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-700">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Action Required • Step 2 of 5
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">
                    Start Your Clinical Triage on WhatsApp with Joy
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Message Joy, our AI Care Coordinator, to confirm your symptoms and home address. Once you send the pre-filled code, this care tracker will instantly update to <strong>Step 2 (Intake & Triage)</strong> in real time.
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 pt-1">
                    <span>Your Tracking Reference:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      {referral.trackingCode}
                    </span>
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 shrink-0">
                  <Button
                    asChild
                    size="lg"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm h-11 px-5"
                  >
                    <a
                      href={`https://wa.me/2348061525811?text=${encodeURIComponent(
                        `START ${referral.trackingCode} - Hello Joy, I'm ready to start my physiotherapy intake.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Chat with Joy on WhatsApp
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyTrackingCode}
                    className="h-9 border-emerald-200 dark:border-emerald-800 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                        Copied to Clipboard
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1.5" />
                        Copy START Code
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 2 && (
          <Card className="border-teal-200 dark:border-teal-800/60 bg-gradient-to-br from-teal-50/70 via-sky-50/30 to-white dark:from-teal-950/30 dark:via-sky-950/20 dark:to-slate-900 shadow-sm">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-700">
                    <Clock className="w-3.5 h-3.5 text-teal-600" />
                    Intake in Progress
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Clinical Triage Underway with Joy
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Joy and our clinical dispatch desk are assessing your case details to assign the nearest certified physiotherapist.
                  </p>
                </div>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-teal-300 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/50 shrink-0"
                >
                  <a
                    href={`https://wa.me/2348061525811?text=${encodeURIComponent(
                      `START ${referral.trackingCode} - Continuing my physiotherapy intake.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                    Resume WhatsApp Chat
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Matched Physio Card */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                Assigned MRTBN Physiotherapist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {referral.assignedPhysiotherapist ? (
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                        {referral.assignedPhysiotherapist.name}
                        <ShieldCheck className="w-4 h-4 text-teal-500" />
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        License: {referral.assignedPhysiotherapist.licenseNumber}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium">
                        {referral.assignedPhysiotherapist.specialization}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                      Verified PT
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
                  <Clock className="w-4 h-4 inline mr-1 text-amber-600" />
                  <strong>Matching in progress</strong>. Our clinical dispatch team is matching the closest certified therapist in{" "}
                  {referral.patient.city || "the patient's zone"}.
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>Care Coordinator:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">Rehabify Clinical Dispatch Team</span>
                </div>
                {referral.sessions.nextSessionAt && (
                  <div className="flex justify-between">
                    <span>Next Scheduled Session:</span>
                    <span className="font-medium text-teal-600">
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
            </CardContent>
          </Card>

          {/* Partner & Referral Meta */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-teal-600" />
                Referral Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Referring Partner:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {referral.partnerId || referral.clinicalNotes.referringDoctor || "Direct Partner Referral"}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Partner Generated Reference:</span>
                <span className="font-mono font-semibold text-teal-600">
                  {referral.partnerExternalId || "N/A"}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Billing Arrangement:</span>
                <span className="font-medium uppercase text-slate-700 dark:text-slate-300">
                  {referral.billingMode.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Date Received:</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {new Date(referral.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="pt-2 flex justify-end">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 text-teal-600 border-teal-200 hover:bg-teal-50"
                >
                  <a
                    href={`https://wa.me/2348061525811?text=${encodeURIComponent(
                      `START ${referral.trackingCode} - Inquiry on Referral ${referral.trackingCode}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 mr-1" />
                    Support on WhatsApp
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
