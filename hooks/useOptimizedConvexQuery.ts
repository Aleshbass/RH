import { useQuery, UseQueryResult } from '@tanstack/react-query'
import { useConvexAuth } from 'convex/react'
import { useAuthStore } from '@/stores/authStore'

/**
 * Optimized Convex query hook with aggressive caching
 * Reduces loading times by caching data for longer periods
 */

interface OptimizedQueryOptions {
  /**
   * How long data stays fresh before refetching (default: 5 minutes)
   */
  staleTime?: number
  /**
   * How long to keep data in cache after last use (default: 10 minutes)
   */
  gcTime?: number
  /**
   * Whether to refetch on window focus (default: false)
   */
  refetchOnWindowFocus?: boolean
  /**
   * Whether query is enabled (default: true)
   */
  enabled?: boolean
}

/**
 * Hook for dashboard data with aggressive caching
 * Use this for data that doesn't change frequently (user info, stats, etc.)
 */
export function useOptimizedConvexQuery<TData>(
  queryFn: any,
  args?: any,
  queryName?: string,
  options?: OptimizedQueryOptions
): UseQueryResult<TData, Error> {
  const { isAuthenticated } = useConvexAuth()
  const { user } = useAuthStore()

  const queryKey = [
    'convex-optimized',
    queryName || queryFn?.name || 'query',
    args,
    user?._id,
  ]

  return useQuery({
    queryKey,
    queryFn: async (): Promise<TData> => {
      if (!queryFn) throw new Error('Query function is required')
      
      try {
        // Call the Convex query function directly
        const result = await queryFn(args || {})
        return result
      } catch (error) {
        throw new Error(`Query failed: ${error}`)
      }
    },
    enabled: isAuthenticated && (options?.enabled ?? true),
    // AGGRESSIVE CACHING FOR DASHBOARD DATA
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5 minutes default
    gcTime: options?.gcTime ?? 10 * 60 * 1000, // 10 minutes default
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnMount: false, // Don't refetch if data exists
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('Not authenticated')) {
        return false
      }
      return failureCount < 2
    },
  })
}

/**
 * Hook specifically for static/semi-static data (user profile, settings)
 * Caches for 15 minutes
 */
export function useStaticConvexQuery<TData>(
  queryFn: any,
  args?: any,
  queryName?: string
): UseQueryResult<TData, Error> {
  return useOptimizedConvexQuery<TData>(queryFn, args, queryName, {
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })
}

/**
 * Hook for frequently updated data (appointments, notifications)
 * Caches for 1 minute
 */
export function useDynamicConvexQuery<TData>(
  queryFn: any,
  args?: any,
  queryName?: string
): UseQueryResult<TData, Error> {
  return useOptimizedConvexQuery<TData>(queryFn, args, queryName, {
    staleTime: 60 * 1000, // 1 minute
    gcTime: 3 * 60 * 1000, // 3 minutes
  })
}
