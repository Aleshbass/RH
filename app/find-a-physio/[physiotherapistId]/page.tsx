"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
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
  CreditCard,
  Globe,
  Heart,
  Sparkles,
  ChevronRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import BookingWidget from "@/components/marketplace/BookingWidget";
import ReviewsList from "@/components/marketplace/ReviewsList";
import RatingBreakdown from "@/components/marketplace/RatingBreakdown";

// ── Helper: Capitalize location ──
function capitalizeLocation(loc: string): string {
  if (!loc) return "";
  return loc
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ── Star rating display ──
function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= Math.round(rating)
            ? "fill-amber-400 text-amber-400"
            : "fill-gray-200 text-gray-200"
            }`}
        />
      ))}
    </div>
  );
}

export default function PhysiotherapistProfilePage() {
  const params = useParams();
  const router = useRouter();
  const physiotherapistId = params.physiotherapistId as Id<"users">;
  const [activeSection, setActiveSection] = useState<"about" | "reviews">("about");

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
      incrementView({ physiotherapistId }).catch(console.error);
    }
  }, [physiotherapistId, profile?.profileId, incrementView]);

  // Loading
  if (profile === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50/50">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#005b57]" />
          </div>
          <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-amber-400 animate-pulse" />
        </div>
        <p className="text-gray-500 mt-4 font-medium">Loading profile...</p>
      </div>
    );
  }

  // Not found
  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50/50">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md text-center border border-gray-100">
          <div className="w-20 h-20 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-5">
            <Users className="h-10 w-10 text-gray-300" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Profile Not Found</h2>
          <p className="text-gray-500 mb-6">
            This physiotherapist may have deactivated their profile or the link may be incorrect.
          </p>
          <Button
            onClick={() => router.push("/find-a-physio")}
            className="bg-[#005b57] hover:bg-[#004a46] text-white rounded-xl px-6 h-11"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* ─── Hero Header ─── */}
      <div className="relative">
        {/* Background */}
        <div className="h-64 sm:h-72 md:h-80 bg-gradient-to-br from-[#002e2c] via-[#005b57] to-[#007a73] relative overflow-hidden">
          {/* Decorative */}
          <div className="absolute inset-0">
            <div className="absolute -right-20 -top-20 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute -left-16 bottom-0 w-60 h-60 bg-teal-400/10 rounded-full blur-3xl" />
            <div className="absolute right-1/4 top-1/3 w-2 h-2 bg-white/20 rounded-full" />
            <div className="absolute left-1/3 top-2/3 w-1.5 h-1.5 bg-white/15 rounded-full" />
          </div>

          {/* Back button - positioned below the fixed header */}
          <div className="absolute top-20 sm:top-24 left-4 sm:left-6 z-20">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-white/80 hover:text-white bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium transition-all hover:bg-white/20 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
          </div>
        </div>

        {/* Profile card overlay */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative -mt-24 sm:-mt-28 bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-gray-100 p-5 sm:p-8"
          >
            <div className="flex flex-col sm:flex-row gap-5 sm:gap-6">
              {/* Avatar */}
              <div className="relative flex-shrink-0 mx-auto sm:mx-0">
                <div className="relative">
                  {profile.imageUrl ? (
                    <Image
                      src={profile.imageUrl}
                      alt={profile.fullName}
                      width={120}
                      height={120}
                      className="rounded-2xl object-cover border-4 border-white shadow-lg w-24 h-24 sm:w-28 sm:h-28"
                    />
                  ) : (
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-[#005b57] to-[#007a73] flex items-center justify-center text-white text-3xl font-bold border-4 border-white shadow-lg">
                      {profile.fullName
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .toUpperCase()}
                    </div>
                  )}
                  {profile.isVerified && (
                    <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-xl p-1.5 border-2 border-white shadow-sm">
                      <BadgeCheck className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                      {profile.fullName}
                    </h1>
                    {profile.credentials.length > 0 && (
                      <p className="text-sm sm:text-base text-gray-500 font-medium mt-0.5">
                        {profile.credentials.join(" · ")}
                      </p>
                    )}

                    {/* Meta badges */}
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                      {profile.location && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                          <MapPin className="h-3 w-3" />
                          {capitalizeLocation(profile.location)}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                        <Award className="h-3 w-3" />
                        {profile.yearsOfExperience} years exp.
                      </span>
                      {(profile.offersOnlineSessions || profile.offersInPersonSessions) && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                          {profile.offersOnlineSessions && profile.offersInPersonSessions ? (
                            <><Globe className="h-3 w-3" /> Hybrid</>
                          ) : profile.offersOnlineSessions ? (
                            <><Video className="h-3 w-3" /> Online</>
                          ) : (
                            <><Users className="h-3 w-3" /> In-Person</>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rating badge */}
                  <div className="flex flex-col items-center sm:items-end flex-shrink-0">
                    {profile.averageRating > 0 ? (
                      <div className="bg-amber-50 border border-amber-100 px-4 py-2.5 rounded-xl text-center">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-2xl font-bold text-gray-900">
                            {profile.averageRating.toFixed(1)}
                          </span>
                          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                        </div>
                        <p className="text-[10px] text-gray-500 font-medium">
                          {profile.reviewCount} verified review{profile.reviewCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-gray-100 px-4 py-2.5 rounded-xl text-center">
                        <p className="text-xs text-gray-400 font-medium">New on Rehabify</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Specializations */}
                {profile.specializations.length > 0 && (
                  <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 mt-4">
                    {profile.specializations.map((spec: string, i: number) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="bg-[#e6f0ef] text-[#005b57] hover:bg-[#d0e5e3] text-xs font-medium px-2.5 py-0.5"
                      >
                        {spec}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Section tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {[
                { key: "about", label: "About" },
                { key: "reviews", label: `Reviews (${profile.reviewCount})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveSection(tab.key as any)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${activeSection === tab.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* About Section */}
            {activeSection === "about" && (
              <motion.div
                key="about"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* Bio */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">About Me</h3>
                  {profile.bio ? (
                    <p className="text-gray-600 leading-relaxed whitespace-pre-line text-[15px]">
                      {profile.bio}
                    </p>
                  ) : (
                    <div className="bg-gray-50 rounded-xl p-5 text-center">
                      <p className="text-gray-400 italic text-sm">
                        This physiotherapist hasn&apos;t added a bio yet.
                      </p>
                    </div>
                  )}
                </div>

                {/* Quick info grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                    <Award className="h-5 w-5 text-[#005b57] mx-auto mb-1.5" />
                    <p className="text-xl font-bold text-gray-900">{profile.yearsOfExperience}</p>
                    <p className="text-xs text-gray-500">Years Exp.</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                    <Star className="h-5 w-5 text-amber-400 mx-auto mb-1.5" />
                    <p className="text-xl font-bold text-gray-900">
                      {profile.averageRating > 0 ? profile.averageRating.toFixed(1) : "—"}
                    </p>
                    <p className="text-xs text-gray-500">Rating</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center col-span-2 sm:col-span-1">
                    <MessageSquare className="h-5 w-5 text-blue-500 mx-auto mb-1.5" />
                    <p className="text-xl font-bold text-gray-900">{profile.reviewCount}</p>
                    <p className="text-xs text-gray-500">Reviews</p>
                  </div>
                </div>

                {/* Languages */}
                {profile.languagesSpoken && profile.languagesSpoken.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-3">Languages Spoken</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.languagesSpoken.map((lang: string, idx: number) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg text-gray-700 text-sm font-medium border border-gray-100"
                        >
                          <Globe className="w-3 h-3 text-gray-400" />
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Session types */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Session Availability</h3>
                  <div className="space-y-2.5">
                    {profile.offersInPersonSessions && (
                      <div className="flex items-center gap-3 p-3 bg-teal-50/50 rounded-xl border border-teal-100/50">
                        <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                          <Users className="h-4 w-4 text-[#005b57]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">In-Person Sessions</p>
                          <p className="text-xs text-gray-500">
                            {profile.location
                              ? `Available in ${capitalizeLocation(profile.location)}`
                              : "Location to be confirmed"}
                          </p>
                        </div>
                        <Check className="h-4 w-4 text-[#005b57] ml-auto" />
                      </div>
                    )}
                    {profile.offersOnlineSessions && (
                      <div className="flex items-center gap-3 p-3 bg-purple-50/50 rounded-xl border border-purple-100/50">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                          <Video className="h-4 w-4 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">Online Sessions</p>
                          <p className="text-xs text-gray-500">Via secure video call</p>
                        </div>
                        <Check className="h-4 w-4 text-purple-600 ml-auto" />
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Reviews Section */}
            {activeSection === "reviews" && (
              <motion.div
                key="reviews"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {ratingBreakdown && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <RatingBreakdown breakdown={ratingBreakdown} />
                  </div>
                )}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <ReviewsList physiotherapistId={physiotherapistId} />
                </div>
              </motion.div>
            )}


          </div>

          {/* Right Column - Booking Widget + Trust Badges */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              {/* Booking widget */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <BookingWidget profile={profile} />
              </div>


              {/* Trust badges */}
              <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                  Why choose Rehabify
                </p>
                {profile.isVerified && (
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <ShieldCheck className="w-5 h-5 text-[#005b57] flex-shrink-0" />
                    <span>Verified Professional</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <BadgeCheck className="w-5 h-5 text-[#005b57] flex-shrink-0" />
                  <span>Licensed Physiotherapist</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <CreditCard className="w-5 h-5 text-[#005b57] flex-shrink-0" />
                  <span>Secure Payments</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Heart className="w-5 h-5 text-[#005b57] flex-shrink-0" />
                  <span>Patient Satisfaction Guarantee</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
