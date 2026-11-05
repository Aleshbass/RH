'use client';

/**
 * One physiotherapist on the Physio Register list: a large photo first (that's what people
 * recognise), then name, licence and what they treat. The whole card opens their public profile,
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

export function initialsOf(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Regulators are acronyms ("Mrtb" is stored as typed): show short ones in capitals. */
export function regulatorLabel(body: string) {
  const value = body.trim();
  return value.length > 0 && value.length <= 6 ? value.toUpperCase() : value;
}

export default function PhysioProfileCard({ data }: { data: PhysioProfileCardData }) {
  const profileUrl = data.slug ? `/physio-register/${data.slug}` : null;
  const place = data.practiceName || data.practiceAddress;
  const signals = [
    data.yearsOfExperience > 0 ? `${data.yearsOfExperience} yr${data.yearsOfExperience === 1 ? '' : 's'} experience` : null,
    data.languages.length > 0 ? data.languages.slice(0, 2).join(', ') : null,
  ].filter(Boolean);

  const body = (
    <>
      {/* Photo: big, faces kept in frame */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-rh-ink">
        {data.profilePhotoUrl ? (
          <Image
            src={data.profilePhotoUrl}
            alt={data.fullName}
            fill
            unoptimized
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
            className="object-cover object-[50%_25%] transition duration-500 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
          />
        ) : (
          <span className={cn('absolute inset-0 flex items-center justify-center text-6xl text-rh-lime', displayFont)}>
            {initialsOf(data.fullName)}
          </span>
        )}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {data.isRehabifyApproved ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-rh-ink shadow-soft">
              <ShieldCheck className="h-3.5 w-3.5 text-[#00cd0f]" /> Verified by Rehabify
            </span>
          ) : (
            <span />
          )}
          {data.ranking ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rh-ink/85 px-2.5 py-1.5 text-xs font-semibold text-white">
              <Award className="h-3.5 w-3.5 text-rh-lime" /> #{data.ranking}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className={cn('truncate text-xl leading-snug tracking-tight text-rh-ink', displayFont)}>{data.fullName}</h3>
        <p className="mt-1 truncate text-sm text-rh-ink/55">
          {regulatorLabel(data.regulatoryBody)} licence <span className="font-medium text-rh-ink/80">{data.licenseNumber}</span>
        </p>

        {data.specialties.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {data.specialties.slice(0, 3).map((specialty) => (
              <span key={specialty} className="rounded-full bg-rh-cream px-3 py-1 text-xs font-medium text-rh-ink/80">
                {specialty}
              </span>
            ))}
            {data.specialties.length > 3 && (
              <span className="rounded-full px-1.5 py-1 text-xs font-medium text-rh-ink/45">+{data.specialties.length - 3} more</span>
            )}
          </div>
        )}

        {(place || signals.length > 0) && (
          <div className="mt-4 space-y-1">
            {place && (
              <p className="flex items-center gap-1.5 text-sm text-rh-ink/70">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-rh-ink/40" />
                <span className="truncate">{place}</span>
              </p>
            )}
            {signals.length > 0 && <p className="text-xs text-rh-ink/50">{signals.join(' · ')}</p>}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="flex min-w-0 items-center gap-3 text-xs text-rh-ink/55">
            {data.peerVerificationCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {data.peerVerificationCount} colleague{data.peerVerificationCount === 1 ? '' : 's'}
              </span>
            )}
            {data.averagePatientRating > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-amber-500" /> {data.averagePatientRating.toFixed(1)}
              </span>
            )}
          </span>
          {profileUrl && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rh-ink px-4 py-2 text-xs font-semibold text-white transition group-hover:bg-black">
              View &amp; verify <ArrowUpRight className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </>
  );

  const cardClass =
    'group flex h-full min-w-0 flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-soft transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink';

  return profileUrl ? (
    <Link href={profileUrl} className={cn(cardClass, 'hover:-translate-y-1 hover:shadow-lift motion-reduce:hover:translate-y-0')}>
      {body}
    </Link>
  ) : (
    <div className={cardClass}>{body}</div>
  );
}
