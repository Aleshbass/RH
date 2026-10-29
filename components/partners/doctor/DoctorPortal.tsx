"use client";

import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "convex/react";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Home, UserPlus, UserRound, Users, Wallet } from "@/components/icons";
import { PageSkeleton, primaryButtonClass } from "@/components/physio/ui";
import { cn } from "@/lib/utils";
import { publicAppUrl } from "@/lib/public-app-url";
import type { PartnerInfo } from "@/components/partners/portal/shared";
import { doctorRefs } from "./refs";
import { DoctorHome } from "./DoctorHome";
import { DoctorReferrals } from "./DoctorReferrals";
import { DoctorEarnings } from "./DoctorEarnings";
import { DoctorProfile } from "./DoctorProfile";
import { DoctorNotifications } from "./DoctorNotifications";
import { ReferDrawer } from "./ReferDrawer";
import { ReferralDrawer } from "./ReferralDrawer";

type Tab = "home" | "referrals" | "earnings" | "profile";

const TABS: Array<{ id: Tab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "referrals", label: "My referrals", icon: Users },
  { id: "earnings", label: "Earnings", icon: Wallet },
  { id: "profile", label: "Profile", icon: UserRound },
];

const isTab = (value: string | null): value is Tab => TABS.some((t) => t.id === value);

/** Keeps ?tab= and ?referral= in the address bar, so links from emails and notifications open the right thing. */
function writeParams(tab: Tab, referralId: string | null) {
  try {
    const url = new URL(window.location.href);
    if (tab === "home") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    if (referralId) url.searchParams.set("referral", referralId);
    else url.searchParams.delete("referral");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Not worth interrupting anyone over
  }
}

/**
 * The referring doctor's portal, on the same design system as the physio and patient portals:
 * Home (refer, progress, share link, earnings), My referrals, Earnings and Profile. A bottom tab
 * bar with the Refer button in the middle on phones.
 */
export function DoctorPortal({
  partnerCode,
  info,
  isAdmin,
  adminSwitcher,
}: {
  partnerCode: string;
  info: PartnerInfo | undefined;
  isAdmin: boolean;
  /** An admin's organisation picker, shown in the top bar */
  adminSwitcher?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("home");
  const [referOpen, setReferOpen] = useState(false);
  const [referralId, setReferralId] = useState<string | null>(null);
  const home = useQuery(doctorRefs.home, { partnerCode });

  // Opened from an email or notification link: /partners/portal?referral=<id>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("tab");
    if (isTab(fromUrl)) setTab(fromUrl);
    const referral = params.get("referral");
    if (referral) setReferralId(referral);
  }, []);

  const go = useCallback(
    (next: Tab) => {
      setTab(next);
      writeParams(next, referralId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [referralId]
  );
  const openReferral = useCallback(
    (id: string | null) => {
      setReferralId(id);
      writeParams(tab, id);
    },
    [tab]
  );

  const name = info?.name ?? home?.name ?? "";
  const canCreateLink = !isAdmin && Boolean(info?.hasProductionAccess);

  return (
    <div className="min-h-screen bg-pt-canvas text-pt-ink antialiased">
      <header className="sticky top-0 z-30 border-b border-pt-line bg-pt-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={publicAppUrl()} className="shrink-0 transition-opacity hover:opacity-80" aria-label="Rehabify Health">
              <Image src="/logos/MainRehabify.svg" alt="Rehabify Health" width={104} height={28} className="h-6 w-auto sm:h-7" priority />
            </Link>
            <span className="hidden h-5 w-px bg-pt-line-strong sm:block" />
            <span className="hidden truncate text-sm font-medium text-pt-muted sm:block">Referral portal</span>
          </div>

          <nav className="hidden items-center gap-1 rounded-2xl bg-pt-sunken p-1 md:flex" aria-label="Portal">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => go(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "rounded-xl px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50",
                  tab === t.id ? "bg-pt-surface text-pt-ink shadow-pt dark:shadow-none" : "text-pt-muted hover:text-pt-ink"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {adminSwitcher}
            {info && (
              <Button type="button" onClick={() => setReferOpen(true)} className={cn(primaryButtonClass, "hidden h-10 md:inline-flex")}>
                <UserPlus className="h-4 w-4" />
                Refer a patient
              </Button>
            )}
            {!isAdmin && <DoctorNotifications onOpenReferral={(id) => openReferral(id)} />}
            <div className="flex h-10 items-center">
              <UserButton afterSignOutUrl="/partners/portal" />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 sm:px-6 sm:pt-8 md:pb-16">
        {!info ? (
          <PageSkeleton />
        ) : tab === "home" ? (
          <DoctorHome
            partnerCode={partnerCode}
            home={home ?? undefined}
            canCreateLink={canCreateLink}
            onRefer={() => setReferOpen(true)}
            onOpenReferral={(id) => openReferral(id)}
            onSeeReferrals={() => go("referrals")}
            onSeeEarnings={() => go("earnings")}
          />
        ) : tab === "referrals" ? (
          <DoctorReferrals partnerCode={partnerCode} onRefer={() => setReferOpen(true)} onOpenReferral={(id) => openReferral(id)} />
        ) : tab === "earnings" ? (
          <DoctorEarnings partnerCode={partnerCode} />
        ) : (
          <DoctorProfile partnerCode={partnerCode} info={info} isAdmin={isAdmin} />
        )}
      </main>

      {/* Phones: tabs at the bottom, Refer in the middle */}
      {info && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-pt-line bg-pt-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
          aria-label="Portal"
        >
          <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
            {TABS.slice(0, 2).map((t) => (
              <BottomTab key={t.id} tab={t} active={tab === t.id} onClick={() => go(t.id)} />
            ))}
            <div className="flex justify-center pb-1.5">
              <button
                type="button"
                onClick={() => setReferOpen(true)}
                aria-label="Refer a patient"
                className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-pt-primary text-pt-on-primary shadow-pt-lift transition active:scale-95"
              >
                <UserPlus className="h-5 w-5" />
              </button>
            </div>
            {TABS.slice(2).map((t) => (
              <BottomTab key={t.id} tab={t} active={tab === t.id} onClick={() => go(t.id)} />
            ))}
          </div>
        </nav>
      )}

      {info && (
        <>
          <ReferDrawer
            partnerCode={partnerCode}
            doctorName={name}
            open={referOpen}
            onOpenChange={setReferOpen}
            onViewReferral={(id) => {
              setReferOpen(false);
              openReferral(id);
            }}
          />
          <ReferralDrawer partnerCode={partnerCode} referralId={referralId} onOpenChange={(open) => !open && openReferral(null)} />
        </>
      )}
    </div>
  );
}

function BottomTab({
  tab,
  active,
  onClick,
}: {
  tab: { id: Tab; label: string; icon: ComponentType<{ className?: string }> };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn("flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition", active ? "text-pt-ink" : "text-pt-faint")}
    >
      <Icon className="h-5 w-5" />
      {tab.id === "referrals" ? "Referrals" : tab.label}
    </button>
  );
}
