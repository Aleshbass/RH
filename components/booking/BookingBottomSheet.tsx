"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Mobile/tablet action sheet for the booking flows. Slides up (spring) as soon as `open`
 * turns true so the Continue button is always in reach; hidden from lg up, where the
 * calendar shows its own inline button. Honours prefers-reduced-motion (fade only).
 *
 * placement="fixed"  — pinned to the viewport (public booking page)
 * placement="sticky" — pinned to the bottom of a scrolling container (dialogs, whose
 *                      transformed content would break `position: fixed`)
 */
export function BookingBottomSheet({
    open,
    children,
    label,
    placement = "fixed",
    className,
}: {
    open: boolean;
    children: ReactNode;
    label: string;
    placement?: "fixed" | "sticky";
    className?: string;
}) {
    const reduceMotion = useReducedMotion();

    return (
        <AnimatePresence initial={false}>
            {open && (
                <motion.div
                    key="booking-sheet"
                    role="region"
                    aria-label={label}
                    initial={reduceMotion ? { opacity: 0 } : { y: "110%" }}
                    animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { y: "110%" }}
                    transition={
                        reduceMotion
                            ? { duration: 0.15 }
                            : { type: "spring", stiffness: 420, damping: 36, mass: 0.9 }
                    }
                    className={cn(
                        "z-40 lg:hidden",
                        placement === "fixed" ? "fixed inset-x-0 bottom-0" : "sticky bottom-0",
                        className
                    )}
                >
                    <div
                        className={cn(
                            "rounded-t-[26px] bg-white px-5 pt-2.5 ring-1 ring-rh-night/10 dark:bg-rh-ink-2 dark:ring-white/10",
                            "shadow-[0_-18px_48px_-20px_rgba(0,46,44,0.55)]",
                            placement === "fixed" && "mx-auto max-w-xl"
                        )}
                        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
                    >
                        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-rh-night/15 dark:bg-white/20" aria-hidden />
                        {children}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
