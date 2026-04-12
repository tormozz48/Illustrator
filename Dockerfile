# ---- Base ----
FROM node:22-alpine AS base
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
RUN npm ci

# ---- Build Backend ----
FROM deps AS build-backend
COPY tsconfig.json tsconfig.api.json tsconfig.worker.json nest-cli.json ./
COPY src/ ./src/
RUN npx nest build api && npx nest build worker

# ---- Build Frontend ----
FROM deps AS build-frontend
COPY apps/web/ ./apps/web/
RUN npm run build --workspace=apps/web

# ---- API Runtime ----
FROM base AS api
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build-backend /app/dist ./dist
COPY --from=build-frontend /app/apps/web/dist ./public
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/api/main.js"]

# ---- Worker Runtime ----
FROM base AS worker
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build-backend /app/dist ./dist
COPY package.json ./
CMD ["node", "dist/worker/main.js"]
