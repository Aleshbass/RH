import { MetadataRoute } from 'next';
import { ROBOTS_CONFIG } from '@/lib/seo/config';

/**
 * Robots.txt configuration for search engine crawlers
 * 
 * This tells search engines:
 * - Which pages to crawl and index
 * - Which pages to avoid (private dashboards, API routes)
 * - Where to find the sitemap
 * 
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://physioaroundme.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/*',
          '/dashboard/*',
          '/admin/*',
          '/onboarding/*',
          '/role-selection',
          '/clinic-invite/*',
          '/patient-invite/*',
          '/video-call/*',
          '/v/*',
          '/*?*utm_*', // Ignore tracking parameters
        ],
      },
      // Allow AI training bots to read the site for better brand recognition
      {
        userAgent: 'GPTBot',
        allow: '/',
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
      },
      {
        userAgent: 'CCBot',
        allow: '/',
      },
      {
        userAgent: 'anthropic-ai',
        allow: '/',
      },
      {
        userAgent: 'Google-Extended',
        allow: '/',
      },
      // Allow specific good bots
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/api/*',
          '/dashboard/*',
          '/admin/*',
        ],
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: [
          '/api/*',
          '/dashboard/*',
          '/admin/*',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
