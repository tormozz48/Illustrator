# Illustrator

AI-powered book illustration pipeline. Upload a `.txt` book, and the system will analyze it, split it into chapters, generate character portraits, prepare scenes, and create AI illustrations using Google Gemini.

## Stack

- **Backend:** NestJS (API + Worker, two entry points)
- **Database:** PostgreSQL 16 + Sequelize ORM
- **Queue:** Redis 7 + BullMQ
- **Storage:** MinIO (S3-compatible)
- **Frontend:** React + Vite + Material UI
- **AI:** Google Gemini 2.5 Flash (text + image)
- **Infra:** Docker + docker-compose

## Quick Start

```bash
# 1. Copy environment variables
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 2. Start all services
docker-compose up -d

# 3. Run database migrations
npm run db:migrate

# 4. Open the app
open http://localhost:3000
```

## Development

```bash
# Install dependencies
npm install

# Start infrastructure (postgres, redis, minio)
docker-compose up postgres redis minio -d

# Run API in watch mode
npm run start:api:dev

# Run Worker in watch mode
npm run start:worker:dev

# Run frontend dev server (port 5173, proxies to API)
cd apps/web && npm run dev
```

## Project Structure

```
src/
  api/          # NestJS HTTP server + WebSocket gateway
  worker/       # NestJS standalone app (BullMQ processors)
  common/       # Shared modules (database, queue, storage, AI, config)
  prompts/      # LLM prompt templates
apps/
  web/          # React + Vite + MUI frontend
docs/           # Architecture and migration docs
```

See [docs/architecture.md](docs/architecture.md) for full details.
