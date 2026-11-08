"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { AnimatedList } from "@/components/magicui/animated-list";
import { cn } from "@/lib/utils";

/** Sound bars that move while the other person is talking. */
function Speaking({ active, compact }: { active: boolean; compact?: boolean }) {
  return (
    <span aria-hidden className={cn("flex h-4 items-end gap-[3px]", compact ? "mt-2" : "mt-3")}>
      {[0.5, 1, 0.7, 0.9, 0.4].map((peak, i) => (
        <motion.span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-rh-lime"
          style={{ height: "100%" }}
          animate={active ? { scaleY: [0.25, peak, 0.35, peak * 0.8, 0.25] } : { scaleY: 0.3 }}
          transition={active ? { duration: 1.1, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" } : { duration: 0 }}
        />
      ))}
    </span>
  );
}

/**
 * A video call in progress for the marketing cards: a running timer, the other person talking
 * (sound bars) and two chat bubbles that pop in and loop. Animates only on screen; reduced motion
 * shows the final state.
 */
export function CallScene({
  initials,
  incoming,
  outgoing,
  compact = false,
  className,
}: {
  /** The other person's initials, in the middle of the call */
  initials: string;
  /** Their message (left, white) and the reply (right, lime) */
  incoming: string;
  outgoing: string;
  /** Smaller avatar and bubbles, for short cards (about 200 px) */
  compact?: boolean;
  className?: string;
}) {
  const bubble = compact ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-[12px]";
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [seconds, setSeconds] = useState(4);
  useEffect(() => {
    if (!inView || reduce) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [inView, reduce]);
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div ref={ref} className={cn("relative h-full", className)}>
      <div className={cn("relative flex h-full flex-col items-center overflow-hidden rounded-2xl bg-rh-ink", compact ? "pt-6" : "pt-10")}>
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white">
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-rh-lime" />
          {clock}
        </span>
        <span
          className={cn(
            "absolute right-3 top-3 flex items-center justify-center rounded-lg bg-rh-ink-3 text-[11px] font-semibold text-white ring-1 ring-white/10",
            compact ? "h-11 w-9" : "h-14 w-11",
          )}
        >
          You
        </span>
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-white/10 font-bold text-white",
            compact ? "h-11 w-11 text-base" : "h-16 w-16 text-lg",
          )}
        >
          {initials}
        </span>
        <Speaking active={inView && !reduce} compact={compact} />
        <AnimatedList
          replay
          order="chat"
          startDelay={900}
          delay={1600}
          loopAfter={4000}
          className={cn("absolute inset-x-3 bottom-3 items-stretch", compact ? "gap-1.5" : "gap-2")}
        >
          <div key="incoming" className="flex">
            <span className={cn("max-w-[80%] rounded-2xl rounded-bl-sm bg-white text-rh-ink shadow-soft", bubble)}>{incoming}</span>
          </div>
          <div key="outgoing" className="flex justify-end">
            <span className={cn("max-w-[80%] rounded-2xl rounded-br-sm bg-rh-lime font-medium text-rh-ink", bubble)}>{outgoing}</span>
          </div>
        </AnimatedList>
      </div>
    </div>
  );
}
