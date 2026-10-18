import type { MetadataRoute } from 'next';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex-client';
import { SITE_CONFIG } from '@/lib/seo/config';

/**
 * sitemap.xml — the only sitemap source (next-sitemap is no longer run after the build).
 *
 * Lists public, indexable pages plus the profile of every physiotherapist patients can book.
 * Auth pages, redirect stubs (/blog, /faqs, /support, /forum, /physio-register/verify) and
 * private areas are left out. Check a route still renders real content before adding it.
 * docs.* and partners.* are separate hosts and are not listed here.
 *
 * Regenerated at most hourly; if Convex is unreachable the static pages are still served.
 */
export const revalidate = 3600;

const CONVEX_TIMEOUT_MS = 8000;

type StaticRoute = {
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;
  priority: number;
  lastModified?: string;
};

const STATIC_ROUTES: StaticRoute[] = [
  { path: '', changeFrequency: 'daily', priority: 1.0 },
  { path: '/find-a-physio', changeFrequency: 'daily', priority: 0.9 },
  { path: '/start-treatment', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/meet-joy', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/payment', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/platform/patients', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/platform/family', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/platform/physiotherapists', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/platform/clinics', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/partnerships', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/physio-register', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/learn', changeFrequency: 'weekly', priority: 0.7 }, // MSK Specialist Program (cohort dates change per intake)
  // Policies
  { path: '/terms-and-conditions', changeFrequency: 'yearly', priority: 0.3, lastModified: '2025-10-02' },
  { path: '/privacy-policy', changeFrequency: 'yearly', priority: 0.3, lastModified: '2025-10-02' },
  { path: '/payment-policy', changeFrequency: 'yearly', priority: 0.3, lastModified: '2025-10-02' },
  { path: '/consultation-booking-policy', changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-09-22' },
  { path: '/payout-policy', changeFrequency: 'yearly', priority: 0.3 },
];

/** User ids of every physiotherapist whose public profile can be booked (same rule as /find-a-physio). */
async function bookablePhysioIds(): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = getConvexClient().query(api.marketplace.search.searchPhysiotherapists, {
      limit: 5000,
      offset: 0,
    });
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CONVEX_TIMEOUT_MS);
    });
    const result = await Promise.race([query, timeout]);
    return result ? result.results.map((physio: { id: string }) => physio.id) : [];
  } catch {
    // Convex unreachable or not configured (e.g. local build): static pages only
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_CONFIG.url;

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${baseUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
    ...(route.lastModified && { lastModified: new Date(route.lastModified) }),
  }));

  const physioEntries: MetadataRoute.Sitemap = (await bookablePhysioIds()).map((id) => ({
    url: `${baseUrl}/find-a-physio/${id}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticEntries, ...physioEntries];
}
