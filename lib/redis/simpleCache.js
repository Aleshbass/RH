const { Redis } = require('@upstash/redis')

// Simple Redis client initialization
let redisClient = null

function getRedis() {
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
const TTL = {
  SHORT: 60,      // 1 minute
  MEDIUM: 300,    // 5 minutes
  LONG: 1800,     // 30 minutes
  SESSION: 86400, // 24 hours
}

// Simple cache operations
class SimpleCache {
  /**
   * Set a value in cache
   */
  static async set(key, value, ttlSeconds = TTL.MEDIUM) {
    try {
      const redis = getRedis()
      const serialized = JSON.stringify(value)
      await redis.setex(key, ttlSeconds, serialized)
      console.log(`[CACHE] Set ${key} with TTL ${ttlSeconds}s`)
      return true
    } catch (error) {
      console.error('[CACHE] Set error:', error)
      return false
    }
  }

  /**
   * Get a value from cache
   */
  static async get(key) {
    try {
      const redis = getRedis()
      const cached = await redis.get(key)
      
      if (!cached) {
        console.log(`[CACHE] Miss for ${key}`)
        return null
      }
      
      const parsed = JSON.parse(cached)
      console.log(`[CACHE] Hit for ${key}`)
      return parsed
    } catch (error) {
      console.error('[CACHE] Get error:', error)
      return null
    }
  }

  /**
   * Delete a value from cache
   */
  static async delete(key) {
    try {
      const redis = getRedis()
      await redis.del(key)
      console.log(`[CACHE] Deleted ${key}`)
      return true
    } catch (error) {
      console.error('[CACHE] Delete error:', error)
      return false
    }
  }

  /**
   * Check if key exists
   */
  static async exists(key) {
    try {
      const redis = getRedis()
      const exists = await redis.exists(key)
      return exists === 1
    } catch (error) {
      console.error('[CACHE] Exists error:', error)
      return false
    }
  }

  /**
   * Clear all keys with prefix
   */
  static async clearPrefix(prefix) {
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
      console.error('[CACHE] Clear prefix error:', error)
      return 0
    }
  }

  /**
   * Get or set pattern - if key doesn't exist, execute function and cache result
   */
  static async getOrSet(key, fetchFn, ttlSeconds = TTL.MEDIUM) {
    try {
      // Try to get from cache first
      const cached = await this.get(key)
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
      console.error('[CACHE] GetOrSet error:', error)
      return null
    }
  }
}

// Session management utilities
class SessionCache {
  static getSessionKey(userId) {
    return `session:${userId}`
  }

  static async setSession(userId, sessionData) {
    const key = this.getSessionKey(userId)
    return SimpleCache.set(key, {
      ...sessionData,
      lastActivity: Date.now(),
    }, TTL.SESSION)
  }

  static async getSession(userId) {
    const key = this.getSessionKey(userId)
    return SimpleCache.get(key)
  }

  static async updateSession(userId, updates) {
    const existing = await this.getSession(userId) || {}
    const merged = {
      ...existing,
      ...updates,
      lastActivity: Date.now(),
    }
    return this.setSession(userId, merged)
  }

  static async deleteSession(userId) {
    const key = this.getSessionKey(userId)
    return SimpleCache.delete(key)
  }
}

// Query caching utilities
class QueryCache {
  static getQueryKey(queryName, params = {}) {
    const paramsStr = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|')
    return `query:${queryName}:${Buffer.from(paramsStr).toString('base64').slice(0, 20)}`
  }

  static async cacheQuery(queryName, params, result, ttlSeconds = TTL.MEDIUM) {
    const key = this.getQueryKey(queryName, params)
    return SimpleCache.set(key, result, ttlSeconds)
  }

  static async getCachedQuery(queryName, params = {}) {
    const key = this.getQueryKey(queryName, params)
    return SimpleCache.get(key)
  }

  static async invalidateQuery(queryName, params) {
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

module.exports = {
  SimpleCache,
  SessionCache,
  QueryCache,
  TTL,
  getRedis
}
