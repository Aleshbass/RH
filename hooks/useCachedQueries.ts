// @ts-nocheck
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useEffect, useState } from 'react'
import { QueryCache, CACHE_TTL } from '@/lib/redis/caching'
import { Id } from '@/convex/_generated/dataModel'

// Types for cached data to avoid deep instantiation
type UserData = {
  _id: Id<"users">
  firstName?: string
  lastName?: string
  email?: string
  role?: string
  onboarded: boolean
}

type AppointmentData = {
  _id: Id<"appointments">
  patientId: Id<"users">
  physiotherapistId: Id<"users">
  startTime: number
  endTime: number
  status: string
}

type DashboardStats = {
  totalAppointments: number
  totalPatients: number
  upcomingAppointments: number
  completedSessions: number
}

/**
 * Hook for cached user data with Redis fallback
 */
export function useCachedUser() {
  const [cachedUser, setCachedUser] = useState<UserData | null>(null)
  const [isLoadingCache, setIsLoadingCache] = useState(true)
  
  // Always call the Convex query
  const convexUser = useQuery(api.users.getMyUser)
  
  useEffect(() => {
    async function loadCachedUser() {
      if (convexUser) {
        try {
          // Cache the user data when we get it from Convex
          await QueryCache.cacheQuery(
            'getMyUser',
            {},
            convexUser,
            CACHE_TTL.LONG
          )
          setCachedUser(convexUser as UserData)
        } catch (error) {
          console.error('Error caching user data:', error)
          setCachedUser(convexUser as UserData)
        }
      }
      setIsLoadingCache(false)
    }

    loadCachedUser()
  }, [convexUser])

  return {
    user: cachedUser || convexUser,
    isLoading: convexUser === undefined || isLoadingCache,
  }
}

/**
 * Hook for cached dashboard stats
 */
export function useCachedDashboardStats(userId?: string) {
  const [cachedStats, setCachedStats] = useState<DashboardStats | null>(null)
  const [isLoadingCache, setIsLoadingCache] = useState(true)

  useEffect(() => {
    async function loadCachedStats() {
      if (!userId) {
        setIsLoadingCache(false)
        return
      }

      try {
        // Try to get from cache first
        const cached = await QueryCache.getCachedQuery<DashboardStats>(
          'getDashboardStats',
          { userId }
        )

        if (cached) {
          setCachedStats(cached)
          setIsLoadingCache(false)
          return
        }

        // If not in cache, we'll rely on the Convex query
        // This would be where you'd fetch from your actual dashboard stats query
        setIsLoadingCache(false)
      } catch (error) {
        console.error('Error loading cached dashboard stats:', error)
        setIsLoadingCache(false)
      }
    }

    loadCachedStats()
  }, [userId])

  return {
    stats: cachedStats,
    isLoading: isLoadingCache,
  }
}

/**
 * Hook for cached appointments with automatic refresh
 */
export function useCachedAppointments(params: { patientId?: string; physiotherapistId?: string } = {}) {
  const [cachedAppointments, setCachedAppointments] = useState<AppointmentData[]>([])
  const [isLoadingCache, setIsLoadingCache] = useState(true)
  
  // Get fresh data from Convex
  const convexAppointments = useQuery(
    api.appointments.getAppointments,
    params.patientId || params.physiotherapistId ? params : "skip"
  )

  useEffect(() => {
    async function loadAndCacheAppointments() {
      if (convexAppointments) {
        try {
          // Cache the appointments data
          await QueryCache.cacheQuery(
            'getAppointments',
            params,
            convexAppointments,
            CACHE_TTL.SHORT // Appointments change frequently
          )
          setCachedAppointments(convexAppointments as AppointmentData[])
        } catch (error) {
          console.error('Error caching appointments:', error)
          setCachedAppointments(convexAppointments as AppointmentData[])
        }
      }
      setIsLoadingCache(false)
    }

    loadAndCacheAppointments()
  }, [convexAppointments, params.patientId, params.physiotherapistId])

  return {
    appointments: cachedAppointments.length > 0 ? cachedAppointments : (convexAppointments || []),
    isLoading: convexAppointments === undefined || isLoadingCache,
    refresh: async () => {
      // Invalidate cache to force refresh
      await QueryCache.invalidateQuery('getAppointments', params)
    }
  }
}

/**
 * Utility hook for manual cache management
 */
export function useCacheManager() {
  const invalidateUserCache = async () => {
    await QueryCache.invalidateQuery('getMyUser', {})
  }

  const invalidateAppointmentsCache = async (params: Record<string, any> = {}) => {
    await QueryCache.invalidateQuery('getAppointments', params)
  }

  const invalidateDashboardCache = async (userId: string) => {
    await QueryCache.invalidateQuery('getDashboardStats', { userId })
  }

  const clearAllCache = async () => {
    try {
      // This would clear all query cache - use with caution
      const { CacheService } = await import('@/lib/redis/caching')
      const CACHE_PREFIXES = (await import('@/lib/redis/caching') as any).CACHE_PREFIXES || {}
      await CacheService.clearByPrefix(CACHE_PREFIXES.QUERY)
      console.log('All query cache cleared')
    } catch (error) {
      console.error('Error clearing cache:', error)
    }
  }

  return {
    invalidateUserCache,
    invalidateAppointmentsCache,
    invalidateDashboardCache,
    clearAllCache,
  }
}

/**
 * Hook for caching expensive computations
 */
export function useCachedComputation<T>(
  key: string,
  computeFn: () => Promise<T>,
  dependencies: any[] = [],
  ttl: number = CACHE_TTL.MEDIUM
) {
  const [result, setResult] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function computeAndCache() {
      setIsLoading(true)
      setError(null)

      try {
        const cached = await QueryCache.getCachedQuery<T>(key, {})
        
        if (cached !== null) {
          setResult(cached)
          setIsLoading(false)
          return
        }

        // Not in cache, compute and cache
        const computed = await computeFn()
        await QueryCache.cacheQuery(key, {}, computed, ttl)
        setResult(computed)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        console.error('Error in cached computation:', err)
      } finally {
        setIsLoading(false)
      }
    }

    computeAndCache()
  }, dependencies)

  return { result, isLoading, error }
}
