import { NextRequest, NextResponse } from 'next/server'
import { ConvexCacheAdapter, CACHE_CONFIGS, createCacheKey } from '@/lib/cache/convexCacheAdapter'
import { getRedis, SimpleCache } from '@/lib/redis/redisCache'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const key = searchParams.get('key') || 'test-key'
    const refresh = searchParams.get('refresh') === 'true'

    const cacheKey = createCacheKey('debug', 'redis-test', { key })

    // Custom config for this test
    const config = {
        ttl: 60, // 1 minute
        prefix: 'debug:redis',
        enabled: true
    }

    if (refresh) {
        await ConvexCacheAdapter.invalidate(cacheKey, config)
    }

    const startTime = performance.now()

    // Track if this is a fresh computation
    let wasComputed = false

    const data = await ConvexCacheAdapter.getOrFetch(
        cacheKey,
        async () => {
            wasComputed = true
            // Simulate expensive operation
            await new Promise(resolve => setTimeout(resolve, 500))
            return {
                timestamp: new Date().toISOString(),
                value: `Random value: ${Math.random()}`
            }
        },
        config
    )

    const endTime = performance.now()
    const duration = endTime - startTime

    // Determine the actual source
    const isCacheHit = !wasComputed
    const actualSource = isCacheHit ? 'Redis Cache (Fast)' : 'Computed (Slow)'

    // Direct Redis Test
    let redisStatus = 'Unknown'
    let redisError = null
    try {
        const redis = getRedis()
        await redis.set('ping', 'pong')
        redisStatus = 'Connected'
    } catch (err: any) {
        redisStatus = 'Error'
        redisError = {
            message: err.message,
            cause: err.cause,
            stack: err.stack
        }
    }

    return NextResponse.json({
        data: {
            ...data,
            source: actualSource
        },
        performance: {
            duration: `${duration.toFixed(2)}ms`,
            cacheHit: isCacheHit
        },
        redisAvailable: ConvexCacheAdapter.isRedisAvailable(),
        redisDebug: {
            status: redisStatus,
            error: redisError,
            configUrl: process.env.UPSTASH_REDIS_REST_URL
        }
    })
}
