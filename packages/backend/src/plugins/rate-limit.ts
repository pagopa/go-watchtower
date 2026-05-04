import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: 100, // Default: 100 requests per minute
    timeWindow: "1 minute",
    errorResponseBuilder: (_request, context) => ({
      error: "Too Many Requests",
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      statusCode: 429,
    }),
  });
}

// Stricter limit for interactive login attempts.
export const loginRateLimitConfig = {
  config: {
    rateLimit: {
      max: 5, // 5 attempts per minute
      timeWindow: "1 minute",
    },
  },
};

// Refresh is called automatically by the frontend and may legitimately arrive
// in small bursts after tab focus, laptop wake, or parallel data refetches.
export const refreshRateLimitConfig = {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: "1 minute",
    },
  },
};
