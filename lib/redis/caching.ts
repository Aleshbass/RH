import { redis, CACHE_PREFIXES, CACHE_TTL, generateCacheKey, safeJsonParse, safeJsonStringify } from './client'

// Re-export CACHE_TTL for use in other modules
export { CACHE_TTL }

// Define simple, non-recursive types to avoid deep instantiation errors
export interface CacheOptions {
  ttl?: number
  prefix?: string
}

export interface CachedItem<T = any> {
  data: T
  timestamp: number
  ttl: number
}

// Generic cache service class
export class CacheService {
  /**
   * Set a value in cache with optional TTL
   */
  static async set<T>(
    key: string, 
    value: T, 
    options: CacheOptions = {}
  ): Promise<boolean> {
    try {
      const { ttl = CACHE_TTL.MEDIUM, prefix = '' } = options
      const cacheKey = prefix ? generateCacheKey(prefix, key) : key
      
      const cachedItem: CachedItem<T> = {
        data: value,
        timestamp: Date.now(),
        ttl
      }
      
      const serialized = safeJsonStringify(cachedItem)
      await redis().setex(cacheKey, ttl, serialized)
      
      console.log(`[CACHE] Set key: ${cacheKey} with TTL: ${ttl}s`)
      return true
    } catch (error) {
      console.error('[CACHE] Error setting cache:', error)
      return false
    }
  }

  /**
   * Get a value from cache
   */
  static async get<T>(
    key: string, 
    options: CacheOptions = {}
  ): Promise<T | null> {
    try {
      const { prefix = '' } = options
      const cacheKey = prefix ? generateCacheKey(prefix, key) : key
      
      const cached = await redis().get(cacheKey)
      if (!cached) return null
      
      const parsedItem = safeJsonParse<CachedItem<T>>(cached as string)
      if (!parsedItem) return null
      
      // Check if cache is still valid
      const now = Date.now()
      const age = (now - parsedItem.timestamp) / 1000 // age in seconds
      
      if (age > parsedItem.ttl) {
        // Cache expired, delete it
        await this.delete(key, options)
        return null
      }
      
      console.log(`[CACHE] Hit key: ${cacheKey}`)
      return parsedItem.data
    } catch (error) {
      console.error('[CACHE] Error getting cache:', error)
      return null
    }
  }

  /**
   * Delete a value from cache
   */
  static async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
    try {
      const { prefix = '' } = options
      const cacheKey = prefix ? generateCacheKey(prefix, key) : key
      
      await redis().del(cacheKey)
      console.log(`[CACHE] Deleted key: ${cacheKey}`)
      return true
    } catch (error) {
      console.error('[CACHE] Error deleting cache:', error)
      return false
    }
  }

  /**
   * Check if a key exists in cache
   */
  static async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    try {
      const { prefix = '' } = options
      const cacheKey = prefix ? generateCacheKey(prefix, key) : key
      
      const exists = await redis().exists(cacheKey)
      return exists === 1
    } catch (error) {
      console.error('[CACHE] Error checking cache existence:', error)
      return false
    }
  }

  /**
   * Clear all cache with a specific prefix
   */
  static async clearByPrefix(prefix: string): Promise<boolean> {
    try {
      const pattern = `${prefix}*`
      const keys = await redis().keys(pattern)
      
      if (keys.length > 0) {
        await redis().del(...keys)
        console.log(`[CACHE] Cleared ${keys.length} keys with prefix: ${prefix}`)
      }
      
      return true
    } catch (error) {
      console.error('[CACHE] Error clearing cache by prefix:', error)
      return false
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute function and cache result
   */
  static async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T | null> {
    try {
      // Try to get from cache first
      const cached = await this.get<T>(key, options)
      if (cached !== null) {
        return cached
      }

      // Not in cache, execute function
      console.log(`[CACHE] Cache miss for key: ${key}, executing fetch function`)
      const result = await fetchFunction()
      
      // Cache the result
      await this.set(key, result, options)
      
      return result
    } catch (error) {
      console.error('[CACHE] Error in getOrSet:', error)
      return null
    }
  }
}

// Specialized caching functions for different data types
export class QueryCache {
  /**
   * Cache query results with automatic key generation
   */
  static async cacheQuery<T>(
    queryName: string,
    params: Record<string, any>,
    result: T,
    ttl: number = CACHE_TTL.MEDIUM
  ): Promise<boolean> {
    const key = this.generateQueryKey(queryName, params)
    return CacheService.set(key, result, { 
      ttl, 
      prefix: CACHE_PREFIXES.QUERY 
    })
  }

  /**
   * Get cached query result
   */
  static async getCachedQuery<T>(
    queryName: string,
    params: Record<string, any>
  ): Promise<T | null> {
    const key = this.generateQueryKey(queryName, params)
    return CacheService.get<T>(key, { 
      prefix: CACHE_PREFIXES.QUERY 
    })
  }

  /**
   * Invalidate query cache
   */
  static async invalidateQuery(
    queryName: string,
    params?: Record<string, any>
  ): Promise<boolean> {
    if (params) {
      const key = this.generateQueryKey(queryName, params)
      return CacheService.delete(key, { prefix: CACHE_PREFIXES.QUERY })
    } else {
      // Invalidate all queries with this name
      return CacheService.clearByPrefix(`${CACHE_PREFIXES.QUERY}${queryName}:`)
    }
  }

  /**
   * Generate consistent query cache key
   */
  private static generateQueryKey(queryName: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key]
        return acc
      }, {} as Record<string, any>)
    
    const paramsHash = Buffer.from(JSON.stringify(sortedParams)).toString('base64')
    return `${queryName}:${paramsHash}`
  }
}

// Session caching utilities
export class SessionCache {
  /**
   * Cache user session data
   */
  static async setSession(
    userId: string,
    sessionData: Record<string, any>,
    ttl: number = CACHE_TTL.SESSION
  ): Promise<boolean> {
    return CacheService.set(userId, sessionData, {
      ttl,
      prefix: CACHE_PREFIXES.SESSION
    })
  }

  /**
   * Get user session data
   */
  static async getSession(userId: string): Promise<Record<string, any> | null> {
    return CacheService.get(userId, {
      prefix: CACHE_PREFIXES.SESSION
    })
  }

  /**
   * Delete user session
   */
  static async deleteSession(userId: string): Promise<boolean> {
    return CacheService.delete(userId, {
      prefix: CACHE_PREFIXES.SESSION
    })
  }

  /**
   * Update session data (merge with existing)
   */
  static async updateSession(
    userId: string,
    updates: Record<string, any>
  ): Promise<boolean> {
    try {
      const existing = await this.getSession(userId) || {}
      const merged = { ...existing, ...updates }
      return this.setSession(userId, merged)
    } catch (error) {
      console.error('[SESSION_CACHE] Error updating session:', error)
      return false
    }
  }
}
