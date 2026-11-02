import type { Metadata } from 'next';
import { cache } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getConvexClient } from '@/lib/convex-client';
import { pageMetadata, physioOgCard, truncateDescription } from '@/lib/seo/utils';
import {
  PhysioProfileSchema,
  formatPhysioLocation,
  physioProfilePath,
  type PublicPhysioProfile,
} from '@/components/seo/PhysioProfileSchema';

/**
 * Server-side metadata + JSON-LD for a public physiotherapist profile. The page itself is a
 * client component (it loads the profile with useQuery), so this layout only adds the <head>
 * tags and structured data; it renders the page unchanged.
 */

type Props = {
  children: React.ReactNode;
  params: Promise<{ physiotherapistId: string }>;
};

const CONVEX_TIMEOUT_MS = 5000;

/**
 * The public profile, `null` when it does not exist or is not bookable (the page shows
 * "Profile Not Found"), or `undefined` when Convex could not be reached in time.
 * Same query as the page, so only bookable physios get indexable metadata.
 */
const loadProfile = cache(async (id: string): Promise<PublicPhysioProfile | null | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = getConvexClient().query(api.marketplace.search.getPhysiotherapistProfile, {
      physiotherapistId: id as Id<'users'>,
    });
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), CONVEX_TIMEOUT_MS);
    });
    const profile = await Promise.race([query, timeout]);
    if (profile === undefined) return undefined;
    if (!profile) return null;
    return {
      id: profile.id,
      fullName: profile.fullName,
      imageUrl: profile.imageUrl,
      bio: profile.bio,
      specializations: profile.specializations,
      languagesSpoken: profile.languagesSpoken,
      yearsOfExperience: profile.yearsOfExperience,
      location: profile.location,
      averageRating: profile.averageRating,
      reviewCount: profile.reviewCount,
      offersOnlineSessions: profile.offersOnlineSessions,
      offersInPersonSessions: profile.offersInPersonSessions,
    };
  } catch (error) {
    // An id that is not a valid Convex users id is a profile that does not exist
    if (error instanceof Error && /ArgumentValidationError|Validator error/i.test(error.message)) return null;
    return undefined;
  } finally {
    clearTimeout(timer);
  }
});

function describe(profile: PublicPhysioProfile): string {
  const location = formatPhysioLocation(profile.location);
  const sessionTypes = [
    profile.offersOnlineSessions ? 'online video' : null,
    profile.offersInPersonSessions ? 'in-person' : null,
  ].filter(Boolean);

  const parts = [
    `${profile.fullName} is a physiotherapist${location ? ` in ${location}` : ''} on Rehabify Health (Physio Around Me)` +
      (profile.yearsOfExperience > 0 ? ` with ${profile.yearsOfExperience} years' experience.` : '.'),
    profile.specializations.length > 0 ? `Focus: ${profile.specializations.slice(0, 3).join(', ')}.` : null,
    sessionTypes.length > 0 ? `Book ${sessionTypes.join(' or ')} sessions online.` : 'Book a session online.',
  ].filter(Boolean);

  return truncateDescription(parts.join(' '), 160);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { physiotherapistId } = await params;
  const path = physioProfilePath(physiotherapistId);
  const profile = await loadProfile(physiotherapistId);

  if (profile === null) {
    return {
      title: 'Physiotherapist not found',
      alternates: { canonical: path },
      robots: { index: false, follow: true },
    };
  }

  if (!profile) {
    // Convex unavailable: neutral metadata, page still indexable
    return pageMetadata({
      title: 'Physiotherapist profile',
      description: 'View this physiotherapist’s profile and book an online or in-person session on Rehabify Health.',
      path,
    });
  }

  const location = formatPhysioLocation(profile.location);
  return pageMetadata({
    title: `${profile.fullName}, Physiotherapist${location ? ` in ${location}` : ''}`,
    description: describe(profile),
    path,
    ogType: 'profile',
    // 1200x630 card with the photo in it (same as booking links), not the raw square photo
    ogImage: physioOgCard(profile),
  });
}

export default async function PhysiotherapistProfileLayout({ children, params }: Props) {
  const { physiotherapistId } = await params;
  const profile = await loadProfile(physiotherapistId);

  return (
    <>
      {profile && <PhysioProfileSchema profile={profile} />}
      {children}
    </>
  );
}
