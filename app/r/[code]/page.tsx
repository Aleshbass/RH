"use client";

import React, { use, useState, useEffect, useRef } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Heart,
  MessageSquare,
  Phone,
  ShieldCheck,
  Timer,
  UserCheck,
  Wifi,
} from "@/components/icons";
import { toast } from "sonner";
import { rememberReferralCode } from "@/lib/referralCookie";

interface PageProps {
  params: Promise<{ code: string }>;
}

const CARE_MODE_LABELS: Record<string, string> = {
  remote: "Online Tele-Rehabilitation",
  face_to_face: "In-Person Home Visit",
  patient_choice: "I'll decide with the Care Team",
};

const REASONS = [
  { value: "back_pain", label: "Back, Neck & Spine Pain" },
  { value: "knee_injury", label: "Knee Injury / Joint Replacement" },
  { value: "stroke_recovery", label: "Stroke & Neurological Recovery" },
  { value: "post_surgery", label: "Post-Operative Rehabilitation" },
  { value: "shoulder_pain", label: "Shoulder & Rotator Cuff Injury" },
  { value: "sports_injury", label: "Sports Injury & Return to Play" },
  { value: "chronic_pain", label: "Chronic Musculoskeletal Pain" },
  { value: "geriatric_care", label: "Elderly Mobility & Fall Prevention" },
  { value: "other", label: "Other Physical Condition" },
];

export default function PartnerReferralLandingPage({ params }: PageProps) {
  const { code } = use(params);

  const linkData = useQuery(api.partnerLinks.resolveReferralLink, { publicCode: code });

  const [step, setStep] = useState<"form" | "success">("form");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot (hidden from people)
  const [successData, setSuccessData] = useState<{
    trackingCode: string | null;
    duplicate: boolean;
  } | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    city: "Lagos",
    reason: "back_pain",
    preferredCareMode: "patient_choice",
    preferredContactChannel: "whatsapp" as "whatsapp" | "phone" | "email" | "sms",
    // Explicit opt-in: never pre-ticked (NDPR/GDPR consent must be an affirmative act).
    consentGranted: false,
  });

  // Count the visit once (the server de-duplicates per visitor and ignores bots). The
  // 30-day attribution cookie itself is set server-side by middleware; mirror it locally.
  const clickRecordedRef = useRef(false);
  useEffect(() => {
    if (linkData?.usable && !clickRecordedRef.current) {
      clickRecordedRef.current = true;
      fetch(`/api/v1/public/referral-links/${encodeURIComponent(code)}/click`, { method: "POST", keepalive: true }).catch(() => {});
      if (linkData.environment === "live") rememberReferralCode(code);
    }
  }, [linkData?.usable, linkData?.environment, code]);

  const handleChange = (field: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  };

  const copyTrackingCode = (codeStr: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(codeStr);
      setCopiedCode(true);
      toast.success("Tracking code copied!");
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.firstName.trim()) return setError("Please enter your first name.");
    if (!form.phone.trim() && !form.email.trim())
      return setError("Please provide a phone number or email address.");
    if (!form.consentGranted)
      return setError("Please confirm your consent to be contacted by Rehabify.");

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/v1/public/referral-links/${encodeURIComponent(code)}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website,
          patient: {
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim() || undefined,
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
            city: form.city.trim() || undefined,
          },
          need: {
            reason: form.reason || undefined,
            preferred_care_mode: form.preferredCareMode === "face_to_face" ? "in_person" : form.preferredCareMode,
          },
          contact: { preferred_channel: form.preferredContactChannel },
          consent: { granted: form.consentGranted, privacy_notice_version: "2026-09-01" },
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error?.message || "Something went wrong. Please try again.");
      }
      setSuccessData({ trackingCode: result.tracking_code ?? null, duplicate: Boolean(result.duplicate) });
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (linkData === undefined) {
    return (
      <div className="min-h-screen bg-[#FAF6E7] flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 rounded-full border-3 border-[#002e2c]/20 border-t-[#002e2c] animate-spin" />
        <p className="text-xs font-semibold uppercase tracking-wider text-[#52706e]">
          Loading healthcare referral...
        </p>
      </div>
    );
  }

  // Invalid or expired link
  if (linkData === null || !linkData.usable || !linkData.partner) {
    return (
      <div className="min-h-screen bg-[#FAF6E7] flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md p-8 bg-white rounded-3xl border border-[#002e2c]/10 text-center space-y-5 shadow-[0_8px_30px_rgba(0,46,44,0.04)]">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-[#002e2c]">Referral Link Unavailable</h1>
          <p className="text-sm text-[#52706e] leading-relaxed">
            This referral link has expired or been deactivated. Please contact your healthcare provider or company for an updated referral link.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#005b57] hover:underline"
          >
            <span>Visit Rehabify Health</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const partner = linkData.partner;

  // --------------------------------------------------------------------------
  // SUCCESS SCREEN: Clear reassurance, tracking code, one-click WhatsApp
  // --------------------------------------------------------------------------
  if (step === "success" && successData && !successData.trackingCode) {
    return (
      <div className="min-h-screen bg-[#FAF6E7] text-[#002e2c] flex flex-col items-center justify-center px-4 py-12 font-sans antialiased">
        <div className="w-full max-w-md p-8 bg-white rounded-3xl border border-[#002e2c]/10 text-center space-y-4 shadow-[0_8px_30px_rgba(0,46,44,0.04)]">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center mx-auto border border-emerald-200">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-[#002e2c]">We already have your request</h1>
          <p className="text-sm text-[#52706e] leading-relaxed">
            You recently registered with these details. Our care team will contact you shortly using the details you gave the first time — there is no need to submit again.
          </p>
        </div>
      </div>
    );
  }

  if (step === "success" && successData?.trackingCode) {
    const trackingCode = successData.trackingCode;
    const whatsappMessage = encodeURIComponent(
      `START ${trackingCode} - Hello Rehabify Health, I just registered for physiotherapy care through ${partner.name}. My tracking code is ${trackingCode}. Please connect me with my care coordinator.`
    );
    const joyPhone = (process.env.NEXT_PUBLIC_JOY_WHATSAPP_NUMBER || "2348061525811").replace(/\D/g, "");
    const whatsappUrl = `https://wa.me/${joyPhone}?text=${whatsappMessage}`;

    return (
      <div className="min-h-screen bg-[#FAF6E7] text-[#002e2c] flex flex-col items-center justify-center px-4 py-12 font-sans antialiased">
        <div className="w-full max-w-md space-y-6 animate-in fade-in duration-300">
          {/* Partner & Rehabify Co-Branding */}
          <div className="flex items-center justify-center gap-3">
            {partner.logoUrl ? (
              <img src={partner.logoUrl} alt={partner.name} className="h-7 max-w-[110px] object-contain" />
            ) : (
              <span className="font-semibold text-xs text-[#002e2c]">{partner.name}</span>
            )}
            <span className="text-xs text-[#52706e] font-medium">in partnership with</span>
            <NextImage
              src="/logos/MainRehabify.svg"
              alt="Rehabify Health"
              width={105}
              height={28}
              className="h-6 w-auto object-contain"
            />
          </div>

          <div className="p-8 bg-white rounded-3xl border border-[#002e2c]/10 text-center space-y-6 shadow-[0_8px_30px_rgba(0,46,44,0.04)]">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center mx-auto border border-emerald-200">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-[#002e2c]">You're Registered!</h1>
              <p className="text-sm text-[#52706e] leading-relaxed">
                Your referral has been successfully received by Rehabify's clinical care coordination team.
              </p>
            </div>

            {/* Tracking code display */}
            <div className="bg-[#FAF6E7] rounded-2xl p-4 border border-[#002e2c]/10 space-y-1">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-[#52706e]">
                Your Care Tracking Code
              </span>
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono text-2xl font-bold text-[#005b57] tracking-wider">
                  {trackingCode}
                </span>
                <button
                  onClick={() => copyTrackingCode(trackingCode)}
                  className="p-1.5 text-[#52706e] hover:text-[#002e2c] rounded-lg transition"
                  title="Copy Tracking Code"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-[#52706e]">
                Keep this code to follow your care progress.
              </p>
            </div>

            {/* Action buttons */}
            <div className="space-y-3 pt-2">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-6 bg-[#002e2c] hover:bg-[#004744] rounded-xl text-[#FAF6E7] font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span>Chat with Care Team on WhatsApp</span>
              </a>

              <Link
                href={`/track/${trackingCode}`}
                className="w-full py-3 px-6 bg-white hover:bg-[#FAF6E7] rounded-xl text-[#002e2c] font-semibold text-xs transition border border-[#002e2c]/15 flex items-center justify-center gap-2"
              >
                <Activity className="w-4 h-4 text-[#005b57]" />
                <span>Track Live Care Progress</span>
              </Link>
            </div>

            {/* SLA assurance */}
            <div className="pt-3 border-t border-[#002e2c]/10 text-xs text-[#52706e] space-y-1">
              <p className="font-medium text-[#002e2c]">What happens next?</p>
              <p className="leading-relaxed">
                A licensed care coordinator will reach out to you within 2 hours to confirm your address, review your symptoms, and assign an MRTBN-certified physical therapist.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // FORM SCREEN: Apple-inspired Cream Patient Referral Submission
  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#FAF6E7] text-[#002e2c] flex flex-col font-sans antialiased selection:bg-[#005b57] selection:text-white">
      {/* Header with co-branding */}
      <header className="border-b border-[#002e2c]/10 bg-[#FAF6E7]/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {partner.logoUrl ? (
              <img src={partner.logoUrl} alt={partner.name} className="h-7 max-w-[110px] object-contain" />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-[#002e2c] text-[#FAF6E7] flex items-center justify-center text-xs font-bold">
                {partner.name?.charAt(0) || "P"}
              </div>
            )}
            <span className="text-xs font-semibold text-[#002e2c]">{partner.name}</span>
            <div className="h-4 w-px bg-[#002e2c]/15" />
            <NextImage
              src="/logos/MainRehabify.svg"
              alt="Rehabify Health"
              width={95}
              height={26}
              className="h-5 w-auto object-contain"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#52706e]">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">MRTBN Verified Care</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-xl mx-auto px-4 pt-8 pb-4 text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-[#002e2c]/10 text-xs font-medium text-[#002e2c] shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          Rehabify Healthcare Partner Network
        </div>

        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#002e2c]">
          Access Verified Physiotherapy Through {partner.name}
        </h1>

        <p className="text-sm text-[#52706e] leading-relaxed">
          Complete this 2-minute registration to get paired with a licensed physical therapist for in-home rehabilitation or virtual care.
        </p>

        {/* Trust features */}
        <div className="flex items-center justify-center gap-4 pt-2 text-xs text-[#52706e] flex-wrap">
          <div className="flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-[#005b57]" />
            <span>2-Hour Clinical Response</span>
          </div>
          <div className="flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-[#005b57]" />
            <span>MRTBN Licensed Specialists</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-[#005b57]" />
            <span>In-Home & Virtual</span>
          </div>
        </div>
      </div>

      {/* Main Intake Form */}
      <main className="max-w-xl mx-auto px-4 pb-16 w-full">
        <form onSubmit={handleSubmit} className="space-y-6">
          {linkData.environment === "sandbox" && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
              Sandbox test link — submissions create test referrals only. No one will contact you.
            </div>
          )}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label>
              Website
              <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>
          {error && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Patient Information */}
          <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,46,44,0.03)] space-y-5">
            <div className="flex items-center justify-between border-b border-[#002e2c]/10 pb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#52706e]">
                1. Your Contact Information
              </h2>
              <span className="text-[11px] text-[#52706e]/80 font-medium">Confidential & Secure</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#002e2c] mb-1.5">First Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Babatunde"
                  value={form.firstName}
                  onChange={(e) => handleChange("firstName", e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-[#FAF6E7]/50 border border-[#002e2c]/15 text-[#002e2c] text-sm placeholder:text-[#52706e]/50 focus:bg-white focus:outline-none focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#002e2c] mb-1.5">Last Name</label>
                <input
                  type="text"
                  placeholder="e.g. Adeyemi"
                  value={form.lastName}
                  onChange={(e) => handleChange("lastName", e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-[#FAF6E7]/50 border border-[#002e2c]/15 text-[#002e2c] text-sm placeholder:text-[#52706e]/50 focus:bg-white focus:outline-none focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#002e2c] mb-1.5">Phone Number <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  required
                  placeholder="+234 800 000 0000"
                  value={form.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-[#FAF6E7]/50 border border-[#002e2c]/15 text-[#002e2c] text-sm font-mono placeholder:font-sans placeholder:text-[#52706e]/50 focus:bg-white focus:outline-none focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#002e2c] mb-1.5">Email Address</label>
                <input
                  type="email"
                  placeholder="patient@email.com"
                  value={form.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-[#FAF6E7]/50 border border-[#002e2c]/15 text-[#002e2c] text-sm placeholder:text-[#52706e]/50 focus:bg-white focus:outline-none focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#002e2c] mb-1.5">City / Residential Area</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => handleChange("city", e.target.value)}
                placeholder="e.g. Ikeja, Lekki Phase 1, Victoria Island, Abuja"
                className="w-full h-11 px-4 rounded-xl bg-[#FAF6E7]/50 border border-[#002e2c]/15 text-[#002e2c] text-sm placeholder:text-[#52706e]/50 focus:bg-white focus:outline-none focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-all"
              />
            </div>
          </div>

          {/* Section 2: Clinical Care Needs */}
          <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,46,44,0.03)] space-y-5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#52706e] border-b border-[#002e2c]/10 pb-3">
              2. What are you seeking care for?
            </h2>

            <div>
              <label className="block text-xs font-semibold text-[#002e2c] mb-1.5">Primary Condition or Symptom</label>
              <select
                value={form.reason}
                onChange={(e) => handleChange("reason", e.target.value)}
                className="w-full h-11 px-4 rounded-xl bg-[#FAF6E7]/50 border border-[#002e2c]/15 text-[#002e2c] text-sm focus:bg-white focus:outline-none focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-all"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#002e2c] mb-2">Preferred Delivery Mode</label>
              <div className="grid grid-cols-1 gap-2.5">
                {Object.entries(CARE_MODE_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleChange("preferredCareMode", value)}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border text-xs sm:text-sm font-medium transition-all ${
                      form.preferredCareMode === value
                        ? "border-[#005b57] bg-[#005b57]/5 text-[#002e2c] font-semibold ring-1 ring-[#005b57]"
                        : "border-[#002e2c]/10 bg-white text-[#52706e] hover:border-[#002e2c]/25 hover:bg-[#FAF6E7]/30"
                    }`}
                  >
                    <span>{label}</span>
                    {form.preferredCareMode === value && (
                      <div className="w-5 h-5 rounded-full bg-[#005b57] text-white flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Communication Preference & Consent */}
          <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,46,44,0.03)] space-y-5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#52706e] border-b border-[#002e2c]/10 pb-3">
              3. How should our clinical team reach you?
            </h2>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: "whatsapp", label: "WhatsApp" },
                { id: "phone", label: "Phone Call" },
                { id: "email", label: "Email" },
              ].map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => handleChange("preferredContactChannel", ch.id)}
                  className={`py-3 rounded-xl border text-xs sm:text-sm font-semibold transition-all ${
                    form.preferredContactChannel === ch.id
                      ? "border-[#002e2c] bg-[#002e2c] text-[#FAF6E7] shadow-xs"
                      : "border-[#002e2c]/15 bg-white text-[#52706e] hover:border-[#002e2c]/30 hover:bg-[#FAF6E7]/40"
                  }`}
                >
                  {ch.label}
                </button>
              ))}
            </div>

            <label className="flex items-start gap-3 pt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.consentGranted}
                onChange={(e) => handleChange("consentGranted", e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[#002e2c]/20 text-[#005b57] focus:ring-[#005b57]"
              />
              <span className="text-xs text-[#52706e] leading-relaxed">
                I agree to be contacted by Rehabify Health care coordinators to schedule my physiotherapy sessions, pursuant to Nigerian healthcare privacy standards and NDPR clinical guidelines.
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 px-6 rounded-2xl bg-[#002e2c] text-[#FAF6E7] font-semibold text-sm sm:text-base hover:bg-[#004744] active:scale-[0.99] transition-all shadow-[0_4px_20px_rgba(0,46,44,0.15)] flex items-center justify-center gap-2.5 disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            )}
            <span>Submit Clinical Referral</span>
          </button>
        </form>
      </main>
    </div>
  );
}
