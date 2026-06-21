# ---- Stage 1: build the React/Vite frontend -> /app/frontend/dist ----
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
# Install against the lockfile first so this layer caches until deps change.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: install production-only backend dependencies ----
FROM node:22-slim AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 3: runtime image ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app/backend

# Backend source + the production node_modules built in stage 2.
COPY backend/package.json backend/server.js ./
COPY backend/src ./src
COPY --from=backend-deps /app/backend/node_modules ./node_modules

# Drop the built SPA where Express serves it from:
# httpApp.js -> path.join(__dirname, '..', 'public') == /app/backend/public
COPY --from=frontend-build /app/frontend/dist ./public

# Run unprivileged using the non-root user the node image already provides.
# The app holds all state in memory and never writes to disk, so no chown.
USER node

EXPOSE 3000

CMD ["node", "server.js"]
