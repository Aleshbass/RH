'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // OPTIMIZED: Aggressive caching for dashboard performance
            staleTime: 5 * 60 * 1000, // 5 minutes (data considered fresh)
            gcTime: 10 * 60 * 1000, // 10 minutes (keep in cache)
            refetchOnWindowFocus: false, // Don't refetch when user returns to tab
            refetchOnMount: false, // Don't refetch if data exists in cache
            refetchOnReconnect: true, // Refetch when internet reconnects
            retry: (failureCount, error) => {
              // Don't retry on 4xx errors (client errors)
              if (error && typeof error === 'object' && 'status' in error) {
                const status = (error as any).status
                if (status >= 400 && status < 500) {
                  return false
                }
              }
              return failureCount < 2 // Reduced retries for faster failure
            },
          },
          mutations: {
            // Global defaults for mutations
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools 
          initialIsOpen={false}
        />
      )}
    </QueryClientProvider>
  )
} 