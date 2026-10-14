"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ExternalLink } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import PhysioCard from "@/components/marketplace/PhysioCard";
import VerificationBadgeWidget from "@/components/marketplace/VerificationBadgeWidget";
import { EmptyState, PageContainer, PageHeader, Panel, StatTile, formatNaira } from "@/components/physio/ui";

/** Marketplace performance, the verified badge and a preview of the public profile. */
export default function PhysiotherapistMarketplacePage() {
  const settings = useQuery(api.marketplace.settings.getMyMarketplaceSettings);

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

  const previewData = {
    id: settings.userId,
    fullName: settings.fullName,
    imageUrl: settings.imageUrl,
    credentials: [],
    bio: settings.bio || "No bio yet",
    specializations: settings.specializations,
    yearsOfExperience: settings.yearsOfExperience,
    location: settings.location || "Location not set",
    hourlyRate: settings.hourlyRate,
    initialConsultRate: settings.initialConsultRate,
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
              <Link href="/dashboard/physiotherapist/settings/marketplace">Prices &amp; listing</Link>
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
        <StatTile label="Earnings" value={formatNaira(settings.totalMarketplaceEarnings || 0)} hint="from the marketplace" />
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
        <div className="lg:col-span-2">
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
