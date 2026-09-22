# Cart Service dùng build context là root repository để dùng lockfile và cấu hình
# TypeScript chung của monorepo. Dockerfile chỉ copy package/source cần thiết của
# Cart, nên các service khác không bị đưa vào image.

# -----------------------------------------------------------------------------
# Giai đoạn build: cài đủ dependency để biên dịch TypeScript.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Lockfile root giúp dependency được cài nhất quán với workspace.
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/cart-service/package.json services/cart-service/tsconfig.json services/cart-service/nest-cli.json ./services/cart-service/
COPY packages/common ./packages/common
RUN npm ci --workspace=services/cart-service --include=dev --ignore-scripts

# Chỉ đưa source của Cart vào image build.
COPY services/cart-service/src ./services/cart-service/src

# tsconfig.json dùng rootDir của monorepo nên output nằm dưới
# services/cart-service/dist/services/cart-service/src.
RUN npx tsc -p services/cart-service/tsconfig.json

# Build đã xong nên loại dev dependency ngay trong builder; runtime chỉ nhận
# phần node_modules production đã được kiểm tra và không cần package manifest.
RUN npm prune --omit=dev

# -----------------------------------------------------------------------------
# Giai đoạn runtime: chỉ giữ dependency production và JavaScript đã biên dịch.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Update Alpine packages so the runtime receives current security fixes.
RUN apk upgrade --no-cache

# Service không cần quyền root khi lắng nghe HTTP hoặc kết nối PostgreSQL.
# npm/npx chỉ cần ở builder để cài dependency; runtime chỉ chạy bằng node.
# Xóa npm trước khi tạo user để final image không chứa tooling không cần thiết.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  && addgroup -g 1001 -S nodejs \
  && adduser -S nestjs -u 1001

WORKDIR /app

# Chỉ copy dependency production đã prune và artifact JavaScript từ builder.
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/services/cart-service/dist/services/cart-service/src ./dist
COPY --from=builder /app/services/cart-service/dist/packages/common ./dist/packages/common

# PORT mặc định dành cho container Compose. Khi chạy local độc lập, .env có thể
# đặt PORT=3010; healthcheck bên dưới sẽ tự dùng giá trị runtime đó.
ENV NODE_ENV=production \
  PORT=3003 \
  NODE_OPTIONS=--max-old-space-size=128

EXPOSE 3003

# Cart bật URI versioning nên health dùng route v1 để khớp với endpoint thực tế.
# Dùng shell form để ${PORT} được mở rộng nếu Compose hoặc Kubernetes override.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/api/v1/health" > /dev/null || exit 1

USER nestjs

# Chạy Node trực tiếp để nhận SIGTERM đúng cách khi container dừng hoặc rollout.
CMD ["node", "dist/main.js"]
