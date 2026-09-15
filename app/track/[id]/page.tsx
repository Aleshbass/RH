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
  if (referral.status === "contacted") currentStep = 2;
  else if (referral.status === "booked") currentStep = 3;
  else if (referral.status === "in_treatment") currentStep = 4;
  else if (referral.status === "completed") currentStep = 5;

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
                    href={`https://wa.me/2348061525811?text=Inquiry%20on%20Referral%20${encodeURIComponent(
                      referral.trackingCode
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
