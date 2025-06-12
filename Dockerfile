# Dockerfile for Bun + TypeScript backend
FROM oven/bun

WORKDIR /app
COPY . .
RUN bun install

CMD ["bun", "index.ts"]
