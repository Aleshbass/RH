"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ExternalLink } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import PhysioCard from "@/components/marketplace/PhysioCard";
import VerificationBadgeWidget from "@/components/marketplace/VerificationBadgeWidget";
import { EmptyState, PageContainer, PageHeader, Panel, StatTile, StatusBadge, formatNaira } from "@/components/physio/ui";
import type { MarketplaceSettings, TravelZone } from "@/lib/rehabify-api-types";

/** Marketplace performance, services and coverage, the verified badge and a preview of the public profile. */
export default function PhysiotherapistMarketplacePage() {
  const settings = useQuery(api.marketplace.settings.getMyMarketplaceSettings) as MarketplaceSettings | null | undefined;
  const zones = useQuery(api.travelZones.listZones) as TravelZone[] | undefined;

  if (settings === undefined) {
    return (
      <PageContainer>
        <Skeleton className="h-8 w-56 rounded-lg" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </PageContainer>
    );
  }

  if (settings === null || !settings.isApproved) {
    return (
      <PageContainer>
        <PageHeader title="Marketplace profile" />
        <Panel>
          <EmptyState
            title="Available once you’re approved"
            description="Your marketplace stats and profile preview appear here after we’ve verified your application."
          />
        </Panel>
      </PageContainer>
    );
  }

  if (settings.isClinicMember) {
    return (
      <PageContainer>
        <PageHeader title="Marketplace profile" />
        <Panel>
          <EmptyState
            title="You see patients through your clinic"
            description="Clinic physiotherapists work under their clinic’s terms and prices, so you aren’t listed on the Rehabify marketplace."
          />
        </Panel>
      </PageContainer>
    );
  }

  const coveredZones = (zones ?? []).filter((zone) => settings.coveredZoneIds.includes(zone.id));

  const previewData = {
    id: settings.userId,
    fullName: settings.fullName,
    imageUrl: settings.imageUrl,
    credentials: [],
    bio: settings.bio || "No bio yet",
    specializations: settings.specializations,
    yearsOfExperience: settings.yearsOfExperience,
    location: settings.location || "Location not set",
    averageRating: settings.averageRating,
    reviewCount: settings.reviewCount,
    isVerified: settings.verificationBadge.status !== "none",
    offersOnlineSessions: settings.offersOnlineSessions,
    offersInPersonSessions: settings.offersInPersonSessions,
  };

  return (
    <PageContainer>
      <PageHeader
        title="Marketplace profile"
        description="How you’re doing on the Rehabify marketplace."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/physiotherapist/settings/marketplace">Services &amp; coverage</Link>
            </Button>
            <Button asChild variant="outline">
              <a href={`/find-a-physio/${settings.userId}`} target="_blank" rel="noopener noreferrer">
                View public page
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Profile views" value={settings.profileViews || 0} hint="all time" />
        <StatTile label="Bookings" value={settings.bookingsThroughMarketplace || 0} hint="from the marketplace" />
        <StatTile label="Earnings" value={formatNaira(settings.totalMarketplaceEarnings || 0)} hint="your payouts from the marketplace" />
        <StatTile
          label="Rating"
          value={settings.averageRating > 0 ? settings.averageRating.toFixed(1) : "–"}
          hint={settings.reviewCount > 0 ? `${settings.reviewCount} ${settings.reviewCount === 1 ? "review" : "reviews"}` : "no reviews yet"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Panel title="Preview" description="What patients see in search">
            <div className="p-4 sm:p-5">
              <PhysioCard physiotherapist={previewData} />
            </div>
          </Panel>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Panel
            title="Services & coverage"
            description="How Rehabify patients can see you"
            actions={
              <Link href="/dashboard/physiotherapist/settings/marketplace" className="text-sm font-medium text-rh-teal hover:underline dark:text-rh-aqua">
                Change
              </Link>
            }
          >
            <dl className="divide-y divide-neutral-100 text-sm dark:divide-white/[0.07]">
              <div className="flex items-center justify-between gap-4 px-5 py-3">
                <dt className="text-neutral-500 dark:text-neutral-400">Video sessions</dt>
                <dd>
                  <StatusBadge tone={settings.offersOnlineSessions ? "green" : "neutral"}>{settings.offersOnlineSessions ? "On" : "Off"}</StatusBadge>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-5 py-3">
                <dt className="shrink-0 text-neutral-500 dark:text-neutral-400">Home visits</dt>
                <dd className="min-w-0 text-right">
                  {settings.offersInPersonSessions && coveredZones.length > 0 ? (
                    <span className="text-neutral-900 dark:text-white">{coveredZones.map((zone) => `${zone.name}, ${zone.city}`).join(" · ")}</span>
                  ) : (
                    <StatusBadge>Off</StatusBadge>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-3">
                <dt className="text-neutral-500 dark:text-neutral-400">Network terms</dt>
                <dd>
                  {settings.networkTermsAccepted ? (
                    <StatusBadge tone="green">Accepted</StatusBadge>
                  ) : (
                    <Link href="/dashboard/physiotherapist/settings/network-terms" className="font-medium text-rh-teal hover:underline dark:text-rh-aqua">
                      Review and accept
                    </Link>
                  )}
                </dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Verified badge" description="Rank higher in search and build trust">
            <div className="p-4 sm:p-5">
              <VerificationBadgeWidget currentStatus={settings.verificationBadge} />
            </div>
          </Panel>
        </div>
      </div>
    </PageContainer>
  );
}
