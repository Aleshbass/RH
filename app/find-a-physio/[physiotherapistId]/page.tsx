"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";
import { 
  Loader2, 
  MapPin, 
  Star, 
  BadgeCheck, 
  Video, 
  Users, 
  Calendar,
  Award,
  Clock,
  ArrowLeft,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import BookingWidget from "@/components/marketplace/BookingWidget";
import ReviewsList from "@/components/marketplace/ReviewsList";
import RatingBreakdown from "@/components/marketplace/RatingBreakdown";

export default function PhysiotherapistProfilePage() {
  const params = useParams();
  const router = useRouter();
  const physiotherapistId = params.physiotherapistId as Id<"users">;
  const [activeTab, setActiveTab] = useState("about");

  // Fetch profile data
  const profile = useQuery(
    api.marketplace.search.getPhysiotherapistProfile,
    { physiotherapistId }
  );

  // Fetch rating breakdown
  const ratingBreakdown = useQuery(
    api.marketplace.reviews.getRatingBreakdown,
    { physiotherapistId }
  );

  // Track profile view (once per session)
  const incrementView = useMutation(api.marketplace.search.incrementProfileView);
  
  useEffect(() => {
    if (!profile) return;
    try {
      const key = `viewed_${physiotherapistId}`;
      const seen = sessionStorage.getItem(key);
      if (!seen) {
        incrementView({ physiotherapistId }).catch(console.error);
        sessionStorage.setItem(key, "1");
      }
    } catch {
      // Fallback without sessionStorage
      incrementView({ physiotherapistId }).catch(console.error);
    }
  }, [physiotherapistId, profile?.profileId]);

  if (profile === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#005b57]" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-gray-600 mb-4">Physiotherapist profile not found</p>
            <Button onClick={() => router.push("/find-a-physio")} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Search
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Button
            variant="ghost"
            onClick={() => router.push("/find-a-physio")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>

          <div className="flex flex-col md:flex-row gap-6">
            {/* Profile Image */}
            <div className="relative flex-shrink-0">
              {profile.imageUrl ? (
                <Image
                  src={profile.imageUrl}
                  alt={profile.fullName}
                  width={160}
                  height={160}
                  className="rounded-full object-cover border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-40 h-40 rounded-full bg-[#005b57] flex items-center justify-center text-white text-4xl font-bold border-4 border-white shadow-lg">
                  {profile.fullName
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()}
                </div>
              )}
              {profile.isVerified && (
                <div className="absolute bottom-2 right-2 bg-blue-500 rounded-full p-2">
                  <BadgeCheck className="h-6 w-6 text-white" />
                </div>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                    {profile.fullName}
                    {profile.isVerified && (
                      <span className="text-blue-500" title="Verified Physiotherapist">
                        <BadgeCheck className="h-6 w-6" />
                      </span>
                    )}
                  </h1>
                  {profile.credentials.length > 0 && (
                    <p className="text-lg text-gray-600 mt-1">
                      {profile.credentials.join(" • ")}
                    </p>
                  )}
                </div>

                {/* Rating */}
                {profile.averageRating > 0 && (
                  <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 rounded-lg">
                    <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
                    <div>
                      <div className="text-2xl font-bold text-gray-900">
                        {profile.averageRating.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-600">
                        {profile.reviewCount} reviews
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Key Info */}
              <div className="flex flex-wrap gap-4 mt-4 text-sm">
                {profile.location && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin className="h-4 w-4" />
                    <span>{profile.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-600">
                  <Award className="h-4 w-4" />
                  <span>{profile.yearsOfExperience} years experience</span>
                </div>
                {profile.offersOnlineSessions && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Video className="h-4 w-4" />
                    <span>Online Sessions</span>
                  </div>
                )}
                {profile.offersInPersonSessions && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Users className="h-4 w-4" />
                    <span>In-Person</span>
                  </div>
                )}
              </div>

              {/* Specializations */}
              {profile.specializations.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {profile.specializations.map((spec: string, index: number) => (
                    <Badge key={index} variant="secondary">
                      {spec}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="about">About</TabsTrigger>
                <TabsTrigger value="reviews">
                  Reviews ({profile.reviewCount})
                </TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
              </TabsList>

              {/* About Tab */}
              <TabsContent value="about" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>About Me</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {profile.bio ? (
                      <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                        {profile.bio}
                      </p>
                    ) : (
                      <p className="text-gray-500 italic">
                        No bio provided yet.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {profile.languagesSpoken && profile.languagesSpoken.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Languages</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {profile.languagesSpoken.map((lang: string, idx: number) => (
                          <Badge key={idx} variant="outline">
                            {lang}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Reviews Tab */}
              <TabsContent value="reviews" className="space-y-6">
                {ratingBreakdown && (
                  <RatingBreakdown breakdown={ratingBreakdown} />
                )}
                <ReviewsList physiotherapistId={physiotherapistId} />
              </TabsContent>

              {/* Pricing Tab */}
              <TabsContent value="pricing" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Session Rates</CardTitle>
                    <CardDescription>
                      All prices are in Nigerian Naira (₦)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {profile.initialConsultRate > 0 && (
                      <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-semibold">Initial Consultation</p>
                          <p className="text-sm text-gray-600">
                            First session assessment
                          </p>
                        </div>
                        <p className="text-2xl font-bold text-[#005b57]">
                          ₦{profile.initialConsultRate.toLocaleString()}
                        </p>
                      </div>
                    )}

                    {profile.hourlyRate > 0 && (
                      <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-semibold">Follow-up Session</p>
                          <p className="text-sm text-gray-600">
                            Subsequent sessions
                          </p>
                        </div>
                        <p className="text-2xl font-bold text-[#005b57]">
                          ₦{profile.hourlyRate.toLocaleString()}
                        </p>
                      </div>
                    )}

                    {profile.packageRates && profile.packageRates.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h3 className="font-semibold mb-3">Package Deals</h3>
                          <div className="space-y-3">
                            {profile.packageRates.map((pkg: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex justify-between items-center p-4 border rounded-lg hover:border-[#005b57] transition-colors"
                              >
                                <div>
                                  <p className="font-semibold">
                                    {pkg.sessions} Sessions
                                  </p>
                                  {pkg.description && (
                                    <p className="text-sm text-gray-600">
                                      {pkg.description}
                                    </p>
                                  )}
                                </div>
                                <p className="text-xl font-bold text-[#005b57]">
                                  ₦{pkg.price.toLocaleString()}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - Booking Widget */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <BookingWidget profile={profile} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
