// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { SessionManager } from './sessionManager'
import { QueryCache, CACHE_TTL } from './caching'
import { Id } from '@/convex/_generated/dataModel'

// Cache configuration for different routes
const ROUTE_CACHE_CONFIG = {
  '/api/dashboard/stats': { ttl: CACHE_TTL.MEDIUM, key: 'dashboard-stats' },
  '/api/appointments': { ttl: CACHE_TTL.SHORT, key: 'appointments' },
  '/api/patients': { ttl: CACHE_TTL.MEDIUM, key: 'patients' },
  '/api/clinics': { ttl: CACHE_TTL.LONG, key: 'clinics' },
  '/api/notifications': { ttl: CACHE_TTL.SHORT, key: 'notifications' },
} as const

/**
 * Middleware for automatic session management
 */
export async function sessionMiddleware(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') as Id<"users"> | null
    const clerkId = request.headers.get('x-clerk-id')
    
    if (userId && clerkId) {
      // Update session activity
      await SessionManager.updateActivity(userId)
      
      // Record API activity
      const pathname = request.nextUrl.pathname
      if (pathname.startsWith('/api/')) {
        await SessionManager.recordActivity(userId, 'lastActivity' as any, Date.now())
      }
    }
  } catch (error) {
    console.error('[MIDDLEWARE] Session middleware error:', error)
  }
  
  return NextResponse.next()
}

/**
 * Middleware for automatic query caching
 */
export async function cacheMiddleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const method = request.method
  
  // Only cache GET requests
  if (method !== 'GET') {
    return NextResponse.next()
  }
  
  const cacheConfig = ROUTE_CACHE_CONFIG[pathname as keyof typeof ROUTE_CACHE_CONFIG]
  if (!cacheConfig) {
    return NextResponse.next()
  }
  
  try {
    const userId = request.headers.get('x-user-id')
    const searchParams = request.nextUrl.searchParams.toString()
    const cacheKey = `${cacheConfig.key}:${userId}:${searchParams}`
    
    // Try to get from cache
    const cached = await QueryCache.getCachedQuery(cacheKey, {})
    
    if (cached) {
      console.log(`[CACHE MIDDLEWARE] Cache hit for ${pathname}`)
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          'X-Cache-Key': cacheKey,
        }
      })
    }
    
    // Cache miss - let the request continue and cache the response
    const response = NextResponse.next()
    response.headers.set('X-Cache', 'MISS')
    response.headers.set('X-Cache-Key', cacheKey)
    
    return response
  } catch (error) {
    console.error('[MIDDLEWARE] Cache middleware error:', error)
    return NextResponse.next()
  }
}

/**
 * Response caching utility for API routes
 */
export class ResponseCache {
  static async cacheResponse(
    key: string,
    data: any,
    ttl: number = CACHE_TTL.MEDIUM
  ): Promise<void> {
    try {
      await QueryCache.cacheQuery(key, {}, data, ttl)
    } catch (error) {
      console.error('[RESPONSE_CACHE] Error caching response:', error)
    }
  }
  
  static async getCachedResponse<T>(key: string): Promise<T | null> {
    try {
      return await QueryCache.getCachedQuery<T>(key, {})
    } catch (error) {
      console.error('[RESPONSE_CACHE] Error getting cached response:', error)
      return null
    }
  }
  
  static async invalidateResponse(key: string): Promise<void> {
    try {
      await QueryCache.invalidateQuery(key, {})
    } catch (error) {
      console.error('[RESPONSE_CACHE] Error invalidating response:', error)
    }
  }
}

/**
 * Higher-order function for wrapping API handlers with caching
 */
export function withCache<T>(
  handler: (req: NextRequest) => Promise<T>,
  options: {
    keyGenerator: (req: NextRequest) => string
    ttl?: number
    shouldCache?: (req: NextRequest) => boolean
  }
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const { keyGenerator, ttl = CACHE_TTL.MEDIUM, shouldCache = () => true } = options
      
      // Only cache GET requests by default
      if (req.method !== 'GET' || !shouldCache(req)) {
        const result = await handler(req)
        return NextResponse.json(result)
      }
      
      const cacheKey = keyGenerator(req)
      
      // Try cache first
      const cached = await ResponseCache.getCachedResponse(cacheKey)
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'X-Cache': 'HIT' }
        })
      }
      
      // Execute handler
      const result = await handler(req)
      
      // Cache result
      await ResponseCache.cacheResponse(cacheKey, result, ttl)
      
      return NextResponse.json(result, {
        headers: { 'X-Cache': 'MISS' }
      })
    } catch (error) {
      console.error('[WITH_CACHE] Error in cached handler:', error)
      // Fallback to executing handler without cache
      const result = await handler(req)
      return NextResponse.json(result)
    }
  }
}

/**
 * Cache invalidation utilities
 */
export class CacheInvalidator {
  /**
   * Invalidate user-specific caches
   */
  static async invalidateUserCaches(userId: Id<"users">): Promise<void> {
    try {
      const patterns = [
        `dashboard-stats:${userId}`,
        `appointments:${userId}`,
        `patients:${userId}`,
        `notifications:${userId}`,
      ]
      
      for (const pattern of patterns) {
        await QueryCache.invalidateQuery(pattern, {})
      }
      
      console.log(`[CACHE_INVALIDATOR] Invalidated caches for user: ${userId}`)
    } catch (error) {
      console.error('[CACHE_INVALIDATOR] Error invalidating user caches:', error)
    }
  }
  
  /**
   * Invalidate appointment-related caches
   */
  static async invalidateAppointmentCaches(
    patientId?: Id<"users">,
    physiotherapistId?: Id<"users">
  ): Promise<void> {
    try {
      const patterns = ['appointments']
      
      if (patientId) patterns.push(`appointments:${patientId}`)
      if (physiotherapistId) patterns.push(`appointments:${physiotherapistId}`)
      
      for (const pattern of patterns) {
        await QueryCache.invalidateQuery(pattern, {})
      }
      
      console.log('[CACHE_INVALIDATOR] Invalidated appointment caches')
    } catch (error) {
      console.error('[CACHE_INVALIDATOR] Error invalidating appointment caches:', error)
    }
  }
  
  /**
   * Invalidate clinic-related caches
   */
  static async invalidateClinicCaches(clinicId?: Id<"clinics">): Promise<void> {
    try {
      const patterns = ['clinics']
      
      if (clinicId) patterns.push(`clinics:${clinicId}`)
      
      for (const pattern of patterns) {
        await QueryCache.invalidateQuery(pattern, {})
      }
      
      console.log('[CACHE_INVALIDATOR] Invalidated clinic caches')
    } catch (error) {
      console.error('[CACHE_INVALIDATOR] Error invalidating clinic caches:', error)
    }
  }
}

/**
 * Cache warming utilities for preloading frequently accessed data
 */
export class CacheWarmer {
  /**
   * Warm user dashboard caches
   */
  static async warmUserDashboard(userId: Id<"users">): Promise<void> {
    try {
      // This would be implemented to preload common dashboard queries
      console.log(`[CACHE_WARMER] Warming dashboard cache for user: ${userId}`)
      
      // Example: Preload dashboard stats, recent appointments, etc.
      // const dashboardData = await fetchDashboardData(userId)
      // await QueryCache.cacheQuery(`dashboard-stats:${userId}`, {}, dashboardData, CACHE_TTL.MEDIUM)
    } catch (error) {
      console.error('[CACHE_WARMER] Error warming user dashboard:', error)
    }
  }
  
  /**
   * Warm frequently accessed data
   */
  static async warmFrequentData(): Promise<void> {
    try {
      console.log('[CACHE_WARMER] Warming frequently accessed data')
      
      // Example: Preload clinic lists, common lookup data, etc.
      // This would be run as a background job
    } catch (error) {
      console.error('[CACHE_WARMER] Error warming frequent data:', error)
    }
  }
}
