FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY scripts/ scripts/
COPY src/ src/
COPY skills/ skills/

RUN npm run build

ENV P4PLAN_API_URL=http://host.docker.internal:4000
ENV LOG_LEVEL=debug
ENV SEARCH_LIMIT=400

CMD ["node", "dist/main.js"]