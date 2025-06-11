import type { Metadata } from "next";
import localFont from 'next/font/local';
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ClerkProvider } from "@clerk/nextjs";
import Header from "@/components/common/Header";
import SyncUserWithConvex from "@/components/auth/SyncUserWithConvex";
import Providers from "./providers";
import '@fortawesome/fontawesome-svg-core/styles.css';
import Footer from '@/components/landing/Footer';
import NextTopLoader from 'nextjs-toploader';

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
              <Header />
              <main className="flex-grow">{children}</main>
              <Footer />
            </ConvexClientProvider>
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
