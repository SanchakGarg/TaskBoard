# ---------- build the frontend ----------
FROM oven/bun:1.3-slim AS client-build
WORKDIR /app
COPY client/package.json client/bun.lock ./client/
RUN cd client && bun install --frozen-lockfile
COPY client ./client
RUN cd client && bun run build

# ---------- runtime ----------
FROM oven/bun:1.3-slim
WORKDIR /app

COPY server/package.json server/bun.lock ./server/
RUN cd server && bun install --production --no-save

COPY server/src ./server/src
COPY --from=client-build /app/client/dist ./client/dist

# non-root user
RUN useradd -r -u 10001 taskboard \
    && chown -R taskboard /app
USER taskboard

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

WORKDIR /app/server
CMD ["bun", "src/index.ts"]
