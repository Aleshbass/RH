"use client";

// Adapted from Magic UI's Animated List (MIT, https://magicui.design). Changes: framer-motion
// imports; a "chat" order (newest at the bottom); `transient` items (a typing bubble) that only show
// while they are the latest; starts when on screen, loops, and shows everything at once for people
// who turn motion off.

import React, { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion, type MotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

export function AnimatedListItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const animations: MotionProps = {
    initial: { scale: 0, opacity: 0 },
    animate: { scale: 1, opacity: 1, originY: 0 },
    exit: { scale: 0, opacity: 0 },
    transition: { type: "spring", stiffness: 350, damping: 40 },
  };
  return (
    <motion.div {...animations} layout className={cn("mx-auto w-full", className)}>
      {children}
    </motion.div>
  );
}

export interface AnimatedListProps extends ComponentPropsWithoutRef<"div"> {
  children: React.ReactNode;
  /** Time between items (ms) */
  delay?: number;
  /** Wait before the first item (ms) */
  startDelay?: number;
  /** "stack": newest on top (Magic UI's default); "chat": newest at the bottom */
  order?: "stack" | "chat";
  /** Start again after the last item, waiting this long (ms); 0 = play once */
  loopAfter?: number;
  /** Keys of items that only show while they are the newest (a typing indicator) */
  transient?: string[];
  /** Start from the beginning each time it comes back on screen */
  replay?: boolean;
  /** Hold the list until this is true (e.g. until a heading has finished typing) */
  play?: boolean;
}

export const AnimatedList = React.memo(function AnimatedList({
  children,
  className,
  delay = 1000,
  startDelay = 0,
  order = "stack",
  loopAfter = 0,
  transient = [],
  replay = false,
  play = true,
  ...props
}: AnimatedListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduce = useReducedMotion();
  const childrenArray = useMemo(() => React.Children.toArray(children), [children]);
  const last = childrenArray.length - 1;
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    if (reduce) {
      setIndex(last);
      return;
    }
    if (!inView || !play) {
      if (replay) setIndex(-1);
      return;
    }
    const wait = index < 0 ? startDelay : index < last ? delay : loopAfter;
    if (index >= last && !loopAfter) return;
    const timeout = setTimeout(() => setIndex((i) => (i >= last ? -1 : i + 1)), wait);
    return () => clearTimeout(timeout);
  }, [index, inView, play, reduce, last, delay, startDelay, loopAfter, replay]);

  const itemsToShow = useMemo(() => {
    const shown = childrenArray.filter((child, i) => {
      if (i > index) return false;
      const key = String((child as React.ReactElement).key ?? "").replace(/^\.\$/, "");
      return !transient.includes(key) || i === index;
    });
    return order === "stack" ? shown.reverse() : shown;
  }, [childrenArray, index, order, transient]);

  return (
    <div ref={ref} className={cn("relative flex flex-col items-center gap-4", className)} {...props}>
      {/* popLayout: an item on its way out stops taking space at once, so no gaps open up */}
      <AnimatePresence initial={false} mode="popLayout">
        {itemsToShow.map((item) => (
          <AnimatedListItem key={(item as React.ReactElement).key}>{item}</AnimatedListItem>
        ))}
      </AnimatePresence>
    </div>
  );
});
