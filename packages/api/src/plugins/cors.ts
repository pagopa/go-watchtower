import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

export async function registerCors(app: FastifyInstance): Promise<void> {
  // Allow multiple frontend origins (web on 3000, frontend on 3002)
  const allowedOrigins = [
    env.FRONTEND_URL,
    "http://localhost:3002",
  ].filter(Boolean);

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });
}
