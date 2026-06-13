# ---------- build the frontend ----------
FROM oven/bun:1.3-slim AS client-build
WORKDIR /app
# Copy workspace root + all package.json files so bun can resolve the workspace
COPY package.json bun.lock ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN bun install --frozen-lockfile
COPY client ./client
RUN bun --cwd client build

# ---------- runtime ----------
FROM oven/bun:1.3-slim
WORKDIR /app

# Same workspace context needed for bun install to resolve correctly
COPY package.json bun.lock ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN bun install --frozen-lockfile --production

COPY server/src ./server/src
COPY --from=client-build /app/client/dist ./client/dist

# non-root user; data dir owned by it for the SQLite volume
RUN useradd -r -u 10001 taskboard \
    && mkdir -p /data \
    && chown -R taskboard /data /app
USER taskboard

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/taskboard.db

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

WORKDIR /app/server
CMD ["bun", "src/index.ts"]
