import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { AI_AND_SEARCH_CRAWLERS, PRIVATE_PATHS, SITE_CONFIG } from '@/lib/seo/config';

/**
 * robots.txt — the only robots source (there is no public/robots.txt; next-sitemap is not run).
 *
 * Public pages are open to every crawler, including the search and AI-answer crawlers named in
 * lib/seo/config.ts (ChatGPT, Claude, Perplexity, Gemini, Copilot/Bing, Apple, Meta...), so they
 * can read and cite the site. A crawler follows only the most specific group that names it, so
 * the named group repeats the same private-area rules as `*`.
 *
 * Each subdomain gets its own answer (middleware lets /robots.txt through on every host): the
 * partner portal, admin console and API have nothing to index; the docs are public.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = ((await headers()).get('host') ?? '').toLowerCase();

  if (/^(partners|admin|api)\./.test(host)) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  if (host.startsWith('docs.')) {
    return { rules: { userAgent: '*', allow: '/' } };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: AI_AND_SEARCH_CRAWLERS,
        allow: ['/', '/llms.txt', '/llms-full.txt'],
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_CONFIG.url}/sitemap.xml`,
    host: SITE_CONFIG.url,
  };
}
