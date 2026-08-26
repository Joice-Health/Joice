# Build context = monorepo root.
FROM oven/bun:1.3.9-slim AS deps
WORKDIR /app
# Copy all workspace manifests first for layer-cached installs.
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/brain/package.json ./apps/brain/
COPY apps/web/package.json ./apps/web/
COPY packages/brain/package.json ./packages/brain/
COPY packages/core/package.json ./packages/core/
COPY packages/marketing/package.json ./packages/marketing/
COPY packages/db/package.json ./packages/db/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/
COPY packages/config/package.json ./packages/config/
RUN bun install --frozen-lockfile

# Dev target — source bind-mounted at runtime; runs the hot-reloading API.
FROM oven/bun:1.3.9-slim AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app ./
COPY . .
EXPOSE 4000
# No migrate step: compose runs the `migrate` service once, and both apps wait
# for it. Two services racing the same migration is what that avoids.
CMD ["bun", "run", "--cwd", "apps/api", "dev"]

FROM oven/bun:1.3.9-slim AS release
WORKDIR /app
ENV NODE_ENV=production
# Copy the whole installed tree so workspace-local node_modules are present too.
COPY --from=deps /app ./
COPY . .
# Which commit this image is. /health reports it, so you can tell at a glance
# whether a task is running the build you think it is. Last, so a new SHA
# doesn't invalidate any layer above it.
ARG BUILD_SHA=dev
ENV BUILD_SHA=$BUILD_SHA
EXPOSE 4000
# Migrations are a separate one-off task that CI runs to completion before
# either service is updated — see packages/db/src/migrate.ts.
CMD ["bun", "apps/api/src/index.ts"]
