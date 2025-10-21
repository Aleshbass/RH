"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, Eye, Save, BadgeCheck, TrendingUp, DollarSign, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MarketplaceSettingsForm from "@/components/marketplace/MarketplaceSettingsForm";
import PhysioCard from "@/components/marketplace/PhysioCard";
import VerificationBadgeWidget from "@/components/marketplace/VerificationBadgeWidget";
import MarketplaceStatsCard from "@/components/marketplace/MarketplaceStatsCard";

export default function PhysiotherapistMarketplacePage() {
  const [activeTab, setActiveTab] = useState("settings");

  // Get marketplace settings
  const settings = useQuery(api.marketplace.settings.getMyMarketplaceSettings);

  if (settings === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#005b57]" />
      </div>
    );
  }

  if (settings === null) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-600">
              Unable to load marketplace settings. Please ensure you are logged in as a physiotherapist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!settings.isApproved) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900">Account Approval Required</CardTitle>
            <CardDescription className="text-amber-700">
              Your account must be approved by an administrator before you can access marketplace features.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-800">
              Current status: <span className="font-semibold">{settings.approvalStatus}</span>
            </p>
            <p className="text-sm text-amber-700 mt-2">
              You will receive an email notification once your account has been reviewed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Format settings for preview card
  const previewData = {
    id: settings.userId,
    fullName: settings.fullName,
    imageUrl: settings.imageUrl,
    credentials: [],
    bio: settings.bio || "No bio provided yet",
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
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Marketplace Profile</h1>
        <p className="text-gray-600 mt-2">
          Manage your marketplace presence and reach more patients
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MarketplaceStatsCard
          title="Profile Views"
          value={settings.profileViews || 0}
          icon={Eye}
          trend={settings.profileViews > 0 ? "All time" : undefined}
        />
        <MarketplaceStatsCard
          title="Total Bookings"
          value={settings.bookingsThroughMarketplace || 0}
          icon={Users}
          trend={settings.bookingsThroughMarketplace > 0 ? "Lifetime bookings" : undefined}
        />
        <MarketplaceStatsCard
          title="Total Earnings"
          value={`₦${(settings.totalMarketplaceEarnings || 0).toLocaleString()}`}
          icon={DollarSign}
          trend={settings.totalMarketplaceEarnings > 0 ? "From marketplace" : undefined}
        />
        <MarketplaceStatsCard
          title="Average Rating"
          value={settings.averageRating > 0 ? settings.averageRating.toFixed(1) : "N/A"}
          icon={TrendingUp}
          trend={settings.reviewCount > 0 ? `${settings.reviewCount} ${settings.reviewCount === 1 ? 'review' : 'reviews'}` : undefined}
        />
      </div>

      {/* Verification Status */}
      {settings.verificationBadge.status === "none" && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <BadgeCheck className="h-5 w-5" />
              Get Verified Badge
            </CardTitle>
            <CardDescription className="text-blue-700">
              Stand out with a verified badge and rank higher in search results
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VerificationBadgeWidget currentStatus={settings.verificationBadge} />
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="preview">Profile Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Marketplace Settings</CardTitle>
              <CardDescription>
                Update your marketplace profile, pricing, and availability
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MarketplaceSettingsForm settings={settings} />
            </CardContent>
          </Card>

          {settings.verificationBadge.status !== "none" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-blue-500" />
                  Verification Badge
                </CardTitle>
                <CardDescription>
                  Manage your verification subscription
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VerificationBadgeWidget currentStatus={settings.verificationBadge} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="preview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Preview</CardTitle>
              <CardDescription>
                This is how patients will see your profile in the marketplace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!settings.isAvailableOnMarketplace && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>Note:</strong> Your profile is currently hidden from the marketplace.
                    Enable it in the Settings tab to start receiving bookings.
                  </p>
                </div>
              )}

              <div className="max-w-2xl">
                <PhysioCard physiotherapist={previewData} />
              </div>

              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold mb-2">Preview Actions</h3>
                <div className="flex gap-4">
                  <Button
                    variant="outline"
                    onClick={() => window.open(`/find-a-physio/${settings.userId}`, "_blank")}
                  >
                    View Full Profile Page
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open("/find-a-physio", "_blank")}
                  >
                    View in Marketplace
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tips Card */}
          <Card>
            <CardHeader>
              <CardTitle>Tips to Get More Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Complete your bio with your expertise and approach to treatment</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Add multiple specializations to appear in more searches</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Get verified to rank higher and build trust with patients</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Offer both online and in-person sessions to reach more patients</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Keep your pricing competitive for your location and experience</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span>Encourage satisfied patients to leave reviews</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
