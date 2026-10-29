"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { AlertCircle, Clock, Mail } from "@/components/icons";
import { primaryButtonClass, secondaryButtonClass } from "@/components/physio/ui";
import { IconChip } from "@/components/patient/ui";
import { cn } from "@/lib/utils";

const SUPPORT_EMAIL = "partners@physioaroundme.com";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-pt-canvas px-4 py-10 text-pt-ink sm:py-16">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" aria-label="Rehabify Health">
            <Image src="/logos/MainRehabify.svg" alt="Rehabify Health" width={112} height={30} className="h-7 w-auto" priority />
          </Link>
          <UserButton afterSignOutUrl="/partners/portal" />
        </div>
        <div className="rounded-3xl border border-pt-line bg-pt-surface p-6 shadow-pt sm:p-8">{children}</div>
      </div>
    </div>
  );
}

/** A referring doctor waiting for Rehabify to check their licence. */
export function DoctorPendingScreen({ name, email }: { name?: string | null; email?: string | null }) {
  const steps = [
    ["We check your licence", "Our clinical team confirms your MDCN registration."],
    ["Your portal opens", "Refer patients in a minute and get your own referral link and QR code."],
    ["Add your bank account", "So we can pay your commission each month."],
  ];
  return (
    <Shell>
      <IconChip icon={Clock} tone="blue" size="lg" />
      <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-tight">We&apos;re checking your licence</h1>
      <p className="mt-2 text-[15px] text-pt-muted">
        Thanks{name ? `, ${name}` : ""}. We check every referring doctor before they can refer. We&apos;ll email
        {email ? <strong className="font-semibold text-pt-ink"> {email}</strong> : " you"} as soon as you&apos;re approved.
      </p>
      <ol className="mt-6 space-y-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i === 0 ? "bg-pt-primary text-pt-on-primary" : "bg-pt-sunken text-pt-muted"
              )}
            >
              {i + 1}
            </span>
            <span className="pt-0.5">
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block text-sm text-pt-muted">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-7 flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="outline" className={cn(secondaryButtonClass, "h-11 flex-1")}>
          <Link href="/doctor">Update my details</Link>
        </Button>
        <Button asChild variant="outline" className={cn(secondaryButtonClass, "h-11 flex-1")}>
          <a href={`mailto:${SUPPORT_EMAIL}`}>
            <Mail className="h-4 w-4" />
            Contact us
          </a>
        </Button>
      </div>
    </Shell>
  );
}

/** We couldn't verify the doctor: say why and let them correct it. */
export function DoctorRejectedScreen({ reason }: { reason?: string | null }) {
  return (
    <Shell>
      <IconChip icon={AlertCircle} tone="rose" size="lg" />
      <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-tight">We couldn&apos;t verify your account</h1>
      <p className="mt-2 text-[15px] text-pt-muted">{reason || "We couldn't confirm your licence details."}</p>
      <div className="mt-7 flex flex-col gap-2 sm:flex-row">
        <Button asChild className={cn(primaryButtonClass, "h-11 flex-1")}>
          <Link href="/doctor">Correct my details</Link>
        </Button>
        <Button asChild variant="outline" className={cn(secondaryButtonClass, "h-11 flex-1")}>
          <a href={`mailto:${SUPPORT_EMAIL}`}>
            <Mail className="h-4 w-4" />
            Email us
          </a>
        </Button>
      </div>
      <p className="mt-4 text-xs text-pt-muted">Send your MDCN folio number to {SUPPORT_EMAIL} and we&apos;ll take another look.</p>
    </Shell>
  );
}
