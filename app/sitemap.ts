import type { MetadataRoute } from 'next';
import { makeFunctionReference } from 'convex/server';
import { getConvexClient } from '@/lib/convex-client';
import { SITE_CONFIG } from '@/lib/seo/config';
import { LEARN_URL } from '@/lib/site-hosts';
import { loadBlogSitemap } from '@/lib/blog/server';

/**
 * sitemap.xml — the only sitemap source (next-sitemap is no longer run after the build).
 *
 * Lists public, indexable pages, the profile of every physiotherapist patients can book, and the
 * published blog (posts, topics, authors; lib/blog/server). Auth pages, redirect stubs (/faqs,
 * /support, /forum, /physio-register/verify) and
 * private areas are left out. Check a route still renders real content before adding it.
 * docs.* and partners.* are separate hosts and are not listed here.
 *
 * Regenerated at most hourly; if Convex is unreachable the static pages are still served.
 */
export const revalidate = 3600;

const CONVEX_TIMEOUT_MS = 8000;

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const searchPhysiotherapistsRef = makeFunctionReference<
  'query',
  { limit: number; offset: number },
  { results: { id: string }[] }
>('marketplace/search:searchPhysiotherapists');

type StaticRoute = {
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;
  priority: number;
  lastModified?: string;
};

const STATIC_ROUTES: StaticRoute[] = [
  { path: '', changeFrequency: 'daily', priority: 1.0 },
  { path: '/find-a-physio', changeFrequency: 'daily', priority: 0.9 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/rehabify-access', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/meet-joy', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/pay-later', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/careers', changeFrequency: 'weekly', priority: 0.5 },
  { path: '/platform/patients', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/platform/family', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/platform/physiotherapists', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/platform/clinics', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/platform/doctors', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/partnerships', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/physio-register', changeFrequency: 'weekly', priority: 0.6 },
  // Rehabify Learn: home, catalogue and the MSK Specialist Program (cohort dates change per intake)
  { path: '/learn', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/learn/courses', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/learn/programs/msk-specialist', changeFrequency: 'weekly', priority: 0.6 },
  // Policies
  { path: '/terms-and-conditions', changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-10-26' },
  { path: '/privacy-policy', changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-10-26' },
  { path: '/payment-policy', changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-11-06' },
  { path: '/consultation-booking-policy', changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-11-06' },
  { path: '/cookie-policy', changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-10-26' },
  { path: '/payout-policy', changeFrequency: 'yearly', priority: 0.3 },
  // Agreements (read-only copies; people sign them in their dashboard)
  { path: '/agreements/network-physiotherapist', changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-10-26' },
  { path: '/agreements/independent-physiotherapist', changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-10-26' },
  { path: '/agreements/clinic', changeFrequency: 'yearly', priority: 0.3, lastModified: '2026-10-26' },
];

/** User ids of every physiotherapist whose public profile can be booked (same rule as /find-a-physio). */
async function bookablePhysioIds(): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = getConvexClient().query(searchPhysiotherapistsRef, {
      limit: 5000,
      offset: 0,
    });
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CONVEX_TIMEOUT_MS);
    });
    const result = await Promise.race([query, timeout]);
    return result ? result.results.map((physio) => physio.id) : [];
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
    // Learn has its own host once NEXT_PUBLIC_LEARN_URL is set
    url: route.path.startsWith('/learn') && LEARN_URL ? `${LEARN_URL}${route.path.slice('/learn'.length) || '/'}` : `${baseUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
    ...(route.lastModified && { lastModified: new Date(route.lastModified) }),
  }));

  const [physioIds, blog] = await Promise.all([bookablePhysioIds(), loadBlogSitemap()]);
  const physioEntries: MetadataRoute.Sitemap = physioIds.map((id) => ({
    url: `${baseUrl}/find-a-physio/${id}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  // The blog index is listed once something is published (until then it says "on the way")
  const blogEntries: MetadataRoute.Sitemap = [];
  if (blog && blog.total > 0) {
    const newest = Math.max(...blog.posts.map((p) => p.updatedAt), 0);
    blogEntries.push({ url: `${baseUrl}/blog`, changeFrequency: 'daily', priority: 0.8, ...(newest ? { lastModified: new Date(newest) } : {}) });
    for (const post of blog.posts) {
      blogEntries.push({
        url: `${baseUrl}/blog/${post.slug}`,
        lastModified: new Date(post.updatedAt),
        changeFrequency: 'monthly',
        priority: 0.7,
        ...(post.image ? { images: [post.image] } : {}),
      });
    }
    for (const c of blog.categories) {
      blogEntries.push({ url: `${baseUrl}/blog/category/${c.slug}`, lastModified: new Date(c.updatedAt), changeFrequency: 'weekly', priority: 0.5 });
    }
    for (const a of blog.authors) {
      blogEntries.push({ url: `${baseUrl}/blog/author/${a.slug}`, lastModified: new Date(a.updatedAt), changeFrequency: 'monthly', priority: 0.4 });
    }
  }

  return [...staticEntries, ...blogEntries, ...physioEntries];
}
