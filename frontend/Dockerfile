FROM oven/bun:1
WORKDIR /app
COPY . .
RUN bun install
RUN bun run --filter @quickbite/frontend build
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD bun -e "fetch('http://localhost:3005/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bun", "run", "frontend/serve.ts"]
