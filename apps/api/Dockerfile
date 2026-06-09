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

FROM oven/bun:1.3.9-slim AS release
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
# Apply migrations, then start the API.
CMD ["sh", "-c", "bun packages/db/src/migrate.ts && bun apps/api/src/index.ts"]
