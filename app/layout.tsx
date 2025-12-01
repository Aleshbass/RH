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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://rehabifyhealth.com'),
  title: {
    default: "Rehabify Health - AI-Powered Physical Therapy & Rehabilitation Platform",
    template: "%s | Rehabify Health",
  },
  description: "Revolutionary healthcare platform connecting patients with licensed physiotherapists. AI-powered exercise monitoring, telehealth appointments, treatment plans, and comprehensive rehabilitation services in Nigeria and beyond.",
  keywords: [
    'rehabify',
    'rehabify health',
    'rehabifyhealth',
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
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://rehabifyhealth.com',
    title: 'Rehabify Health - Expert Physical Therapy & Rehabilitation',
    description: 'Revolutionary healthcare platform connecting patients with licensed physiotherapists. AI-powered exercise monitoring and telehealth appointments.',
    siteName: 'Rehabify Health',
    images: [
      {
        url: '/opengraph-image', // Next.js auto-generates from opengraph-image.tsx
        width: 1200,
        height: 630,
        alt: 'Rehabify Health - Expert Physical Therapy & Rehabilitation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rehabify Health - Expert Physical Therapy & Rehabilitation',
    description: 'Revolutionary healthcare platform connecting patients with licensed physiotherapists.',
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
    canonical: process.env.NEXT_PUBLIC_APP_URL || 'https://rehabifyhealth.com',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="en">
      <body
        className={`${calSans.variable} ${matter.variable} font-sans antialiased`}
      >
        {/* Top loader is rendered in app/providers.tsx (client component) */}
        <ClerkProvider dynamic>
          <Providers>
            <ConvexClientProvider>
              <SyncUserWithConvex />

              <ConditionalLayout>
                {children}
              </ConditionalLayout>
            </ConvexClientProvider>
          </Providers>
        </ClerkProvider>

        {/* Paystack Inline Script */}
        <script src="https://js.paystack.co/v1/inline.js" async />

        {/* Umami Analytics - Only in production */}
        {process.env.NODE_ENV === 'production' && (
          <Script
            src="https://rehabifyhealth-analytics.vercel.app/script.js"
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        )}


      </body>
    </html>
  );
}
