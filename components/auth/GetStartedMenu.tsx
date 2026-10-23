"use client";

/**
 * "Get started" in the site header: asks who the visitor is before sign-up, so a physio or
 * clinic who never found their own page still lands in the right onboarding. The option
 * matching the current page is marked "Suggested"; the choice is remembered for later.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Building2, ChevronDown, Handshake, Heart, HeartHandshake, LayoutDashboard, Stethoscope, UserCheck } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  intentForPath,
  onboardingPathFor,
  PRIMARY_INTENTS,
  rememberIntent,
  SECONDARY_INTENTS,
  SIGNUP_INTENTS,
  signUpHrefFor,
  type SignupIntent,
} from "@/lib/auth/signupIntent";

export const INTENT_ICONS: Record<SignupIntent, React.ComponentType<{ className?: string }>> = {
  patient: Heart,
  physiotherapist: UserCheck,
  clinic_owner: Building2,
  doctor: Stethoscope,
  family: HeartHandshake,
  partner: Handshake,
};

function IntentLink({
  intent,
  suggested,
  compact,
  onPick,
}: {
  intent: SignupIntent;
  suggested: boolean;
  compact?: boolean;
  onPick?: () => void;
}) {
  const Icon = INTENT_ICONS[intent];
  const details = SIGNUP_INTENTS[intent];
  return (
    <Link
      href={signUpHrefFor(intent)}
      onClick={() => {
        rememberIntent(intent);
        onPick?.();
      }}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 transition-colors hover:bg-[#f0f8f7] focus-visible:bg-[#f0f8f7] focus-visible:outline-none",
        compact ? "py-2" : "py-2.5",
        suggested && "bg-[#f0f8f7] ring-1 ring-inset ring-[#005b57]/15",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg bg-[#e6f0ef] text-[#005b57] transition-colors group-hover:bg-[#005b57] group-hover:text-white",
          compact ? "h-7 w-7" : "h-9 w-9",
        )}
      >
        <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("font-semibold text-gray-900", compact ? "text-[13px]" : "text-sm")}>{details.menuLabel}</span>
          {suggested && (
            <span className="rounded-full bg-[#005b57] px-2 py-0.5 text-[10px] font-bold text-white">Suggested</span>
          )}
        </span>
        {!compact && <span className="mt-0.5 block text-xs text-gray-500">{details.description}</span>}
      </span>
    </Link>
  );
}

/** Every option, primary roles first. Used inside the desktop dropdown and the mobile menu. */
export function GetStartedList({ onPick }: { onPick?: () => void }) {
  const suggested = intentForPath(usePathname());
  return (
    <div>
      <div className="space-y-1">
        {PRIMARY_INTENTS.map((intent) => (
          <IntentLink key={intent} intent={intent} suggested={suggested === intent} onPick={onPick} />
        ))}
      </div>
      <div className="my-2 h-px bg-gray-100" role="separator" />
      <div className="space-y-0.5">
        {SECONDARY_INTENTS.map((intent) => (
          <IntentLink key={intent} intent={intent} suggested={suggested === intent} compact onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

/** Desktop "Get started ▾" button and its dropdown. */
export function GetStartedMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#002e2c] px-4 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#004744] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#005b57]/25"
      >
        Get started
        <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="absolute right-0 z-50 mt-2 w-[320px] rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_16px_48px_rgba(0,0,0,0.12)]"
          >
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Who are you?</p>
            <GetStartedList onPick={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type AccountLike = { role?: string | null; onboarded?: boolean } | null | undefined;

const ROLE_SETUP_PATHS: Record<string, string> = {
  patient: onboardingPathFor("patient"),
  physiotherapist: onboardingPathFor("physiotherapist"),
  clinic_owner: onboardingPathFor("clinic_owner"),
  doctor: onboardingPathFor("doctor"),
};

/** Where a signed-in person's account button goes: their dashboard, or the step they haven't finished. */
export function accountDestination(user: AccountLike): { href: string; label: string } {
  if (user && !user.role) return { href: "/role-selection", label: "Finish setup" };
  if (user?.role === "partner") return { href: "/partners/portal", label: "Partner portal" };
  if (user && !user.onboarded && user.role && ROLE_SETUP_PATHS[user.role]) {
    return { href: ROLE_SETUP_PATHS[user.role], label: "Finish setup" };
  }
  return { href: "/dashboard", label: "Dashboard" };
}

/** "Dashboard" (or "Finish setup") for signed-in visitors, next to the account avatar. */
export function DashboardButton({ className, onClick }: { className?: string; onClick?: () => void }) {
  const user = useQuery(api.users.getMyUser);
  const { href, label } = accountDestination(user);
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-[#002e2c] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#004744] sm:px-4 sm:py-2 sm:text-sm",
        className,
      )}
    >
      <LayoutDashboard className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
