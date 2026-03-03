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

// Stricter rate limit config for auth endpoints
export const authRateLimitConfig = {
  config: {
    rateLimit: {
      max: 5, // 5 attempts per minute
      timeWindow: "1 minute",
    },
  },
};

