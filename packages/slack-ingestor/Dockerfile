FROM public.ecr.aws/lambda/nodejs:22-arm64 AS builder

# Install pnpm
RUN npm install -g pnpm@10

WORKDIR /build

# Copy manifests
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json         ./packages/shared/
COPY packages/database/package.json       ./packages/database/
COPY packages/slack-ingestor/package.json ./packages/slack-ingestor/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/        ./packages/shared/
COPY packages/database/      ./packages/database/
COPY packages/slack-ingestor/ ./packages/slack-ingestor/

# Build: shared -> database -> slack-ingestor
RUN pnpm --filter @go-watchtower/shared build
RUN pnpm --filter @go-watchtower/database build
RUN pnpm --filter @go-watchtower/slack-ingestor build

# --- Runtime image ---
FROM public.ecr.aws/lambda/nodejs:22-arm64

WORKDIR ${LAMBDA_TASK_ROOT}

# Copy built artifacts and node_modules
COPY --from=builder /build/packages/slack-ingestor/dist/          ./
COPY --from=builder /build/packages/database/dist/                ./packages/database/dist/
COPY --from=builder /build/packages/database/generated/           ./packages/database/generated/
COPY --from=builder /build/packages/shared/dist/                  ./packages/shared/dist/
COPY --from=builder /build/node_modules/                          ./node_modules/
COPY --from=builder /build/packages/slack-ingestor/node_modules/  ./packages/slack-ingestor/node_modules/

# Lambda handler: handler.js exports `handler`
CMD ["handler.handler"]
