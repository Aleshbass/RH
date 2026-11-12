/**
 * SEO Utility Functions
 *
 * Helper functions for generating SEO-friendly content,
 * metadata, and handling URL optimization.
 */

import type { Metadata } from 'next';
import { SITE_CONFIG } from './config';

export type OgImage = { url: string; width?: number; height?: number; alt?: string };

/** The site-wide 1200x630 link-preview card (app/share-image; see SITE_CONFIG.ogImage). */
export const DEFAULT_OG_IMAGE: OgImage = {
  url: SITE_CONFIG.ogImage,
  width: 1200,
  height: 630,
  alt: SITE_CONFIG.ogImageAlt,
};

/**
 * Metadata for one public page: title, description, its own canonical URL and Open Graph /
 * Twitter cards. Use it in a page's or a pass-through layout's `export const metadata`.
 *
 * `path` is the page's own path ("/pricing"). Every page needs its own canonical: a canonical
 * set in a parent layout is inherited by every child, which tells Google and Bing that those
 * pages are duplicates of the parent.
 *
 * `title` is the short page title; the root layout's template appends the site name.
 * A child `openGraph` replaces the parent's entirely (images included), so the site image
 * (DEFAULT_OG_IMAGE) is set explicitly unless `ogImage` is given.
 */
export function pageMetadata({
  title,
  description,
  path,
  noIndex = false,
  ogImage,
  ogType = 'website',
}: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
  /** A URL (no size known) or a sized image such as physioOgCard() */
  ogImage?: string | OgImage;
  ogType?: 'website' | 'profile' | 'article';
}): Metadata {
  const socialTitle = `${title} | ${SITE_CONFIG.name}`;
  const image: OgImage =
    typeof ogImage === 'string' ? { url: ogImage, alt: title } : ogImage ?? DEFAULT_OG_IMAGE;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: ogType,
      locale: SITE_CONFIG.locale,
      url: path,
      siteName: SITE_CONFIG.name,
      title: socialTitle,
      description,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      // X gets the card file itself; LinkedIn's different picture only applies to og:image
      images: [image.url === DEFAULT_OG_IMAGE.url ? SITE_CONFIG.twitterImage : image.url],
    },
    ...(noIndex && { robots: { index: false, follow: true } }),
  };
}

/**
 * Link preview for a private, per-person link (join links, one-tap sign-in links, trackers).
 * WhatsApp shows og:* to everyone in the chat, so the text must be generic: no names, no
 * condition, no clinic. Never indexed or followed, and no canonical.
 */
export function privateLinkMetadata(args: { title: string; description: string; path: string }): Metadata {
  return {
    ...pageMetadata({ ...args, noIndex: true }),
    alternates: null,
    robots: { index: false, follow: false },
  };
}

/**
 * 1200x630 physiotherapist card from app/api/og/booking (name, focus, photo), for profile and
 * booking links: a raw profile photo is square and has no size, so previews crop or shrink it.
 */
export function physioOgCard(profile: {
  fullName: string;
  specializations?: string[];
  imageUrl?: string | null;
}): OgImage {
  const params = new URLSearchParams({ name: profile.fullName, duration: '60' });
  if (profile.specializations?.[0]) params.set('spec', profile.specializations[0]);
  if (profile.imageUrl) params.set('image', profile.imageUrl);
  return {
    url: `/api/og/booking?${params.toString()}`,
    width: 1200,
    height: 630,
    alt: `Book a session with ${profile.fullName}`,
  };
}

/** Metadata for pages that must stay out of search results (redirect stubs, auth, utilities). */
export const NOINDEX_METADATA: Metadata = {
  robots: { index: false, follow: true },
};

/**
 * Create SEO-friendly URL slugs
 * Converts text to lowercase, removes special chars, replaces spaces with hyphens
 */
export function createSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Generate canonical URL
 * Ensures consistent URL format (removes trailing slashes, query params)
 */
export function getCanonicalUrl(path: string, includeParams = false): string {
  const baseUrl = SITE_CONFIG.url;
  let cleanPath = path.replace(/\/$/, ''); // Remove trailing slash
  
  if (!includeParams) {
    cleanPath = cleanPath.split('?')[0]; // Remove query parameters
  }
  
  return `${baseUrl}${cleanPath}`;
}

/**
 * Truncate text for meta descriptions
 * Google shows ~155-160 characters in search results
 */
export function truncateDescription(text: string, maxLength = 155): string {
  if (text.length <= maxLength) return text;
  
  // Try to break at last sentence or word boundary
  const truncated = text.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastPeriod > maxLength * 0.8) {
    return truncated.substring(0, lastPeriod + 1);
  }
  
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

/**
 * Generate Open Graph image URL
 * For dynamic OG images, you can use services like Vercel OG
 */
export function generateOGImageUrl({
  title,
  description,
}: {
  title: string;
  description?: string;
}): string {
  // Option 1: Use static image
  // return `${SITE_CONFIG.url}/og-image.png`;
  
  // Option 2: Use Vercel OG (dynamic images)
  const params = new URLSearchParams({
    title,
    ...(description && { description }),
  });
  
  return `${SITE_CONFIG.url}/api/og?${params.toString()}`;
}

/**
 * Extract keywords from text content
 * Simple keyword extraction for auto-generating meta keywords
 */
export function extractKeywords(
  text: string,
  maxKeywords = 10
): string[] {
  // Common stop words to filter out
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'been', 'be',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));

  // Count word frequency
  const wordCount = new Map<string, number>();
  words.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  });

  // Sort by frequency and return top keywords
  return Array.from(wordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Validate URL for SEO best practices
 */
export function validateUrlSEO(url: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check length (Google recommends < 75 chars)
  if (url.length > 75) {
    issues.push('URL is too long (> 75 characters)');
    suggestions.push('Shorten URL for better user experience and SEO');
  }

  // Check for special characters
  if (/[^a-z0-9-\/]/.test(url)) {
    issues.push('URL contains special characters');
    suggestions.push('Use only lowercase letters, numbers, and hyphens');
  }

  // Check for underscores
  if (url.includes('_')) {
    issues.push('URL contains underscores');
    suggestions.push('Replace underscores with hyphens');
  }

  // Check for uppercase
  if (/[A-Z]/.test(url)) {
    issues.push('URL contains uppercase letters');
    suggestions.push('Use lowercase for all URLs');
  }

  // Check for trailing slash consistency
  if (url.endsWith('/') && url !== '/') {
    suggestions.push('Consider removing trailing slash for consistency');
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
  };
}

/**
 * Generate breadcrumb data from pathname
 */
export function generateBreadcrumbs(pathname: string): Array<{
  name: string;
  url: string;
}> {
  const paths = pathname.split('/').filter(Boolean);
  const breadcrumbs = [{ name: 'Home', url: SITE_CONFIG.url }];

  let currentPath = '';
  paths.forEach((path, index) => {
    currentPath += `/${path}`;
    const name = path
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
    
    breadcrumbs.push({
      name,
      url: `${SITE_CONFIG.url}${currentPath}`,
    });
  });

  return breadcrumbs;
}

/**
 * Check if content is duplicate/thin
 * Returns quality score (0-100)
 */
export function analyzeContentQuality(content: string): {
  score: number;
  wordCount: number;
  issues: string[];
  recommendations: string[];
} {
  const wordCount = content.trim().split(/\s+/).length;
  const charCount = content.length;
  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  // Check word count (Google prefers 300+ words for most pages)
  if (wordCount < 300) {
    score -= 30;
    issues.push('Content is too short');
    recommendations.push('Add at least 300 words of quality content');
  }

  // Check for keyword stuffing (repetitive words)
  const words = content.toLowerCase().split(/\s+/);
  const wordFreq = new Map<string, number>();
  words.forEach(word => {
    if (word.length > 3) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  });

  const maxFreq = Math.max(...Array.from(wordFreq.values()));
  if (maxFreq > wordCount * 0.05) {
    score -= 20;
    issues.push('Possible keyword stuffing detected');
    recommendations.push('Vary your vocabulary and avoid repetition');
  }

  // Check reading difficulty (simple approximation)
  const avgWordLength = charCount / wordCount;
  if (avgWordLength > 7) {
    score -= 10;
    recommendations.push('Consider using simpler, more accessible language');
  }

  return {
    score: Math.max(0, score),
    wordCount,
    issues,
    recommendations,
  };
}

/**
 * Format date for structured data (ISO 8601)
 */
export function formatDateForSchema(date: Date): string {
  return date.toISOString();
}

/**
 * Clean and optimize title for SEO
 * Ensures optimal length and format
 */
export function optimizeTitle(title: string, includeBrand = true): string {
  let optimized = title.trim();
  
  // Optimal title length is 50-60 characters
  const maxLength = includeBrand ? 50 : 60;
  
  if (optimized.length > maxLength) {
    optimized = optimized.substring(0, maxLength - 3) + '...';
  }
  
  if (includeBrand && !optimized.includes(SITE_CONFIG.name)) {
    const remaining = 60 - optimized.length - 3; // 3 for " | "
    if (remaining >= SITE_CONFIG.name.length) {
      optimized = `${optimized} | ${SITE_CONFIG.name}`;
    }
  }
  
  return optimized;
}
