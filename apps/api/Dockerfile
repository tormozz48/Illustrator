FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root package.json and workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./

# Copy shared package
COPY packages/shared/package.json packages/shared/
COPY packages/shared packages/shared

# Copy API package
COPY apps/api/package.json apps/api/
COPY apps/api apps/api

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared package
RUN pnpm --filter @illustrator/shared build

EXPOSE 3000

CMD ["pnpm", "--filter", "@illustrator/api", "dev"]
