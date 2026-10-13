import { NextRequest, NextResponse } from "next/server";

export type RateLimitTier =
  | "sandbox"
  | "standard"
  | "professional"
  | "enterprise"
  | "public_form"
  | "public_query";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  burstCapacity?: number;
}

export const TIER_CONFIGS: Record<RateLimitTier, RateLimitConfig> = {
  // Sandbox / Test Mode (5 req/sec, burst up to 10)
  sandbox: {
    windowMs: 1000,
    maxRequests: 5,
    burstCapacity: 10,
  },
  // Standard / Professional Partners (10 req/sec, burst up to 20)
  standard: {
    windowMs: 1000,
    maxRequests: 10,
    burstCapacity: 20,
  },
  professional: {
    windowMs: 1000,
    maxRequests: 10,
    burstCapacity: 20,
  },
  // Enterprise Partners (50 req/sec, burst up to 100)
  enterprise: {
    windowMs: 1000,
    maxRequests: 50,
    burstCapacity: 100,
  },
  // Public Lead Forms (e.g. MediLoan interest, Book Demo: 5 requests per 10 mins per IP)
  public_form: {
    windowMs: 10 * 60 * 1000,
    maxRequests: 5,
    burstCapacity: 5,
  },
  // Public Queries (e.g. referral links resolution: 60 requests per minute per IP)
  public_query: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    burstCapacity: 80,
  },
};

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
  retryAfter: number; // Seconds to wait
  tier: RateLimitTier;
}

// In-Memory sliding-window storage with automatic pruning
class InMemoryRateLimiter {
  private windows: Map<string, number[]> = new Map();
  private lastCleanup: number = Date.now();

  private cleanup() {
    const now = Date.now();
    // Run cleanup at most once every 60 seconds
    if (now - this.lastCleanup < 60000 && this.windows.size < 5000) {
      return;
    }
    this.lastCleanup = now;

    // Largest window is 10 minutes (600,000 ms)
    const maxAge = 600000;
    this.windows.forEach((timestamps, key) => {
      const valid = timestamps.filter((ts) => now - ts < maxAge);
      if (valid.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, valid);
      }
    });
  }

  public check(
    identifier: string,
    tier: RateLimitTier = "standard"
  ): RateLimitResult {
    this.cleanup();

    const config = TIER_CONFIGS[tier] || TIER_CONFIGS.standard;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const timestamps = this.windows.get(identifier) || [];
    // Keep only timestamps within current window
    const activeTimestamps = timestamps.filter((ts) => ts > windowStart);

    const limit = config.burstCapacity || config.maxRequests;
    const isAllowed = activeTimestamps.length < limit;

    if (isAllowed) {
      activeTimestamps.push(now);
      this.windows.set(identifier, activeTimestamps);
    }

    const remaining = Math.max(0, limit - activeTimestamps.length);
    const oldestTimestamp = activeTimestamps[0] || now;
    const resetTimeMs = oldestTimestamp + config.windowMs;
    const reset = Math.ceil(resetTimeMs / 1000);
    const retryAfter = isAllowed
      ? 0
      : Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

    return {
      success: isAllowed,
      limit,
      remaining,
      reset,
      retryAfter,
      tier,
    };
  }

  public reset(identifier: string) {
    this.windows.delete(identifier);
  }
}

// Global singleton across hot reloads in dev
const globalForLimiter = globalThis as unknown as {
  inMemoryRateLimiter?: InMemoryRateLimiter;
};

const limiter =
  globalForLimiter.inMemoryRateLimiter || new InMemoryRateLimiter();

if (process.env.NODE_ENV !== "production") {
  globalForLimiter.inMemoryRateLimiter = limiter;
}

/**
 * Checks rate limit for a given key or IP.
 * Checks Upstash Redis if configured, falling back seamlessly to in-memory store.
 */
export async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier = "standard"
): Promise<RateLimitResult> {
  const hasUpstash = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );

  if (hasUpstash) {
    try {
      const { redis } = await import("./redis/client");
      const client = redis();
      const config = TIER_CONFIGS[tier] || TIER_CONFIGS.standard;
      const limit = config.burstCapacity || config.maxRequests;
      const windowSec = Math.max(1, Math.ceil(config.windowMs / 1000));
      const now = Date.now();
      const currentBucketIndex = Math.floor(now / config.windowMs);
      const nextWindowMs = (currentBucketIndex + 1) * config.windowMs;
      const bucketKey = `ratelimit:${tier}:${identifier}:${currentBucketIndex}`;

      const currentCount = await client.incr(bucketKey);
      if (currentCount === 1) {
        await client.expire(bucketKey, windowSec * 2);
      }

      const isAllowed = currentCount <= limit;
      const remaining = Math.max(0, limit - currentCount);
      const reset = Math.ceil(nextWindowMs / 1000);
      const retryAfter = isAllowed
        ? 0
        : Math.max(1, Math.ceil((nextWindowMs - now) / 1000));

      return {
        success: isAllowed,
        limit,
        remaining,
        reset,
        retryAfter,
        tier,
      };
    } catch (err) {
      // If Redis has an error or timeout, log once and smoothly fallback to in-memory limiter
      console.warn("Upstash Redis rate limit check failed, using in-memory store:", err);
    }
  }

  // Fallback / default: In-memory sliding window limiter
  return limiter.check(identifier, tier);
}

/**
 * Extracts client IP from request headers.
 */
export function getClientIp(req: Request | NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

/**
 * Maps rate limit result into standard RFC HTTP response headers.
 */
export function getRateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };

  if (!result.success && result.retryAfter > 0) {
    headers["Retry-After"] = String(result.retryAfter);
  }

  return headers;
}

/**
 * Standardized HTTP 429 Too Many Requests response builder
 */
export function createRateLimitResponse({
  requestId,
  traceId,
  rateLimitResult,
  customMessage,
}: {
  requestId?: string;
  traceId?: string;
  rateLimitResult: RateLimitResult;
  customMessage?: string;
}): NextResponse {
  const headers = getRateLimitHeaders(rateLimitResult);
  if (requestId) headers["X-Rehabify-Request-Id"] = requestId;
  if (traceId) headers["X-Rehabify-Trace-Id"] = traceId;

  return NextResponse.json(
    {
      error: {
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
        message:
          customMessage ||
          `Rate limit exceeded for tier '${rateLimitResult.tier}'. Limit: ${rateLimitResult.limit} requests per window. Please retry after ${rateLimitResult.retryAfter}s.`,
        retry_after_seconds: rateLimitResult.retryAfter,
        request_id: requestId,
        trace_id: traceId,
        doc_url: "https://docs.physioaroundme.com/getting-started/errors#rate_limit_exceeded",
      },
    },
    {
      status: 429,
      headers,
    }
  );
}
