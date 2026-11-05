'use client';

/**
 * One physiotherapist on the Physio Register list. The whole card opens their public profile,
 * which is where people verify them (licence, regulator, colleague verifications, reviews).
 */

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Award, MapPin, ShieldCheck, Star, Users } from '@/components/icons';
import { displayFont } from '@/components/learn/shared';
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

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function PhysioProfileCard({ data }: { data: PhysioProfileCardData }) {
  const profileUrl = data.slug ? `/physio-register/${data.slug}` : null;
  const place = data.practiceName || data.practiceAddress;
  const facts = [
    data.yearsOfExperience > 0 ? `${data.yearsOfExperience} yr${data.yearsOfExperience === 1 ? '' : 's'} experience` : null,
    data.languages.length > 0 ? data.languages.slice(0, 2).join(', ') : null,
  ].filter(Boolean);

  const body = (
    <>
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          {data.profilePhotoUrl ? (
            <Image
              src={data.profilePhotoUrl}
              alt={data.fullName}
              width={56}
              height={56}
              unoptimized
              className="h-14 w-14 rounded-2xl object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rh-ink text-lg font-semibold text-rh-lime">
              {initials(data.fullName)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={cn('truncate text-lg leading-snug tracking-tight text-rh-ink', displayFont)}>{data.fullName}</h3>
          <p className="mt-0.5 truncate text-xs text-rh-ink/55">
            {data.regulatoryBody} · <span className="font-medium text-rh-ink/75">{data.licenseNumber}</span>
          </p>
        </div>
        {data.ranking ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rh-cream px-2.5 py-1 text-xs font-semibold text-rh-ink">
            <Award className="h-3.5 w-3.5" /> #{data.ranking}
          </span>
        ) : null}
      </div>

      {data.isRehabifyApproved && (
        <span className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-rh-ink px-3 py-1 text-xs font-semibold text-white">
          <ShieldCheck className="h-3.5 w-3.5 text-rh-lime" /> Verified by Rehabify
        </span>
      )}

      {data.specialties.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {data.specialties.slice(0, 3).map((specialty) => (
            <span key={specialty} className="rounded-full bg-rh-ink/[0.05] px-2.5 py-1 text-xs font-medium text-rh-ink/75">
              {specialty}
            </span>
          ))}
          {data.specialties.length > 3 && <span className="px-1 py-1 text-xs text-rh-ink/45">+{data.specialties.length - 3}</span>}
        </div>
      )}

      {place && (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-rh-ink/65">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-rh-ink/40" />
          <span className="truncate">{place}</span>
        </p>
      )}
      {facts.length > 0 && <p className="mt-1.5 text-xs text-rh-ink/50">{facts.join(' · ')}</p>}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-rh-ink/[0.06] pt-4">
        <span className="flex items-center gap-3 text-xs text-rh-ink/55">
          {data.peerVerificationCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {data.peerVerificationCount} colleague{data.peerVerificationCount === 1 ? '' : 's'}
            </span>
          )}
          {data.averagePatientRating > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-amber-500" /> {data.averagePatientRating.toFixed(1)} ({data.patientReviewCount})
            </span>
          )}
        </span>
        {profileUrl && (
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-rh-ink">
            View &amp; verify <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </>
  );

  const cardClass =
    'group flex h-full min-w-0 flex-col rounded-[1.75rem] bg-white p-6 shadow-soft transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink';

  return profileUrl ? (
    <Link href={profileUrl} className={cn(cardClass, 'hover:-translate-y-1 hover:shadow-lift motion-reduce:hover:translate-y-0')}>
      {body}
    </Link>
  ) : (
    <div className={cardClass}>{body}</div>
  );
}
