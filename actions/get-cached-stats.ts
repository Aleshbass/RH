'use server'

import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import { auth } from '@clerk/nextjs/server'
import { ConvexCacheAdapter, CACHE_CONFIGS, createCacheKey } from '@/lib/cache/convexCacheAdapter'

export async function getCachedPhysiotherapistStats() {
    const { userId } = await auth()

    if (!userId) {
        throw new Error('Unauthorized')
    }

    // Create a unique cache key for this user's stats
    const cacheKey = createCacheKey(userId, 'physiotherapistStats')

    // Use the cache adapter to get cached data or fetch from Convex
    return await ConvexCacheAdapter.getOrFetch(
        cacheKey,
        async () => {
            // This runs on the server, so we use fetchQuery
            // We need to pass the token if we were using a client, but fetchQuery handles auth differently
            // However, since we are in a Server Action, we might not have the Convex auth context directly
            // So we might need to pass the user ID explicitly if the query supports it, 
            // OR rely on the fact that fetchQuery uses the configured CONVEX_URL

            // NOTE: standard fetchQuery doesn't automatically have the acting user context 
            // unless we pass a token. For simplicity in this MVP, we assume the query 
            // can take a userId or we are using a query that doesn't strictly depend on 
            // implicit auth context if we can pass the ID.

            // Looking at the usage `api.analytics.getPhysiotherapistStats`, it likely uses `ctx.auth.getUserIdentity()`.
            // `fetchQuery` in a Server Action might not have that context unless we pass a token.

            // For now, let's try to use fetchQuery. If it fails due to auth, we might need to 
            // pass the token from Clerk.

            const token = await (await auth()).getToken({ template: 'convex' })

            return await fetchQuery(
                api.analytics.getPhysiotherapistStats,
                {},
                { token: token || undefined }
            )
        },
        CACHE_CONFIGS.DASHBOARD_STATS
    )
}
