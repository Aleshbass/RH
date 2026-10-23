"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Star, BadgeCheck, Video, Users } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export default function PhysioCard({ physiotherapist, priceHint }: PhysioCardProps) {
  const trackView = useMutation(api.analytics.trackProfileView);

  const handleProfileClick = () => {
    trackView({ physiotherapistId: physiotherapist.id as any });
  };

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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all overflow-hidden group flex flex-col h-full">
      <div className="p-4 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          {/* Profile Image */}
          <div className="relative flex-shrink-0">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={fullName}
                width={64}
                height={64}
                className="rounded-full object-cover border border-gray-100"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-brand/5 flex items-center justify-center text-brand text-lg font-bold border border-brand/10">
                {fullName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </div>
            )}
            {isVerified && (
              <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-0.5 border-2 border-white">
                <BadgeCheck className="h-3 w-3 text-white" />
              </div>
            )}
          </div>

          {/* Name & Credentials */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-gray-900 truncate pr-1" title={fullName}>
                  {fullName}
                </h3>
                <p className="text-xs text-gray-500 truncate" title={credentials.join(" • ")}>
                  {credentials.length > 0 ? credentials.join(" • ") : "Physiotherapist"}
                </p>
              </div>

              {/* Rating */}
              {averageRating > 0 && (
                <div className="flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  <span className="text-xs font-bold text-gray-900">{averageRating.toFixed(1)}</span>
                </div>
              )}
            </div>

            {/* Location & Experience */}
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
              {location && (
                <div className="flex items-center gap-0.5 min-w-0">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{location}</span>
                </div>
              )}
              <span className="flex-shrink-0">• {yearsOfExperience}y exp.</span>
            </div>
          </div>
        </div>

        {/* Specializations */}
        <div className="mb-3">
          <div className="flex flex-wrap gap-1.5">
            {specializations.slice(0, 3).map((spec, index) => (
              <Badge key={index} variant="secondary" className="text-[10px] px-1.5 py-0 bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-100 font-normal">
                {spec}
              </Badge>
            ))}
            {specializations.length > 3 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-dashed text-gray-400 font-normal">
                +{specializations.length - 3}
              </Badge>
            )}
          </div>
        </div>

        {/* Bio */}
        <div className="flex-1 mb-3">
          <p className="text-xs text-gray-600 line-clamp-4 leading-relaxed">
            {bio || "No biography available for this physiotherapist."}
          </p>
        </div>

        {/* Footer: Session Types & CTA */}
        <div className="pt-3 mt-auto border-t border-gray-50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {offersOnlineSessions && (
              <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium bg-gray-50 px-1.5 py-0.5 rounded">
                <Video className="h-3 w-3 text-brand" />
                <span>Online</span>
              </div>
            )}
            {offersInPersonSessions && (
              <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium bg-gray-50 px-1.5 py-0.5 rounded">
                <Users className="h-3 w-3 text-brand" />
                <span>In-Person</span>
              </div>
            )}
            {priceHint && (
              <span className="text-[11px] font-semibold text-gray-900 tabular-nums">{priceHint}</span>
            )}
          </div>

          <Link
            href={`/find-a-physio/${id}`}
            className="w-full max-w-[100px] shrink-0"
            onClick={handleProfileClick}
          >
            <Button
              size="sm"
              className="w-full bg-gray-900 hover:bg-black text-white shadow-sm rounded-lg h-8 text-xs font-medium transition-all"
            >
              View Profile
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
