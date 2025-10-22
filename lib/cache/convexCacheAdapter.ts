/**
 * Redis-backed cache adapter for Convex queries
 * Provides server-side caching with Upstash Redis
 */

import { SimpleCache, QueryCache, TTL } from '@/lib/redis/simpleCache'

export interface CacheConfig {
  /**
   * Time-to-live in seconds
   */
  ttl: number
  /**
   * Cache key prefix
   */
  prefix: string
  /**
   * Whether to use Redis caching (requires UPSTASH env vars)
   */
  enabled: boolean
}

/**
 * Default cache configurations for different data types
 */
export const CACHE_CONFIGS = {
  USER_PROFILE: {
    ttl: TTL.LONG, // 30 minutes
    prefix: 'user:profile',
    enabled: true,
  },
  DASHBOARD_STATS: {
    ttl: TTL.MEDIUM, // 5 minutes
    prefix: 'dashboard:stats',
    enabled: true,
  },
  APPOINTMENTS: {
    ttl: TTL.SHORT, // 1 minute
    prefix: 'appointments',
    enabled: true,
  },
  PATIENTS: {
    ttl: TTL.MEDIUM, // 5 minutes
    prefix: 'patients',
    enabled: true,
  },
  CLINIC_INFO: {
    ttl: TTL.LONG, // 30 minutes
    prefix: 'clinic:info',
    enabled: true,
  },
  SESSION_LOGS: {
    ttl: TTL.MEDIUM, // 5 minutes
    prefix: 'sessions',
    enabled: true,
  },
} as const

/**
 * Convex Cache Adapter with Redis backend
 */
export class ConvexCacheAdapter {
  /**
   * Get cached data or fetch from Convex and cache
   */
  static async getOrFetch<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    config: CacheConfig
  ): Promise<T> {
    if (!config.enabled) {
      return fetchFn()
    }

    try {
      // Check Redis first
      const fullKey = `${config.prefix}:${cacheKey}`
      const cached = await SimpleCache.get<T>(fullKey)

      if (cached !== null) {
        console.log(`[CACHE HIT] ${fullKey}`)
        return cached
      }

      // Cache miss - fetch from Convex
      console.log(`[CACHE MISS] ${fullKey} - Fetching from Convex...`)
      const data = await fetchFn()

      // Store in Redis (fire and forget)
      SimpleCache.set(fullKey, data, config.ttl).catch((err) => {
        console.error('[CACHE ERROR] Failed to cache data:', err)
      })

      return data
    } catch (error) {
      console.error('[CACHE ERROR] Cache adapter error, falling back to direct fetch:', error)
      return fetchFn()
    }
  }

  /**
   * Invalidate cached data
   */
  static async invalidate(cacheKey: string, config: CacheConfig): Promise<void> {
    if (!config.enabled) return

    try {
      const fullKey = `${config.prefix}:${cacheKey}`
      await SimpleCache.delete(fullKey)
      console.log(`[CACHE INVALIDATE] ${fullKey}`)
    } catch (error) {
      console.error('[CACHE ERROR] Failed to invalidate:', error)
    }
  }

  /**
   * Invalidate all cached data with a specific prefix
   */
  static async invalidatePrefix(prefix: string): Promise<void> {
    try {
      await SimpleCache.clearPrefix(prefix)
      console.log(`[CACHE INVALIDATE PREFIX] ${prefix}`)
    } catch (error) {
      console.error('[CACHE ERROR] Failed to invalidate prefix:', error)
    }
  }

  /**
   * Check if Redis is available
   */
  static isRedisAvailable(): boolean {
    return !!(
      process.env.UPSTASH_REDIS_REST_URL && 
      process.env.UPSTASH_REDIS_REST_TOKEN
    )
  }
}

/**
 * Helper function to create cache keys
 */
export function createCacheKey(
  userId: string,
  queryName: string,
  params: Record<string, any> = {}
): string {
  const paramsStr = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&')
  
  return `${userId}:${queryName}${paramsStr ? `:${paramsStr}` : ''}`
}
