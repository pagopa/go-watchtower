import Fastify from "fastify";
import type { FastifyServerOptions } from "fastify";
import { registerCors } from "./plugins/cors.js";
import { registerJwt } from "./plugins/jwt.js";
import { registerGoogleOAuth } from "./plugins/google-oauth.js";
import { registerSwagger } from "./plugins/swagger.js";
import { registerRateLimit } from "./plugins/rate-limit.js";
import { authRoutes } from "./routes/auth/index.js";
import { productRoutes } from "./routes/products/index.js";
import { analysisRoutes } from "./routes/analyses/index.js";
import { permissionRoutes } from "./routes/permissions/index.js";
import { userRoutes } from "./routes/users/index.js";
import { reportRoutes } from "./routes/reports/index.js";
import { ignoreReasonRoutes } from "./routes/ignore-reasons/index.js";
import { systemEventRoutes } from "./routes/system-events/index.js";
import { settingRoutes } from "./routes/settings/index.js";
import { healthRoutes } from "./routes/health.js";

function getLoggerConfig(): FastifyServerOptions["logger"] {
  if (process.env["NODE_ENV"] === "production") {
    return { level: "info" };
  }

  return {
    level: "debug",
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
      },
    },
  };
}

export async function buildApp() {
  const app = Fastify({
    logger: getLoggerConfig(),
    trustProxy: true, // Required for rate limiting by IP behind proxy
  });

  // Register plugins
  await registerRateLimit(app);
  await registerCors(app);
  await registerJwt(app);
  await registerGoogleOAuth(app);
  await registerSwagger(app);

  // Register routes
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(productRoutes, { prefix: "/api" });
  await app.register(analysisRoutes, { prefix: "/api" });
  await app.register(permissionRoutes, { prefix: "/api" });
  await app.register(userRoutes, { prefix: "/api" });
  await app.register(reportRoutes, { prefix: "/api" });
  await app.register(ignoreReasonRoutes, { prefix: "/api" });
  await app.register(systemEventRoutes, { prefix: "/api" });
  await app.register(settingRoutes, { prefix: "/api" });

  return app;
}
