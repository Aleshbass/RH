"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Star, BadgeCheck, Video, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    hourlyRate: number;
    initialConsultRate: number;
    averageRating: number;
    reviewCount: number;
    isVerified: boolean;
    offersOnlineSessions: boolean;
    offersInPersonSessions: boolean;
  };
}

export default function PhysioCard({ physiotherapist }: PhysioCardProps) {
  const {
    id,
    fullName,
    imageUrl,
    credentials,
    bio,
    specializations,
    yearsOfExperience,
    location,
    hourlyRate,
    initialConsultRate,
    averageRating,
    reviewCount,
    isVerified,
    offersOnlineSessions,
    offersInPersonSessions,
  } = physiotherapist;

  return (
    <div className="bg-white rounded-xl shadow-md border-2 border-transparent hover:border-pink-200 hover:shadow-xl transition-all overflow-hidden group">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          {/* Profile Image */}
          <div className="relative flex-shrink-0">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={fullName}
                width={80}
                height={80}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#005b57] flex items-center justify-center text-white text-2xl font-bold">
                {fullName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </div>
            )}
            {isVerified && (
              <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full p-1">
                <BadgeCheck className="h-4 w-4 text-white" />
              </div>
            )}
          </div>

          {/* Name & Credentials */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  {fullName}
                  {isVerified && (
                    <span className="text-blue-500" title="Verified Physiotherapist">
                      <BadgeCheck className="h-5 w-5" />
                    </span>
                  )}
                </h3>
                {credentials.length > 0 && (
                  <p className="text-sm text-gray-600 mt-1">
                    {credentials.join(" • ")}
                  </p>
                )}
              </div>
              
              {/* Rating */}
              {averageRating > 0 && (
                <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-semibold text-gray-900">
                    {averageRating.toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-600">
                    ({reviewCount})
                  </span>
                </div>
              )}
            </div>

            {/* Location & Experience */}
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              {location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>{location}</span>
                </div>
              )}
              <span>{yearsOfExperience} years exp.</span>
            </div>
          </div>
        </div>

        {/* Specializations */}
        {specializations.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {specializations.slice(0, 3).map((spec, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {spec}
              </Badge>
            ))}
            {specializations.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{specializations.length - 3} more
              </Badge>
            )}
          </div>
        )}

        {/* Bio */}
        {bio && (
          <p className="mt-4 text-sm text-gray-600 line-clamp-2">
            {bio}
          </p>
        )}

        {/* Session Types */}
        <div className="mt-4 flex items-center gap-4 text-sm">
          {offersOnlineSessions && (
            <div className="flex items-center gap-1 text-gray-600">
              <Video className="h-4 w-4" />
              <span>Online</span>
            </div>
          )}
          {offersInPersonSessions && (
            <div className="flex items-center gap-1 text-gray-600">
              <Users className="h-4 w-4" />
              <span>In-Person</span>
            </div>
          )}
        </div>

        {/* Pricing & CTA */}
        <div className="mt-6 pt-4 border-t-2 border-gradient-to-r from-pink-100 to-purple-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Starting from</p>
            <p className="text-2xl font-bold bg-gradient-to-r from-[#005b57] to-pink-600 bg-clip-text text-transparent">
              ₦{(initialConsultRate || hourlyRate).toLocaleString()}
              <span className="text-sm font-normal text-gray-600">/session</span>
            </p>
          </div>

          <Link href={`/find-a-physio/${id}`}>
            <Button className="bg-gradient-to-r from-[#005b57] to-pink-600 hover:from-[#00443e] hover:to-pink-700 text-white shadow-lg group-hover:shadow-xl transition-all">
              View Profile
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
