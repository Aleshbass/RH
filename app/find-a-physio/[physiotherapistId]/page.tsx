"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Check, Loader2, Star } from "@/components/icons";
import BookingWidget from "@/components/marketplace/BookingWidget";
import ReviewsList from "@/components/marketplace/ReviewsList";
import RatingBreakdown from "@/components/marketplace/RatingBreakdown";
import { cn } from "@/lib/utils";
import { PublicProof } from "@/components/outcomes/PublicProof";
import { rememberViewedPhysio } from "@/lib/viewedPhysios";

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

const cardClass = "rounded-2xl border border-rh-ink/10 bg-white p-5 sm:p-6";

export default function PhysiotherapistProfilePage() {
  const params = useParams();
  const router = useRouter();
  const physiotherapistId = params.physiotherapistId as Id<"users">;
  const [activeSection, setActiveSection] = useState<"about" | "reviews">("about");

  const profile = useQuery(api.marketplace.search.getPhysiotherapistProfile, { physiotherapistId });
  const ratingBreakdown = useQuery(api.marketplace.reviews.getRatingBreakdown, { physiotherapistId });

  // Track profile view (once per session)
  const incrementView = useMutation(api.marketplace.search.incrementProfileView);

  useEffect(() => {
    if (!profile) return;
    // Remembered on this device so "Help me choose a physio" can tell the care team who they looked at
    rememberViewedPhysio(physiotherapistId);
    try {
      const key = `viewed_${physiotherapistId}`;
      const seen = sessionStorage.getItem(key);
      if (!seen) {
        incrementView({ physiotherapistId }).catch(console.error);
        sessionStorage.setItem(key, "1");
      }
    } catch {
      incrementView({ physiotherapistId }).catch(console.error);
    }
  }, [physiotherapistId, profile?.profileId, incrementView]);

  if (profile === undefined) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-rh-canvas text-rh-ink">
        <Loader2 className="h-7 w-7 animate-spin" />
        <p className="mt-4 text-sm text-rh-ink/60">Loading profile…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rh-canvas px-4 text-rh-ink">
        <div className="max-w-md rounded-3xl bg-white p-10 text-center">
          <h1 className="text-xl font-semibold">This profile isn&apos;t available</h1>
          <p className="mt-2 text-rh-ink/60">
            The physiotherapist may not be taking new patients right now, or the link may be wrong.
          </p>
          <Link
            href="/find-a-physio"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-rh-lime px-5 text-sm font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to search
          </Link>
        </div>
      </div>
    );
  }

  const modes = [
    profile.offersOnlineSessions && { title: "Video sessions", detail: "On a secure video call, wherever you are." },
    profile.offersInPersonSessions && {
      title: "Home visits",
      detail: profile.location ? `In and around ${titleCase(profile.location)}.` : "In the areas they cover.",
    },
  ].filter(Boolean) as { title: string; detail: string }[];

  const meta = [
    profile.location && titleCase(profile.location),
    profile.yearsOfExperience > 0 && `${profile.yearsOfExperience} yrs experience`,
    modes.map((mode) => mode.title).join(" · "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-screen bg-rh-canvas text-rh-ink">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6 md:pt-32 lg:px-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm font-medium text-rh-ink/60 transition-colors hover:text-rh-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            {/* Profile header */}
            <div className={cn(cardClass, "flex flex-col gap-5 sm:flex-row sm:items-start")}>
              <div className="relative shrink-0">
                {profile.imageUrl ? (
                  <Image
                    src={profile.imageUrl}
                    alt={profile.fullName}
                    width={112}
                    height={112}
                    className="h-24 w-24 rounded-2xl object-cover sm:h-28 sm:w-28"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-rh-ink text-3xl font-semibold text-white sm:h-28 sm:w-28">
                    {initials(profile.fullName)}
                  </div>
                )}
                {profile.isVerified && (
                  <span
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-rh-lime text-rh-ink"
                    title="Verified by Rehabify"
                  >
                    <BadgeCheck className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{profile.fullName}</h1>
                    <p className="mt-0.5 text-rh-ink/60">
                      {profile.credentials.length > 0 ? profile.credentials.join(" · ") : "Physiotherapist"}
                    </p>
                  </div>
                  {profile.averageRating > 0 ? (
                    <div className="flex items-center gap-1.5 text-lg font-semibold tabular-nums">
                      <Star className="h-4 w-4" />
                      {profile.averageRating.toFixed(1)}
                      <span className="text-sm font-normal text-rh-ink/50">
                        ({profile.reviewCount} review{profile.reviewCount !== 1 ? "s" : ""})
                      </span>
                    </div>
                  ) : (
                    <span className="rounded-full bg-rh-canvas px-3 py-1 text-xs font-medium text-rh-ink/70">New on Rehabify</span>
                  )}
                </div>

                {meta && <p className="mt-3 text-sm text-rh-ink/60">{meta}</p>}

                {profile.specializations.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {profile.specializations.map((spec: string) => (
                      <span key={spec} className="rounded-full bg-rh-canvas px-3 py-1 text-xs font-medium text-rh-ink/80">
                        {spec}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section switch */}
            <div className="flex w-fit rounded-full border border-rh-ink/10 bg-white p-1" role="tablist">
              {[
                { key: "about" as const, label: "About" },
                { key: "reviews" as const, label: `Reviews (${profile.reviewCount})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeSection === tab.key}
                  onClick={() => setActiveSection(tab.key)}
                  className={cn(
                    "h-9 rounded-full px-5 text-sm font-medium transition-colors",
                    activeSection === tab.key ? "bg-rh-ink text-white" : "text-rh-ink/60 hover:text-rh-ink"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeSection === "about" && (
              <div className="space-y-5">
                <PublicProof physiotherapistId={physiotherapistId} />
                <div className={cardClass}>
                  <h2 className="text-lg font-semibold">About</h2>
                  <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-rh-ink/75">
                    {profile.bio || "This physiotherapist hasn't added a bio yet."}
                  </p>
                </div>

                {modes.length > 0 && (
                  <div className={cardClass}>
                    <h2 className="text-lg font-semibold">How you can see them</h2>
                    <ul className="mt-3 divide-y divide-rh-ink/10">
                      {modes.map((mode) => (
                        <li key={mode.title} className="flex items-start gap-3 py-3 first:pt-1 last:pb-0">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rh-lime text-rh-ink">
                            <Check className="h-3 w-3" />
                          </span>
                          <div>
                            <p className="font-medium">{mode.title}</p>
                            <p className="text-sm text-rh-ink/60">{mode.detail}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {profile.languagesSpoken && profile.languagesSpoken.length > 0 && (
                  <div className={cardClass}>
                    <h2 className="text-lg font-semibold">Languages</h2>
                    <p className="mt-2 text-rh-ink/75">{profile.languagesSpoken.join(", ")}</p>
                  </div>
                )}
              </div>
            )}

            {activeSection === "reviews" && (
              <div className="space-y-5">
                {ratingBreakdown && (
                  <div className="overflow-hidden rounded-2xl border border-rh-ink/10 bg-white">
                    <RatingBreakdown breakdown={ratingBreakdown} />
                  </div>
                )}
                <div className="overflow-hidden rounded-2xl border border-rh-ink/10 bg-white">
                  <ReviewsList physiotherapistId={physiotherapistId} />
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="space-y-4 lg:sticky lg:top-28">
              <BookingWidget profile={profile} />

              <div className={cardClass}>
                <h2 className="font-semibold">Booking through Rehabify</h2>
                <ul className="mt-3 space-y-2.5 text-sm text-rh-ink/75">
                  {[
                    "Licensed physiotherapist",
                    "The price you see is the price you pay",
                    "Pay securely online",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
