'use client';

import React from 'react';
import Link from 'next/link';
import {
  Award, MapPin, GraduationCap, Globe, Star, Users, ShieldCheck, ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PhysioProfileCardData {
  id: string;
  fullName: string;
  licenseNumber: string;
  regulatoryBody: string;
  licenseCountry: string;
  licenseExpiryDate: string;
  specialties: string[];
  languages: string[];
  bio?: string;
  yearsOfExperience: number;
  practiceName?: string;
  practiceAddress?: string;
  profilePhotoUrl?: string | null;
  slug?: string;
  peerVerificationCount: number;
  patientReviewCount: number;
  averagePatientRating: number;
  ranking?: number;
  rankingScore: number;
  isRehabifyApproved?: boolean;
}

export default function PhysioProfileCard({ data }: { data: PhysioProfileCardData }) {
  const profileUrl = data.slug ? `/physio-register/${data.slug}` : '#';

  return (
    <Link
      href={profileUrl}
      className="group block bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl hover:border-teal-200/60 transition-all duration-300"
    >
      {/* Top accent bar */}
      <div className="h-1.5 bg-gradient-to-r from-[#005b57] via-teal-500 to-emerald-400" />

      <div className="p-5">
        {/* Header: Photo + Name + Ranking */}
        <div className="flex items-start gap-4 mb-4">
          {/* Profile Photo */}
          <div className="relative shrink-0">
            {data.profilePhotoUrl ? (
              <img
                src={data.profilePhotoUrl}
                alt={data.fullName}
                className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md ring-2 ring-teal-100 group-hover:ring-teal-300 transition-all"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center border-2 border-white shadow-md ring-2 ring-teal-100">
                <span className="text-lg font-bold text-[#005b57]">
                  {data.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            {data.isRehabifyApproved && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center border-2 border-white">
                <ShieldCheck className="w-3 h-3 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-[#002e2c] group-hover:text-[#005b57] transition-colors truncate">
              {data.fullName}
            </h3>
            <p className="text-xs text-gray-500 font-medium">
              {data.regulatoryBody} • {data.licenseNumber}
            </p>
          </div>

          {/* Ranking badge */}
          {data.ranking && (
            <div className="shrink-0 flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200">
              <Award className="w-3.5 h-3.5" />
              <span className="text-xs font-bold">#{data.ranking}</span>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
          {data.peerVerificationCount > 0 && (
            <div className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-teal-600" />
              <span><strong className="text-gray-700">{data.peerVerificationCount}</strong> verified</span>
            </div>
          )}
          {data.averagePatientRating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span><strong className="text-gray-700">{data.averagePatientRating.toFixed(1)}</strong> ({data.patientReviewCount})</span>
            </div>
          )}
          {data.yearsOfExperience > 0 && (
            <div className="flex items-center gap-1 text-gray-500">
              <span><strong className="text-gray-700">{data.yearsOfExperience}</strong>yr exp</span>
            </div>
          )}
        </div>

        {/* Specialties */}
        {data.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {data.specialties.slice(0, 3).map((spec) => (
              <span
                key={spec}
                className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full text-[10px] font-medium border border-teal-100"
              >
                {spec}
              </span>
            ))}
            {data.specialties.length > 3 && (
              <span className="text-[10px] text-gray-400 px-1">
                +{data.specialties.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Location */}
        {(data.practiceAddress || data.practiceName) && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
            <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span className="truncate">{data.practiceName || data.practiceAddress}</span>
          </div>
        )}

        {/* Bio preview */}
        {data.bio && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">
            {data.bio}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-50">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Globe className="w-3 h-3" />
            {data.languages.slice(0, 2).join(', ')}
          </div>
          <span className="text-xs font-semibold text-[#005b57] group-hover:text-teal-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            View Profile <ArrowUpRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
