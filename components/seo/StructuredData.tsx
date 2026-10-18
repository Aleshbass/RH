/**
 * Structured Data (JSON-LD) Components for SEO
 *
 * These inject schema.org structured data so search engines and AI assistants can tell what
 * Rehabify Health is, what it offers and who the physiotherapists on it are.
 *
 * Rules: only mark up what the page visibly shows, and only state facts from lib/seo/config.ts.
 */

import { SITE_CONFIG } from '@/lib/seo/config';

type JsonLdData = Record<string, unknown>;

/**
 * Renders one JSON-LD block. `<` is escaped so text from user content (bios, names) can never
 * close the script tag.
 */
export function JsonLd({ data }: { data: JsonLdData }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

export const ORGANIZATION_ID = `${SITE_CONFIG.url}/#organization`;
export const WEBSITE_ID = `${SITE_CONFIG.url}/#website`;

/** The company as a schema.org MedicalOrganization (no street address is published). */
export function organizationNode(): JsonLdData {
  const org = SITE_CONFIG.organization;
  return {
    '@type': 'MedicalOrganization',
    '@id': ORGANIZATION_ID,
    name: org.name,
    alternateName: org.alternateNames,
    url: SITE_CONFIG.url,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_CONFIG.url}${org.logo}`,
      width: 512,
      height: 512,
    },
    description: org.description,
    email: org.supportEmail,
    telephone: org.supportPhone,
    areaServed: { '@type': 'Country', name: org.country },
    medicalSpecialty: ['https://schema.org/Physiotherapy', 'https://schema.org/Musculoskeletal'],
    knowsAbout: [
      'Physiotherapy',
      'Online physiotherapy (telehealth)',
      'Home physiotherapy visits',
      'Back and neck pain',
      'Knee and joint pain',
      'Sports injury rehabilitation',
      'Post-surgery rehabilitation',
      'Stroke rehabilitation',
      'Arthritis',
      'Musculoskeletal rehabilitation',
    ],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        telephone: org.supportPhone,
        email: org.supportEmail,
        areaServed: 'NG',
        availableLanguage: ['English'],
        hoursAvailable: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '08:00',
          closes: '18:00',
        },
      },
      {
        '@type': 'ContactPoint',
        contactType: 'partnerships',
        email: org.partnersEmail,
        areaServed: 'NG',
      },
    ],
    ...(org.sameAs.length > 0 && { sameAs: org.sameAs }),
  };
}

/** The website. No SearchAction: the find-a-physio search does not read a URL query. */
export function websiteNode(): JsonLdData {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE_CONFIG.url,
    name: 'Physio Around Me',
    alternateName: ['Rehabify Health', 'physioaroundme.com'],
    description: SITE_CONFIG.description,
    inLanguage: 'en-NG',
    publisher: { '@id': ORGANIZATION_ID },
  };
}

/**
 * Organization Schema - Use on homepage
 */
export function OrganizationSchema() {
  return <JsonLd data={{ '@context': 'https://schema.org', ...organizationNode() }} />;
}

/**
 * WebSite Schema - Use on homepage
 */
export function WebSiteSchema() {
  return <JsonLd data={{ '@context': 'https://schema.org', ...websiteNode() }} />;
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
    isPartOf: { '@id': WEBSITE_ID },
    publisher: {
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: SITE_CONFIG.organization.name,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_CONFIG.url}${SITE_CONFIG.organization.logo}`,
      },
    },
  };

  return <JsonLd data={schema} />;
}

/**
 * Service Schema - Use on service/feature pages
 */
export function ServiceSchema({
  name,
  description,
  serviceType = 'Physiotherapy',
}: {
  name: string;
  description: string;
  serviceType?: string;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    description,
    serviceType,
    provider: { '@id': ORGANIZATION_ID, '@type': 'MedicalOrganization', name: SITE_CONFIG.organization.name },
    areaServed: { '@type': 'Country', name: SITE_CONFIG.organization.country },
  };

  return <JsonLd data={schema} />;
}

/** FAQPage node for questions and answers that are shown on the page. */
export function faqPageNode(faqs: ReadonlyArray<{ question: string; answer: string }>): JsonLdData {
  return {
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
}

/**
 * FAQ Schema - Use on pages that show these questions and answers
 */
export function FAQSchema({
  faqs,
}: {
  faqs: ReadonlyArray<{ question: string; answer: string }>;
}) {
  return <JsonLd data={{ '@context': 'https://schema.org', ...faqPageNode(faqs) }} />;
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
      '@id': ORGANIZATION_ID,
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

  return <JsonLd data={schema} />;
}

/** BreadcrumbList node. */
export function breadcrumbNode(items: ReadonlyArray<{ name: string; url: string }>): JsonLdData {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Breadcrumb Schema - Use on deep pages
 */
export function BreadcrumbSchema({
  items,
}: {
  items: Array<{ name: string; url: string }>;
}) {
  return <JsonLd data={{ '@context': 'https://schema.org', ...breadcrumbNode(items) }} />;
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

  return <JsonLd data={schema} />;
}

/**
 * HowTo Schema - Use on instructional/tutorial pages
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

  return <JsonLd data={schema} />;
}
