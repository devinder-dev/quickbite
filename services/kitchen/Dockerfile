FROM oven/bun:1
WORKDIR /app
# Build from repo root context so the workspace + shared package resolve.
COPY . .
RUN bun install
CMD ["bun", "run", "services/kitchen/src/index.ts"]
