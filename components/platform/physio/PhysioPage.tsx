"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowRight, Plus } from "@/components/icons";
import { MarketingVideo } from "@/components/landing/MarketingVideo";
import { SegmentedSwitch, switchPanelId, switchTabId } from "@/components/landing/SegmentedSwitch";
import { PairingShapes } from "@/components/learn/shared";
import { SnapCarousel } from "@/components/marketing/SnapCarousel";
import { posterUrl } from "@/convex/exerciseLibraryCatalog";
import { signUpHrefFor } from "@/lib/auth/signupIntent";
import { MARKETING_VIDEOS } from "@/lib/marketingVideos";
import { cn } from "@/lib/utils";

/**
 * /platform/physiotherapists, in four parts: hero, the two ways to use Rehabify (a switch between
 * the free practice tools and the care network, so it stays one section), questions, closing call.
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const SIGN_UP = signUpHrefFor("physiotherapist");
const WAYS_ID = "two-ways";

const primary =
  "group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const secondaryOnLight =
  "inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[15px] font-semibold text-rh-ink ring-1 ring-inset ring-rh-ink/10 transition-colors hover:bg-rh-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink";
const secondaryOnInk =
  "inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-semibold text-white ring-1 ring-inset ring-white/25 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime";

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

function StartFree({ onInk = false }: { onInk?: boolean }) {
  return (
    <Link href={SIGN_UP} className={cn(primary, onInk ? "focus-visible:ring-rh-lime focus-visible:ring-offset-rh-ink" : "focus-visible:ring-rh-ink")}>
      Start free
      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}

// ─── Small product sketches for the tool cards (ink and lime, no screenshots of old designs) ───

function TemplatesSketch() {
  const rows = ["ACL reconstruction: weeks 1–6", "Acute low back pain", "Frozen shoulder"];
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-4">
      {rows.map((row, i) => (
        <div key={row} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-2.5 text-[13px] font-medium text-rh-ink">
          <span className="truncate">{row}</span>
          {i === 0 && <span className="shrink-0 rounded-full bg-rh-lime px-2.5 py-0.5 text-[11px] font-semibold">Use</span>}
        </div>
      ))}
    </div>
  );
}

function CallSketch() {
  return (
    <div className="relative h-full p-4">
      <div className="flex h-full items-center justify-center rounded-2xl bg-rh-ink">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white">AO</span>
        <span className="absolute right-7 top-7 flex h-12 w-10 items-center justify-center rounded-lg bg-rh-ink-3 text-[11px] font-semibold text-white ring-1 ring-white/10">You</span>
      </div>
      <span className="absolute bottom-7 left-7 max-w-[70%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-[12px] text-rh-ink shadow-soft">
        Knee feels better after the exercises
      </span>
    </div>
  );
}

function WeekSketch() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const booked = [[0, 2], [1], [0, 1, 3], [2], [1, 2]];
  return (
    <div className="grid h-full grid-cols-5 gap-1.5 p-4">
      {days.map((day, d) => (
        <div key={day} className="flex flex-col gap-1.5">
          <span className="text-center text-[11px] font-semibold text-rh-ink/60">{day}</span>
          {[0, 1, 2, 3].map((slot) => (
            <span key={slot} className={cn("flex-1 rounded-lg", booked[d].includes(slot) ? "bg-rh-ink" : "bg-white")} />
          ))}
        </div>
      ))}
    </div>
  );
}

function InvoiceSketch() {
  const rows = [
    { who: "Invoice to A. Okafor", status: "Paid" },
    { who: "Invoice to T. Bello", status: "Sent" },
    { who: "Invoice to K. Eze", status: "Paid" },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-4">
      {rows.map((row) => (
        <div key={row.who} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-2.5 text-[13px] font-medium text-rh-ink">
          <span className="truncate">{row.who}</span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
              row.status === "Paid" ? "bg-rh-lime text-rh-ink" : "bg-rh-ink/[0.06] text-rh-ink/70",
            )}
          >
            {row.status}
          </span>
        </div>
      ))}
    </div>
  );
}

type Tool = { title: string; body: string; visual: ReactNode; note?: string };

const TOOLS: Tool[] = [
  {
    title: "Every patient in one place",
    body: "History, SOAP notes and care plans, ready before each session.",
    visual: (
      <Image
        src="/logos/images/Group 469272 (1).webp"
        alt="A physiotherapist treating a patient"
        fill
        sizes="(min-width: 1024px) 360px, 84vw"
        className="object-cover object-[center_20%]"
      />
    ),
  },
  { title: "Care plans in minutes", body: "Start from templates you've saved instead of writing from scratch.", visual: <TemplatesSketch /> },
  {
    title: "Exercise programmes patients actually follow",
    body: "Build programmes from our 3D exercise library. Patients see clear demonstrations at home.",
    note: "New: camera coach tracks reps and form (beta)",
    visual: (
      <Image src={posterUrl("mini-squat")} alt="A mini squat from the Rehabify 3D exercise library" fill sizes="(min-width: 1024px) 360px, 84vw" className="bg-white object-contain p-3" />
    ),
  },
  { title: "See patients anywhere", body: "Video sessions and messaging, so you can follow up between visits.", visual: <CallSketch /> },
  { title: "Your week, organised", body: "Set your hours and see your appointments at a glance.", visual: <WeekSketch /> },
  { title: "Get paid without chasing", body: "Send invoices, and track what's been paid.", visual: <InvoiceSketch /> },
];

const NETWORK = [
  {
    title: "Patients come to you",
    body: "Patients across Nigeria message Joy on WhatsApp. Joy screens for warning signs, then matches them to a network physio by condition, location and availability. That includes MSK, stroke and neurological rehab, recovery after surgery, and more.",
  },
  { title: "You choose what to accept", body: "You get the patient's summary first, then accept and book." },
  {
    title: "Fair, predictable pay",
    body: "Network sessions are priced at Rehabify's standard rates, and you earn a fixed payout for every completed session.",
  },
  { title: "Referrals from doctors too", body: "GPs and hospitals refer through Rehabify, so your patient list grows beyond walk-ins." },
];

const STEPS: { title: string; body: string }[] = [
  { title: "Sign up free", body: "and set up your practice tools." },
  { title: "Apply", body: "with your MRTBN licence. We review every application." },
  { title: "Start receiving patients", body: "matched to your skills and area." },
];

const FAQS: { question: string; answer: ReactNode }[] = [
  {
    question: "Is it really free?",
    answer: "Yes. The practice tools are free for physiotherapists using them with their own patients, within our fair-use limits.",
  },
  {
    question: "Can I keep my own clinic and patients?",
    answer: "Yes. Rehabify works alongside your current practice. Your own patients stay yours.",
  },
  {
    question: "Do I have to take every network patient?",
    answer: "No. You choose which patients to accept, based on your skills and availability.",
  },
  {
    question: "How do network payouts work?",
    answer: (
      <>
        You earn a fixed payout for every completed session. The full details are in our{" "}
        <Link href="/payout-policy" className="font-semibold text-rh-ink underline underline-offset-4">
          Payout Policy
        </Link>
        .
      </>
    ),
  },
  {
    question: "Who can see my patients' information?",
    answer:
      "Only you and the people involved in their care, with the patient's consent. Patient data is protected under the Nigeria Data Protection Act.",
  },
];

const WAYS = [
  { id: "practice", label: "Run your practice: free", short: "Your practice" },
  { id: "network", label: "Get patients from us", short: "Get patients" },
] as const;
type WayId = (typeof WAYS)[number]["id"];

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <article className="flex w-full flex-col rounded-[1.75rem] bg-white p-4 ring-1 ring-inset ring-rh-ink/[0.06]">
      <div className="relative h-[200px] overflow-hidden rounded-[1.25rem] bg-rh-canvas">{tool.visual}</div>
      <h4 className="mt-5 px-1 text-lg font-bold leading-snug text-rh-ink">{tool.title}</h4>
      <p className="mt-1.5 px-1 pb-1 text-[15px] leading-relaxed text-rh-ink/70">{tool.body}</p>
      {tool.note && (
        <span className="mx-1 mb-1 mt-auto inline-flex w-fit rounded-full bg-rh-ink px-3 py-1 text-xs font-semibold text-white">{tool.note}</span>
      )}
    </article>
  );
}

export default function PhysioPage() {
  const reduce = useReducedMotion();
  const [way, setWay] = useState<WayId>("practice");

  // "#network" (from the landing page or the buttons below) opens the network side.
  useEffect(() => {
    const sync = () => {
      if (window.location.hash !== "#network") return;
      setWay("network");
      document.getElementById(WAYS_ID)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [reduce]);

  const openNetwork = (event: MouseEvent<HTMLAnchorElement>) => {
    // Same hash twice doesn't fire hashchange, so open it directly too.
    if (window.location.hash === "#network") {
      event.preventDefault();
      setWay("network");
      document.getElementById(WAYS_ID)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-rh-canvas text-rh-ink">
      {/* Hero */}
      <section className="px-4 pb-16 pt-32 sm:px-6 sm:pt-40 lg:pb-24">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
          <motion.div initial={reduce ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE }}>
            <h1 className="max-w-xl text-[40px] font-bold leading-[1.04] tracking-tight text-rh-ink sm:text-[56px]">
              Better tools for your practice.{" "}
              <span className="text-rh-ink/55">
                More patients when you join our network.
                <a href="#network-note" aria-label="See note" className="no-underline">
                  *
                </a>
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-lg font-medium leading-relaxed text-rh-ink/70 sm:text-xl">
              Rehabify gives you a free practice system built for Nigerian physiotherapists. Join our care network and we&apos;ll also send you patients,
              matched to your skills and your area.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <StartFree />
              <a href="#network" onClick={openNetwork} className={secondaryOnLight}>
                Join the care network
              </a>
            </div>
            <p id="network-note" className="mt-5 text-sm text-rh-ink/55">
              *For licensed physiotherapists. We review every application.
            </p>
          </motion.div>

          <motion.div initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}>
            <MarketingVideo
              url={MARKETING_VIDEOS.physiotherapist}
              title="Rehabify for physiotherapists"
              fallback={{ src: "/logos/images/Group 469272.webp", alt: "A Rehabify physiotherapist coaching a patient through an exercise" }}
            />
          </motion.div>
        </div>
      </section>

      {/* Two ways to use Rehabify: one section, a switch between the two */}
      <section id={WAYS_ID} className="scroll-mt-24 px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="mx-auto max-w-6xl">
          <Rise>
            <h2 className="max-w-2xl text-[36px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-5xl">Two ways to use Rehabify.</h2>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-rh-ink/70">You can start with one and add the other any time.</p>
            <SegmentedSwitch
              idBase={WAYS_ID}
              label="Two ways to use Rehabify"
              options={WAYS}
              value={way}
              onChange={setWay}
              className="mt-8 flex w-full sm:inline-flex sm:w-auto"
            />
          </Rise>

          {/* Both sides stay in the page (for search engines and anchors); only one shows. */}
          <div id={switchPanelId(WAYS_ID)} role="tabpanel" aria-labelledby={switchTabId(WAYS_ID, way)} className="mt-10">
            <div hidden={way !== "practice"} className="animate-in fade-in duration-300">
              <h3 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">Run your practice better: free</h3>
              <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-rh-ink/70 sm:text-[17px]">
                Bring your own patients and manage everything in one place: notes, care plans, exercises, appointments and payments.
              </p>
              <SnapCarousel label="Tools for your practice" className="mt-8">
                {TOOLS.map((tool) => (
                  <ToolCard key={tool.title} tool={tool} />
                ))}
              </SnapCarousel>
              <div className="mt-2">
                <StartFree />
              </div>
            </div>

            <div id="network" hidden={way !== "network"} className="animate-in fade-in duration-300">
              <h3 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">Get patients from us: join the network</h3>
              <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-rh-ink/70 sm:text-[17px]">
                Licensed physiotherapists in our network receive patients matched by Joy, our AI assistant. No adverts, no marketing cost.
              </p>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                {NETWORK.map((item) => (
                  <article key={item.title} className="rounded-[1.75rem] bg-white p-6 ring-1 ring-inset ring-rh-ink/[0.06] sm:p-7">
                    <h4 className="text-lg font-bold leading-snug text-rh-ink sm:text-xl">{item.title}</h4>
                    <p className="mt-2 text-[15px] leading-relaxed text-rh-ink/70 sm:text-base">{item.body}</p>
                  </article>
                ))}
              </div>

              <div className="mt-4 rounded-[1.75rem] bg-rh-ink p-6 text-white sm:p-8">
                <h4 className="text-xl font-bold sm:text-2xl">How to join the network</h4>
                <ol className="mt-6 grid gap-5 md:grid-cols-3">
                  {STEPS.map((step, i) => (
                    <li key={step.title} className="flex gap-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rh-lime text-sm font-bold text-rh-ink">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="pt-1 text-[15px] leading-relaxed text-white/75">
                        <span className="font-semibold text-white">{step.title}</span> {step.body}
                      </p>
                    </li>
                  ))}
                </ol>
                <p className="mt-7 border-t border-white/10 pt-5 text-[15px] leading-relaxed text-white/75">
                  <span className="font-semibold text-white">Keep growing:</span> join our{" "}
                  <Link href="/learn" className="font-semibold text-rh-lime underline-offset-4 hover:underline">
                    MSK Specialist Program
                  </Link>
                  , a live, cohort-based course, to sharpen your skills.
                </p>
                <div className="mt-7">
                  <Link href={SIGN_UP} className={cn(primary, "focus-visible:ring-rh-lime focus-visible:ring-offset-rh-ink")}>
                    Join the care network
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Questions */}
      <section id="faqs" className="scroll-mt-24 px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Rise>
            <h2 className="text-[36px] font-bold leading-[1.05] tracking-tight sm:text-5xl">Questions physios ask.</h2>
          </Rise>
          <Rise delay={0.06} className="border-b border-rh-ink/10">
            {FAQS.map((item) => (
              <details key={item.question} className="group border-t border-rh-ink/10">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-semibold leading-snug sm:text-xl [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <Plus className="h-4 w-4 shrink-0 transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none" />
                </summary>
                <p className="-mt-2 max-w-2xl pb-6 text-[15px] leading-relaxed text-rh-ink/65 sm:text-base">{item.answer}</p>
              </details>
            ))}
          </Rise>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="px-4 pb-20 sm:px-6 lg:pb-28">
        <Rise className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-[2rem] bg-rh-ink px-6 py-12 text-white sm:rounded-[2.5rem] sm:px-12 sm:py-16 lg:px-16">
            <PairingShapes className="-bottom-16 -right-12 hidden h-64 w-64 sm:block" />
            <div className="relative max-w-2xl">
              <h2 className="text-[32px] font-bold leading-[1.1] tracking-tight text-white sm:text-[44px]">Built by physiotherapists, for physiotherapists.</h2>
              <p className="mt-4 text-lg font-medium leading-relaxed text-white/75">Better tools today. More patients when you&apos;re ready.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <StartFree onInk />
                <a href="#network" onClick={openNetwork} className={secondaryOnInk}>
                  Join the care network
                </a>
              </div>
            </div>
          </div>
        </Rise>
      </section>
    </div>
  );
}
