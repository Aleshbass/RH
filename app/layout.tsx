import type { Metadata } from "next";
import localFont from 'next/font/local';
import Script from 'next/script';
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ClerkProvider } from "@clerk/nextjs";
import SyncUserWithConvex from "@/components/auth/SyncUserWithConvex";
import Providers from "./providers";
import '@fortawesome/fontawesome-svg-core/styles.css';
import ConditionalLayout from '@/components/layout/ConditionalLayout';

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
    default: "Physio Around Me by Rehabify Health - AI-Powered Physical Therapy & Rehabilitation",
    template: "%s | Physio Around Me by Rehabify Health",
  },
  description: "Revolutionary healthcare platform connecting patients with licensed physiotherapists. Find a physio around me. AI-powered exercise monitoring, telehealth appointments, treatment plans, and comprehensive rehabilitation services in Nigeria and beyond.",
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
    'AI exercise monitoring',
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
    icon: '/logos/favicon/favicon.ico',
    apple: '/logos/favicon/apple-touch-icon.png',
    shortcut: '/logos/favicon/favicon.ico',
  },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://physioaroundme.com',
    title: 'Physio Around Me by Rehabify Health - Expert Physical Therapy',
    description: 'Find a physio around me. Revolutionary healthcare platform connecting patients with licensed physiotherapists. AI-powered exercise monitoring and telehealth appointments.',
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
    title: 'Physio Around Me by Rehabify Health - Expert Physical Therapy',
    description: 'Find a physio around me. Revolutionary healthcare platform connecting patients with licensed physiotherapists.',
    creator: '@RehabifyHealth',
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
  alternates: {
    canonical: process.env.NEXT_PUBLIC_APP_URL || 'https://physioaroundme.com',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

import { headers } from "next/headers";
import { clinicThemeNoFlashScript } from "@/lib/clinic-theme";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let isSubdomainHost = false;
  let isClinicPortal = false;
  try {
    const headersList = await headers();
    isClinicPortal = (headersList.get("x-pathname") || "").startsWith("/dashboard/clinic");
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
    // The clinic portal sets the `dark` class on <html> before hydration.
    <html lang="en" suppressHydrationWarning>
      {isClinicPortal && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: clinicThemeNoFlashScript }} />
        </head>
      )}
      <body
        className={`${calSans.variable} ${matter.variable} font-sans antialiased`}
      >
        {/* Top loader is rendered in app/providers.tsx (client component) */}
        <ClerkProvider>
          <Providers>
            <ConvexClientProvider>
              <SyncUserWithConvex />

              <ConditionalLayout isSubdomainHost={isSubdomainHost}>
                {children}
              </ConditionalLayout>
            </ConvexClientProvider>
          </Providers>
        </ClerkProvider>

        {/* Paystack Inline Script */}
        <script src="https://js.paystack.co/v1/inline.js" async />

        {/* Umami Analytics */}
        <Script
          src="https://yoursiteanalytics.vercel.app/script.js"
          data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || "051e7953-f174-41aa-a2b7-96106c6f3d0d"}
          strategy="afterInteractive"
        />


      </body>
    </html>
  );
}
