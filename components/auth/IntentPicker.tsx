"use client";

/**
 * "I'm signing up as" on the sign-up page: Patient · Physio · Clinic, with the rarer
 * choices (doctor, caregiver, partner) under "More". Compact so the form still fits a
 * small phone without scrolling.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils";
import { PRIMARY_INTENTS, SECONDARY_INTENTS, SIGNUP_INTENTS, type SignupIntent } from "@/lib/auth/signupIntent";

const chipClass =
  "inline-flex h-[clamp(32px,4.6dvh,36px)] items-center justify-center gap-1 rounded-full px-3.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rh-teal/20";

export function IntentPicker({
  value,
  onChange,
  disabled,
}: {
  value: SignupIntent | null;
  onChange: (intent: SignupIntent) => void;
  disabled?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const secondary = value && SECONDARY_INTENTS.includes(value) ? value : null;

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [moreOpen]);

  const chip = (selected: boolean) =>
    cn(
      chipClass,
      selected
        ? "bg-rh-night text-white"
        : "bg-white text-rh-night ring-1 ring-inset ring-rh-night/12 hover:ring-rh-night/25",
    );

  return (
    <div>
      <p id="signup-intent-label" className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rh-night/50">
        I&apos;m signing up as
      </p>
      <div role="radiogroup" aria-labelledby="signup-intent-label" className="flex flex-wrap items-center gap-1.5">
        {PRIMARY_INTENTS.map((intent) => (
          <button
            key={intent}
            type="button"
            role="radio"
            aria-checked={value === intent}
            disabled={disabled}
            onClick={() => onChange(intent)}
            className={chip(value === intent)}
          >
            {SIGNUP_INTENTS[intent].chip}
          </button>
        ))}
        <div ref={moreRef} className="relative">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="true"
            disabled={disabled}
            onClick={() => setMoreOpen((open) => !open)}
            className={chip(!!secondary)}
          >
            {secondary ? SIGNUP_INTENTS[secondary].chip : "More"}
            <ChevronDown className={cn("h-3 w-3 transition-transform", moreOpen && "rotate-180")} />
          </button>
          {moreOpen && (
            <div className="absolute right-0 z-20 mt-1.5 w-60 rounded-2xl border border-rh-night/10 bg-white p-1.5 shadow-soft">
              {SECONDARY_INTENTS.map((intent) => (
                <button
                  key={intent}
                  type="button"
                  role="radio"
                  aria-checked={value === intent}
                  onClick={() => {
                    setMoreOpen(false);
                    onChange(intent);
                  }}
                  className={cn(
                    "block w-full rounded-xl px-3 py-2 text-left transition hover:bg-rh-honeydew",
                    value === intent && "bg-rh-honeydew",
                  )}
                >
                  <span className="block text-sm font-semibold text-rh-night">{SIGNUP_INTENTS[intent].menuLabel}</span>
                  <span className="block text-xs text-rh-night/55">{SIGNUP_INTENTS[intent].description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
