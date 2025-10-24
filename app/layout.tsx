import type { Metadata } from "next";
import localFont from 'next/font/local';
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ClerkProvider } from "@clerk/nextjs";
import SyncUserWithConvex from "@/components/auth/SyncUserWithConvex";
import AutoOnboardClinicOwner from "@/components/auth/AutoOnboardClinicOwner";
import Providers from "./providers";
import '@fortawesome/fontawesome-svg-core/styles.css';
import ConditionalLayout from '@/components/layout/ConditionalLayout';

const pallyRegular = localFont({
  src: '../public/logos/fonts/Pally-Regular.otf',
  variable: '--font-pally-regular',
  weight: '400',
  display: 'swap',
});

const pallyMedium = localFont({
  src: '../public/logos/fonts/Pally-Medium.otf',
  variable: '--font-pally-medium',
  weight: '500',
  display: 'swap',
});

const pallyBold = localFont({
  src: '../public/logos/fonts/Pally-Bold.otf',
  variable: '--font-pally-bold',
  weight: '700',
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
    title: 'Rehabify Health - AI-Powered Physical Therapy Platform',
    description: 'Revolutionary healthcare platform connecting patients with licensed physiotherapists. AI-powered exercise monitoring and telehealth appointments.',
    siteName: 'Rehabify Health',
    images: [
      {
        url: '/opengraph-image', // Next.js auto-generates from opengraph-image.tsx
        width: 1200,
        height: 630,
        alt: 'Rehabify Health - AI-Powered Physical Therapy Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rehabify Health - AI-Powered Physical Therapy Platform',
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
  const cookiebotGroupId = process.env.NEXT_PUBLIC_COOKIEBOT_DOMAIN_GROUP_ID || '00000000-0000-0000-0000-000000000000'
  return (
    <html lang="en">
      <body
        className={`${pallyRegular.variable} ${pallyMedium.variable} ${pallyBold.variable} font-sans antialiased`}
      >
        {/* Top loader is rendered in app/providers.tsx (client component) */}
        <ClerkProvider dynamic>
          <Providers>
            <ConvexClientProvider>
              <SyncUserWithConvex />
              <AutoOnboardClinicOwner />
              <ConditionalLayout>
                {children}
              </ConditionalLayout>
            </ConvexClientProvider>
          </Providers>
        </ClerkProvider>
        
        {/* Paystack Inline Script */}
        <script src="https://js.paystack.co/v1/inline.js" async />
        
        {/* Cookiebot is rendered in app/providers.tsx (client component) */}
      </body>
    </html>
  );
}
