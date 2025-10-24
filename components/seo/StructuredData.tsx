/**
 * Structured Data (JSON-LD) Components for SEO
 * 
 * These components inject schema.org structured data into pages,
 * helping search engines understand your content better and
 * enabling rich results in search (rich snippets, knowledge panels, etc.)
 */

import { SITE_CONFIG } from '@/lib/seo/config';

/**
 * Organization Schema - Use on homepage
 * Shows your business info in search results
 */
export function OrganizationSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalBusiness',
    name: SITE_CONFIG.organization.name,
    legalName: SITE_CONFIG.organization.legalName,
    url: SITE_CONFIG.organization.url,
    logo: `${SITE_CONFIG.url}${SITE_CONFIG.organization.logo}`,
    foundingDate: SITE_CONFIG.organization.foundingDate,
    description: SITE_CONFIG.description,
    
    // Contact information
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: SITE_CONFIG.organization.contactPoint.telephone,
      contactType: SITE_CONFIG.organization.contactPoint.contactType,
      email: SITE_CONFIG.organization.contactPoint.email,
      availableLanguage: SITE_CONFIG.organization.contactPoint.availableLanguage,
    },
    
    // Social media profiles
    sameAs: SITE_CONFIG.organization.sameAs,
    
    // Medical specialties
    medicalSpecialty: SITE_CONFIG.medicalService.medicalSpecialty,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * WebSite Schema - Use on homepage
 * Enables search box in Google results
 */
export function WebSiteSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_CONFIG.name,
    url: SITE_CONFIG.url,
    description: SITE_CONFIG.description,
    
    // Enables site search in Google results
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_CONFIG.url}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * MedicalWebPage Schema - Use on healthcare content pages
 */
export function MedicalWebPageSchema({
  title,
  description,
  url,
  datePublished,
  dateModified,
  image,
}: {
  title: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  image?: string;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: title,
    description,
    url,
    ...(datePublished && { datePublished }),
    ...(dateModified && { dateModified }),
    ...(image && { image }),
    
    // Medical content aspects
    audience: {
      '@type': 'PeopleAudience',
      suggestedMinAge: 18,
    },
    
    // Publisher information
    publisher: {
      '@type': 'Organization',
      name: SITE_CONFIG.organization.name,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_CONFIG.url}${SITE_CONFIG.organization.logo}`,
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Service Schema - Use on service/feature pages
 */
export function ServiceSchema({
  name,
  description,
  provider = SITE_CONFIG.organization.name,
  serviceType = 'Medical',
}: {
  name: string;
  description: string;
  provider?: string;
  serviceType?: string;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    description,
    provider: {
      '@type': 'Organization',
      name: provider,
    },
    serviceType,
    areaServed: {
      '@type': 'Country',
      name: 'Nigeria', // Adjust based on your coverage
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * FAQ Schema - Use on FAQ pages
 * Shows expandable FAQs directly in Google search results
 */
export function FAQSchema({
  faqs,
}: {
  faqs: Array<{ question: string; answer: string }>;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Article Schema - Use on blog posts
 */
export function ArticleSchema({
  headline,
  description,
  image,
  datePublished,
  dateModified,
  author,
  url,
}: {
  headline: string;
  description: string;
  image: string;
  datePublished: string;
  dateModified?: string;
  author: string;
  url: string;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    image,
    datePublished,
    dateModified: dateModified || datePublished,
    author: {
      '@type': 'Person',
      name: author,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_CONFIG.organization.name,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_CONFIG.url}${SITE_CONFIG.organization.logo}`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Breadcrumb Schema - Use on deep pages
 * Shows breadcrumb trail in search results
 */
export function BreadcrumbSchema({
  items,
}: {
  items: Array<{ name: string; url: string }>;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * Video Schema - Use on pages with video content
 */
export function VideoSchema({
  name,
  description,
  thumbnailUrl,
  uploadDate,
  duration,
  contentUrl,
}: {
  name: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string;
  duration?: string; // ISO 8601 format (e.g., "PT1M30S" for 1 min 30 sec)
  contentUrl?: string;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name,
    description,
    thumbnailUrl,
    uploadDate,
    ...(duration && { duration }),
    ...(contentUrl && { contentUrl }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

/**
 * HowTo Schema - Use on instructional/tutorial pages
 * Shows step-by-step instructions in search results
 */
export function HowToSchema({
  name,
  description,
  image,
  steps,
}: {
  name: string;
  description: string;
  image?: string;
  steps: Array<{ name: string; text: string; image?: string }>;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    ...(image && { image }),
    step: steps.map((step) => ({
      '@type': 'HowToStep',
      name: step.name,
      text: step.text,
      ...(step.image && { image: step.image }),
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
