"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { initMonitoring, analytics } from "@/lib/monitoring";
import NextTopLoader from 'nextjs-toploader';
import ReactCookiebot from 'react-cookiebot';

export default function Providers({ children }: { children: ReactNode }) {
  // Create a client with enhanced configuration
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        gcTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          // Don't retry on 4xx errors (client errors)
          if (error && typeof error === 'object' && 'status' in error) {
            const status = (error as { status: number }).status
            if (status >= 400 && status < 500) {
              return false
            }
          }
          return failureCount < 3
        },
      },
      mutations: {
        retry: 1,
      },
    },
  }));

  // Monitoring: initialize and track SPA navigations
  const pathname = usePathname();
  const { user } = useUser();

  // Init monitoring when user context is available
  useEffect(() => {
    // user?.id may be undefined initially; init is idempotent
    initMonitoring(user?.id);
  }, [user?.id]);

  // Track page views on route change
  useEffect(() => {
    if (pathname) {
      analytics.trackPageView(pathname);
    }
  }, [pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Global progress bar (client-only) */}
      <NextTopLoader
        color="#00cd0f"
        initialPosition={0.08}
        crawlSpeed={200}
        height={3}
        crawl={true}
        showSpinner={true}
        easing="ease"
        speed={200}
        shadow="0 0 10px #00cd0f, 0 0 5px #00cd0f"
      />
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}

      {/* Cookie Consent Management (client-only) */}
      <ReactCookiebot
        domainGroupId={process.env.NEXT_PUBLIC_COOKIEBOT_DOMAIN_GROUP_ID || '00000000-0000-0000-0000-000000000000'}
        blockingMode="auto"
        level="strict"
        culture="en"
        framework="TCFv2.2"
        onLoad={() => {
          if (typeof window !== 'undefined') {
            console.info('Cookiebot loaded', { groupId: process.env.NEXT_PUBLIC_COOKIEBOT_DOMAIN_GROUP_ID, hasCookiebot: !!(window as any).Cookiebot })
          }
        }}
        onAccept={() => console.info('Cookie consent accepted')}
        onDecline={() => console.info('Cookie consent declined')}
      />
    </QueryClientProvider>
  );
}
