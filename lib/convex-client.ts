import { ConvexHttpClient } from 'convex/browser'

let convexClient: ConvexHttpClient | null = null

/**
 * Returns a lazily-initialized ConvexHttpClient.
 * This avoids crashing during Next.js build when NEXT_PUBLIC_CONVEX_URL
 * is not yet available (the env var is only set at runtime on Vercel).
 */
export function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!url) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL is not set')
    }
    convexClient = new ConvexHttpClient(url)
  }
  return convexClient
}
