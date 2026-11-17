"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ArrowDown, ArrowRight, Car, Check, CheckCheck, Factory, Footprints, Lock, Plus, ShieldCheck, Truck } from "@/components/icons";
import { PairingShapes } from "@/components/learn/shared";
import { AnimatedList } from "@/components/magicui/animated-list";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { CallScene } from "@/components/marketing/CallScene";
import { LoopVideo } from "@/components/marketing/LoopVideo";
import { SnapCarousel } from "@/components/marketing/SnapCarousel";
import { cn } from "@/lib/utils";
import { PilotRequestDialog } from "./PilotRequestDialog";

/**
 * /platform/employers (Rehabify for Work): hero with Joy checking in on a worker, how it works as
 * five animated cards, who it's for, what you get and pricing, questions and a closing call. Same
 * look and motion as the physio page. "Request a pilot" opens a form (and "#pilot" opens it from
 * other pages); a slim bar keeps the button in reach once the hero has scrolled away.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

const primary =
  "group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const secondaryOnLight =
  "group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold text-rh-ink ring-1 ring-inset ring-rh-ink/10 transition-colors hover:bg-rh-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink";

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

function RequestPilot({ onClick, onInk = false, className }: { onClick: () => void; onInk?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(primary, onInk ? "focus-visible:ring-rh-lime focus-visible:ring-offset-rh-ink" : "focus-visible:ring-rh-ink", className)}
    >
      Request a pilot
      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </button>
  );
}

/** True while the element is on screen; always true for reduced motion (final state, no movement). */
function useShown(amount = 0.4) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount });
  const reduce = useReducedMotion();
  return { ref, shown: inView || Boolean(reduce), moving: inView && !reduce, reduce: Boolean(reduce) };
}

function TypingDots({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label="typing">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={cn("h-1.5 w-1.5 rounded-full", dark ? "bg-rh-ink/70" : "bg-rh-ink/40")}
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

const joyBubble = "max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[13px] leading-snug text-rh-ink shadow-soft sm:text-[14px]";
const workerBubble =
  "inline-flex max-w-[80%] items-end gap-1.5 rounded-2xl rounded-tr-sm bg-rh-lime px-3.5 py-2.5 text-[13px] font-medium leading-snug text-rh-ink sm:text-[14px]";

// ─── Hero: Joy runs a worker's quick check on WhatsApp and books a physio ───

function JoyCheckPhone() {
  return (
    <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[2rem] bg-white shadow-lift ring-1 ring-rh-ink/[0.06]">
      <div className="flex items-center gap-3 bg-rh-ink px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rh-lime text-lg font-bold text-rh-ink">J</span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight text-white">Joy · Rehabify for Work</p>
          <p className="text-[11px] font-medium text-white/70">WhatsApp · speaks your language</p>
        </div>
      </div>
      <div className="flex h-[400px] flex-col justify-end overflow-hidden bg-rh-canvas p-4 sm:h-[440px]">
        <AnimatedList
          replay
          order="chat"
          startDelay={500}
          delay={1200}
          loopAfter={4500}
          transient={["typing-you-1", "typing-joy-1", "typing-you-2", "typing-joy-2"]}
          className="items-stretch gap-2"
        >
          <div key="joy-1" className="flex">
            <p className={joyBubble}>
              <span className="mb-0.5 block text-[11px] font-semibold text-rh-ink/50">Joy · 9:00 am</span>
              Hi Musa 👋🏾 Time for your quick check. Any pain in your back, neck or joints this month?
            </p>
          </div>
          <div key="typing-you-1" className="flex justify-end">
            <span className="rounded-2xl rounded-tr-sm bg-rh-lime px-3.5 py-3">
              <TypingDots dark />
            </span>
          </div>
          <div key="you-1" className="flex justify-end">
            <p className={workerBubble}>
              Lower back. After long days on the bike
              <CheckCheck className="mb-0.5 h-3 w-3 shrink-0" />
            </p>
          </div>
          <div key="typing-joy-1" className="flex">
            <span className="rounded-2xl rounded-tl-sm bg-white px-3.5 py-3 shadow-soft">
              <TypingDots />
            </span>
          </div>
          <div key="joy-2" className="flex">
            <p className={joyBubble}>Thanks for telling me. From 0 to 10, how bad is it today?</p>
          </div>
          <div key="typing-you-2" className="flex justify-end">
            <span className="rounded-2xl rounded-tr-sm bg-rh-lime px-3.5 py-3">
              <TypingDots dark />
            </span>
          </div>
          <div key="you-2" className="flex justify-end">
            <p className={workerBubble}>
              6
              <CheckCheck className="mb-0.5 h-3 w-3 shrink-0" />
            </p>
          </div>
          <div key="typing-joy-2" className="flex">
            <span className="rounded-2xl rounded-tl-sm bg-white px-3.5 py-3 shadow-soft">
              <TypingDots />
            </span>
          </div>
          <div key="joy-3" className="flex">
            <p className={joyBubble}>Let&apos;s get that looked at before it gets worse. I&apos;ve booked you in with a physiotherapist.</p>
          </div>
          <div key="booked" className="flex">
            <div className="flex max-w-[85%] items-center gap-3 rounded-2xl bg-rh-ink px-3.5 py-3 text-white shadow-soft">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rh-lime">
                <Check className="h-3.5 w-3.5 text-rh-ink" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-tight">Video call booked</span>
                <span className="block text-[12px] text-white/70">Licensed physiotherapist · Thu 10:00</span>
              </span>
            </div>
          </div>
        </AnimatedList>
      </div>
    </div>
  );
}

// ─── Small sketches for the "How it works" cards (ink and lime, animate while on screen) ───

const CHECK_ANSWERS: [string, string][] = [
  ["Pain", "Lower back, 6/10"],
  ["Past injuries", "None"],
  ["How they work", "Rider, 9 hours a day"],
];

function QuickCheckSketch() {
  return (
    <div className="flex h-full flex-col justify-center p-4">
      <AnimatedList replay order="chat" startDelay={300} delay={650} loopAfter={3500} className="items-stretch gap-1.5">
        {CHECK_ANSWERS.map(([question, answer]) => (
          <div key={question} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-2 text-[13px] text-rh-ink">
            <span className="font-semibold text-rh-ink/60">{question}</span>
            <span className="truncate font-medium">{answer}</span>
          </div>
        ))}
        <div key="done" className="flex items-center gap-2 rounded-2xl bg-rh-ink px-3.5 py-2 text-[13px] font-semibold text-white">
          <Check className="h-3.5 w-3.5 shrink-0 text-rh-lime" />
          <span className="truncate">Check done in 4 minutes</span>
        </div>
      </AnimatedList>
    </div>
  );
}

const RECOVERY = ["Assessed by a physiotherapist", "Recovery plan, 2 sessions a week", "Light duties from week 3"];

function BackToWorkSketch() {
  const { ref, shown, reduce } = useShown();
  return (
    <div ref={ref} className="flex h-full flex-col justify-center gap-2.5 p-4">
      <div className="px-1">
        <p className="flex items-baseline justify-between text-[12px] font-semibold text-rh-ink/60">
          Recovery after an accident
          <span className="text-rh-ink">Week 4</span>
        </p>
        <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-white">
          <motion.span
            className="block h-full rounded-full bg-rh-lime"
            initial={false}
            animate={{ width: shown ? "100%" : "6%" }}
            transition={reduce ? { duration: 0 } : { duration: 3.2, ease: EASE, delay: 0.3 }}
          />
        </span>
      </div>
      <AnimatedList replay order="chat" startDelay={300} delay={700} loopAfter={3500} className="items-stretch gap-1.5">
        {RECOVERY.map((step) => (
          <p key={step} className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-1.5 text-[12px] font-semibold text-rh-ink">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rh-lime">
              <Check className="h-2.5 w-2.5" />
            </span>
            <span className="truncate">{step}</span>
          </p>
        ))}
        <p key="ready" className="flex items-center gap-2 rounded-2xl bg-rh-ink px-3.5 py-1.5 text-[12px] font-semibold text-white">
          <ArrowRight className="h-3 w-3 shrink-0 text-rh-lime" />
          <span className="truncate">Ready to return to work</span>
        </p>
      </AnimatedList>
    </div>
  );
}

// People reporting pain, month by month (an example, not real data)
const PAIN_TREND = [64, 58, 49, 41, 33, 26];

function ReportSketch() {
  const { ref, shown, reduce } = useShown();
  return (
    <div ref={ref} className="flex h-full flex-col justify-center gap-2 p-4">
      <p className="flex items-center justify-between px-1 text-[12px] font-semibold text-rh-ink/60">
        Example monthly report
        <span className="inline-flex items-center gap-1 rounded-full bg-rh-ink/[0.06] px-2 py-0.5 text-[10px] text-rh-ink/70">
          <Lock className="h-2.5 w-2.5" /> No names
        </span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white px-3 py-2">
          <p className="text-[20px] font-bold leading-none text-rh-ink">
            <NumberTicker value={86} replay />%
          </p>
          <p className="mt-1 text-[11px] font-medium text-rh-ink/60">Took the check</p>
        </div>
        <div className="rounded-2xl bg-white px-3 py-2">
          <p className="text-[20px] font-bold leading-none text-rh-ink">
            <NumberTicker value={9} replay /> days
          </p>
          <p className="mt-1 text-[11px] font-medium text-rh-ink/60">Back to work, on average</p>
        </div>
      </div>
      <div className="rounded-2xl bg-white px-3 pb-2 pt-2">
        <p className="text-[11px] font-medium text-rh-ink/60">Workers reporting pain</p>
        <div className="mt-1.5 flex h-9 items-end gap-1.5">
          {PAIN_TREND.map((value, i) => (
            <motion.span
              key={i}
              className={cn("flex-1 origin-bottom rounded-md", i === PAIN_TREND.length - 1 ? "bg-rh-lime" : "bg-rh-ink")}
              style={{ height: `${value}%` }}
              initial={false}
              animate={{ scaleY: shown ? 1 : 0.1, opacity: shown ? 1 : 0.3 }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 22, delay: 0.15 + i * 0.08 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type Step = { title: string; body: string; visual: ReactNode; note?: string };

const STEPS: Step[] = [
  {
    title: "Every worker gets a quick check",
    body: "Joy, our recovery assistant on WhatsApp, asks each person about pain, past injuries and how they work, in a few minutes.",
    visual: <QuickCheckSketch />,
  },
  {
    title: "Pain is caught early",
    body: "Anyone who reports pain gets a virtual consultation with a licensed physiotherapist within 48 hours.",
    note: "Seen within 48 hours",
    visual: <CallScene compact className="p-4" initials="TO" incoming="Show me how you lift the parcels" outgoing="Like this, from the floor" />,
  },
  {
    title: "Everyone stays on track",
    body: "Posture and stretching videos, our camera coach and monthly check-ins from Joy help prevent problems from building up.",
    note: "New: camera coach for reps and form (beta)",
    visual: (
      <LoopVideo base="/media/camera-coach-sts" label="Demo: the camera coach follows sit to stand, counts the reps and talks you through it" className="object-center" sound />
    ),
  },
  {
    title: "Injured workers get back safely",
    body: "After an accident, a physiotherapist assesses them and supports their recovery until they're ready to return to work.",
    visual: <BackToWorkSketch />,
  },
  {
    title: "You see the results",
    body: "A monthly report shows uptake, pain trends and return-to-work times, with no individual health details shared.",
    visual: <ReportSketch />,
  },
];

function StepCard({ step, index }: { step: Step; index: number }) {
  return (
    <article className="flex w-full flex-col rounded-[1.75rem] bg-white p-4 ring-1 ring-inset ring-rh-ink/[0.06]">
      <div className="relative h-[200px] overflow-hidden rounded-[1.25rem] bg-rh-canvas">{step.visual}</div>
      <span className="mt-5 flex h-8 w-8 items-center justify-center rounded-xl bg-rh-ink text-xs font-bold text-white">
        {String(index + 1).padStart(2, "0")}
      </span>
      <h3 className="mt-3 px-1 text-lg font-bold leading-snug text-rh-ink">{step.title}</h3>
      <p className="mt-1.5 px-1 pb-1 text-[15px] leading-relaxed text-rh-ink/70">{step.body}</p>
      {step.note && (
        <div className="mt-auto px-1 pb-1 pt-3">
          <span className="inline-flex rounded-full bg-rh-ink px-3 py-1 text-xs font-semibold text-white">{step.note}</span>
        </div>
      )}
    </article>
  );
}

const AUDIENCES: { label: string; icon: ComponentType<{ className?: string }> }[] = [
  { label: "Delivery and logistics companies", icon: Truck },
  { label: "Ride-hailing and transport platforms", icon: Car },
  { label: "Factories and warehouses", icon: Factory },
  { label: "Insurers and HMOs", icon: ShieldCheck },
  { label: "Any business with people on their feet all day", icon: Footprints },
];

const BENEFITS = [
  "Fewer days lost to pain and injury.",
  "Faster return to work after accidents.",
  "A benefit your workers feel, which helps them stay with you.",
  "Clear reports for HR, insurers and leadership.",
];

const FAQS: { question: string; answer: string }[] = [
  {
    question: "How much does it cost?",
    answer: "A simple monthly fee per worker, with recovery packages after injury quoted separately. Request a pilot and we'll share pricing for your team.",
  },
  {
    question: "Will we see our workers' health details?",
    answer:
      "No. Your monthly report shows uptake, pain trends and return-to-work times, with no individual health details shared. Workers' health information stays private, in line with the Nigeria Data Protection Act.",
  },
  {
    question: "Do workers need to download anything?",
    answer: "No. Joy works on the WhatsApp they already use.",
  },
  {
    question: "Who are the physiotherapists?",
    answer: "Every physiotherapist on Rehabify is licensed by the Medical Rehabilitation Therapists Board of Nigeria.",
  },
  {
    question: "What happens after an accident at work?",
    answer: "A physiotherapist assesses the injured worker and supports their recovery until they're ready to return to work.",
  },
];

export default function EmployersPage() {
  const reduce = useReducedMotion();
  const [pilotOpen, setPilotOpen] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLElement>(null);

  // "#pilot" (from other pages or emails) opens the request form.
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === "#pilot") setPilotOpen(true);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const setPilot = useCallback((open: boolean) => {
    setPilotOpen(open);
    // Clear the hash on close so the same link opens it again
    if (!open && window.location.hash === "#pilot") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);
  const openPilot = useCallback(() => setPilot(true), [setPilot]);

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
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <motion.div initial={reduce ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE }}>
            <h1 className="max-w-xl text-[40px] font-bold leading-[1.04] tracking-tight text-rh-ink sm:text-[56px]">
              Healthcare that helps your business grow.
            </h1>
            <p className="mt-3 max-w-lg text-lg font-semibold leading-snug text-rh-ink/60 sm:text-xl">By keeping your people healthy and at work.</p>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-rh-ink/70">
              Everyone who works with their body faces back, neck and joint pain that slowly takes them off the job. Rehabify for Work catches that
              pain early, gets people to a licensed physiotherapist fast, and supports them back to work after an injury, all on the WhatsApp they
              already use.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <RequestPilot onClick={openPilot} />
              <a href="#how" className={secondaryOnLight}>
                See how it works
                <ArrowDown className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-y-0.5" />
              </a>
            </div>
          </motion.div>

          <motion.div initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}>
            <JoyCheckPhone />
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="mx-auto max-w-6xl">
          <Rise>
            <h2 className="max-w-2xl text-[36px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-5xl">How it works.</h2>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-rh-ink/70">From a first check on WhatsApp to a monthly report for you.</p>
          </Rise>
          <SnapCarousel label="How Rehabify for Work works" className="mt-10">
            {STEPS.map((step, i) => (
              <StepCard key={step.title} step={step} index={i} />
            ))}
          </SnapCarousel>
        </div>
      </section>

      {/* Who it's for */}
      <section className="px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="mx-auto max-w-6xl">
          <Rise>
            <h2 className="text-[36px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-5xl">Who it&apos;s for.</h2>
          </Rise>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {AUDIENCES.map(({ label, icon: Icon }, i) => {
              const last = i === AUDIENCES.length - 1;
              return (
                <Rise key={label} delay={i * 0.06} className={cn("flex", last && "sm:col-span-2 lg:col-span-1")}>
                  <div
                    className={cn(
                      "flex w-full flex-row items-center gap-4 rounded-[1.5rem] p-5 lg:flex-col lg:items-start lg:p-6",
                      last ? "bg-rh-ink text-white" : "bg-white ring-1 ring-inset ring-rh-ink/[0.06]",
                    )}
                  >
                    <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", last ? "bg-rh-lime" : "bg-rh-canvas")}>
                      <Icon className="h-5 w-5 text-rh-ink" />
                    </span>
                    <p className={cn("text-[16px] font-bold leading-snug lg:mt-auto lg:pt-6", last ? "text-white" : "text-rh-ink")}>{label}</p>
                  </div>
                </Rise>
              );
            })}
          </div>
        </div>
      </section>

      {/* What you get and pricing */}
      <section className="px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-4 md:grid-cols-[1.15fr_1fr]">
            <Rise className="flex">
              <article className="flex w-full flex-col rounded-[2rem] bg-white p-6 ring-1 ring-inset ring-rh-ink/[0.06] sm:p-8">
                <h2 className="text-[30px] font-bold leading-tight tracking-tight sm:text-[36px]">What you get.</h2>
                <ul className="mt-6 space-y-3">
                  {BENEFITS.map((benefit, i) => (
                    <motion.li
                      key={benefit}
                      initial={reduce ? false : { opacity: 0, x: -12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{ duration: 0.45, ease: EASE, delay: 0.1 + i * 0.08 }}
                      className="flex items-start gap-4 rounded-2xl bg-rh-canvas p-4"
                    >
                      <motion.span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rh-lime"
                        initial={reduce ? false : { scale: 0.4 }}
                        whileInView={{ scale: 1 }}
                        viewport={{ once: true, margin: "-40px" }}
                        transition={{ type: "spring", stiffness: 320, damping: 16, delay: 0.25 + i * 0.08 }}
                      >
                        <Check className="h-3.5 w-3.5 text-rh-ink" />
                      </motion.span>
                      <span className="pt-0.5 text-[16px] font-semibold leading-snug text-rh-ink">{benefit}</span>
                    </motion.li>
                  ))}
                </ul>
              </article>
            </Rise>

            <Rise delay={0.06} className="flex">
              <article className="relative flex w-full flex-col overflow-hidden rounded-[2rem] bg-rh-ink p-6 text-white sm:p-8">
                <PairingShapes className="-bottom-14 -right-12 hidden h-48 w-48 opacity-70 sm:block" />
                <h2 className="relative text-[30px] font-bold leading-tight tracking-tight sm:text-[36px]">Pricing.</h2>
                <p className="relative mt-4 text-[22px] font-bold leading-snug tracking-tight sm:text-[26px]">A simple monthly fee per worker.</p>
                <p className="relative mt-3 max-w-sm text-[16px] leading-relaxed text-white/75">Recovery packages after injury are quoted separately.</p>
                <div className="relative mt-auto pt-8">
                  <RequestPilot onClick={openPilot} onInk />
                </div>
              </article>
            </Rise>
          </div>

          {/* Reassurance */}
          <Rise delay={0.1}>
            <div className="mt-4 flex flex-col gap-4 rounded-[1.5rem] bg-white p-5 ring-1 ring-inset ring-rh-ink/[0.06] sm:flex-row sm:items-center sm:p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rh-lime">
                <ShieldCheck className="h-5 w-5 text-rh-ink" />
              </span>
              <p className="text-[15px] leading-relaxed text-rh-ink/75 sm:text-base">
                Every physiotherapist on Rehabify is licensed by the Medical Rehabilitation Therapists Board of Nigeria, and workers&apos; health
                information stays private, in line with the Nigeria Data Protection Act.
              </p>
            </div>
          </Rise>
        </div>
      </section>

      {/* Questions */}
      <section id="faqs" className="scroll-mt-24 px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Rise>
            <h2 className="text-[36px] font-bold leading-[1.05] tracking-tight sm:text-5xl">Questions employers ask.</h2>
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
              <h2 className="text-[32px] font-bold leading-[1.1] tracking-tight text-white sm:text-[44px]">Keep your people healthy and at work.</h2>
              <p className="mt-4 text-lg font-medium leading-relaxed text-white/75">Tell us about your team and we&apos;ll plan a pilot with you.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <RequestPilot onClick={openPilot} onInk />
              </div>
            </div>
          </div>
        </Rise>
      </section>

      {/* Floating "Request a pilot" once the hero has scrolled away (below dialogs and the cookie banner) */}
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
              <span className="text-sm font-semibold sm:hidden">Rehabify for Work</span>
              <span className="hidden text-sm font-semibold text-white/80 sm:inline">Fewer days lost to pain and injury</span>
              <RequestPilot onClick={openPilot} onInk className="h-11 px-5 text-sm" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PilotRequestDialog open={pilotOpen} onOpenChange={setPilot} />
    </div>
  );
}
