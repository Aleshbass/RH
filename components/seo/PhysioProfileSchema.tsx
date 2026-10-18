/**
 * JSON-LD for a public physiotherapist profile (/find-a-physio/[physiotherapistId]).
 *
 * Marks up only what the profile page shows: name, photo, bio, specialities, languages,
 * location, years of experience, session types and — when the physio has approved reviews —
 * the star rating and review count. Prices are not shown on the profile page (only on the
 * booking page), so no Offer/price is marked up here.
 */

import { SITE_CONFIG } from '@/lib/seo/config';
import { JsonLd, ORGANIZATION_ID, WEBSITE_ID, breadcrumbNode } from './StructuredData';

export type PublicPhysioProfile = {
  id: string;
  fullName: string;
  imageUrl?: string;
  bio: string;
  specializations: string[];
  languagesSpoken: string[];
  yearsOfExperience: number;
  location?: string;
  averageRating: number;
  reviewCount: number;
  offersOnlineSessions: boolean;
  offersInPersonSessions: boolean;
};

/** "ikeja, lagos" -> "Ikeja, Lagos" (same as the profile page). */
export function formatPhysioLocation(location?: string): string {
  if (!location) return '';
  return location
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

export function physioProfilePath(id: string): string {
  return `/find-a-physio/${id}`;
}

export function PhysioProfileSchema({ profile }: { profile: PublicPhysioProfile }) {
  const pageUrl = `${SITE_CONFIG.url}${physioProfilePath(profile.id)}`;
  const personId = `${pageUrl}#person`;
  const location = formatPhysioLocation(profile.location);
  const hasRating = profile.reviewCount > 0 && profile.averageRating > 0;

  const channels = [
    ...(profile.offersOnlineSessions
      ? [{ '@type': 'ServiceChannel', name: 'Online session via secure video call', serviceUrl: `${SITE_CONFIG.url}/book/${profile.id}` }]
      : []),
    ...(profile.offersInPersonSessions
      ? [{ '@type': 'ServiceChannel', name: location ? `In-person session in ${location}` : 'In-person session', serviceUrl: `${SITE_CONFIG.url}/book/${profile.id}` }]
      : []),
  ];

  const graph = [
    {
      '@type': 'ProfilePage',
      '@id': pageUrl,
      url: pageUrl,
      name: `${profile.fullName}, Physiotherapist`,
      isPartOf: { '@id': WEBSITE_ID },
      mainEntity: { '@id': personId },
      breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
      inLanguage: 'en-NG',
    },
    {
      '@type': 'Person',
      '@id': personId,
      name: profile.fullName,
      jobTitle: 'Physiotherapist',
      url: pageUrl,
      ...(profile.imageUrl && { image: profile.imageUrl }),
      ...(profile.bio && { description: profile.bio }),
      ...(profile.specializations.length > 0 && { knowsAbout: profile.specializations }),
      ...(profile.languagesSpoken.length > 0 && { knowsLanguage: profile.languagesSpoken }),
      ...(location && {
        workLocation: {
          '@type': 'Place',
          address: { '@type': 'PostalAddress', addressLocality: location, addressCountry: 'NG' },
        },
      }),
      hasOccupation: {
        '@type': 'Occupation',
        name: 'Physiotherapist',
        ...(profile.yearsOfExperience > 0 && {
          experienceRequirements: {
            '@type': 'OccupationalExperienceRequirements',
            monthsOfExperience: profile.yearsOfExperience * 12,
          },
        }),
      },
    },
    {
      '@type': 'Service',
      '@id': `${pageUrl}#service`,
      name: `Physiotherapy with ${profile.fullName}`,
      serviceType: 'Physiotherapy',
      provider: { '@id': personId },
      broker: { '@id': ORGANIZATION_ID },
      areaServed: location
        ? { '@type': 'Place', name: `${location}, Nigeria` }
        : { '@type': 'Country', name: 'Nigeria' },
      ...(channels.length > 0 && { availableChannel: channels }),
      ...(hasRating && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: Number(profile.averageRating.toFixed(1)),
          reviewCount: profile.reviewCount,
          bestRating: 5,
          worstRating: 1,
        },
      }),
    },
    {
      ...breadcrumbNode([
        { name: 'Home', url: SITE_CONFIG.url },
        { name: 'Find a physiotherapist', url: `${SITE_CONFIG.url}/find-a-physio` },
        { name: profile.fullName, url: pageUrl },
      ]),
      '@id': `${pageUrl}#breadcrumb`,
    },
  ];

  return <JsonLd data={{ '@context': 'https://schema.org', '@graph': graph }} />;
}
