FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root package.json and workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./

# Copy shared package
COPY packages/shared/package.json packages/shared/
COPY packages/shared packages/shared

# Copy worker package
COPY apps/worker/package.json apps/worker/
COPY apps/worker apps/worker

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared package
RUN pnpm --filter @illustrator/shared build

CMD ["pnpm", "--filter", "@illustrator/worker", "dev"]
