# syntax=docker/dockerfile:1

# Build stage
FROM node:25-alpine AS builder

# Install pnpm (corepack removed in Node 25)
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy full package sources (before install, so pnpm resolves workspace links correctly)
COPY packages/database ./packages/database
COPY packages/backend ./packages/backend

# Install dependencies (no --frozen-lockfile: ensures workspace links are created in Docker)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install

# Generate Prisma client
RUN pnpm --filter @go-watchtower/database exec prisma generate

# Build packages in dependency order
RUN pnpm --filter @go-watchtower/database build
RUN pnpm --filter @go-watchtower/backend build

# Production stage
FROM node:25-alpine AS runner

# Install pnpm (corepack removed in Node 25)
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace configuration and package sources
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/backend/package.json ./packages/backend/

# Install production dependencies only
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod

# Install prisma CLI globally (needed for generate and migrate deploy)
RUN npm install -g prisma@7.4.1

# Copy Prisma schema, migrations and config
COPY packages/database/prisma ./packages/database/prisma
COPY packages/database/prisma.config.ts ./packages/database/

# Generate Prisma client — NODE_PATH lets the config resolve prisma/config from global install
RUN cd packages/database && NODE_PATH=/usr/local/lib/node_modules prisma generate

# Copy built files from builder
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist

# Download AWS RDS CA bundle (required for TLS verification against Aurora)
RUN mkdir -p /usr/local/share/ca-certificates && \
    wget -O /usr/local/share/ca-certificates/rds-ca-bundle.pem \
    https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/rds-ca-bundle.pem

# Copy entrypoint
COPY packages/backend/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set working directory to API
WORKDIR /app/packages/backend

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 fastify
USER fastify

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Run migrations then start
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/index.js"]
