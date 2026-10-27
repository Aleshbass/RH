"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgeCheck, Star } from "@/components/icons";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

interface PhysioCardProps {
  physiotherapist: {
    id: string;
    fullName: string;
    imageUrl?: string;
    credentials: string[];
    bio?: string;
    specializations: string[];
    yearsOfExperience: number;
    location?: string;
    averageRating: number;
    reviewCount: number;
    isVerified: boolean;
    offersOnlineSessions: boolean;
    offersInPersonSessions: boolean;
  };
  /** e.g. "From ₦6,000": the cheapest Rehabify service this physio offers. */
  priceHint?: string | null;
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

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PhysioCard({ physiotherapist, priceHint }: PhysioCardProps) {
  const trackView = useMutation(api.analytics.trackProfileView);

  const {
    id,
    fullName,
    imageUrl,
    credentials,
    bio,
    specializations,
    yearsOfExperience,
    location,
    averageRating,
    reviewCount,
    isVerified,
    offersOnlineSessions,
    offersInPersonSessions,
  } = physiotherapist;

  const modes = [offersOnlineSessions && "Video", offersInPersonSessions && "Home visits"].filter(Boolean).join(" · ");
  const meta = [location && titleCase(location), yearsOfExperience > 0 && `${yearsOfExperience} yrs experience`]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/find-a-physio/${id}`}
      onClick={() => trackView({ physiotherapistId: id as any }).catch(() => {})}
      className="group flex h-full flex-col rounded-2xl border border-rh-ink/10 bg-white p-5 transition-colors hover:border-rh-ink/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
    >
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          {imageUrl ? (
            <Image src={imageUrl} alt={fullName} width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rh-ink text-lg font-semibold text-white">
              {initials(fullName)}
            </div>
          )}
          {isVerified && (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-rh-lime text-rh-ink"
              title="Verified by Rehabify"
            >
              <BadgeCheck className="h-3 w-3" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="truncate text-[17px] font-semibold leading-snug text-rh-ink" title={fullName}>
              {fullName}
            </h3>
            {averageRating > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-rh-ink">
                <Star className="h-3.5 w-3.5" />
                {averageRating.toFixed(1)}
                <span className="font-normal text-rh-ink/50">({reviewCount})</span>
              </span>
            )}
          </div>
          <p className="truncate text-sm text-rh-ink/60">
            {credentials.length > 0 ? credentials.join(" · ") : "Physiotherapist"}
          </p>
          {meta && <p className="mt-1 truncate text-sm text-rh-ink/60">{meta}</p>}
        </div>
      </div>

      {specializations.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {specializations.slice(0, 3).map((spec) => (
            <span key={spec} className="rounded-full bg-rh-canvas px-2.5 py-1 text-xs font-medium text-rh-ink/80">
              {spec}
            </span>
          ))}
          {specializations.length > 3 && (
            <span className="rounded-full px-1.5 py-1 text-xs text-rh-ink/50">+{specializations.length - 3}</span>
          )}
        </div>
      )}

      {bio && <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-rh-ink/70">{bio}</p>}

      <div className="min-h-4 flex-1" />
      <div className="flex items-end justify-between gap-3 border-t border-rh-ink/10 pt-4">
        <div className="min-w-0 text-sm">
          {modes && <p className="truncate text-rh-ink/60">{modes}</p>}
          {priceHint && <p className="font-semibold tabular-nums text-rh-ink">{priceHint}</p>}
        </div>
        <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-rh-lime px-4 text-sm font-semibold text-rh-ink transition-colors group-hover:bg-rh-lime-deep">
          View profile
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
