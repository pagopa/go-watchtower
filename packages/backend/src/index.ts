import { env } from "./config/env.js";
import { buildApp } from "./app.js";
import { cleanupExpiredTokens } from "./services/token.service.js";

const TOKEN_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`Server running at http://${env.HOST}:${env.PORT}`);
    console.log(`API docs available at http://${env.HOST}:${env.PORT}/docs`);

    // Periodic cleanup of expired/revoked refresh tokens
    const cleanup = async () => {
      try {
        const count = await cleanupExpiredTokens();
        if (count > 0) app.log.info(`Cleaned up ${count} expired tokens`);
      } catch (err) {
        app.log.error(err, "Token cleanup failed");
      }
    };
    cleanup(); // run once on startup
    setInterval(cleanup, TOKEN_CLEANUP_INTERVAL_MS);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
