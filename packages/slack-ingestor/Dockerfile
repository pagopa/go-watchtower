FROM public.ecr.aws/lambda/nodejs:22-arm64@sha256:99e6da421cc14226185d29391c977aa82de08f192cc74fe7da26b38c324aa03a AS builder

# Install pnpm
RUN npm install -g pnpm@latest

WORKDIR /build

# Copy manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json         ./packages/shared/
COPY packages/database/package.json       ./packages/database/
COPY packages/slack-ingestor/package.json ./packages/slack-ingestor/

# Install all workspace dependencies
RUN pnpm install --no-frozen-lockfile

# Copy source
COPY packages/shared/        ./packages/shared/
COPY packages/database/      ./packages/database/
COPY packages/slack-ingestor/ ./packages/slack-ingestor/

# Build: shared -> database -> slack-ingestor
RUN pnpm --filter @go-watchtower/shared build
RUN pnpm --filter @go-watchtower/database build
RUN pnpm --filter @go-watchtower/slack-ingestor build

# Create a standalone deploy with flat node_modules (no pnpm symlinks)
RUN pnpm --filter @go-watchtower/slack-ingestor deploy /deploy --prod --legacy

# --- Runtime image ---
FROM public.ecr.aws/lambda/nodejs:22-arm64@sha256:99e6da421cc14226185d29391c977aa82de08f192cc74fe7da26b38c324aa03a

WORKDIR ${LAMBDA_TASK_ROOT}

# Enable ESM
RUN echo '{"type":"module"}' > package.json

# Copy deployed output (flat node_modules, no symlinks)
COPY --from=builder /deploy/node_modules/ ./node_modules/
COPY --from=builder /build/packages/slack-ingestor/dist/ ./

# Lambda handler: handler.js exports `handler`
CMD ["handler.handler"]
