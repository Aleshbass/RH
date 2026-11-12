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
import { RehabifyPageLoader } from "@/components/brand/RehabifyLoader";

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
      <RehabifyPageLoader message="Loading your referral…" className="min-h-screen bg-pt-canvas" />
    );
  }

  // Invalid or expired link
  if (linkData === null || !linkData.usable || !linkData.partner) {
    return (
      <div className="min-h-screen bg-pt-canvas flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md p-8 bg-pt-surface rounded-3xl border border-pt-line text-center space-y-5 shadow-pt dark:shadow-none">
          <div className="w-14 h-14 rounded-2xl bg-pt-sunken text-pt-ink flex items-center justify-center mx-auto border border-transparent">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-pt-ink">Referral Link Unavailable</h1>
          <p className="text-sm text-pt-muted leading-relaxed">
            This referral link has expired or been deactivated. Please contact your healthcare provider or company for an updated referral link.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-pt-ink hover:underline"
          >
            <span>Visit Rehabify Health</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const partner = linkData.partner;
  // A referring doctor's personal link (QR in the consulting room, WhatsApp): speak as their doctor's referral
  const isDoctorLink = partner.type === "doctor";

  // --------------------------------------------------------------------------
  // SUCCESS SCREEN: Clear reassurance, tracking code, one-click WhatsApp
  // --------------------------------------------------------------------------
  if (step === "success" && successData && !successData.trackingCode) {
    return (
      <div className="min-h-screen bg-pt-canvas text-pt-ink flex flex-col items-center justify-center px-4 py-12 font-sans antialiased">
        <div className="w-full max-w-md p-8 bg-pt-surface rounded-3xl border border-pt-line text-center space-y-4 shadow-pt dark:shadow-none">
          <div className="w-16 h-16 rounded-2xl bg-pt-green-bg text-pt-green-fg flex items-center justify-center mx-auto border border-transparent">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-pt-ink">We already have your request</h1>
          <p className="text-sm text-pt-muted leading-relaxed">
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
    const joyPhone = (process.env.NEXT_PUBLIC_JOY_WHATSAPP_NUMBER || "2348122615453").replace(/\D/g, "");
    const whatsappUrl = `https://wa.me/${joyPhone}?text=${whatsappMessage}`;

    return (
      <div className="min-h-screen bg-pt-canvas text-pt-ink flex flex-col items-center justify-center px-4 py-12 font-sans antialiased">
        <div className="w-full max-w-md space-y-6 animate-in fade-in duration-300">
          {/* Partner & Rehabify Co-Branding */}
          <div className="flex items-center justify-center gap-3">
            {partner.logoUrl ? (
              <img src={partner.logoUrl} alt={partner.name} className="h-7 max-w-[110px] object-contain" />
            ) : (
              <span className="font-semibold text-xs text-pt-ink">{partner.name}</span>
            )}
            <span className="text-xs text-pt-muted font-medium">in partnership with</span>
            <NextImage
              src="/logos/MainRehabify.svg"
              alt="Rehabify Health"
              width={105}
              height={28}
              className="h-6 w-auto object-contain"
            />
          </div>

          <div className="p-8 bg-pt-surface rounded-3xl border border-pt-line text-center space-y-6 shadow-pt dark:shadow-none">
            <div className="w-16 h-16 rounded-2xl bg-pt-green-bg text-pt-green-fg flex items-center justify-center mx-auto border border-transparent">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-pt-ink">You're Registered!</h1>
              <p className="text-sm text-pt-muted leading-relaxed">
                Your referral has been successfully received by Rehabify's clinical care coordination team.
              </p>
            </div>

            {/* Tracking code display */}
            <div className="bg-pt-canvas rounded-2xl p-4 border border-pt-line space-y-1">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-pt-muted">
                Your Care Tracking Code
              </span>
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono text-2xl font-bold text-pt-ink tracking-wider">
                  {trackingCode}
                </span>
                <button
                  onClick={() => copyTrackingCode(trackingCode)}
                  className="p-1.5 text-pt-muted hover:text-pt-ink rounded-lg transition"
                  title="Copy Tracking Code"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-pt-green-fg" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-pt-muted">
                Keep this code to follow your care progress.
              </p>
            </div>

            {/* Action buttons */}
            <div className="space-y-3 pt-2">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-6 bg-pt-primary hover:bg-pt-primary-hover rounded-xl text-pt-on-primary font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <MessageSquare className="w-4 h-4 text-pt-green-fg" />
                <span>Chat with Care Team on WhatsApp</span>
              </a>

              <Link
                href={`/track/${trackingCode}`}
                className="w-full py-3 px-6 bg-pt-surface hover:bg-pt-hover rounded-xl text-pt-ink font-semibold text-xs transition border border-pt-line flex items-center justify-center gap-2"
              >
                <Activity className="w-4 h-4 text-pt-ink" />
                <span>Track Live Care Progress</span>
              </Link>
            </div>

            {/* SLA assurance */}
            <div className="pt-3 border-t border-pt-line text-xs text-pt-muted space-y-1">
              <p className="font-medium text-pt-ink">What happens next?</p>
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
    <div className="min-h-screen bg-pt-canvas text-pt-ink flex flex-col font-sans antialiased selection:bg-pt-primary selection:text-pt-on-primary">
      {/* Header with co-branding */}
      <header className="border-b border-pt-line bg-pt-canvas/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {partner.logoUrl ? (
              <img src={partner.logoUrl} alt={partner.name} className="h-7 max-w-[110px] object-contain" />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-pt-primary text-pt-on-primary flex items-center justify-center text-xs font-bold">
                {partner.name?.charAt(0) || "P"}
              </div>
            )}
            <span className="text-xs font-semibold text-pt-ink">{partner.name}</span>
            <div className="h-4 w-px bg-pt-line-strong" />
            <NextImage
              src="/logos/MainRehabify.svg"
              alt="Rehabify Health"
              width={95}
              height={26}
              className="h-5 w-auto object-contain"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-pt-muted">
            <ShieldCheck className="w-4 h-4 text-pt-green-fg" />
            <span className="hidden sm:inline">MRTBN Verified Care</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-xl mx-auto px-4 pt-8 pb-4 text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pt-surface/80 border border-pt-line text-xs font-medium text-pt-ink shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-pt-accent" />
          {isDoctorLink ? "Referred by your doctor" : "Rehabify Healthcare Partner Network"}
        </div>

        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-pt-ink">
          {isDoctorLink ? `${partner.name} referred you for physiotherapy` : `Access Verified Physiotherapy Through ${partner.name}`}
        </h1>

        <p className="text-sm text-pt-muted leading-relaxed">
          {isDoctorLink
            ? "Tell us how to reach you. Our care team will message you on WhatsApp and match you with a verified physiotherapist, in a clinic, at home or online."
            : "Complete this 2-minute registration to get paired with a licensed physical therapist for in-home rehabilitation or virtual care."}
        </p>

        {/* Trust features */}
        <div className="flex items-center justify-center gap-4 pt-2 text-xs text-pt-muted flex-wrap">
          <div className="flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-pt-ink" />
            <span>2-Hour Clinical Response</span>
          </div>
          <div className="flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-pt-ink" />
            <span>MRTBN Licensed Specialists</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-pt-ink" />
            <span>In-Home & Virtual</span>
          </div>
        </div>
      </div>

      {/* Main Intake Form */}
      <main className="max-w-xl mx-auto px-4 pb-16 w-full">
        <form onSubmit={handleSubmit} className="space-y-6">
          {linkData.environment === "sandbox" && (
            <div className="p-3 rounded-2xl bg-pt-sunken border border-transparent text-xs text-pt-ink font-medium">
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
            <div className="p-4 rounded-2xl bg-pt-rose-bg border border-transparent text-xs text-pt-rose-fg flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Patient Information */}
          <div className="bg-pt-surface rounded-3xl border border-pt-line p-6 sm:p-8 shadow-pt dark:shadow-none space-y-5">
            <div className="flex items-center justify-between border-b border-pt-line pb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-pt-muted">
                1. Your Contact Information
              </h2>
              <span className="text-[11px] text-pt-muted font-medium">Confidential & Secure</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-pt-ink mb-1.5">First Name <span className="text-pt-rose-fg">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Babatunde"
                  value={form.firstName}
                  onChange={(e) => handleChange("firstName", e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-pt-sunken border border-pt-line text-pt-ink text-sm placeholder:text-pt-faint focus:bg-pt-surface focus:outline-none focus:border-pt-ink focus:ring-2 focus:ring-pt-accent/40 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-pt-ink mb-1.5">Last Name</label>
                <input
                  type="text"
                  placeholder="e.g. Adeyemi"
                  value={form.lastName}
                  onChange={(e) => handleChange("lastName", e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-pt-sunken border border-pt-line text-pt-ink text-sm placeholder:text-pt-faint focus:bg-pt-surface focus:outline-none focus:border-pt-ink focus:ring-2 focus:ring-pt-accent/40 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-pt-ink mb-1.5">Phone Number <span className="text-pt-rose-fg">*</span></label>
                <input
                  type="tel"
                  required
                  placeholder="+234 800 000 0000"
                  value={form.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-pt-sunken border border-pt-line text-pt-ink text-sm font-mono placeholder:font-sans placeholder:text-pt-faint focus:bg-pt-surface focus:outline-none focus:border-pt-ink focus:ring-2 focus:ring-pt-accent/40 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-pt-ink mb-1.5">Email Address</label>
                <input
                  type="email"
                  placeholder="patient@email.com"
                  value={form.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-pt-sunken border border-pt-line text-pt-ink text-sm placeholder:text-pt-faint focus:bg-pt-surface focus:outline-none focus:border-pt-ink focus:ring-2 focus:ring-pt-accent/40 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-pt-ink mb-1.5">City / Residential Area</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => handleChange("city", e.target.value)}
                placeholder="e.g. Ikeja, Lekki Phase 1, Victoria Island, Abuja"
                className="w-full h-11 px-4 rounded-xl bg-pt-sunken border border-pt-line text-pt-ink text-sm placeholder:text-pt-faint focus:bg-pt-surface focus:outline-none focus:border-pt-ink focus:ring-2 focus:ring-pt-accent/40 transition-all"
              />
            </div>
          </div>

          {/* Section 2: Clinical Care Needs */}
          <div className="bg-pt-surface rounded-3xl border border-pt-line p-6 sm:p-8 shadow-pt dark:shadow-none space-y-5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-pt-muted border-b border-pt-line pb-3">
              2. What are you seeking care for?
            </h2>

            <div>
              <label className="block text-xs font-semibold text-pt-ink mb-1.5">Primary Condition or Symptom</label>
              <select
                value={form.reason}
                onChange={(e) => handleChange("reason", e.target.value)}
                className="w-full h-11 px-4 rounded-xl bg-pt-sunken border border-pt-line text-pt-ink text-sm focus:bg-pt-surface focus:outline-none focus:border-pt-ink focus:ring-2 focus:ring-pt-accent/40 transition-all"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-pt-ink mb-2">Preferred Delivery Mode</label>
              <div className="grid grid-cols-1 gap-2.5">
                {Object.entries(CARE_MODE_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleChange("preferredCareMode", value)}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border text-xs sm:text-sm font-medium transition-all ${
                      form.preferredCareMode === value
                        ? "border-pt-primary bg-pt-sunken text-pt-ink font-semibold ring-1 ring-pt-primary"
                        : "border-pt-line bg-pt-surface text-pt-muted hover:border-pt-line-strong hover:bg-pt-hover"
                    }`}
                  >
                    <span>{label}</span>
                    {form.preferredCareMode === value && (
                      <div className="w-5 h-5 rounded-full bg-pt-primary text-pt-on-primary flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Communication Preference & Consent */}
          <div className="bg-pt-surface rounded-3xl border border-pt-line p-6 sm:p-8 shadow-pt dark:shadow-none space-y-5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-pt-muted border-b border-pt-line pb-3">
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
                      ? "border-pt-primary bg-pt-primary text-pt-on-primary shadow-xs"
                      : "border-pt-line bg-pt-surface text-pt-muted hover:border-pt-line-strong hover:bg-pt-hover"
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
                className="mt-1 h-4 w-4 rounded border-pt-line-strong text-pt-ink focus:ring-pt-accent"
              />
              <span className="text-xs text-pt-muted leading-relaxed">
                I agree to be contacted by Rehabify Health care coordinators to schedule my physiotherapy sessions, pursuant to Nigerian healthcare privacy standards and NDPR clinical guidelines.
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !form.consentGranted}
            className="w-full py-4 px-6 rounded-2xl bg-pt-primary text-pt-on-primary font-semibold text-sm sm:text-base hover:bg-pt-primary-hover active:scale-[0.99] transition-all shadow-pt-lift flex items-center justify-center gap-2.5 disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 rounded-full border-2 border-pt-on-primary border-t-transparent animate-spin" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-pt-green-fg" />
            )}
            <span>Submit Clinical Referral</span>
          </button>
        </form>
      </main>
    </div>
  );
}
