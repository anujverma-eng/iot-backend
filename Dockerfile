# ─── 1- Build stage ─────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev         # installs prod deps only
COPY . .
RUN npm run build             # creates dist/

# ─── 2- Runtime stage (tiny) ────────────────────────────────
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
