/**
 * Central SEO / AI-visibility facts for Rehabify Health (physioaroundme.com).
 *
 * Everything here ends up in page metadata, JSON-LD, robots.txt and llms-full.txt — it is what
 * search engines and AI assistants (ChatGPT, Gemini, Claude, Perplexity, Copilot) read about the
 * company. Only state things that are true and visible on the site: no invented stats, awards,
 * partners, phone numbers or social profiles.
 */

const PRODUCTION_ORIGIN = 'https://physioaroundme.com';

/**
 * Public origin used in canonicals and structured data. Reads only NEXT_PUBLIC_APP_URL so the
 * server and browser render the same value (this file is also used by client components);
 * www. is folded into the apex like lib/public-app-url.ts.
 */
function siteUrl(): string {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL || PRODUCTION_ORIGIN);
    if (url.hostname === 'www.physioaroundme.com') url.hostname = 'physioaroundme.com';
    return url.origin;
  } catch {
    return PRODUCTION_ORIGIN;
  }
}

const SITE_URL = siteUrl();

export const SITE_CONFIG = {
  url: SITE_URL,
  /** Site name as used in <title> templates and og:site_name. */
  name: 'Physio Around Me by Rehabify Health',
  title: 'Physio Around Me by Rehabify Health — Book a Verified Physiotherapist in Nigeria',
  description:
    'Find and book licensed, verified physiotherapists in Nigeria. Online video sessions or in-person care at home or in clinic, with secure payment by Paystack.',
  ogImage: '/opengraph-image', // app/opengraph-image.tsx
  locale: 'en_NG',

  organization: {
    name: 'Rehabify Health',
    alternateNames: ['Physio Around Me', 'PhysioAroundMe', 'physioaroundme.com', 'Rehabify', 'RehabifyHealth'],
    // Square raster logo (Google prefers raster, min 112x112)
    logo: '/logos/favicon/android-chrome-512x512.png',
    description:
      'Rehabify Health (physioaroundme.com, also known as Physio Around Me) is a Nigerian physiotherapy platform that connects patients with licensed physiotherapists approved by the Rehabify team, for online video sessions or in-person care at home or in clinic. It also provides practice software for physiotherapy clinics, a referral API for health partners, and the MSK Specialist Program for physiotherapists.',
    // As listed on /about ("Contact grid") and the homepage FAQ
    supportEmail: 'support@physioaroundme.com',
    partnersEmail: 'partners@physioaroundme.com',
    supportPhone: '+234 806 152 5811', // Patient support + Joy on WhatsApp
    whatsappUrl: 'https://wa.me/2348061525811',
    officeHours: 'Mon-Fri 8AM-6PM WAT',
    country: 'Nigeria',
    /**
     * Official social profiles (schema.org sameAs). Empty until the footer links to real
     * profiles — add each URL here at the same time as in components/landing/Footer.tsx.
     */
    sameAs: [] as string[],
  },

  /** Public sub-sites linked from the footer. */
  subSites: {
    docs: 'https://docs.physioaroundme.com',
    partners: 'https://partners.physioaroundme.com',
  },
};

/**
 * Crawlers that power search and AI answers. They are explicitly allowed on public pages
 * (robots.txt), with the same private areas blocked as for everyone else.
 */
export const AI_AND_SEARCH_CRAWLERS = [
  // OpenAI (ChatGPT search, ChatGPT browsing, model training)
  'OAI-SearchBot',
  'ChatGPT-User',
  'GPTBot',
  // Anthropic (Claude)
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Google (Search, Gemini / AI Overviews, other Google fetchers)
  'Googlebot',
  'Google-Extended',
  'GoogleOther',
  // Microsoft (Bing powers Copilot and ChatGPT search results)
  'Bingbot',
  // Apple (Siri / Spotlight / Apple Intelligence)
  'Applebot',
  'Applebot-Extended',
  // DuckDuckGo
  'DuckDuckBot',
  'DuckAssistBot',
  // Meta AI, Amazon (Alexa), Mistral, Common Crawl (used by many models)
  'meta-externalagent',
  'Amazonbot',
  'MistralAI-User',
  'CCBot',
];

/** Private, per-user or transactional areas: never crawled by anyone. */
export const PRIVATE_PATHS = [
  '/api/',
  '/dashboard',
  '/admin',
  '/onboarding',
  '/role-selection',
  '/sso-callback',
  '/clinic-invite/',
  '/patient-invite/',
  '/staff-invite/',
  '/video-call/',
  '/video/',
  '/v/', // patient join links
  '/x/', // PIN-protected exercise programme links
  '/r/', // partner referral links (set an attribution cookie)
  '/go/', // one-tap dashboard links from Joy (carry a sign-in code)
  '/track/', // individual referral tracking pages
  '/invoices',
  '/payment/callback',
  '/marketplace/booking-confirmation',
  '/library', // licensed exercise library
  '/partners/portal',
  '/server',
  '/test',
  '/*?*utm_', // tracking-parameter duplicates
];
