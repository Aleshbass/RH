/**
 * "At most once per window" guard backed by Upstash Redis (global across serverless
 * instances) with an in-memory fallback for local development.
 */
const memory = new Map<string, number>();

export async function firstWithin(key: string, windowSeconds: number): Promise<boolean> {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { redis } = await import("../redis/client");
      const result = await redis().set(`once:${key}`, "1", { nx: true, ex: windowSeconds });
      return result === "OK";
    } catch (error) {
      console.warn("firstWithin: redis unavailable, using memory", error instanceof Error ? error.message : error);
    }
  }
  const now = Date.now();
  if (memory.size > 10_000) {
    for (const [k, expires] of memory) if (expires <= now) memory.delete(k);
  }
  const expires = memory.get(key);
  if (expires && expires > now) return false;
  memory.set(key, now + windowSeconds * 1000);
  return true;
}

const counters = new Map<string, { count: number; expires: number }>();

/** Increments a windowed counter and returns the new value. */
export async function bumpCounter(key: string, windowSeconds: number): Promise<number> {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { redis } = await import("../redis/client");
      const client = redis();
      const value = await client.incr(`ctr:${key}`);
      if (value === 1) await client.expire(`ctr:${key}`, windowSeconds);
      return value;
    } catch {
      /* fall back to memory */
    }
  }
  const now = Date.now();
  const entry = counters.get(key);
  if (!entry || entry.expires <= now) {
    counters.set(key, { count: 1, expires: now + windowSeconds * 1000 });
    return 1;
  }
  entry.count++;
  return entry.count;
}

/** Reads a windowed counter without changing it. */
export async function readCounter(key: string): Promise<number> {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { redis } = await import("../redis/client");
      return Number((await redis().get<number>(`ctr:${key}`)) ?? 0);
    } catch {
      /* fall back to memory */
    }
  }
  const entry = counters.get(key);
  return entry && entry.expires > Date.now() ? entry.count : 0;
}

const BOT_PATTERN =
  /bot|crawler|spider|crawling|preview|facebookexternalhit|whatsapp|slackbot|telegrambot|discordbot|linkedinbot|twitterbot|embedly|quora link|pinterest|vkshare|skypeuripreview|headless|lighthouse|curl|wget|python-requests|httpclient/i;

export function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent || userAgent.length < 10) return true;
  return BOT_PATTERN.test(userAgent);
}
