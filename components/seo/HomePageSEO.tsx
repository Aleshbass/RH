/**
 * Homepage SEO: canonical link + one JSON-LD graph (organisation, website, FAQ).
 *
 * The homepage is a client component, so it cannot export `metadata`; React 19 hoists the
 * <link rel="canonical"> below into <head>. The root layout deliberately sets no canonical
 * (a layout canonical is inherited by every page).
 */

import { SITE_CONFIG } from '@/lib/seo/config';
import { JsonLd, faqPageNode, organizationNode, websiteNode } from './StructuredData';

/**
 * The questions and answers shown in the homepage FAQ section (components/landing/FAQ.tsx).
 * Keep word-for-word in sync with `faqData` there — structured data must match the page.
 */
const HOMEPAGE_FAQS = [
  {
    question: 'How quickly can I get an appointment?',
    answer: 'Most patients get matched and booked within 24 hours. Urgent cases often same-day.',
  },
  {
    question: 'Do you work with my doctor?',
    answer:
      "Yes! If you're referred by a doctor, we send them progress updates with your permission. You can also share your session notes and recovery data.",
  },
  {
    question: 'What if I need to cancel?',
    answer:
      'Cancel or reschedule up to 6 hours before your session with no penalty. Less than 6 hours = one-time warning, repeat cancellations may forfeit package discounts.',
  },
  {
    question: 'How do packages work?',
    answer: 'Book 4, 6, or 8 sessions together and save. Pay upfront, and lock in your schedule.',
  },
  {
    question: 'Can I switch physiotherapists?',
    answer: "Absolutely. If it's not the right fit after your first session, we'll rematch you at no extra cost.",
  },
  {
    question: 'Do you accept HMO coverage?',
    answer: 'Currently, we do not accept HMO coverage. We are actively working on bringing this to you soon.',
  },
] as const;

export function HomePageSEO() {
  return (
    <>
      <link rel="canonical" href={SITE_CONFIG.url} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            organizationNode(),
            websiteNode(),
            {
              '@type': 'WebPage',
              '@id': `${SITE_CONFIG.url}/#webpage`,
              url: SITE_CONFIG.url,
              name: SITE_CONFIG.title,
              description: SITE_CONFIG.description,
              isPartOf: { '@id': `${SITE_CONFIG.url}/#website` },
              about: { '@id': `${SITE_CONFIG.url}/#organization` },
              inLanguage: 'en-NG',
            },
            { ...faqPageNode(HOMEPAGE_FAQS), '@id': `${SITE_CONFIG.url}/#faq` },
          ],
        }}
      />
    </>
  );
}
