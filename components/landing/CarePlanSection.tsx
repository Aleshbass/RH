"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { useConvex } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCheck, Rotate3d, TrendingDown, X } from "@/components/icons";
import { AnimatedList } from "@/components/magicui/animated-list";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { TypingAnimation } from "@/components/magicui/typing-animation";
import { CallScene } from "@/components/marketing/CallScene";
import { LoopVideo } from "@/components/marketing/LoopVideo";
import { SnapCarousel } from "@/components/marketing/SnapCarousel";
import { EXERCISE_CATALOG, posterUrl } from "@/convex/exerciseLibraryCatalog";
import type { ViewerGrant } from "@/lib/exercise3d/useViewerGrant";
import { cn } from "@/lib/utils";
import { SegmentedSwitch, switchPanelId, switchTabId } from "./SegmentedSwitch";

/**
 * "Your care plan.": what a patient gets after their first visit, as one simple carousel.
 * The first card plays a real exercise from the 3D library; "Try it in 3D" opens it full size
 * so visitors can turn it themselves (inside the carousel a swipe always moves the cards).
 */

const EASE = [0.22, 1, 0.36, 1] as const;

// three.js and the viewer only download once the section is close to the screen.
const ExerciseViewer = dynamic(() => import("@/components/exercise3d/ExerciseViewer").then((m) => m.ExerciseViewer), {
  ssr: false,
});

// Must match DEMO_CLIPS in convex/exerciseLibrary.ts: the only clips a signed-out visitor can watch.
const DEMOS = [
  { id: "mini-squat", label: "Mini squat" },
  { id: "glute-bridge", label: "Glute bridge" },
] as const;
type DemoId = (typeof DEMOS)[number]["id"];

// makeFunctionReference keeps the landing page clear of the generated api types (TS2589).
const demoGrantRef = makeFunctionReference<"query", { version: string }, ViewerGrant>("exerciseLibrary:demoGrant");
let grantRequest: Promise<ViewerGrant> | null = null;

function useDemoGrant() {
  const convex = useConvex();
  return useCallback(async () => {
    grantRequest ??= convex.query(demoGrantRef, { version: EXERCISE_CATALOG.version });
    try {
      return await grantRequest;
    } catch (err) {
      grantRequest = null;
      throw err;
    }
  }, [convex]);
}

// ─── Card pictures: simple sketches of what the patient sees ───

function ExerciseVisual({ near, onTry }: { near: boolean; onTry: () => void }) {
  const requestGrant = useDemoGrant();
  return (
    <div className="relative h-full bg-white">
      {/* Plays and turns on its own; no touch handling here, so swipes move the carousel */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {near ? (
          <ExerciseViewer
            clipId="mini-squat"
            requestGrant={requestGrant}
            variant="showcase"
            bare
            accent="ink"
            className="aspect-auto h-full rounded-none bg-white"
          />
        ) : (
          <Image src={posterUrl("mini-squat")} alt="" fill sizes="(min-width: 1024px) 380px, 84vw" className="object-contain p-4" />
        )}
      </div>
      <button
        type="button"
        onClick={onTry}
        className="absolute bottom-4 left-4 inline-flex h-10 items-center gap-2 rounded-full bg-rh-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2"
      >
        <Rotate3d className="h-4 w-4" />
        Try it in 3D
      </button>
    </div>
  );
}

// The cards below animate with Magic UI components (components/magicui) when they're on screen, and
// replay each time a visitor swipes back to them. With reduced motion they show their final state.

const SUMMARY_LINES = ["Keep going with mini squats, 3 sets of 10 a day.", "Next visit on Friday."];

function SummaryVisual() {
  // The bullet points follow once the headline has finished typing, however fast the phone types
  const [typed, setTyped] = useState(false);
  return (
    <div className="flex h-full items-center p-5">
      <div className="w-full rounded-2xl bg-white p-4 shadow-soft">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-semibold text-rh-ink/50">Visit summary · Tuesday</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rh-lime/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rh-ink">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-rh-ink" />
            New
          </span>
        </div>
        <TypingAnimation
          replay
          delay={350}
          duration={32}
          onDoneChange={setTyped}
          className="mt-2 min-h-[2.6em] w-full text-[14px] font-semibold leading-snug text-rh-ink"
        >
          Your knee is bending further than last week.
        </TypingAnimation>
        <AnimatedList replay play={typed} order="chat" startDelay={250} delay={650} className="mt-3 items-stretch gap-2">
          {SUMMARY_LINES.map((line) => (
            <p key={line} className="flex gap-2 text-[13px] leading-snug text-rh-ink/75">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rh-lime" />
              {line}
            </p>
          ))}
        </AnimatedList>
      </div>
    </div>
  );
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

const joyBubble = "max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[13px] leading-snug text-rh-ink shadow-soft";

function ReminderVisual() {
  return (
    <div className="flex h-full flex-col justify-end p-4">
      <AnimatedList replay order="chat" startDelay={400} delay={1150} loopAfter={3500} transient={["typing-you", "typing-joy"]} className="items-stretch gap-2">
        <div key="joy-1" className="flex">
          <p className={joyBubble}>
            <span className="mb-0.5 block text-[11px] font-semibold text-rh-ink/50">Joy · 6:00 pm</span>
            Time for your knee exercises 💪🏾 Reply DONE when you finish.
          </p>
        </div>
        <div key="typing-you" className="flex justify-end">
          <span className="rounded-2xl rounded-tr-sm bg-rh-lime px-3.5 py-3">
            <TypingDots dark />
          </span>
        </div>
        <div key="done" className="flex justify-end">
          <p className="inline-flex items-center gap-1.5 rounded-2xl rounded-tr-sm bg-rh-lime px-3.5 py-2 text-[13px] font-semibold text-rh-ink">
            DONE <CheckCheck className="h-3 w-3" />
          </p>
        </div>
        <div key="typing-joy" className="flex">
          <span className="rounded-2xl rounded-tl-sm bg-white px-3.5 py-3 shadow-soft">
            <TypingDots />
          </span>
        </div>
        <div key="joy-2" className="flex">
          <p className={joyBubble}>Great work! That&apos;s 3 days in a row 🔥</p>
        </div>
      </AnimatedList>
    </div>
  );
}

const PAIN = [7, 6, 6, 4, 3, 2];

function ProgressVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const grown = inView || Boolean(reduce);
  return (
    <div ref={ref} className="flex h-full flex-col p-5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-rh-ink">Pain</p>
        <p className="inline-flex items-center gap-1 text-[12px] font-semibold text-rh-ink">
          <TrendingDown className="h-3 w-3" />
          <span>
            <NumberTicker value={71} replay delay={0.5} />% in 6 weeks
          </span>
        </p>
      </div>
      <div className="mt-4 flex flex-1 items-end gap-2.5">
        {PAIN.map((value, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <NumberTicker value={value} replay delay={0.12 * i} className="text-[11px] font-semibold text-rh-ink/60" />
            <motion.span
              className={cn("w-full origin-bottom rounded-lg", i === PAIN.length - 1 ? "bg-rh-lime" : "bg-rh-ink")}
              style={{ height: `${value * 18}px` }}
              initial={false}
              animate={{ scaleY: grown ? 1 : 0 }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 18, delay: grown ? 0.12 * i : 0 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CallVisual() {
  return <CallScene className="p-5" initials="CN" incoming="How did the exercises feel today?" outgoing="Much easier than last week 🙌🏾" />;
}

function Card({ title, body, note, children }: { title: string; body: string; note?: string; children: ReactNode }) {
  return (
    <article className="flex w-full flex-col rounded-[2rem] bg-white p-3 ring-1 ring-inset ring-rh-ink/[0.06]">
      <div className="relative h-[280px] overflow-hidden rounded-[1.5rem] bg-rh-canvas">{children}</div>
      <div className="flex flex-1 flex-col px-3 pb-3 pt-5">
        <h3 className="text-xl font-bold leading-snug text-rh-ink">{title}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-rh-ink/70">{body}</p>
        {note && (
          <div className="mt-auto pt-4">
            <span className="inline-flex rounded-full bg-rh-ink/[0.06] px-3 py-1 text-xs font-semibold text-rh-ink/80">{note}</span>
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Full-size 3D, where visitors turn it themselves ───

function Try3D({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const requestGrant = useDemoGrant();
  const [clipId, setClipId] = useState<DemoId>("mini-squat");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-rh-ink/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-[81] max-h-[94vh] overflow-y-auto rounded-t-[2rem] bg-rh-canvas p-4 pb-6 sm:p-6",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(92vw,560px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[2rem]",
            "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-bottom-6 sm:data-[state=open]:slide-in-from-bottom-0",
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-xl font-bold text-rh-ink">Turn it with your finger</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-rh-ink ring-1 ring-inset ring-rh-ink/10 hover:bg-rh-ink hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <SegmentedSwitch
            idBase="try-3d"
            label="Choose an exercise"
            options={DEMOS}
            value={clipId}
            onChange={setClipId}
            className="mt-4 flex w-full"
          />
          <div id={switchPanelId("try-3d")} role="tabpanel" aria-labelledby={switchTabId("try-3d", clipId)} className="mt-4">
            {open && (
              <ExerciseViewer
                clipId={clipId}
                requestGrant={requestGrant}
                variant="showcase"
                accent="ink"
                className="aspect-[4/5] max-h-[62vh] rounded-[1.5rem] bg-white sm:aspect-square"
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CarePlanSection() {
  const reduce = useReducedMotion();
  const [near, setNear] = useState(false);
  const [tryOpen, setTryOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: "400px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);

  return (
    <section ref={ref} id="care-plan" className="overflow-x-clip bg-rh-canvas px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <h2 className="max-w-2xl text-[36px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-5xl">Your care plan.</h2>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-rh-ink/70">
            After your first visit, your physio builds a plan around you. Everything you need to get better stays in one place.
          </p>
        </motion.div>

        <SnapCarousel label="What's in your care plan" className="mt-10">
          <Card
            title="Exercises you can see in 3D"
            body="Your physio picks exercises for you. Watch them from every side and follow along at home."
            note="New: 3D motion tracking counts your reps"
          >
            <ExerciseVisual near={near} onTry={() => setTryOpen(true)} />
          </Card>
          <Card
            title="3D motion tracking"
            body="Exercise in front of your phone's camera. It counts your reps and gives you tips on your form, next to the 3D coach."
            note="Your video never leaves your phone"
          >
            <LoopVideo
              base="/media/camera-coach-demo"
              label="Demo: 3D motion tracking follows shoulder raises and counts the reps"
              className="object-[85%_50%]"
            />
          </Card>
          <Card title="A summary after every visit" body="In plain words: what your physio found, what you did together and what comes next.">
            <SummaryVisual />
          </Card>
          <Card title="Reminders on WhatsApp" body="Joy reminds you when it's time for your exercises. Reply DONE when you've finished.">
            <ReminderVisual />
          </Card>
          <Card title="See your progress" body="Quick check-ins track your pain and daily activity, so you and your physio can see what's working.">
            <ProgressVisual />
          </Card>
          <Card title="Your physio, a message away" body="Message your physio or join a video session between visits.">
            <CallVisual />
          </Card>
        </SnapCarousel>
      </div>

      <Try3D open={tryOpen} onOpenChange={setTryOpen} />
    </section>
  );
}
