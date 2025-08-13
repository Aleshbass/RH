import { Redis } from '@upstash/redis'

// Initialize Redis client with Upstash credentials
let redis: Redis | null = null

// Lazy initialization to avoid issues with environment variables
function getRedisClient(): Redis {
  if (!redis) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Redis environment variables are not configured')
    }
    
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redis
}

// Cache key prefixes for different data types
export const CACHE_PREFIXES = {
  QUERY: 'query:',
  SESSION: 'session:',
  USER: 'user:',
  APPOINTMENT: 'appointment:',
  PATIENT: 'patient:',
  CLINIC: 'clinic:',
  DASHBOARD_STATS: 'dashboard:stats:',
  NOTIFICATION: 'notification:',
} as const

// Cache TTL (Time To Live) in seconds
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 1800, // 30 minutes
  VERY_LONG: 3600, // 1 hour
  SESSION: 86400, // 24 hours
} as const

// Redis client instance
export { getRedisClient as redis }

// Helper function to generate cache keys
export function generateCacheKey(prefix: string, identifier: string): string {
  return `${prefix}${identifier}`
}

// Helper function to safely parse JSON from Redis
export function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch (error) {
    console.error('Failed to parse JSON from Redis:', error)
    return null
  }
}

// Helper function to safely stringify JSON for Redis
export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch (error) {
    console.error('Failed to stringify JSON for Redis:', error)
    return '{}'
  }
}
