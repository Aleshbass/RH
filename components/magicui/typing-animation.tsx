"use client";

// Adapted from Magic UI's Typing Animation (MIT, https://magicui.design). Changes: framer-motion
// imports; one text, typed when on screen and again each time it comes back (`replay`); the cursor
// blinks with framer-motion (no global CSS); full text at once for people who turn motion off.

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TypingAnimationProps {
  children: string;
  className?: string;
  /** Milliseconds per character */
  duration?: number;
  /** Milliseconds before typing starts */
  delay?: number;
  replay?: boolean;
  showCursor?: boolean;
  /** Told when the text is fully typed (true) and when it starts over (false) */
  onDoneChange?: (done: boolean) => void;
}

export function TypingAnimation({
  children,
  className,
  duration = 60,
  delay = 0,
  replay = false,
  showCursor = true,
  onDoneChange,
}: TypingAnimationProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { amount: 0.3, once: !replay });
  const graphemes = Array.from(children);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduce) {
      setCount(graphemes.length);
      return;
    }
    if (!inView) {
      if (replay) setCount(0);
      return;
    }
    if (count >= graphemes.length) return;
    const timeout = setTimeout(() => setCount((c) => c + 1), count === 0 ? delay || duration : duration);
    return () => clearTimeout(timeout);
  }, [inView, count, graphemes.length, duration, delay, replay, reduce]);

  const typing = count < graphemes.length;
  useEffect(() => {
    onDoneChange?.(!typing);
  }, [typing, onDoneChange]);
  return (
    <span ref={ref} className={cn("inline-block", className)} aria-label={children}>
      <span aria-hidden>{graphemes.slice(0, count).join("")}</span>
      {showCursor && typing && !reduce && (
        <motion.span
          aria-hidden
          className="ml-px inline-block"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        >
          |
        </motion.span>
      )}
    </span>
  );
}
