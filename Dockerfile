# ─── 1- Builder stage ─────────────────────────────────────
FROM public.ecr.aws/docker/library/node:20-slim AS builder

WORKDIR /app
COPY package*.json ./

# install ALL deps so nest-cli exists
RUN npm ci

COPY . .
RUN npm run build        # generates /app/dist
RUN npm prune --omit=dev # strip dev-deps AFTER the build

# ─── 2- Runtime stage ─────────────────────────────────────
FROM gcr.io/distroless/nodejs20-debian11

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["dist/src/main.js"]
