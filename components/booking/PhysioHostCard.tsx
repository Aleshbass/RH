"use client";

import { useState } from "react";
import Image from "next/image";
import { BadgeCheck, Briefcase, MapPin, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { initialsOf, type BookingProfile } from "./booking-shared";

/**
 * Host details for the booking pages (cal.com shows the host in the left column):
 * photo, name, title, specialisations, years of experience and a short bio with "more".
 *
 * tone="dark"  — on the rh-night page background (session-type page)
 * tone="light" — inside the white booking card (calendar page)
 */
export function PhysioHostCard({
    profile,
    tone = "light",
    size = "md",
    className,
}: {
    profile: BookingProfile;
    tone?: "dark" | "light";
    size?: "md" | "lg";
    className?: string;
}) {
    const [bioOpen, setBioOpen] = useState(false);
    const dark = tone === "dark";
    const bio = (profile.bio || "").trim();
    const longBio = bio.length > 150;
    const years = Math.round(profile.yearsOfExperience || 0);
    const title = profile.credentials?.includes("Licensed Physiotherapist")
        ? "Licensed Physiotherapist"
        : "Physiotherapist";
    const specialisations = (profile.specializations || []).filter(Boolean).slice(0, 4);
    const avatar = size === "lg" ? 72 : 56;

    return (
        <div className={cn("min-w-0", className)}>
            <div className="flex items-center gap-3.5">
                <div className="relative shrink-0">
                    {profile.imageUrl ? (
                        <Image
                            src={profile.imageUrl}
                            alt={profile.fullName}
                            width={avatar}
                            height={avatar}
                            unoptimized
                            className={cn(
                                "rounded-full object-cover",
                                dark ? "ring-2 ring-rh-lime/70 ring-offset-2 ring-offset-rh-night" : "ring-1 ring-rh-night/10 dark:ring-white/10"
                            )}
                            style={{ width: avatar, height: avatar }}
                        />
                    ) : (
                        <div
                            className={cn(
                                "flex items-center justify-center rounded-full font-semibold",
                                dark ? "bg-rh-lime text-rh-night" : "bg-rh-night text-white dark:bg-rh-lime dark:text-rh-night",
                                size === "lg" ? "text-xl" : "text-base"
                            )}
                            style={{ width: avatar, height: avatar }}
                            aria-hidden
                        >
                            {initialsOf(profile.fullName)}
                        </div>
                    )}
                    {profile.isVerified && (
                        <span
                            className={cn(
                                "absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-rh-lime text-rh-night ring-2",
                                dark ? "ring-rh-night" : "ring-white dark:ring-rh-ink-2"
                            )}
                            title="Verified by Rehabify"
                        >
                            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                        </span>
                    )}
                </div>
                <div className="min-w-0">
                    <h1
                        className={cn(
                            "truncate font-semibold tracking-tight",
                            size === "lg" ? "text-xl sm:text-2xl" : "text-lg",
                            dark ? "text-white" : "text-rh-night dark:text-white"
                        )}
                    >
                        {profile.fullName}
                    </h1>
                    <p className={cn("text-sm", dark ? "text-white/70" : "text-rh-night/65 dark:text-white/60")}>
                        {title}
                        {profile.isVerified && (
                            <span className={cn("ml-1.5 font-medium", dark ? "text-rh-lime" : "text-rh-night dark:text-rh-lime")}>
                                · Verified
                            </span>
                        )}
                    </p>
                </div>
            </div>

            {(years > 0 || profile.location || (profile.reviewCount ?? 0) > 0) && (
                <ul
                    className={cn(
                        "mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]",
                        dark ? "text-white/75" : "text-rh-night/70 dark:text-white/65"
                    )}
                >
                    {years > 0 && (
                        <li className="flex items-center gap-1.5">
                            <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {years} {years === 1 ? "year" : "years"} experience
                        </li>
                    )}
                    {profile.location && (
                        <li className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {profile.location}
                        </li>
                    )}
                    {(profile.reviewCount ?? 0) > 0 && (
                        <li className="flex items-center gap-1.5">
                            <Star className={cn("h-3.5 w-3.5 shrink-0", dark ? "fill-rh-lime text-rh-lime" : "fill-amber-400 text-amber-400")} aria-hidden />
                            <span className="tabular-nums">{(profile.averageRating || 0).toFixed(1)}</span>
                            <span className={dark ? "text-white/50" : "text-rh-night/45 dark:text-white/45"}>
                                ({profile.reviewCount} {profile.reviewCount === 1 ? "review" : "reviews"})
                            </span>
                        </li>
                    )}
                </ul>
            )}

            {specialisations.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Specialisations">
                    {specialisations.map((spec) => (
                        <li
                            key={spec}
                            className={cn(
                                "rounded-full px-2.5 py-1 text-xs font-medium",
                                dark
                                    ? "bg-white/[0.08] text-white/85 ring-1 ring-inset ring-white/10"
                                    : "bg-rh-night/[0.05] text-rh-night/80 ring-1 ring-inset ring-rh-night/10 dark:bg-white/[0.06] dark:text-white/75 dark:ring-white/10"
                            )}
                        >
                            {spec}
                        </li>
                    ))}
                </ul>
            )}

            {bio && (
                <div className="mt-4">
                    <p
                        className={cn(
                            "whitespace-pre-line text-sm leading-relaxed",
                            dark ? "text-white/75" : "text-rh-night/70 dark:text-white/65",
                            longBio && !bioOpen && "line-clamp-3"
                        )}
                    >
                        {bio}
                    </p>
                    {longBio && (
                        <button
                            type="button"
                            onClick={() => setBioOpen((open) => !open)}
                            aria-expanded={bioOpen}
                            className={cn(
                                "mt-1 rounded text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime",
                                dark ? "text-rh-lime" : "text-rh-night dark:text-rh-lime"
                            )}
                        >
                            {bioOpen ? "less" : "more"}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
