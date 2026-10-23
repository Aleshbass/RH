"use client";

import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Building2,
  Stethoscope,
  Briefcase,
  Dumbbell,
  Laptop,
  Code,
  Webhook,
  MessageSquare,
  LayoutDashboard,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Zap,
  Globe,
  Lock,
  Clock,
  Copy,
  Check,
  Send,
  Users,
  TrendingUp,
  Handshake,
} from "@/components/icons";

// ── Fade-in wrapper ──────────────────────────────
function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Partner Type Cards Data ──────────────────────
const partnerTypes = [
  {
    icon: Building2,
    title: "Hospitals & Clinics",
    description: "Refer patients to verified physiotherapists with real-time outcome tracking and automated discharge summaries.",
    features: ["1-Click Referral", "Outcome Reports", "Per-referral Incentive"],
    color: "from-teal-500/10 to-emerald-500/10",
    borderColor: "border-teal-200",
    iconBg: "bg-teal-500/10 text-teal-600",
  },
  {
    icon: Stethoscope,
    title: "HMOs & Insurers",
    description: "Pre-authorize and sponsor physiotherapy sessions for your members with bulk packages and utilization dashboards.",
    features: ["Eligibility API", "Bulk Pricing", "Utilization Dashboard"],
    color: "from-blue-500/10 to-indigo-500/10",
    borderColor: "border-blue-200",
    iconBg: "bg-blue-500/10 text-blue-600",
  },
  {
    icon: Briefcase,
    title: "Corporate & HR",
    description: "Offer recovery and wellness benefits to your employees. Boost productivity with accessible physiotherapy.",
    features: ["Employee Portal", "Usage Analytics", "Flexible Plans"],
    color: "from-violet-500/10 to-purple-500/10",
    borderColor: "border-violet-200",
    iconBg: "bg-violet-500/10 text-violet-600",
  },
  {
    icon: Dumbbell,
    title: "Gyms & Sports Clubs",
    description: "Embed recovery services for your members. QR codes, booking widgets, and member discount packages.",
    features: ["Referral Links", "QR Codes", "Member Discounts"],
    color: "from-orange-500/10 to-amber-500/10",
    borderColor: "border-orange-200",
    iconBg: "bg-orange-500/10 text-orange-600",
  },
  {
    icon: Laptop,
    title: "Healthtech Platforms",
    description: "Embed Rehabify's verified physio network inside your product via our REST API and JavaScript SDK.",
    features: ["Full REST API", "Sandbox Environment", "Revenue Share"],
    color: "from-cyan-500/10 to-sky-500/10",
    borderColor: "border-cyan-200",
    iconBg: "bg-cyan-500/10 text-cyan-600",
  },
];

// ── Integration Channels Data ────────────────────
const integrationChannels = [
  {
    icon: Code,
    name: "REST API",
    description: "Programmatic access to referrals, eligibility, provider search, and booking",
    setupTime: "1–3 days",
    badge: "Full Control",
  },
  {
    icon: Laptop,
    name: "JavaScript SDK",
    description: "Drop-in booking widget (coming soon) — use no-code referral links today",
    setupTime: "30 minutes",
    badge: "Fastest",
  },
  {
    icon: Webhook,
    name: "Webhooks",
    description: "Real-time event streaming — session booked, completed, discharged",
    setupTime: "1–2 hours",
    badge: "Real-time",
  },
  {
    icon: MessageSquare,
    name: "WhatsApp Deep-Links",
    description: "Smart links with partner tokens. Joy recognizes the source automatically",
    setupTime: "15 minutes",
    badge: "No-Code",
  },
  {
    icon: LayoutDashboard,
    name: "Partner Portal",
    description: "Web dashboard for manual referrals, patient tracking, and analytics",
    setupTime: "Instant",
    badge: "Dashboard",
  },
  {
    icon: Lock,
    name: "SSO / OAuth",
    description: "Your users authenticate into Rehabify via your own identity system",
    setupTime: "3–5 days",
    badge: "Enterprise",
  },
];

// ── Pricing Tiers ────────────────────────────────
const pricingTiers = [
  {
    name: "Starter",
    price: "Free",
    priceNote: "Forever",
    description: "Perfect for individual doctors and small clinics getting started with referrals.",
    features: [
      "WhatsApp deep-links",
      "Partner portal access",
      "Email support",
      "Up to 10 referrals/month",
    ],
    cta: "Get Started Free",
    popular: false,
    gradient: "from-gray-50 to-white",
  },
  {
    name: "Professional",
    price: "₦25,000",
    priceNote: "/month",
    description: "For mid-size clinics and gyms that want API access, webhooks, and data.",
    features: [
      "500 API calls/month",
      "5 webhook endpoints",
      "No-code referral links",
      "Priority email + chat support",
      "Usage analytics dashboard",
    ],
    cta: "Start Professional",
    popular: true,
    gradient: "from-[#002e2c] to-[#005b57]",
  },
  {
    name: "Enterprise",
    price: "₦100,000",
    priceNote: "/month",
    description: "Unlimited API access, dedicated support, and custom SLAs for large organizations.",
    features: [
      "Unlimited API calls",
      "Unlimited webhook endpoints",
      "SSO / OAuth integration",
      "Dedicated account manager",
      "Custom SLA guarantee",
      "White-label option available",
    ],
    cta: "Contact Sales",
    popular: false,
    gradient: "from-gray-50 to-white",
  },
];

// ── Code Sample Component ────────────────────────
function CodeSample() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"referral" | "widget" | "webhook">("referral");

  const codeSnippets = {
    referral: `// Create a patient referral (server-side, secret key)
const response = await fetch(
  'https://api.physioaroundme.com/v1/partners/referrals',
  {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${process.env.REHABIFY_API_KEY}\`, // sk_test_… / sk_live_…
      'Content-Type': 'application/json',
      'Idempotency-Key': 'HMO-REF-2026-0091',
    },
    body: JSON.stringify({
      partner_reference: 'HMO-REF-2026-0091',
      patient: { first_name: 'Adaeze', last_name: 'Nwosu', phone: '+2348012345678' },
      clinical: { condition: 'Post-ACL reconstruction', recommended_sessions: 8 },
      consent: { granted: true },
    }),
  }
);

const referral = await response.json();
// { object: "referral", tracking_code: "RHB-4829173655",
//   status: "received", links: { whatsapp_intake_url: "…" }, … }`,
    widget: `<!-- No-code referral link (create it in the Partner Portal) -->
<a href="https://physioaroundme.com/r/yourco-7KQ2X9MD">
  Book physiotherapy with Rehabify
</a>

<!-- Patients land on a co-branded page, give consent,
     and are contacted by the Rehabify care team.
     Sign-ups and paid bookings are attributed to you
     for 30 days (first partner wins). -->`,
    webhook: `// Webhook: referral.booked (signed: X-Rehabify-Signature)
{
  "id": "evt_01JA4T7Q9Y2V3W4X5Z6A7B8C9D",
  "object": "event",
  "type": "referral.booked",
  "api_version": "2026-10-01",
  "created_at": "2026-10-13T09:35:12.000Z",
  "environment": "live",
  "data": {
    "previous_status": "contacted",
    "sequence": 3,
    "referral": {
      "id": "jd7f3k2m9x1q8w4e5r6t7y8u9i0o1p2a",
      "tracking_code": "RHB-4829173655",
      "partner_reference": "HMO-REF-2026-0091",
      "status": "booked",
      "provider": { "name": "Chiamaka Obi", "license_number": "MRTBN/PT/12345" }
    }
  }
}`,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-800 bg-[#0d1117] shadow-2xl">
      {/* Tab Bar */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-[#161b22]">
        <div className="flex">
          {(["referral", "widget", "webhook"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-xs font-medium transition-colors capitalize ${
                activeTab === tab
                  ? "text-white bg-[#0d1117] border-b-2 border-emerald-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab === "referral" ? "Create Referral" : tab === "widget" ? "Referral Link" : "Webhook Event"}
            </button>
          ))}
        </div>
        <button
          onClick={handleCopy}
          className="mr-3 p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* Code Content */}
      <div className="p-5 overflow-x-auto">
        <pre className="text-sm leading-relaxed font-mono">
          <code className="text-gray-300 whitespace-pre">
            {codeSnippets[activeTab]}
          </code>
        </pre>
      </div>
    </div>
  );
}

// ── Partner Inquiry Form ─────────────────────────
function PartnerInquiryForm() {
  const [formData, setFormData] = useState({
    companyName: "",
    contactName: "",
    email: "",
    partnerType: "",
    message: "",
  });

  const submitInquiry = useMutation(api.public.submitPartnershipInquiry);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Record the inquiry for the partnerships team (admin → Partnerships → Inquiries)
    // without delaying the WhatsApp hand-off (popup blockers need the click's tick).
    submitInquiry({
      name: formData.contactName.trim(),
      email: formData.email.trim(),
      organization: formData.companyName.trim(),
      message: `[${formData.partnerType || "Unspecified"}] ${formData.message.trim()}`.slice(0, 4000),
    }).catch((error) => console.error("Failed to record partnership inquiry", error));
    // Build WhatsApp message with form data
    const waMessage = `Hi! 👋🏾 I'm interested in partnering with RehabifyHealth.\n\nCompany: ${formData.companyName}\nContact: ${formData.contactName}\nEmail: ${formData.email}\nPartner Type: ${formData.partnerType}\n\n${formData.message}`;
    window.open(
      `https://wa.me/2348061525811?text=${encodeURIComponent(waMessage)}`,
      "_blank"
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Company Name</label>
          <input
            type="text"
            required
            value={formData.companyName}
            onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-[#005b57] focus:border-transparent transition-all text-sm"
            placeholder="Acme Healthcare"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Contact Name</label>
          <input
            type="text"
            required
            value={formData.contactName}
            onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-[#005b57] focus:border-transparent transition-all text-sm"
            placeholder="Dr. Adaeze Nwosu"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-[#005b57] focus:border-transparent transition-all text-sm"
            placeholder="adaeze@acme.com"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Partnership Type</label>
          <select
            required
            value={formData.partnerType}
            onChange={(e) => setFormData({ ...formData, partnerType: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-[#005b57] focus:border-transparent transition-all text-sm"
          >
            <option value="">Select type...</option>
            <option value="Hospital / Clinic">Hospital / Clinic</option>
            <option value="HMO / Insurer">HMO / Insurer</option>
            <option value="Corporate / HR">Corporate / HR</option>
            <option value="Gym / Sports Club">Gym / Sports Club</option>
            <option value="Healthtech Platform">Healthtech Platform</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tell us about your integration needs</label>
        <textarea
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          rows={3}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-[#005b57] focus:border-transparent transition-all text-sm resize-none"
          placeholder="We're looking to integrate physiotherapy referrals into our hospital management system..."
        />
      </div>
      <button
        type="submit"
        className="w-full sm:w-auto bg-[#002e2c] text-white font-bold py-3 px-8 rounded-xl hover:bg-[#005b57] transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 group"
      >
        <Send className="w-4 h-4" />
        Send Partnership Inquiry
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>
    </form>
  );
}

// ── Main Page Component ──────────────────────────
export default function PartnershipsPage() {
  return (
    <div className="bg-[#FAF6E7] min-h-screen font-sans text-gray-900">
      {/* ─── Hero Section ─────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6 lg:px-8 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-10 w-96 h-96 bg-[#002e2c]/5 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-500/3 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto text-center">
          <FadeIn>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#002e2c]/5 border border-[#002e2c]/10 mb-6">
              <Handshake className="w-4 h-4 text-[#005b57]" />
              <span className="text-sm font-semibold text-[#005b57]">Partnership Program</span>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-[#002e2c] mb-6 font-cal leading-[1.1]">
              Power Your Platform with{" "}
              <span className="bg-gradient-to-r from-[#005b57] to-emerald-500 bg-clip-text text-transparent">
                Rehabify
              </span>
            </h1>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-10 leading-relaxed">
              Integrate Nigeria&apos;s largest verified physiotherapy network into your product. 
              REST APIs, embed widgets, WhatsApp deep-links, and more — choose the integration 
              that fits your workflow.
            </p>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <a
                href="#inquiry"
                className="bg-[#002e2c] text-white font-bold py-4 px-8 rounded-xl hover:bg-[#005b57] transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 group"
              >
                Become a Partner
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <Link
                href="/integrations"
                className="bg-white text-[#002e2c] border border-[#002e2c]/20 font-bold py-4 px-8 rounded-xl hover:bg-gray-50 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                <Code className="w-4 h-4" />
                View Integration Docs
              </Link>
            </div>
          </FadeIn>

          {/* Stats strip */}
          <FadeIn delay={0.4}>
            <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
              {[
                { value: "500+", label: "Patients Treated" },
                { value: "50+", label: "Verified Therapists" },
                { value: "15 min", label: "Average Setup" },
                { value: "99.9%", label: "API Uptime" },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-[#002e2c] font-cal">{stat.value}</div>
                  <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Partner Types Section ────────────────── */}
      <section className="py-20 px-6 lg:px-8 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-[#002e2c] font-cal mb-4">
                Built for Every Healthcare Partner
              </h2>
              <p className="text-lg text-gray-500 max-w-2xl mx-auto">
                Whether you&apos;re a hospital, HMO, corporate, gym, or healthtech platform — we have 
                the right integration for you.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {partnerTypes.map((partner, idx) => (
              <FadeIn key={idx} delay={idx * 0.08}>
                <div
                  className={`relative p-6 rounded-2xl border ${partner.borderColor} bg-gradient-to-br ${partner.color} hover:shadow-lg transition-all duration-300 group h-full`}
                >
                  <div className={`w-12 h-12 rounded-xl ${partner.iconBg} flex items-center justify-center mb-4`}>
                    <partner.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2 font-cal">{partner.title}</h3>
                  <p className="text-sm text-gray-600 mb-4 leading-relaxed">{partner.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {partner.features.map((feature, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-white/80 text-gray-700 border border-gray-200"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Integration Showcase ─────────────────── */}
      <section className="py-20 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-[#002e2c] font-cal mb-4">
                Choose Your Integration Path
              </h2>
              <p className="text-lg text-gray-500 max-w-2xl mx-auto">
                From no-code WhatsApp links to full REST APIs — integrate at the level that 
                matches your technical capacity.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Integration Channels */}
            <div className="space-y-4">
              {integrationChannels.map((channel, idx) => (
                <FadeIn key={idx} delay={idx * 0.06}>
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-gray-100 hover:border-[#005b57]/20 hover:shadow-md transition-all duration-300 group">
                    <div className="w-10 h-10 rounded-lg bg-[#002e2c]/5 text-[#005b57] flex items-center justify-center shrink-0 group-hover:bg-[#002e2c] group-hover:text-white transition-colors">
                      <channel.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-gray-900 text-sm">{channel.name}</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {channel.badge}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{channel.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        {channel.setupTime}
                      </div>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>

            {/* Code Preview */}
            <FadeIn delay={0.2}>
              <div className="sticky top-24">
                <CodeSample />
                <p className="text-xs text-gray-400 text-center mt-4">
                  Production-ready API with comprehensive documentation
                </p>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── Pricing Section ──────────────────────── */}
      <section className="py-20 px-6 lg:px-8 bg-white border-y border-gray-100">
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-[#002e2c] font-cal mb-4">
                Simple, Transparent Pricing
              </h2>
              <p className="text-lg text-gray-500 max-w-2xl mx-auto">
                Start free. Scale as you grow. Only pay for what you use.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {pricingTiers.map((tier, idx) => (
              <FadeIn key={idx} delay={idx * 0.1}>
                <div
                  className={`relative rounded-2xl p-8 h-full flex flex-col ${
                    tier.popular
                      ? "bg-gradient-to-br from-[#002e2c] to-[#005b57] text-white shadow-2xl ring-2 ring-emerald-400/30 scale-[1.02]"
                      : "bg-white border border-gray-200 shadow-lg"
                  }`}
                >
                  {tier.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-4 py-1 rounded-full bg-emerald-400 text-[#002e2c] text-xs font-bold shadow-lg">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <h3 className={`text-lg font-bold font-cal ${tier.popular ? "text-white" : "text-gray-900"}`}>
                    {tier.name}
                  </h3>

                  <div className="mt-4 mb-2">
                    <span className={`text-4xl font-bold font-cal ${tier.popular ? "text-white" : "text-[#002e2c]"}`}>
                      {tier.price}
                    </span>
                    <span className={`text-sm ml-1 ${tier.popular ? "text-emerald-200" : "text-gray-500"}`}>
                      {tier.priceNote}
                    </span>
                  </div>

                  <p className={`text-sm mb-6 ${tier.popular ? "text-emerald-100" : "text-gray-500"}`}>
                    {tier.description}
                  </p>

                  <ul className="space-y-3 mb-8 flex-1">
                    {tier.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            tier.popular ? "text-emerald-300" : "text-emerald-500"
                          }`}
                        />
                        <span className={`text-sm ${tier.popular ? "text-emerald-50" : "text-gray-600"}`}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href="#inquiry"
                    className={`w-full py-3 rounded-xl font-bold text-sm text-center transition-all duration-200 block ${
                      tier.popular
                        ? "bg-white text-[#002e2c] hover:bg-emerald-50 shadow-lg"
                        : "bg-[#002e2c] text-white hover:bg-[#005b57] shadow-md"
                    }`}
                  >
                    {tier.cta}
                  </a>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* Additional note */}
          <FadeIn delay={0.3}>
            <div className="mt-10 text-center">
              <p className="text-sm text-gray-500">
                All plans include an{" "}
                <span className="font-semibold text-gray-700">8–12% platform fee</span>{" "}
                per booked session (built into therapist pricing, not charged to partners).
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Why Partner With Us ──────────────────── */}
      <section className="py-20 px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-[#002e2c] font-cal mb-4">
                Why Partner With Rehabify?
              </h2>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: ShieldCheck,
                title: "Verified Network",
                description: "Every therapist is license-verified and background-checked. Your patients are in safe hands.",
              },
              {
                icon: Zap,
                title: "Fast Integration",
                description: "From no-code deep-links (15 mins) to full API integration (3 days). We meet you where you are.",
              },
              {
                icon: Globe,
                title: "WhatsApp-First",
                description: "Patients prefer WhatsApp. Our AI assistant Joy handles intake, booking, and follow-ups on WhatsApp.",
              },
              {
                icon: TrendingUp,
                title: "Outcome Data",
                description: "Real-time clinical outcomes data. Know exactly how your referred patients are progressing.",
              },
              {
                icon: Users,
                title: "Dedicated Support",
                description: "Enterprise partners get a dedicated account manager and SLA-backed support.",
              },
              {
                icon: Lock,
                title: "HIPAA-Ready",
                description: "Enterprise-grade security with encrypted data, audit logs, and compliance-ready infrastructure.",
              },
            ].map((item, idx) => (
              <FadeIn key={idx} delay={idx * 0.08}>
                <div className="text-center p-6">
                  <div className="w-14 h-14 rounded-2xl bg-[#002e2c]/5 text-[#005b57] flex items-center justify-center mx-auto mb-4">
                    <item.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2 font-cal">{item.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{item.description}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Inquiry Form Section ─────────────────── */}
      <section id="inquiry" className="py-20 px-6 lg:px-8 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold text-[#002e2c] font-cal mb-4">
                Ready to Integrate?
              </h2>
              <p className="text-lg text-gray-500">
                Tell us about your organization and integration needs. 
                Our partnerships team will get back to you within 24 hours.
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="bg-[#FAF6E7] rounded-2xl p-8 border border-gray-100 shadow-sm">
              <PartnerInquiryForm />
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
