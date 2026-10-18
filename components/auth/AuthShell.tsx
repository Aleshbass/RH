'use client';

/**
 * Full-screen frame for the sign-in and sign-up pages (main site and partner portal):
 * logo on top, legal links at the bottom, form in between, and a night-green brand panel
 * on large screens. Sized to the dynamic viewport so the page itself never scrolls; the
 * form column only scrolls as a last resort (e.g. a CAPTCHA challenge on a tiny screen).
 */
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { AUTH_COPY, authRoutes, type AuthAudience } from "./authConfig";
import { EASE } from "./AuthControls";

function BrandPanel({ audience, home }: { audience: AuthAudience; home: string }) {
  const copy = AUTH_COPY[audience].panel;
  const reduce = useReducedMotion();
  return (
    <aside className="relative hidden w-[46%] max-w-[680px] shrink-0 p-3 lg:flex">
      <div className="relative flex w-full flex-col overflow-hidden rounded-[2rem] bg-rh-night px-10 py-9 text-white xl:px-14 xl:py-12">
        <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-rh-teal/60 blur-3xl" />
        {/* Colour pairing from the brand guide: teal + lime rounded squares */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 xl:h-80 xl:w-80"
          initial={reduce ? false : { opacity: 0, y: 40, rotate: -8 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
        >
          <div className="absolute inset-0 rounded-[28%] bg-rh-teal" />
          <div className="absolute -left-[16%] -top-[16%] h-[44%] w-[44%] rounded-[26%] bg-rh-lime" />
        </motion.div>

        <Link
          href={home}
          aria-label="Rehabify Health home"
          className="relative inline-flex w-fit rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <Image src="/logos/WhiteGreen MainRehabify.svg" alt="Rehabify Health" width={132} height={36} priority className="h-9 w-auto" />
        </Link>

        <motion.div
          className="relative my-auto max-w-[30rem] py-8"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-rh-mint ring-1 ring-inset ring-white/15">
            <span className="h-1.5 w-1.5 rounded-full bg-rh-lime" />
            {copy.badge}
          </span>
          <h2 className="mt-6 text-[44px] leading-[1.04] tracking-tight text-white xl:text-[54px] [@media(max-height:720px)]:mt-4 [@media(max-height:720px)]:text-[38px]">
            {copy.lead}{" "}
            <span className="relative inline-block">
              {copy.highlight}
              <span aria-hidden className="absolute -bottom-1 left-0 h-[0.1em] w-full rounded-full bg-rh-lime" />
            </span>
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/70 [@media(max-height:760px)]:hidden">{copy.body}</p>
          <ul className="mt-7 space-y-3 [@media(max-height:660px)]:hidden">
            {copy.points.map((point) => (
              <li key={point} className="flex items-center gap-3 text-[15px] text-white/85">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rh-lime text-rh-night">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </aside>
  );
}

export function AuthShell({
  audience = "default",
  partnersHost = false,
  children,
}: {
  audience?: AuthAudience;
  partnersHost?: boolean;
  children: ReactNode;
}) {
  const routes = authRoutes(audience, partnersHost);
  const reduce = useReducedMotion();
  const legal = [
    { href: `${routes.siteOrigin}/terms-and-conditions`, label: "Terms" },
    { href: `${routes.siteOrigin}/privacy-policy`, label: "Privacy policy" },
    { href: `${routes.siteOrigin}/support`, label: "Help" },
  ];

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-rh-canvas text-rh-night">
      <BrandPanel audience={audience} home={routes.home} />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
        {/* Small screens: the night + lime pairing tucked into the corner, clear of the form */}
        <div aria-hidden className="pointer-events-none absolute right-0 top-0 h-20 w-28 lg:hidden">
          <div className="absolute -right-10 -top-10 h-28 w-28 rounded-[30%] bg-rh-night" />
          <div className="absolute right-[60px] top-10 h-6 w-6 rounded-lg bg-rh-lime" />
        </div>

        <header className="relative shrink-0 px-5 pt-[clamp(14px,3dvh,32px)] sm:px-10 lg:hidden">
          <Link
            href={routes.home}
            aria-label="Rehabify Health home"
            className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-teal/40"
          >
            <Image src="/logos/MainRehabify.svg" alt="Rehabify Health" width={118} height={32} priority className="h-[clamp(28px,4.6dvh,32px)] w-auto" />
          </Link>
        </header>

        {/* my-auto (not justify-center) so content is never clipped if it has to scroll */}
        <div className="relative flex flex-1 flex-col px-5 py-[clamp(10px,2.4dvh,24px)] sm:px-10">
          <motion.div
            className="mx-auto my-auto w-full max-w-[400px]"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            {children}
          </motion.div>
        </div>

        <footer className="relative shrink-0 px-5 pb-[clamp(10px,2.2dvh,24px)] pt-1">
          <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-rh-night/50">
            {legal.map((link) => (
              <Link key={link.label} href={link.href} className="transition hover:text-rh-night hover:underline underline-offset-4">
                {link.label}
              </Link>
            ))}
            <span>© {new Date().getFullYear()} Rehabify Health</span>
          </nav>
        </footer>
      </div>
    </div>
  );
}

/** Suspense fallback and "signing you in" state, inside the same frame so nothing jumps. */
export function AuthLoading({
  audience = "default",
  partnersHost = false,
  label = "Loading…",
}: {
  audience?: AuthAudience;
  partnersHost?: boolean;
  label?: string;
}) {
  return (
    <AuthShell audience={audience} partnersHost={partnersHost}>
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-rh-night/60" role="status">
        <Loader2 className="h-7 w-7 animate-spin text-rh-teal" />
        {label}
      </div>
    </AuthShell>
  );
}
