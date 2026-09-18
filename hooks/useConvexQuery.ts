import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query'
import { useConvexAuth } from 'convex/react'
import { FunctionReference, getFunctionName } from 'convex/server'
import { useAuthStore } from '@/stores/authStore'

interface ConvexQueryOptions<TData, TError = Error> extends Omit<UseQueryOptions<TData, TError>, 'queryKey' | 'queryFn'> {
  /**
   * Custom gc time in milliseconds (replaces cacheTime in v5)
   * @default 5 minutes (300000ms)
   */
  gcTime?: number
  /**
   * Custom stale time in milliseconds  
   * @default 1 minute (60000ms)
   */
  staleTime?: number
  /**
   * Whether to refetch on window focus
   * @default false for dashboard data
   */
  refetchOnWindowFocus?: boolean
}

/**
 * Enhanced Convex query hook with TanStack Query caching
 * Provides better error handling, caching, and loading states
 */
export function useConvexQuery<TData>(
  query: FunctionReference<'query', 'public', any, TData>,
  args?: any,
  options?: ConvexQueryOptions<TData>
): UseQueryResult<TData, Error> {
  const { isAuthenticated } = useConvexAuth()
  const { user, canAccessDashboard } = useAuthStore()
  
  const queryKey = [
    'convex',
    getFunctionName(query),
    args,
    user?._id, // Include user ID in query key for user-specific data
  ]

  return useQuery({
    queryKey,
    queryFn: async (): Promise<TData> => {
      // Import convex client dynamically to avoid SSR issues
      const { ConvexHttpClient } = await import('convex/browser')
      const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
      
      try {
        const result = await client.query(query, args || {})
        return result
      } catch (error) {
        throw new Error(`Query failed: ${error}`)
      }
    },
    enabled: isAuthenticated && canAccessDashboard && (options?.enabled ?? true),
    gcTime: options?.gcTime ?? 5 * 60 * 1000, // 5 minutes
    staleTime: options?.staleTime ?? 60 * 1000, // 1 minute
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error instanceof Error && error.message.includes('Not authenticated')) {
        return false
      }
      // Retry up to 3 times for other errors
      return failureCount < 3
    },
    ...options,
  })
}
 