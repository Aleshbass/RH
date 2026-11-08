"use client";

// Adapted from Magic UI's Number Ticker (MIT, https://magicui.design). Changes: framer-motion
// imports; counts again each time it comes back on screen (`replay`); final value for people who
// turn motion off.

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { useInView, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number;
  startValue?: number;
  direction?: "up" | "down";
  /** Seconds before counting starts */
  delay?: number;
  decimalPlaces?: number;
  replay?: boolean;
}

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  replay = false,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const from = direction === "down" ? value : startValue;
  const to = direction === "down" ? startValue : value;
  const motionValue = useMotionValue(reduce ? to : from);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const isInView = useInView(ref, { once: !replay, margin: "0px" });

  useEffect(() => {
    if (reduce) return;
    if (!isInView) {
      if (replay) motionValue.jump(from);
      return;
    }
    const timer = setTimeout(() => motionValue.set(to), delay * 1000);
    return () => clearTimeout(timer);
  }, [motionValue, isInView, delay, from, to, replay, reduce]);

  useEffect(
    () =>
      springValue.on("change", (latest) => {
        if (ref.current) {
          ref.current.textContent = Intl.NumberFormat("en-US", {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces,
          }).format(Number(latest.toFixed(decimalPlaces)));
        }
      }),
    [springValue, decimalPlaces]
  );

  return (
    <span ref={ref} className={cn("inline-block tabular-nums", className)} {...props}>
      {reduce ? to : from}
    </span>
  );
}
