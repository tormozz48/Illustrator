# Docker Compose & Environment Configuration

> **Source:** [`technical-specification.md`](technical-specification.md)  
> **Location:** Root `docker-compose.yml` and `apps/*/src/env.ts`

---

## Docker Compose

### Full Stack Configuration

```yaml
# docker-compose.yml

version: '3.8'

services:
  # ============================================
  # INFRASTRUCTURE
  # ============================================
  
  postgres:
    image: postgres:16-alpine
    container_name: illustrator-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: illustrator
      POSTGRES_PASSWORD: illustrator_dev_password
      POSTGRES_DB: illustrator
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U illustrator"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: illustrator-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    container_name: illustrator-minio
    restart: unless-stopped
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    ports:
      - "9000:9000"   # API
      - "9001:9001"   # Console
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3

  # Create default bucket on startup
  minio-setup:
    image: minio/mc:latest
    container_name: illustrator-minio-setup
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 minioadmin minioadmin123;
      mc mb local/illustrator-dev --ignore-existing;
      mc anonymous set public local/illustrator-dev;
      exit 0;
      "

  # ============================================
  # APPLICATION SERVICES
  # ============================================

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: illustrator-api
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      PORT: 3000
      DATABASE_URL: postgresql://illustrator:illustrator_dev_password@postgres:5432/illustrator
      REDIS_URL: redis://redis:6379
      R2_ENDPOINT: http://minio:9000
      R2_ACCESS_KEY_ID: minioadmin
      R2_SECRET_ACCESS_KEY: minioadmin123
      R2_BUCKET_NAME: illustrator-dev
      CORS_ORIGIN: http://localhost:5173
      LOG_LEVEL: debug
      # Clerk keys - replace with your dev keys
      CLERK_SECRET_KEY: ${CLERK_SECRET_KEY:-sk_test_placeholder}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    volumes:
      # Mount source for hot reload in dev
      - ./apps/api/src:/app/apps/api/src:ro
      - ./packages/shared/src:/app/packages/shared/src:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    container_name: illustrator-worker
    restart: unless-stopped
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://illustrator:illustrator_dev_password@postgres:5432/illustrator
      REDIS_URL: redis://redis:6379
      R2_ENDPOINT: http://minio:9000
      R2_ACCESS_KEY_ID: minioadmin
      R2_SECRET_ACCESS_KEY: minioadmin123
      R2_BUCKET_NAME: illustrator-dev
      LOG_LEVEL: debug
      # AI API keys - replace with your keys
      GROQ_API_KEY: ${GROQ_API_KEY:-gsk_placeholder}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    volumes:
      - ./apps/worker/src:/app/apps/worker/src:ro
      - ./packages/shared/src:/app/packages/shared/src:ro

volumes:
  postgres_data:
  redis_data:
  minio_data:

networks:
  default:
    name: illustrator-network
```

---

### Service Dockerfiles

#### API Dockerfile

```dockerfile
# apps/api/Dockerfile

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm --filter @illustrator/api build

# Production
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=deps /app/node_modules ./node_modules
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

#### Worker Dockerfile

```dockerfile
# apps/worker/Dockerfile

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm --filter @illustrator/worker build

# Production
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=deps /app/node_modules ./node_modules
WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
```

---

## Environment Variables

### Variable Reference

| Variable | App | Required | Default | Description |
|----------|-----|----------|---------|-------------|
| `NODE_ENV` | all | ✅ | — | `development` or `production` |
| `PORT` | api | ❌ | `3000` | API server port |
| `DATABASE_URL` | api, worker | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | api, worker | ✅ | — | Redis connection string |
| `CLERK_SECRET_KEY` | api | ✅ | — | Clerk backend secret key |
| `CLERK_PUBLISHABLE_KEY` | api | ❌ | — | For SSR (not used in SPA) |
| `VITE_CLERK_PUBLISHABLE_KEY` | web | ✅ | — | Clerk frontend publishable key |
| `VITE_API_URL` | web | ✅ | — | API base URL |
| `R2_ENDPOINT` | api, worker | ✅ | — | Cloudflare R2 / MinIO endpoint |
| `R2_ACCESS_KEY_ID` | api, worker | ✅ | — | S3 access key |
| `R2_SECRET_ACCESS_KEY` | api, worker | ✅ | — | S3 secret key |
| `R2_BUCKET_NAME` | api, worker | ✅ | — | S3 bucket name |
| `GROQ_API_KEY` | worker | ✅ | — | Groq API key for LLM calls |
| `CORS_ORIGIN` | api | ✅ | — | Allowed CORS origin |
| `LOG_LEVEL` | api, worker | ❌ | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |

---

### Environment Validation with @t3-oss/env-core

#### API Environment

```typescript
// apps/api/src/env.ts

import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'production', 'test']),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    CLERK_SECRET_KEY: z.string().min(1),
    R2_ENDPOINT: z.string().url(),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
    CORS_ORIGIN: z.string().url(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
```

#### Worker Environment

```typescript
// apps/worker/src/env.ts

import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'production', 'test']),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    R2_ENDPOINT: z.string().url(),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
    GROQ_API_KEY: z.string().min(1),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
```

#### Web Environment (Vite Client)

```typescript
// apps/web/src/env.ts

import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  clientPrefix: 'VITE_',
  client: {
    VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    VITE_API_URL: z.string().url(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
```

---

### Example .env Files

#### `.env.development` (git-ignored, local dev)

```bash
# .env.development

# Node
NODE_ENV=development

# Database (Docker)
DATABASE_URL=postgresql://illustrator:illustrator_dev_password@localhost:5432/illustrator

# Redis (Docker)
REDIS_URL=redis://localhost:6379

# MinIO (Docker, S3-compatible)
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin123
R2_BUCKET_NAME=illustrator-dev

# Clerk (get from dashboard.clerk.com)
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxx
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx

# API
PORT=3000
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=debug

# Frontend
VITE_API_URL=http://localhost:3000

# AI Services (get from console.groq.com)
GROQ_API_KEY=gsk_xxxxxxxxxxxxx
```

#### `.env.production.example` (template for production)

```bash
# .env.production.example

# Node
NODE_ENV=production

# Database (Supabase)
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# Redis (managed service)
REDIS_URL=redis://:[password]@[host]:6379

# Cloudflare R2
R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=xxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxx
R2_BUCKET_NAME=illustrator-prod

# Clerk
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxxx
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxx

# API
PORT=3000
CORS_ORIGIN=https://illustrator.yourdomain.com
LOG_LEVEL=info

# Frontend
VITE_API_URL=https://api.illustrator.yourdomain.com

# AI Services
GROQ_API_KEY=gsk_xxxxxxxxxxxxx
```

---

## Development Commands

### Start Full Stack

```bash
# Start infrastructure (Postgres, Redis, MinIO)
docker-compose up -d postgres redis minio minio-setup

# Run API in watch mode (outside Docker for faster iteration)
cd apps/api && pnpm dev

# Run Worker in watch mode
cd apps/worker && pnpm dev

# Run Frontend in watch mode
cd apps/web && pnpm dev
```

### Or Start Everything in Docker

```bash
# Build and start all services
docker-compose up --build

# Frontend still runs outside for HMR:
cd apps/web && pnpm dev
```

### Database Operations

```bash
# Generate migration
pnpm --filter @illustrator/shared db:generate

# Push schema to database
pnpm --filter @illustrator/shared db:push

# Open Drizzle Studio (database viewer)
pnpm --filter @illustrator/shared db:studio
```

### Useful Docker Commands

```bash
# View logs
docker-compose logs -f api
docker-compose logs -f worker

# Restart a service
docker-compose restart api

# Stop everything
docker-compose down

# Stop and remove volumes (fresh start)
docker-compose down -v

# Access Postgres CLI
docker-compose exec postgres psql -U illustrator -d illustrator

# Access Redis CLI
docker-compose exec redis redis-cli

# Access MinIO Console
open http://localhost:9001  # login: minioadmin / minioadmin123
```

---

## Health Checks

| Service | Endpoint | Expected Response |
|---------|----------|-------------------|
| API | `GET http://localhost:3000/health` | `{"status":"ok"}` |
| Postgres | `pg_isready` (internal) | Exit code 0 |
| Redis | `redis-cli ping` | `PONG` |
| MinIO | `GET http://localhost:9000/minio/health/live` | 200 OK |

---

## Port Mapping Summary

| Service | Container Port | Host Port (Dev) | Purpose |
|---------|---------------|-----------------|---------|
| API | 3000 | 3000 | Express + tRPC |
| Frontend | 5173 | 5173 | Vite dev server (outside Docker) |
| Postgres | 5432 | 5432 | Database |
| Redis | 6379 | 6379 | Queue + Cache |
| MinIO API | 9000 | 9000 | S3-compatible storage |
| MinIO Console | 9001 | 9001 | Web UI |
