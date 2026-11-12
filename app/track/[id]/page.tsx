"use client";

import React, { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, Check, Copy, MessageSquare } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { RehabifyLoader } from "@/components/brand/RehabifyLoader";

type TrackStep = { key: string; label: string; done: boolean; at: number | null };

interface TrackPageProps {
  params: Promise<{ id: string }>;
}

const JOY_NUMBER = (process.env.NEXT_PUBLIC_JOY_WHATSAPP_NUMBER || "2348122615453").replace(/\D/g, "");

function formatDate(ms: number | null | undefined) {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Public care tracker. Shows ONLY the status timeline for a tracking code — no names,
 * phone numbers, conditions or clinical information — so a guessed or forwarded code
 * reveals nothing personal.
 */
export default function PatientTrackPage({ params }: TrackPageProps) {
  const resolvedParams = use(params);
  const identifier = decodeURIComponent(resolvedParams.id || "").trim();
  const status = useQuery(api.partnerLinks.getPublicReferralStatus, identifier ? { trackingCode: identifier } : "skip");
  const [copied, setCopied] = React.useState(false);

  const copyStartMessage = () => {
    if (!status?.trackingCode) return;
    navigator.clipboard.writeText(`START ${status.trackingCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (status === undefined) {
    return (
      <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="w-full max-w-md p-10 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 text-center space-y-3">
          <RehabifyLoader size={56} label="Loading care status" className="mx-auto mb-4" />
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Loading care status…</p>
        </div>
      </div>
    );
  }

  if (status === null) {
    return (
      <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="w-full max-w-lg p-8 sm:p-10 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Not found</p>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">We couldn&apos;t find that tracking code</h1>
            <p className="text-sm text-neutral-500 leading-relaxed pt-1">
              Check the code (it looks like <span className="font-mono">RHB-1234567890</span>) or contact our care desk.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild variant="outline" className="rounded-lg">
              <Link href="/track">Search another code</Link>
            </Button>
            <Button asChild className="rounded-lg text-white" style={{ backgroundColor: "#0D6B4F" }}>
              <a href={`https://wa.me/${JOY_NUMBER}?text=${encodeURIComponent("Hello Rehabify, I need help tracking my referral")}`} target="_blank" rel="noreferrer">
                Contact care desk
              </a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const steps = status.steps as TrackStep[];
  const doneCount = steps.filter((s: TrackStep) => s.done).length;

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] p-4 sm:p-6 flex justify-center">
      <div className="w-full max-w-xl space-y-5 py-6">
        <Link href="/track" className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          <ArrowLeft className="w-3.5 h-3.5" /> Track another referral
        </Link>

        <div className="p-6 sm:p-8 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 space-y-6">
          {status.isSandbox && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              Sandbox test referral — not a real patient.
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Care tracker</p>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{status.statusLabel}</h1>
            <p className="text-sm text-neutral-500">
              Tracking code <span className="font-mono text-neutral-900 dark:text-neutral-100">{status.trackingCode}</span>
              {status.partnerName ? <> · referred by {status.partnerName}</> : null}
            </p>
          </div>

          {status.terminal ? (
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-700 dark:text-neutral-200">
              This referral is {status.terminal.toLowerCase()}. If you still need care, message our care team on WhatsApp.
            </div>
          ) : (
            <ol className="space-y-4" aria-label="Care progress">
              {steps.map((step: TrackStep, index: number) => (
                <li key={step.key} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
                      step.done ? "bg-emerald-600 text-white" : index === doneCount ? "border-2 border-emerald-600 text-emerald-700" : "border border-neutral-300 text-neutral-400"
                    }`}
                  >
                    {step.done ? <Check className="w-3.5 h-3.5" /> : index + 1}
                  </span>
                  <div>
                    <p className={`text-sm font-medium ${step.done ? "text-neutral-900 dark:text-neutral-50" : "text-neutral-500"}`}>{step.label}</p>
                    {step.done && formatDate(step.at) ? <p className="text-xs text-neutral-400">{formatDate(step.at)}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
            <p className="text-xs text-neutral-500">
              Questions about your care? Message Joy, our care assistant, on WhatsApp with your tracking code.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button asChild className="rounded-lg text-white" style={{ backgroundColor: "#0D6B4F" }}>
                <a href={`https://wa.me/${JOY_NUMBER}?text=${encodeURIComponent(`START ${status.trackingCode}`)}`} target="_blank" rel="noreferrer">
                  <MessageSquare className="w-4 h-4 mr-2" /> Chat on WhatsApp
                </a>
              </Button>
              <Button variant="outline" className="rounded-lg" onClick={copyStartMessage}>
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? "Copied" : "Copy START message"}
              </Button>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-center text-neutral-400">
          For your privacy this page never shows personal or clinical information. Last updated {formatDate(status.updatedAt)}.
        </p>
      </div>
    </div>
  );
}
