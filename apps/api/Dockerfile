# Build context = monorepo root.
FROM oven/bun:1.3.9-slim AS deps
WORKDIR /app
# Copy all workspace manifests first for layer-cached installs.
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/ui/package.json ./packages/ui/
COPY packages/config/package.json ./packages/config/
RUN bun install --frozen-lockfile

# Dev target — source bind-mounted at runtime; runs the hot-reloading API.
FROM oven/bun:1.3.9-slim AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app ./
COPY . .
EXPOSE 4000
CMD ["sh", "-c", "bun packages/db/src/migrate.ts && bun run --cwd apps/api dev"]

FROM oven/bun:1.3.9-slim AS release
WORKDIR /app
ENV NODE_ENV=production
# Copy the whole installed tree so workspace-local node_modules are present too.
COPY --from=deps /app ./
COPY . .
EXPOSE 4000
# Apply migrations, then start the API.
CMD ["sh", "-c", "bun packages/db/src/migrate.ts && bun apps/api/src/index.ts"]
