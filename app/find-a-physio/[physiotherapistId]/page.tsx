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
  MessageSquare,
  ShieldCheck,
  Activity,
  CreditCard
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
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Cover Image & Header */}
      <div className="bg-white shadow-sm">
        {/* Cover Image */}
        <div className="h-48 md:h-64 bg-gradient-to-r from-[#005b57] to-[#007f7a] relative">
          <div className="absolute inset-0 bg-black/10" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative -mt-20 sm:-mt-24 pb-6 border-b border-gray-100">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              {/* Profile Image */}
              <div className="relative flex-shrink-0 mx-auto md:mx-0">
                <div className="relative">
                  {profile.imageUrl ? (
                    <Image
                      src={profile.imageUrl}
                      alt={profile.fullName}
                      width={160}
                      height={160}
                      className="rounded-full object-cover border-[6px] border-white shadow-lg w-32 h-32 sm:w-40 sm:h-40"
                    />
                  ) : (
                    <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-[#005b57] flex items-center justify-center text-white text-4xl font-bold border-[6px] border-white shadow-lg">
                      {profile.fullName
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .toUpperCase()}
                    </div>
                  )}
                  {profile.isVerified && (
                    <div className="absolute bottom-2 right-2 bg-blue-500 rounded-full p-1.5 border-2 border-white shadow-sm" title="Verified Physiotherapist">
                      <BadgeCheck className="h-5 w-5 text-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Profile Info */}
              <div className="flex-1 text-center md:text-left pt-2 md:pt-24">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-1">
                      {profile.fullName}
                    </h1>
                    {profile.credentials.length > 0 && (
                      <p className="text-lg text-gray-600 font-medium">
                        {profile.credentials.join(" • ")}
                      </p>
                    )}

                    {/* Key Info Badges */}
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-4 text-sm">
                      {profile.location && (
                        <div className="flex items-center gap-1.5 text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{profile.location}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                        <Award className="h-3.5 w-3.5" />
                        <span>{profile.yearsOfExperience} years exp.</span>
                      </div>
                      {(profile.offersOnlineSessions || profile.offersInPersonSessions) && (
                        <div className="flex items-center gap-1.5 text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                          {profile.offersOnlineSessions ? <Video className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                          <span>
                            {profile.offersOnlineSessions && profile.offersInPersonSessions
                              ? "Hybrid Available"
                              : profile.offersOnlineSessions
                                ? "Online Only"
                                : "In-Person Only"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rating Badge */}
                  {profile.averageRating > 0 && (
                    <div className="flex flex-col items-center md:items-end bg-amber-50 px-4 py-2 rounded-xl border border-amber-100">
                      <div className="flex items-center gap-1.5">
                        <span className="text-2xl font-bold text-gray-900">{profile.averageRating.toFixed(1)}</span>
                        <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                      </div>
                      <span className="text-xs text-gray-600 font-medium">{profile.reviewCount} verified reviews</span>
                    </div>
                  )}
                </div>

                {/* Specializations */}
                {profile.specializations.length > 0 && (
                  <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-6">
                    {profile.specializations.map((spec: string, index: number) => (
                      <Badge key={index} variant="secondary" className="bg-[#e6f0ef] text-[#005b57] hover:bg-[#d0e5e3]">
                        {spec}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Breadcrumb */}
          <div className="md:hidden py-4">
            <Button
              variant="ghost"
              onClick={() => router.push("/find-a-physio")}
              className="text-gray-600 hover:text-[#005b57] pl-0"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Search
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="about">About</TabsTrigger>
                <TabsTrigger value="reviews">Reviews ({profile.reviewCount})</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
              </TabsList>

              {/* About Tab */}
              <TabsContent value="about" className="space-y-6 animate-in fade-in-50 duration-300">
                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-xl">About Me</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {profile.bio ? (
                      <p className="text-gray-700 leading-relaxed whitespace-pre-line text-base">
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
                  <Card className="border-none shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-xl">Languages Spoken</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {profile.languagesSpoken.map((lang: string, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-md text-gray-700 text-sm font-medium">
                            <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
                            {lang}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Reviews Tab */}
              <TabsContent value="reviews" className="space-y-6 animate-in fade-in-50 duration-300">
                {ratingBreakdown && (
                  <RatingBreakdown breakdown={ratingBreakdown} />
                )}
                <ReviewsList physiotherapistId={physiotherapistId} />
              </TabsContent>

              {/* Pricing Tab */}
              <TabsContent value="pricing" className="space-y-6 animate-in fade-in-50 duration-300">
                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-xl">Session Rates</CardTitle>
                    <CardDescription>
                      Transparent pricing for all services. All prices are in Nigerian Naira (₦).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {profile.initialConsultRate > 0 && (
                      <div className="flex justify-between items-center p-5 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                            <Activity className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">Initial Consultation</p>
                            <p className="text-sm text-gray-600">Comprehensive assessment & treatment plan</p>
                          </div>
                        </div>
                        <p className="text-xl font-bold text-[#005b57]">
                          ₦{profile.initialConsultRate.toLocaleString()}
                        </p>
                      </div>
                    )}

                    {profile.hourlyRate > 0 && (
                      <div className="flex justify-between items-center p-5 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">Follow-up Session</p>
                            <p className="text-sm text-gray-600">Standard therapy session</p>
                          </div>
                        </div>
                        <p className="text-xl font-bold text-[#005b57]">
                          ₦{profile.hourlyRate.toLocaleString()}
                        </p>
                      </div>
                    )}

                    {profile.packageRates && profile.packageRates.length > 0 && (
                      <>
                        <div className="py-2">
                          <Separator />
                        </div>
                        <div>
                          <h3 className="font-semibold mb-4 text-lg">Package Deals</h3>
                          <div className="grid gap-4">
                            {profile.packageRates.map((pkg: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex justify-between items-center p-5 border rounded-xl hover:border-[#005b57] hover:shadow-sm transition-all bg-white"
                              >
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="border-[#005b57] text-[#005b57]">
                                      {pkg.sessions} Sessions
                                    </Badge>
                                  </div>
                                  {pkg.description && (
                                    <p className="text-sm text-gray-600 mt-1">
                                      {pkg.description}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className="text-xl font-bold text-[#005b57]">
                                    ₦{pkg.price.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    Save ₦{((profile.hourlyRate * pkg.sessions) - pkg.price).toLocaleString()}
                                  </p>
                                </div>
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
            <div className="sticky top-24">
              <BookingWidget profile={profile} />

              {/* Trust Badges */}
              <div className="mt-6 bg-white rounded-xl p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <ShieldCheck className="w-5 h-5 text-[#005b57]" />
                  <span>Verified Professional</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <BadgeCheck className="w-5 h-5 text-[#005b57]" />
                  <span>Licensed Physiotherapist</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <CreditCard className="w-5 h-5 text-[#005b57]" />
                  <span>Secure Payments via Paystack</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
