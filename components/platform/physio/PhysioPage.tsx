"use client";

import Image from "next/image";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, Check, Plus, X } from "@/components/icons";
import { MarketingVideo } from "@/components/landing/MarketingVideo";
import { PairingShapes } from "@/components/learn/shared";
import { AnimatedList } from "@/components/magicui/animated-list";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { CallScene } from "@/components/marketing/CallScene";
import { LoopVideo } from "@/components/marketing/LoopVideo";
import { SnapCarousel } from "@/components/marketing/SnapCarousel";
import { signUpHrefFor } from "@/lib/auth/signupIntent";
import { MARKETING_VIDEOS } from "@/lib/marketingVideos";
import { cn } from "@/lib/utils";

/**
 * /platform/physiotherapists: hero, the two ways to use Rehabify (both visible; "Read more" opens
 * the network details in a drawer), the practice tools, questions and a closing call. A slim
 * "Start free" bar floats once the hero has scrolled away, so readers never scroll back to start.
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const SIGN_UP = signUpHrefFor("physiotherapist");

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

function StartFree({ onInk = false, className }: { onInk?: boolean; className?: string }) {
  return (
    <Link
      href={SIGN_UP}
      className={cn(primary, onInk ? "focus-visible:ring-rh-lime focus-visible:ring-offset-rh-ink" : "focus-visible:ring-rh-ink", className)}
    >
      Start free
      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}

// ─── Small product sketches for the tool cards (ink and lime, no screenshots of old designs) ───
// They animate while on screen (Magic UI components, components/magicui) and replay when a reader
// swipes back to them; reduced motion shows the final state.

/** True while the element is on screen; always true for reduced motion (final state, no movement). */
function useShown(amount = 0.4) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount });
  const reduce = useReducedMotion();
  return { ref, shown: inView || Boolean(reduce), moving: inView && !reduce, reduce: Boolean(reduce) };
}

function RecordSketch() {
  const { ref, moving } = useShown();
  const items = ["History and red flags", "SOAP note saved", "Care plan updated"];
  return (
    <div ref={ref} className="relative h-full overflow-hidden">
      <motion.div
        className="absolute inset-0"
        animate={moving ? { scale: [1, 1.07, 1] } : { scale: 1 }}
        transition={moving ? { duration: 14, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
      >
        <Image
          src="/logos/images/Group 469272 (1).webp"
          alt="A physiotherapist treating a patient"
          fill
          sizes="(min-width: 1024px) 360px, 84vw"
          className="object-cover object-[center_20%]"
        />
      </motion.div>
      <AnimatedList replay order="stack" startDelay={500} delay={900} loopAfter={3500} className="absolute bottom-3 left-3 w-[64%] items-stretch gap-1.5">
        {items.map((item) => (
          <p key={item} className="flex items-center gap-2 rounded-xl bg-white/95 px-3 py-1.5 text-[12px] font-semibold text-rh-ink shadow-soft">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rh-lime">
              <Check className="h-2.5 w-2.5" />
            </span>
            {item}
          </p>
        ))}
      </AnimatedList>
    </div>
  );
}

function TemplatesSketch() {
  const rows = ["ACL reconstruction: weeks 1–6", "Acute low back pain", "Frozen shoulder"];
  return (
    <div className="flex h-full flex-col justify-center p-4">
      <AnimatedList replay order="chat" startDelay={300} delay={600} loopAfter={3500} className="items-stretch gap-1.5">
        {rows.map((row, i) => (
          <div key={row} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-2 text-[13px] font-medium text-rh-ink">
            <span className="truncate">{row}</span>
            {i === 0 && <span className="shrink-0 rounded-full bg-rh-lime px-2.5 py-0.5 text-[11px] font-semibold">Use</span>}
          </div>
        ))}
        <div key="ready" className="flex items-center gap-2 rounded-2xl bg-rh-ink px-3.5 py-2 text-[13px] font-semibold text-white">
          <Check className="h-3.5 w-3.5 shrink-0 text-rh-lime" />
          <span className="truncate">Plan ready, from ACL reconstruction</span>
        </div>
      </AnimatedList>
    </div>
  );
}

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const BOOKED = [[0, 2], [1], [0, 1, 3], [2], [1, 2]];
const NEW_BOOKING = { day: 3, slot: 1 };

function WeekSketch() {
  const { ref, shown, moving, reduce } = useShown();
  // A new booking lands a moment after the week fills in, then the loop starts again
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (reduce) return setFresh(true);
    if (!moving) return setFresh(false);
    const t = setInterval(() => setFresh((f) => !f), 2600);
    return () => clearInterval(t);
  }, [moving, reduce]);
  let order = 0;
  return (
    <div ref={ref} className="relative grid h-full grid-cols-5 gap-1.5 p-4">
      {WEEK_DAYS.map((day, d) => (
        <div key={day} className="flex flex-col gap-1.5">
          <span className="text-center text-[11px] font-semibold text-rh-ink/60">{day}</span>
          {[0, 1, 2, 3].map((slot) => {
            const booked = BOOKED[d].includes(slot);
            const isNew = d === NEW_BOOKING.day && slot === NEW_BOOKING.slot;
            const delay = booked ? 0.05 * order++ : 0;
            return (
              <span key={slot} className="relative flex-1 rounded-lg bg-white">
                {(booked || isNew) && (
                  <motion.span
                    className={cn("absolute inset-0 rounded-lg", isNew ? "bg-rh-lime" : "bg-rh-ink")}
                    initial={false}
                    animate={(isNew ? fresh : shown) ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 20, delay: isNew ? 0 : delay }}
                  />
                )}
              </span>
            );
          })}
        </div>
      ))}
      <AnimatePresence>
        {fresh && !reduce && (
          <motion.p
            key="toast"
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className="absolute inset-x-6 bottom-3 rounded-xl bg-rh-ink px-3 py-2 text-center text-[12px] font-semibold text-white shadow-soft"
          >
            New booking · Thu 10:00
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

const INVOICES = [
  { who: "Invoice to A. Okafor", paid: true },
  { who: "Invoice to T. Bello", paid: false },
  { who: "Invoice to K. Eze", paid: true },
];

function InvoiceSketch() {
  const { ref, moving, reduce } = useShown();
  // T. Bello's invoice gets paid while you watch
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (reduce) return setSettled(true);
    if (!moving) return setSettled(false);
    const t = setTimeout(() => setSettled(true), 2400);
    return () => clearTimeout(t);
  }, [moving, reduce]);
  return (
    <div ref={ref} className="flex h-full flex-col justify-center gap-2 p-4">
      <p className="flex items-baseline justify-between px-1 text-[12px] font-semibold text-rh-ink/60">
        Received this week
        <span className="text-[15px] font-bold text-rh-ink">
          ₦<NumberTicker value={settled ? 63000 : 45000} replay />
        </span>
      </p>
      <AnimatedList replay order="chat" startDelay={200} delay={450} className="items-stretch gap-2">
        {INVOICES.map((row) => {
          const paid = row.paid || settled;
          return (
            <div key={row.who} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-2 text-[13px] font-medium text-rh-ink">
              <span className="truncate">{row.who}</span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={paid ? "paid" : "sent"}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                    paid ? "bg-rh-lime text-rh-ink" : "bg-rh-ink/[0.06] text-rh-ink/70",
                  )}
                >
                  {paid ? (
                    <>
                      Paid <Check className="h-2.5 w-2.5" />
                    </>
                  ) : (
                    "Sent"
                  )}
                </motion.span>
              </AnimatePresence>
            </div>
          );
        })}
      </AnimatedList>
    </div>
  );
}

type Tool = { title: string; body: string; visual: ReactNode; note?: string };

const TOOLS: Tool[] = [
  { title: "Every patient in one place", body: "History, SOAP notes and care plans, ready before each session.", visual: <RecordSketch /> },
  { title: "Care plans in minutes", body: "Start from templates you've saved instead of writing from scratch.", visual: <TemplatesSketch /> },
  {
    title: "Exercise programmes patients actually follow",
    body: "Build programmes from our 3D exercise library. Patients see clear demonstrations at home.",
    note: "New: camera coach for reps and form (beta)",
    visual: (
      <LoopVideo base="/media/camera-coach-sts" label="Demo: the camera coach follows sit to stand, counts the reps and talks you through it" className="object-center" sound />
    ),
  },
  {
    title: "See patients anywhere",
    body: "Video sessions and messaging, so you can follow up between visits.",
    visual: <CallScene compact className="p-4" initials="AO" incoming="Knee feels better after the exercises" outgoing="Great, let's add a third set 💪🏾" />,
  },
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

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <article className="flex w-full flex-col rounded-[1.75rem] bg-white p-4 ring-1 ring-inset ring-rh-ink/[0.06]">
      <div className="relative h-[200px] overflow-hidden rounded-[1.25rem] bg-rh-canvas">{tool.visual}</div>
      <h4 className="mt-5 px-1 text-lg font-bold leading-snug text-rh-ink">{tool.title}</h4>
      <p className="mt-1.5 px-1 pb-1 text-[15px] leading-relaxed text-rh-ink/70">{tool.body}</p>
      {tool.note && (
        <div className="mt-auto px-1 pb-1 pt-3">
          <span className="inline-flex rounded-full bg-rh-ink px-3 py-1 text-xs font-semibold text-white">{tool.note}</span>
        </div>
      )}
    </article>
  );
}

// ─── "Patients from the Rehabify network": read, then close and carry on where you were ───

function NetworkDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[85] bg-rh-ink/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-[86] flex max-h-[92vh] flex-col rounded-t-[2rem] bg-rh-canvas",
            "sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(94vw,520px)] sm:rounded-none sm:rounded-l-[2rem]",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:slide-in-from-right-10",
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5 sm:px-7 sm:pt-7">
            <Dialog.Title className="text-[26px] font-bold leading-tight tracking-tight text-rh-ink">Patients from the Rehabify network</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-rh-ink ring-1 ring-inset ring-rh-ink/10 hover:bg-rh-ink hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-6 sm:px-7">
            <p className="text-[16px] leading-relaxed text-rh-ink/70">
              Licensed physiotherapists in our network receive patients matched by Joy, our AI assistant. No adverts, no marketing cost.
            </p>

            <div className="mt-6 space-y-3">
              {NETWORK.map((item) => (
                <article key={item.title} className="rounded-[1.5rem] bg-white p-5 ring-1 ring-inset ring-rh-ink/[0.06]">
                  <h3 className="text-lg font-bold leading-snug text-rh-ink">{item.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-rh-ink/70">{item.body}</p>
                </article>
              ))}
            </div>

            <div className="mt-3 rounded-[1.5rem] bg-rh-ink p-5 text-white sm:p-6">
              <h3 className="text-xl font-bold">How to join the network</h3>
              <ol className="mt-5 space-y-4">
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
              <p className="mt-6 border-t border-white/10 pt-5 text-[15px] leading-relaxed text-white/75">
                <span className="font-semibold text-white">Keep growing:</span> join our{" "}
                <Link href="/learn" className="font-semibold text-rh-lime underline-offset-4 hover:underline">
                  MSK Specialist Program
                </Link>
                , a live, cohort-based course, to sharpen your skills.
              </p>
            </div>
          </div>

          <div className="border-t border-rh-ink/10 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-7">
            <Link href={SIGN_UP} className={cn(primary, "w-full focus-visible:ring-rh-ink")}>
              Join the care network
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function PhysioPage() {
  const reduce = useReducedMotion();
  const [networkOpen, setNetworkOpen] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLElement>(null);

  // "#network" (from the landing page) opens the network details.
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === "#network") setNetworkOpen(true);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const setNetwork = useCallback((open: boolean) => {
    setNetworkOpen(open);
    // Clear the hash on close so the same link opens it again
    if (!open && window.location.hash === "#network") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  // The floating bar shows once the hero is gone, and steps aside for the closing call.
  useEffect(() => {
    const hero = heroRef.current;
    const end = endRef.current;
    if (!hero || !end) return;
    const heroObserver = new IntersectionObserver(([entry]) => setPastHero(!entry.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    const endObserver = new IntersectionObserver(([entry]) => setAtEnd(entry.isIntersecting));
    heroObserver.observe(hero);
    endObserver.observe(end);
    return () => {
      heroObserver.disconnect();
      endObserver.disconnect();
    };
  }, []);

  const showBar = pastHero && !atEnd;

  return (
    <div className="min-h-screen overflow-x-hidden bg-rh-canvas text-rh-ink">
      {/* Hero */}
      <section ref={heroRef} className="px-4 pb-16 pt-32 sm:px-6 sm:pt-40 lg:pb-24">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
          <motion.div initial={reduce ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE }}>
            <h1 className="max-w-xl text-[40px] font-bold leading-[1.04] tracking-tight text-rh-ink sm:text-[56px]">Better tools for your practice.</h1>
            <p className="mt-3 max-w-lg text-lg font-semibold leading-snug text-rh-ink/60 sm:text-xl">More patients when you join our network.</p>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-rh-ink/70">
              Rehabify gives you a free practice system built for Nigerian physiotherapists. Join our care network and we&apos;ll also send you patients,
              matched to your skills and your area.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <StartFree />
              <button type="button" onClick={() => setNetwork(true)} className={secondaryOnLight}>
                Join the care network
              </button>
            </div>
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

      {/* Two ways to use Rehabify: both visible, network details one tap away */}
      <section id="two-ways" className="scroll-mt-24 px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="mx-auto max-w-6xl">
          <Rise>
            <h2 className="max-w-2xl text-[36px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-5xl">Two ways to use Rehabify.</h2>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-rh-ink/70">You can start with one and add the other any time.</p>
          </Rise>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Rise className="flex">
              <article className="flex w-full flex-col rounded-[2rem] bg-white p-6 ring-1 ring-inset ring-rh-ink/[0.06] sm:p-8">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rh-ink text-sm font-bold text-white">01</span>
                <h3 className="mt-5 text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">Run your practice better: free</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-rh-ink/70">
                  Bring your own patients and manage everything in one place: notes, care plans, exercises, appointments and payments.
                </p>
                <div className="mt-auto flex flex-col gap-3 pt-7 sm:flex-row sm:items-center">
                  <StartFree />
                  <a href="#tools" className="inline-flex h-12 items-center justify-center gap-2 px-3 text-[15px] font-semibold text-rh-ink underline-offset-4 hover:underline">
                    See the tools <ArrowDown className="h-3.5 w-3.5" />
                  </a>
                </div>
              </article>
            </Rise>

            <Rise delay={0.06} className="flex">
              <article className="relative flex w-full flex-col overflow-hidden rounded-[2rem] bg-rh-ink p-6 text-white sm:p-8">
                <PairingShapes className="-bottom-14 -right-12 hidden h-48 w-48 opacity-70 sm:block" />
                <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-rh-lime text-sm font-bold text-rh-ink">02</span>
                <h3 className="relative mt-5 text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">Get patients from us: join the network</h3>
                <p className="relative mt-3 text-[16px] leading-relaxed text-white/75">
                  Licensed physiotherapists in our network receive patients matched by Joy, our AI assistant. No adverts, no marketing cost.
                </p>
                <div className="relative mt-auto flex flex-col gap-3 pt-7 sm:flex-row">
                  <button type="button" onClick={() => setNetwork(true)} className={cn(primary, "focus-visible:ring-rh-lime focus-visible:ring-offset-rh-ink")}>
                    Read more
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </button>
                  <Link href={SIGN_UP} className={secondaryOnInk}>
                    Join the care network
                  </Link>
                </div>
              </article>
            </Rise>
          </div>

          <div id="tools" className="scroll-mt-24 pt-16">
            <Rise>
              <h3 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">Tools for your practice</h3>
            </Rise>
            <SnapCarousel label="Tools for your practice" className="mt-8">
              {TOOLS.map((tool) => (
                <ToolCard key={tool.title} tool={tool} />
              ))}
            </SnapCarousel>
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
      <section ref={endRef} className="px-4 pb-20 sm:px-6 lg:pb-28">
        <Rise className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-[2rem] bg-rh-ink px-6 py-12 text-white sm:rounded-[2.5rem] sm:px-12 sm:py-16 lg:px-16">
            <PairingShapes className="-bottom-16 -right-12 hidden h-64 w-64 sm:block" />
            <div className="relative max-w-2xl">
              <h2 className="text-[32px] font-bold leading-[1.1] tracking-tight text-white sm:text-[44px]">Built by physiotherapists, for physiotherapists.</h2>
              <p className="mt-4 text-lg font-medium leading-relaxed text-white/75">Better tools today. More patients when you&apos;re ready.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <StartFree onInk />
                <button type="button" onClick={() => setNetwork(true)} className={secondaryOnInk}>
                  Join the care network
                </button>
              </div>
            </div>
          </div>
        </Rise>
      </section>

      {/* Floating "Start free" once the hero has scrolled away (below dialogs and the cookie banner) */}
      <AnimatePresence>
        {showBar && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[55] sm:inset-x-auto sm:bottom-5 sm:right-5"
          >
            <div className="flex items-center justify-between gap-3 rounded-full bg-rh-ink p-1.5 pl-5 text-white shadow-lift">
              <span className="text-sm font-semibold sm:hidden">Free for your own patients</span>
              <button
                type="button"
                onClick={() => setNetwork(true)}
                className="hidden text-sm font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline sm:inline"
              >
                Get patients from us
              </button>
              <StartFree onInk className="h-11 px-5 text-sm" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <NetworkDrawer open={networkOpen} onOpenChange={setNetwork} />
    </div>
  );
}
