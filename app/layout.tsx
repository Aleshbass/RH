import type { Metadata } from "next";
import localFont from 'next/font/local';
import "./globals.css";
import { ConsentProvider } from "@/components/consent/ConsentProvider";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ClerkProvider } from "@clerk/nextjs";
import SyncUserWithConvex from "@/components/auth/SyncUserWithConvex";
import PlatformStatusGate from "@/components/platform/PlatformStatusGate";
import Providers from "./providers";
import '@fortawesome/fontawesome-svg-core/styles.css';
import ConditionalLayout from '@/components/layout/ConditionalLayout';
import PwaRegister from '@/components/pwa/PwaRegister';

const calSans = localFont({
  src: '../public/fonts/CalSans-SemiBold.woff2',
  variable: '--font-cal',
  display: 'swap',
});

const matter = localFont({
  src: [
    {
      path: '../public/fonts/Matter-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/Matter-Light.woff2',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../public/fonts/Matter-SemiBold.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-matter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://physioaroundme.com'),
  title: {
    default: "Physio Around Me by Rehabify Health — Book a Verified Physiotherapist in Nigeria",
    template: "%s | Physio Around Me by Rehabify Health",
  },
  description: "Find and book licensed, verified physiotherapists in Nigeria. Online video sessions or in-person care at home or in clinic, with secure payment by Paystack.",
  keywords: [
    'physio around me',
    'physioaroundme',
    'physioaroundme.com',
    'rehabify health',
    'rehabifyhealth',
    'Rehabify',
    'Rehabify Health',
    'RehabifyHealth',
    'physiotherapy platform',
    'physical therapy online',
    'online physiotherapy',
    'telehealth physical therapy',
    'virtual rehabilitation',
    'physiotherapist near me',
    'home physiotherapy',
    'rehabilitation services Nigeria',
    'book physiotherapist online',
    'virtual physical therapy sessions',
    'treatment plans',
    'licensed physiotherapists',
  ],
  authors: [{ name: 'Rehabify Health' }],
  creator: 'Rehabify Health',
  publisher: 'Rehabify Health',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/logos/favicon/favicon.ico', sizes: '48x48' },
      { url: '/logos/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    // Opaque square: iOS fills transparent corners with black
    apple: { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
    shortcut: '/logos/favicon/favicon.ico',
  },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    // No og:url here: like a canonical, it would be inherited by every page (pages set their own)
    title: 'Physio Around Me by Rehabify Health — Book a Verified Physiotherapist in Nigeria',
    description: 'Find and book licensed, verified physiotherapists in Nigeria. Online video sessions or in-person care at home or in clinic.',
    siteName: 'Physio Around Me by Rehabify Health',
    images: [
      {
        url: '/opengraph-image', // Next.js auto-generates from opengraph-image.tsx
        width: 1200,
        height: 630,
        alt: 'Physio Around Me by Rehabify Health - Expert Physical Therapy & Rehabilitation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Physio Around Me by Rehabify Health — Book a Verified Physiotherapist in Nigeria',
    description: 'Find and book licensed, verified physiotherapists in Nigeria. Online video sessions or in-person care at home or in clinic.',
    images: ['/opengraph-image'],
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
  },
  // No canonical here: a layout canonical is inherited by every page and pointed them all at
  // the homepage. Pages set their own (lib/seo/utils pageMetadata; homepage in HomePageSEO).
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-title': 'Rehabify',
    // "black", not "black-translucent": translucent draws pages under the iPhone status bar
    'apple-mobile-web-app-status-bar-style': 'black',
  },
};

import { headers } from "next/headers";
import { clinicThemeNoFlashScript } from "@/lib/clinic-theme";
import { domTranslationGuardScript } from "@/lib/domTranslationGuard";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let isSubdomainHost = false;
  let isClinicPortal = false;
  try {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") || "";
    isClinicPortal =
      pathname.startsWith("/dashboard/clinic") ||
      pathname.startsWith("/dashboard/physiotherapist") ||
      pathname.startsWith("/dashboard/admin") ||
      pathname.startsWith("/dashboard/patient");
    const host = (headersList.get("host") || "").toLowerCase();
    const isSubdomainHeader = headersList.get("x-is-b2b-subdomain") === "true";
    isSubdomainHost =
      isSubdomainHeader ||
      host.startsWith("docs.") ||
      host.startsWith("api.") ||
      host.startsWith("partners.");
  } catch {
    // Fallback for static generation
  }

  return (
    // The clinic and physiotherapist portals set the `dark` class on <html> before hydration.
    <html lang="en" suppressHydrationWarning>
      {isClinicPortal && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: clinicThemeNoFlashScript }} />
          <script dangerouslySetInnerHTML={{ __html: domTranslationGuardScript }} />
        </head>
      )}
      <body
        className={`${calSans.variable} ${matter.variable} font-sans antialiased`}
      >
        {/* Top loader is rendered in app/providers.tsx (client component) */}
        <PwaRegister />
        {/* Clerk's own default after signing in/up is "/": anything it finishes without our
            redirect goes to the dashboard, or to /role-selection, which opens the right onboarding */}
        <ClerkProvider signInFallbackRedirectUrl="/dashboard" signUpFallbackRedirectUrl="/role-selection">
          <Providers>
            <ConvexClientProvider>
              <SyncUserWithConvex />
              <PlatformStatusGate />

              {/* Cookie banner and settings; also loads analytics (Umami) only once allowed */}
              <ConsentProvider>
                <ConditionalLayout isSubdomainHost={isSubdomainHost}>
                  {children}
                </ConditionalLayout>
              </ConsentProvider>
            </ConvexClientProvider>
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
