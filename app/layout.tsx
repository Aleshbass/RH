import type { Metadata } from "next";
import localFont from 'next/font/local';
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ClerkProvider } from "@clerk/nextjs";
import SyncUserWithConvex from "@/components/auth/SyncUserWithConvex";
import AutoOnboardClinicOwner from "@/components/auth/AutoOnboardClinicOwner";
import Providers from "./providers";
import '@fortawesome/fontawesome-svg-core/styles.css';
import NextTopLoader from 'nextjs-toploader';
import ConditionalLayout from '@/components/layout/ConditionalLayout';
import ReactCookiebot from 'react-cookiebot';

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
  title: "Rehabify Health",
  description: "Revolutionizing physical therapy with AI-powered exercise monitoring",
  icons: {
    icon: '/logos/favicon/favicon.ico',
    apple: '/logos/favicon/apple-touch-icon.png',
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
        <NextTopLoader
          color="#00cd0f" // Highlighter Green
          initialPosition={0.08}
          crawlSpeed={200}
          height={3}
          crawl={true}
          showSpinner={true}
          easing="ease"
          speed={200}
          shadow="0 0 10px #00cd0f, 0 0 5px #00cd0f"
        />
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
        
        {/* Cookie Consent Management */}
        <ReactCookiebot 
          domainGroupId={cookiebotGroupId}
          blockingMode="auto"
          level="strict"
          culture="en"
          framework="TCFv2.2"
          onLoad={() => {
            if (typeof window !== 'undefined') {
              // Simple runtime signal that Cookiebot initialized
              console.info('Cookiebot loaded', { groupId: cookiebotGroupId, hasCookiebot: !!window.Cookiebot })
            }
          }}
          onAccept={() => console.info('Cookie consent accepted')}
          onDecline={() => console.info('Cookie consent declined')}
        />
      </body>
    </html>
  );
}
