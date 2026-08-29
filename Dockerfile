# Dockerfile độc lập cho Cart Service; build context là thư mục submodule này.
# Image không chứa source hoặc dev dependency không cần thiết trong production runtime.

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json tsconfig.docker.json ./
COPY src ./src

RUN npm install
RUN npx tsc -p tsconfig.docker.json

FROM node:20-alpine AS production

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 3003

USER nestjs

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3003/api/health || exit 1

CMD ["node", "--max-old-space-size=128", "dist/main.js"]
