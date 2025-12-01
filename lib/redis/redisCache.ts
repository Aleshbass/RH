import { Redis } from '@upstash/redis'

// Simple Redis client initialization
let redisClient: Redis | null = null

function getRedis(): Redis {
  if (!redisClient) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Redis environment variables not configured')
    }

    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redisClient
}

// Simple cache TTL values (in seconds)
export const TTL = {
  SHORT: 60,      // 1 minute
  MEDIUM: 300,    // 5 minutes
  LONG: 1800,     // 30 minutes
  SESSION: 86400, // 24 hours
} as const

// Circuit breaker state
let isRedisHealthy = true
let lastErrorTime = 0
const RETRY_AFTER_MS = 60000 // Retry after 1 minute

// Simple cache operations
export class SimpleCache {
  private static shouldSkip(): boolean {
    return false
  }

  static lastError: any = null

  private static handleFailure(error: any) {
    console.error('[CACHE] Redis error:', error)
    this.lastError = error
    isRedisHealthy = false
    lastErrorTime = Date.now()
  }

  /**
   * Set a value in cache
   */
  static async set(key: string, value: unknown, ttlSeconds: number = TTL.MEDIUM): Promise<boolean> {
    if (this.shouldSkip()) return false

    try {
      const redis = getRedis()
      await redis.set(key, value, { ex: ttlSeconds })
      console.log(`[CACHE] Set ${key} with TTL ${ttlSeconds}s`)
      return true
    } catch (error) {
      this.handleFailure(error)
      return false
    }
  }

  /**
   * Get a value from cache
   */
  static async get<T = unknown>(key: string): Promise<T | null> {
    if (this.shouldSkip()) return null

    try {
      const redis = getRedis()
      console.log(`[CACHE] GET ${key}`)
      const cached = await redis.get(key)
      console.log(`[CACHE] RESULT ${key}:`, cached)

      if (!cached) {
        console.log(`[CACHE] Miss for ${key}`)
        return null
      }

      console.log(`[CACHE] Hit for ${key}`)
      return cached as T
    } catch (error) {
      this.handleFailure(error)
      return null
    }
  }

  /**
   * Delete a value from cache
   */
  static async delete(key: string): Promise<boolean> {
    if (this.shouldSkip()) return false

    try {
      const redis = getRedis()
      await redis.del(key)
      console.log(`[CACHE] Deleted ${key}`)
      return true
    } catch (error) {
      this.handleFailure(error)
      return false
    }
  }

  /**
   * Check if key exists
   */
  static async exists(key: string): Promise<boolean> {
    if (this.shouldSkip()) return false

    try {
      const redis = getRedis()
      const exists = await redis.exists(key)
      return exists === 1
    } catch (error) {
      this.handleFailure(error)
      return false
    }
  }

  /**
   * Clear all keys with prefix
   */
  static async clearPrefix(prefix: string): Promise<number> {
    if (this.shouldSkip()) return 0

    try {
      const redis = getRedis()
      const keys = await redis.keys(`${prefix}*`)

      if (keys.length === 0) {
        return 0
      }

      await redis.del(...keys)
      console.log(`[CACHE] Cleared ${keys.length} keys with prefix ${prefix}`)
      return keys.length
    } catch (error) {
      this.handleFailure(error)
      return 0
    }
  }

  /**
   * Get or set pattern - if key doesn't exist, execute function and cache result
   */
  static async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = TTL.MEDIUM
  ): Promise<T | null> {
    if (this.shouldSkip()) {
      return fetchFn()
    }

    try {
      // Try to get from cache first
      const cached = await this.get<T>(key)
      if (cached !== null) {
        return cached
      }

      // Not in cache, execute function
      console.log(`[CACHE] Executing fetch function for ${key}`)
      const result = await fetchFn()

      // Cache the result
      await this.set(key, result, ttlSeconds)

      return result
    } catch (error) {
      this.handleFailure(error)
      // Fallback to direct execution if cache fails
      return fetchFn()
    }
  }
}

// Session management utilities
export class SessionCache {
  private static getSessionKey(userId: string): string {
    return `session:${userId}`
  }

  static async setSession(userId: string, sessionData: Record<string, unknown>): Promise<boolean> {
    const key = this.getSessionKey(userId)
    return SimpleCache.set(key, {
      ...sessionData,
      lastActivity: Date.now(),
    }, TTL.SESSION)
  }

  static async getSession(userId: string): Promise<Record<string, unknown> | null> {
    const key = this.getSessionKey(userId)
    return SimpleCache.get(key)
  }

  static async updateSession(userId: string, updates: Record<string, unknown>): Promise<boolean> {
    const existing = await this.getSession(userId) || {}
    const merged = {
      ...existing,
      ...updates,
      lastActivity: Date.now(),
    }
    return this.setSession(userId, merged)
  }

  static async deleteSession(userId: string): Promise<boolean> {
    const key = this.getSessionKey(userId)
    return SimpleCache.delete(key)
  }
}

// Query caching utilities
export class QueryCache {
  private static getQueryKey(queryName: string, params: Record<string, unknown> = {}): string {
    const paramsStr = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|')
    return `query:${queryName}:${Buffer.from(paramsStr).toString('base64').slice(0, 20)}`
  }

  static async cacheQuery<T>(
    queryName: string,
    params: Record<string, unknown>,
    result: T,
    ttlSeconds: number = TTL.MEDIUM
  ): Promise<boolean> {
    const key = this.getQueryKey(queryName, params)
    return SimpleCache.set(key, result, ttlSeconds)
  }

  static async getCachedQuery<T>(
    queryName: string,
    params: Record<string, unknown> = {}
  ): Promise<T | null> {
    const key = this.getQueryKey(queryName, params)
    return SimpleCache.get<T>(key)
  }

  static async invalidateQuery(queryName: string, params?: Record<string, unknown>): Promise<boolean> {
    if (params) {
      const key = this.getQueryKey(queryName, params)
      return SimpleCache.delete(key)
    } else {
      // Clear all queries with this name
      const cleared = await SimpleCache.clearPrefix(`query:${queryName}:`)
      return cleared > 0
    }
  }
}

export { getRedis }
