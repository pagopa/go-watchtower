#!/bin/sh
set -e

echo "Running database migrations..."
NODE_PATH=/usr/local/lib/node_modules prisma migrate deploy \
  --config /app/packages/database/prisma.config.ts
echo "Migrations complete."

exec "$@"
