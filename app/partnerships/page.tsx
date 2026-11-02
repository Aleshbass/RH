"use client";

import React, { useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { BookDemoDialog } from "@/components/partners/BookDemoDialog";
import { ArrowRight, Check, Copy, Info } from "@/components/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PairingShapes } from "@/components/learn/shared";
import { SegmentedSwitch, switchPanelId, switchTabId } from "@/components/landing/SegmentedSwitch";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const submitPartnershipInquiryRef = makeFunctionReference<
  "mutation",
  { name: string; email: string; organization: string; message: string },
  { success: boolean; inquiryId: string }
>("public:submitPartnershipInquiry");

// ── Shared styles ────────────────────────────────
const pill =
  "group inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const primary = cn(pill, "bg-rh-lime text-rh-ink hover:bg-rh-lime-deep focus-visible:ring-rh-ink");
const primaryOnInk = cn(pill, "bg-rh-lime text-rh-ink hover:bg-rh-lime-deep focus-visible:ring-rh-lime focus-visible:ring-offset-rh-ink");
const secondary = cn(pill, "bg-white text-rh-ink ring-1 ring-inset ring-rh-ink/10 hover:bg-rh-ink/[0.03] focus-visible:ring-rh-ink");
const textLink =
  "group inline-flex items-center gap-2 rounded-sm text-[15px] font-semibold text-rh-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink";
const h2Class = "max-w-2xl text-[36px] font-bold leading-[1.05] tracking-tight sm:text-5xl";
const leadClass = "mt-4 max-w-xl text-base font-medium leading-relaxed sm:text-lg";

function Arrow() {
  return <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />;
}

/** "i" beside the hero buttons: what each one does, plus sign-in and docs, so the hero keeps two CTAs. */
function CtaInfo() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Which option is right for me?"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-rh-ink/50 transition-colors hover:bg-white hover:text-rh-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
      >
        <Info className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border-rh-ink/10 bg-white p-4 text-sm leading-relaxed text-rh-ink/75"
      >
        <p>
          <span className="font-semibold text-rh-ink">Book a demo</span> for a short call with our team.
        </p>
        <p className="mt-2">
          <span className="font-semibold text-rh-ink">Become a partner</span> to send your details. We&apos;ll set up your
          partner account.
        </p>
        <div className="mt-3 flex flex-col gap-1.5 border-t border-rh-ink/10 pt-3">
          <Link href="/partners/portal" className="font-semibold text-rh-ink hover:underline">
            Already a partner? Sign in
          </Link>
          <Link href="/integrations" className="font-semibold text-rh-ink hover:underline">
            Integration docs
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Subtle fade-up ───────────────────────────────
function Rise({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Content ──────────────────────────────────────
const REFERRAL_STEPS = [
  { title: "You refer", body: "Send a referral by link, portal or API, with the patient's consent." },
  { title: "We reach out", body: "Our care team contacts the patient, and Joy handles intake on WhatsApp." },
  { title: "They're matched", body: "An MRTBN-licensed physiotherapist, usually within 24 hours." },
  { title: "You follow along", body: "Track each referral's status and progress reports." },
];

const PARTNER_TYPES = [
  { title: "Hospitals, clinics & doctors", body: "Refer patients for physiotherapy and get progress reports back." },
  { title: "HMOs & insurers", body: "Send members to licensed physiotherapists and track every referral." },
  { title: "Employers", body: "Offer physiotherapy to your staff as part of their health benefits." },
  { title: "Gyms & sports clubs", body: "Share a referral link or QR code so members can get recovery care." },
  { title: "Healthtech platforms", body: "Add Rehabify's physiotherapists to your product with our REST API." },
];

type Cta = { label: string; href: string };

const PATHS = [
  {
    id: "links",
    label: "Referral links",
    short: "Links",
    heading: "Share a link. No code needed.",
    points: [
      "Create co-branded referral links in the partner portal",
      "Share them on WhatsApp, by SMS or as a QR code",
      "Sign-ups and paid bookings are credited to you for 30 days",
    ],
    ctas: [{ label: "Become a partner", href: "#inquiry" }] as Cta[],
  },
  {
    id: "portal",
    label: "Partner portal",
    short: "Portal",
    heading: "Refer and track from one dashboard.",
    points: [
      "Send referrals from a simple web form",
      "Follow each patient's status and progress reports",
      "See your commissions and payouts",
    ],
    ctas: [
      { label: "Create a partner account", href: "/partners/sign-up" },
      { label: "Sign in to the portal", href: "/partners/portal" },
    ] as Cta[],
  },
  {
    id: "api",
    label: "API & webhooks",
    short: "API",
    heading: "Build referrals into your own product.",
    points: [
      "Create referrals and search providers over a REST API",
      "Get a signed webhook event each time a referral moves",
      "Test everything in sandbox before you go live",
    ],
    ctas: [{ label: "Read the integration docs", href: "/integrations" }] as Cta[],
  },
] as const;

type PathId = (typeof PATHS)[number]["id"];

const DEV_FACTS = [
  "Sandbox and live keys (sk_test_ and sk_live_)",
  "Idempotency keys make retries safe",
  "Webhooks signed with X-Rehabify-Signature",
  "Failed webhook deliveries are retried automatically",
];

const TRUST: { title: string; body: ReactNode }[] = [
  { title: "Shared with consent", body: "Referrals are shared only with the patient's consent." },
  {
    title: "Covered by our privacy policy",
    body: (
      <>
        Patient data is handled under our{" "}
        <Link href="/privacy-policy" className="font-semibold text-rh-ink underline underline-offset-4 hover:no-underline">
          privacy policy
        </Link>
        .
      </>
    ),
  },
  { title: "Hashed API keys", body: "We store API keys as hashes and show each one only once." },
  { title: "Sandbox, then live", body: "Live access opens only after a separate go-live review." },
];

// ── Code Sample Component ────────────────────────
const CODE_ID = "partner-code";
const CODE_TABS = [
  { id: "referral", label: "Create referral", short: "Referral" },
  { id: "widget", label: "Referral link", short: "Link" },
  { id: "webhook", label: "Webhook event", short: "Webhook" },
] as const;
type CodeTab = (typeof CODE_TABS)[number]["id"];

function CodeSample() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<CodeTab>("referral");

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
    navigator.clipboard
      .writeText(codeSnippets[activeTab])
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-rh-ink-2 ring-1 ring-inset ring-white/10">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 p-3 sm:p-4">
        <SegmentedSwitch
          idBase={CODE_ID}
          label="Code examples"
          tone="dark"
          options={CODE_TABS}
          value={activeTab}
          onChange={setActiveTab}
          className="min-w-0 overflow-x-auto"
        />
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          title="Copy code"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/70 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
        >
          {copied ? <Check className="h-4 w-4 text-rh-lime" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      <div
        id={switchPanelId(CODE_ID)}
        role="tabpanel"
        aria-labelledby={switchTabId(CODE_ID, activeTab)}
        className="overflow-x-auto p-5 sm:p-7"
      >
        <pre className="font-mono text-[13px] leading-relaxed sm:text-sm">
          <code className="whitespace-pre text-white/85">{codeSnippets[activeTab]}</code>
        </pre>
      </div>
    </div>
  );
}

// ── Partner Inquiry Form ─────────────────────────
const fieldClass =
  "h-12 w-full rounded-2xl border border-rh-ink/10 bg-white px-4 text-[15px] text-rh-ink placeholder:text-rh-ink/40 transition-colors focus:border-rh-ink focus:outline-none focus:ring-4 focus:ring-rh-ink/[0.07]";
const labelClass = "mb-2 block text-[15px] font-semibold text-rh-ink";

function PartnerInquiryForm() {
  const [formData, setFormData] = useState({
    companyName: "",
    contactName: "",
    email: "",
    partnerType: "",
    message: "",
  });

  const submitInquiry = useMutation(submitPartnershipInquiryRef);

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
      `https://wa.me/2348122615453?text=${encodeURIComponent(waMessage)}`,
      "_blank"
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="pi-company" className={labelClass}>Company name</label>
          <input
            id="pi-company"
            type="text"
            required
            autoComplete="organization"
            value={formData.companyName}
            onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            className={fieldClass}
            placeholder="Acme Healthcare"
          />
        </div>
        <div>
          <label htmlFor="pi-contact" className={labelClass}>Contact name</label>
          <input
            id="pi-contact"
            type="text"
            required
            autoComplete="name"
            value={formData.contactName}
            onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
            className={fieldClass}
            placeholder="Dr. Adaeze Nwosu"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="pi-email" className={labelClass}>Email</label>
          <input
            id="pi-email"
            type="email"
            required
            autoComplete="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className={fieldClass}
            placeholder="adaeze@acme.com"
          />
        </div>
        <div>
          <label htmlFor="pi-type" className={labelClass}>Partnership type</label>
          <select
            id="pi-type"
            required
            value={formData.partnerType}
            onChange={(e) => setFormData({ ...formData, partnerType: e.target.value })}
            className={fieldClass}
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
        <label htmlFor="pi-message" className={labelClass}>What do you need?</label>
        <textarea
          id="pi-message"
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          rows={4}
          className={cn(fieldClass, "h-auto resize-none py-3 leading-relaxed")}
          placeholder="We'd like to refer patients from our hospital system..."
        />
      </div>
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:gap-5">
        <button type="submit" className={cn(primary, "w-full sm:w-auto")}>
          Send partnership inquiry
          <Arrow />
        </button>
        <p className="text-sm font-medium text-rh-ink/60">Opens WhatsApp with your details filled in.</p>
      </div>
    </form>
  );
}

// ── Integration paths (segmented) ────────────────
const PATHS_ID = "partner-paths";

function IntegrationPaths() {
  const reduce = useReducedMotion();
  const [id, setId] = useState<PathId>("links");
  const path = PATHS.find((p) => p.id === id) ?? PATHS[0];

  return (
    <section className="px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="mx-auto max-w-6xl">
        <Rise>
          <h2 className={cn(h2Class, "text-rh-ink")}>Choose how you connect.</h2>
          <p className={cn(leadClass, "text-rh-ink/75")}>Start with a link today and move to the API when you&apos;re ready.</p>
        </Rise>

        <SegmentedSwitch
          idBase={PATHS_ID}
          label="Ways to connect"
          options={PATHS}
          value={id}
          onChange={setId}
          className="mt-8 flex w-full sm:inline-flex sm:w-auto"
        />

        <div id={switchPanelId(PATHS_ID)} role="tabpanel" aria-labelledby={switchTabId(PATHS_ID, id)} className="mt-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={path.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="grid gap-6 rounded-[2rem] bg-white p-7 sm:p-10 lg:grid-cols-[0.9fr_1.1fr] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-8"
            >
              <h3 className="text-[26px] font-bold leading-tight tracking-tight text-rh-ink sm:text-[32px] lg:col-start-1 lg:row-start-1">
                {path.heading}
              </h3>
              <ul className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
                {path.points.map((point) => (
                  <li key={point} className="flex items-center gap-3 border-t border-rh-ink/10 py-4 text-base font-medium text-rh-ink/80">
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-rh-lime" />
                    {point}
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:col-start-1 lg:row-start-2 lg:self-end">
                {path.ctas.map((cta, i) => (
                  <Link key={cta.href} href={cta.href} className={i === 0 ? primary : secondary}>
                    {cta.label}
                    {i === 0 && <Arrow />}
                  </Link>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <Rise delay={0.05}>
          <div className="mt-5 flex flex-col gap-4 rounded-[2rem] bg-white p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
            <div>
              <h3 className="text-xl font-bold leading-tight text-rh-ink">Free to join.</h3>
              <p className="mt-1 max-w-2xl text-[15px] font-medium text-rh-ink/70">
                Partners earn commission on verified payments from patients they refer, as set in their partner agreement.
              </p>
            </div>
            <a href="#inquiry" className={cn(textLink, "shrink-0 self-start sm:self-center")}>
              Ask about terms
              <Arrow />
            </a>
          </div>
        </Rise>
      </div>
    </section>
  );
}

// ── Main Page Component ──────────────────────────
export default function PartnershipsPage() {
  const [demoOpen, setDemoOpen] = useState(false);
  return (
    <div className="min-h-screen bg-rh-canvas font-sans text-rh-ink">
      {/* ─── Hero ─────────────────────────────────── */}
      <section className="px-4 pb-20 pt-32 sm:px-6 sm:pt-36 lg:pb-28 lg:pt-44">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <Rise>
            <h1 className="text-[40px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-[56px] lg:text-[64px]">
              Connect the people you serve to licensed physiotherapy.
            </h1>
            <p className="mt-5 max-w-xl text-lg font-medium leading-relaxed text-rh-ink/75">
              Refer through a link, the partner portal or our REST API, and follow every patient&apos;s recovery.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" onClick={() => setDemoOpen(true)} className={primary}>
                Book a demo
                <Arrow />
              </button>
              <div className="flex items-center gap-2">
                <a href="#inquiry" className={cn(secondary, "flex-1 sm:flex-none")}>
                  Become a partner
                </a>
                <CtaInfo />
              </div>
            </div>
            <p className="mt-8 text-[15px] font-medium text-rh-ink/60">Partners include AwaDoc and MediLoan by MyItura.</p>
          </Rise>

          <Rise delay={0.08}>
            <div className="rounded-[2rem] bg-white p-7 sm:p-9">
              <h2 className="text-[22px] font-bold leading-tight text-rh-ink sm:text-2xl">How a referral works</h2>
              <ol className="mt-6">
                {REFERRAL_STEPS.map((step, i) => (
                  <li key={step.title} className="flex gap-4 border-t border-rh-ink/10 py-4 last:pb-0">
                    <span
                      aria-hidden
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rh-ink text-sm font-semibold text-white"
                    >
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-[17px] font-bold leading-snug text-rh-ink">{step.title}</span>
                      <span className="mt-0.5 block text-[15px] font-medium leading-relaxed text-rh-ink/70">{step.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </Rise>
        </div>
      </section>

      {/* ─── Who we work with ─────────────────────── */}
      <section className="px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="mx-auto max-w-6xl">
          <Rise>
            <h2 className={cn(h2Class, "text-rh-ink")}>Built for every kind of referrer.</h2>
            <p className={cn(leadClass, "text-rh-ink/75")}>From one clinic to a national health plan, refer the same way.</p>
          </Rise>
          <Rise delay={0.06}>
            <ol className="mt-10 grid gap-x-12 sm:grid-cols-2">
              {PARTNER_TYPES.map((partner, i) => (
                <li key={partner.title} className="flex gap-5 border-t border-rh-ink/10 py-5">
                  <span className="w-7 shrink-0 pt-0.5 text-[15px] font-semibold tabular-nums text-rh-ink/40">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="block text-lg font-bold leading-snug text-rh-ink">{partner.title}</span>
                    <span className="mt-1 block text-[15px] font-medium leading-relaxed text-rh-ink/70">{partner.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Rise>
        </div>
      </section>

      {/* ─── Integration paths ────────────────────── */}
      <IntegrationPaths />

      {/* ─── For developers ───────────────────────── */}
      <section className="overflow-hidden bg-rh-ink px-4 py-20 text-white sm:px-6 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <Rise>
              <h2 className={cn(h2Class, "text-white")}>Made for developers.</h2>
              <p className={cn(leadClass, "text-white/75")}>A REST API and signed webhooks, with a sandbox to build in first.</p>
              <div className="mt-8">
                <Link href="/integrations" className={primaryOnInk}>
                  Read the integration docs
                  <Arrow />
                </Link>
              </div>
            </Rise>
            <Rise delay={0.05}>
              <ul className="lg:pt-2">
                {DEV_FACTS.map((fact) => (
                  <li key={fact} className="flex items-center gap-3 border-t border-white/10 py-4 text-base font-medium text-white/85">
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-rh-lime" />
                    {fact}
                  </li>
                ))}
              </ul>
            </Rise>
          </div>

          <Rise delay={0.1} className="relative mt-12 lg:mt-16">
            <PairingShapes className="-right-5 -top-6 h-28 w-28 sm:-right-8 sm:-top-8 sm:h-40 sm:w-40" />
            <CodeSample />
          </Rise>
        </div>
      </section>

      {/* ─── Trust ────────────────────────────────── */}
      <section className="px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <Rise>
            <h2 className={cn(h2Class, "text-rh-ink")}>Patient data, handled with care.</h2>
            <p className={cn(leadClass, "text-rh-ink/75")}>Every Rehabify physiotherapist is MRTBN-licensed.</p>
          </Rise>
          <Rise delay={0.06}>
            <ol className="mt-10 grid gap-x-12 sm:grid-cols-2">
              {TRUST.map((item, i) => (
                <li key={item.title} className="flex gap-5 border-t border-rh-ink/10 py-5">
                  <span className="w-7 shrink-0 pt-0.5 text-[15px] font-semibold tabular-nums text-rh-ink/40">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="block text-lg font-bold leading-snug text-rh-ink">{item.title}</span>
                    <span className="mt-1 block text-[15px] font-medium leading-relaxed text-rh-ink/70">{item.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Rise>
        </div>
      </section>

      {/* ─── Inquiry Form ─────────────────────────── */}
      <section id="inquiry" className="scroll-mt-24 px-4 pb-24 sm:px-6 lg:pb-32">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Rise>
            <h2 className={cn(h2Class, "text-rh-ink")}>Tell us about your organisation.</h2>
            <p className={cn(leadClass, "text-rh-ink/75")}>Share a few details and we&apos;ll pick it up with you on WhatsApp.</p>
            <p className="mt-6 text-[15px] font-medium text-rh-ink/70">
              Prefer to talk it through?{" "}
              <button
                type="button"
                onClick={() => setDemoOpen(true)}
                className="rounded-sm font-semibold text-rh-ink underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
              >
                Book a demo
              </button>
            </p>
          </Rise>

          <Rise delay={0.05}>
            <div className="rounded-[2rem] bg-white p-6 sm:p-9">
              <PartnerInquiryForm />
            </div>
          </Rise>
        </div>
      </section>

      <BookDemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
    </div>
  );
}
