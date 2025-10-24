/**
 * Centralized SEO Configuration for RehabifyHealth
 * 
 * This file contains all SEO-related constants, metadata templates,
 * and configuration used across the application.
 */

export const SITE_CONFIG = {
  name: 'RehabifyHealth',
  title: 'Rehabify Health - AI-Powered Physical Therapy & Rehabilitation Platform',
  description: 'Revolutionary healthcare platform connecting patients with licensed physiotherapists. AI-powered exercise monitoring, telehealth appointments, treatment plans, and comprehensive rehabilitation services.',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://rehabifyhealth.com',
  ogImage: '/opengraph-image', // Auto-generated from opengraph-image.tsx
  twitterHandle: '@RehabifyHealth',
  keywords: [
    // Primary keywords - Brand variations
    'rehabify',
    'rehabify health',
    'rehabifyhealth',
    'Rehabify Health',
    'RehabifyHealth',
    
    // Service keywords
    'physiotherapy platform',
    'physical therapy online',
    
    // Service keywords
    'online physiotherapy',
    'telehealth physical therapy',
    'virtual rehabilitation',
    'remote physiotherapy',
    'AI exercise monitoring',
    
    // Healthcare keywords
    'rehabilitation services',
    'physical therapy appointments',
    'licensed physiotherapists',
    'treatment plans',
    'exercise therapy',
    
    // Location-based (adjust based on your target regions)
    'physiotherapy Nigeria',
    'online therapy Africa',
    
    // Long-tail keywords
    'book physiotherapist online',
    'virtual physical therapy sessions',
    'AI powered rehabilitation',
    'online exercise monitoring',
    'telehealth physiotherapy platform',
  ],
  
  // Structured data
  organization: {
    name: 'RehabifyHealth',
    legalName: 'Rehabify Health Ltd',
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://rehabifyhealth.com',
    logo: '/logos/MainRehabify.svg',
    foundingDate: '2024',
    contactPoint: {
      telephone: '+234-XXX-XXX-XXXX', // Update with real number
      contactType: 'Customer Service',
      email: 'support@rehabifyhealth.com',
      availableLanguage: ['English'],
    },
    sameAs: [
      'https://www.facebook.com/rehabifyhealth',
      'https://twitter.com/rehabifyhealth',
      'https://www.linkedin.com/company/rehabifyhealth',
      'https://www.instagram.com/rehabifyhealth',
    ],
  },
  
  // Medical service schema
  medicalService: {
    '@type': 'MedicalBusiness',
    name: 'RehabifyHealth',
    description: 'Digital physiotherapy and rehabilitation platform',
    medicalSpecialty: [
      'Physical Therapy',
      'Rehabilitation Medicine',
      'Sports Medicine',
      'Orthopedics',
    ],
    availableService: [
      {
        '@type': 'MedicalTherapy',
        name: 'Virtual Physiotherapy Consultations',
        description: 'Online video consultations with licensed physiotherapists',
      },
      {
        '@type': 'MedicalTherapy',
        name: 'AI-Powered Exercise Monitoring',
        description: 'Real-time exercise tracking and form correction',
      },
      {
        '@type': 'MedicalTherapy',
        name: 'Personalized Treatment Plans',
        description: 'Custom rehabilitation programs tailored to patient needs',
      },
    ],
  },
};

/**
 * Default metadata for all pages
 */
export const DEFAULT_METADATA = {
  metadataBase: new URL(SITE_CONFIG.url),
  title: {
    default: SITE_CONFIG.title,
    template: `%s | ${SITE_CONFIG.name}`,
  },
  description: SITE_CONFIG.description,
  keywords: SITE_CONFIG.keywords,
  authors: [{ name: SITE_CONFIG.name }],
  creator: SITE_CONFIG.name,
  publisher: SITE_CONFIG.name,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_CONFIG.url,
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
    siteName: SITE_CONFIG.name,
    images: [
      {
        url: SITE_CONFIG.ogImage,
        width: 1200,
        height: 630,
        alt: `${SITE_CONFIG.name} - AI-Powered Physical Therapy Platform`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
    creator: SITE_CONFIG.twitterHandle,
    images: [SITE_CONFIG.ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION,
    // Add other verification codes as needed
  },
  alternates: {
    canonical: SITE_CONFIG.url,
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

/**
 * Page-specific metadata templates
 */
export const PAGE_METADATA = {
  home: {
    title: 'Rehabify Health - AI-Powered Physical Therapy & Telehealth Platform',
    description: 'Connect with licensed physiotherapists online. AI-powered exercise monitoring, personalized treatment plans, and convenient telehealth appointments. Start your rehabilitation journey today.',
    keywords: ['rehabify', 'online physiotherapy', 'telehealth', 'virtual physical therapy', 'AI exercise monitoring'],
  },
  
  signIn: {
    title: 'Sign In to Rehabify Health',
    description: 'Access your RehabifyHealth account. Book appointments, track your progress, and connect with your physiotherapist.',
    robots: { index: false, follow: true }, // Don't index auth pages
  },
  
  signUp: {
    title: 'Join Rehabify Health - Start Your Rehabilitation Journey',
    description: 'Create your RehabifyHealth account. Get access to licensed physiotherapists, personalized treatment plans, and AI-powered exercise monitoring.',
    robots: { index: true, follow: true }, // Index signup for conversion
  },
  
  dashboard: {
    title: 'Dashboard',
    description: 'Manage your appointments, view treatment plans, and track your rehabilitation progress.',
    robots: { index: false, follow: false }, // Don't index private pages
  },
  
  blog: {
    title: 'Rehabilitation & Physical Therapy Blog',
    description: 'Expert insights on physiotherapy, rehabilitation techniques, injury prevention, and wellness tips from licensed healthcare professionals.',
    keywords: ['physiotherapy tips', 'rehabilitation advice', 'injury prevention', 'physical therapy blog'],
  },
  
  // Physiotherapist pages
  findPhysiotherapist: {
    title: 'Find Licensed Physiotherapists Online',
    description: 'Browse and book appointments with verified, licensed physiotherapists. Filter by specialty, availability, and ratings.',
    keywords: ['find physiotherapist', 'book physical therapy', 'licensed therapists'],
  },
  
  // Patient journey pages
  howItWorks: {
    title: 'How Rehabify Health Works - Simple Steps to Better Health',
    description: 'Learn how RehabifyHealth connects you with physiotherapists, monitors your exercises, and tracks your recovery progress.',
  },
  
  pricing: {
    title: 'Affordable Physical Therapy Pricing & Plans',
    description: 'Transparent pricing for online physiotherapy sessions. Pay per session or choose subscription plans. No hidden fees.',
  },
  
  about: {
    title: 'About Rehabify Health - Revolutionizing Physical Therapy',
    description: 'Learn about our mission to make quality physiotherapy accessible through technology, AI, and telehealth.',
  },
  
  contact: {
    title: 'Contact Rehabify Health - Get Support',
    description: 'Get in touch with our support team. We\'re here to help with questions about appointments, treatments, and platform features.',
  },
};

/**
 * Robots.txt rules
 */
export const ROBOTS_CONFIG = {
  rules: [
    {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/dashboard/',
        '/_next/',
        '/admin/',
        '/*?*', // Query parameters on public pages
      ],
    },
    {
      userAgent: 'GPTBot', // Block AI crawlers if desired
      disallow: '/',
    },
    {
      userAgent: 'ChatGPT-User',
      disallow: '/',
    },
  ],
  sitemap: `${SITE_CONFIG.url}/sitemap.xml`,
  host: SITE_CONFIG.url,
};

/**
 * Sitemap configuration
 */
export const SITEMAP_CONFIG = {
  // Static routes that should be in sitemap
  staticRoutes: [
    {
      url: '',
      changeFrequency: 'daily' as const,
      priority: 1.0,
    },
    {
      url: '/sign-up',
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    },
    {
      url: '/blog',
      changeFrequency: 'daily' as const,
      priority: 0.7,
    },
    // Add more public routes as needed
  ],
  
  // Routes to exclude from sitemap
  excludedRoutes: [
    '/dashboard',
    '/admin',
    '/api',
    '/sign-in',
    '/_next',
    '/onboarding',
    '/role-selection',
    '/clinic-invite',
    '/patient-invite',
    '/video-call',
  ],
};
