# ── Stage 1: Build React frontend ──────────────────────────────────────────
FROM node:20-alpine AS client-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN NODE_ENV=development npm install

COPY client/ ./
RUN npm run build

# ── Stage 2: Production server ──────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Copy the built React app from the builder stage
COPY --from=client-builder /app/client/dist ./client/dist

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/admin/maintenance/status', (res) => { if (res.statusCode < 200 || res.statusCode >= 400) process.exit(1); process.exit(0); }).on('error', () => process.exit(1));"

CMD ["npm", "start"]
