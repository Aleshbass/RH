"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export type SwitchOption<T extends string> = {
  id: T;
  label: string;
  /** Used below `sm` when the full label would not fit on a phone */
  short?: string;
};

type Props<T extends string> = {
  options: readonly SwitchOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Prefix for tab/panel ids, unique per page */
  idBase: string;
  label: string;
  tone?: "light" | "dark";
  className?: string;
};

export const switchTabId = (idBase: string, id: string) => `${idBase}-tab-${id}`;
export const switchPanelId = (idBase: string) => `${idBase}-panel`;

/**
 * Pill switch with a highlight that slides to the chosen option.
 * Tab semantics: arrow keys, Home and End move the selection, like a native tab list.
 */
export function SegmentedSwitch<T extends string>({ options, value, onChange, idBase, label, tone = "light", className }: Props<T>) {
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const dark = tone === "dark";

  const move = (index: number) => {
    const next = (index + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: options.length - 1 };
    if (event.key in keys) {
      event.preventDefault();
      move(keys[event.key]);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "inline-flex rounded-full p-1.5 ring-1 ring-inset",
        dark ? "bg-white/[0.06] ring-white/10" : "bg-white ring-rh-ink/10",
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={switchTabId(idBase, option.id)}
            aria-selected={selected}
            aria-controls={switchPanelId(idBase)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "relative flex-1 whitespace-nowrap rounded-full px-4 py-3 text-sm font-semibold transition-colors duration-200 sm:flex-none sm:px-7 sm:text-[15px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2",
              dark ? "focus-visible:ring-offset-rh-ink" : "focus-visible:ring-offset-white",
              selected
                ? dark ? "text-rh-ink" : "text-white"
                : dark ? "text-white/70 hover:text-white" : "text-rh-ink/65 hover:text-rh-ink",
            )}
          >
            {selected && (
              <motion.span
                layoutId={`${idBase}-pill`}
                className={cn("absolute inset-0 rounded-full", dark ? "bg-rh-lime" : "bg-rh-ink")}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">
              {option.short ? (
                <>
                  <span className="sm:hidden">{option.short}</span>
                  <span className="hidden sm:inline">{option.label}</span>
                </>
              ) : (
                option.label
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
