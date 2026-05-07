# syntax=docker/dockerfile:1.7

# ---- builder: install all deps, compile TypeScript ----
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY scripts/ scripts/
COPY src/ src/
RUN npm run build

# ---- runtime: prod deps + built output + skills only ----
FROM node:24-alpine AS runtime
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY skills/ ./skills/

# logger writes to /app/.logs at startup (see src/factories/logger.factory.ts);
# pre-create it with node ownership so the unprivileged USER can write
RUN mkdir -p /app/.logs && chown -R node:node /app/.logs

LABEL org.opencontainers.image.title="P4 Plan MCP Server" \
      org.opencontainers.image.description="MCP server for P4 Plan project management" \
      org.opencontainers.image.source="https://github.com/perforce/p4plan-mcp" \
      org.opencontainers.image.url="https://github.com/perforce/p4plan-mcp" \
      org.opencontainers.image.documentation="https://github.com/perforce/p4plan-mcp#readme" \
      org.opencontainers.image.vendor="Perforce Software, Inc." \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    LOG_LEVEL=info

USER node
ENTRYPOINT ["node", "dist/main.js"]
