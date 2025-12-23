# Fortress Backup Manager

## Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy server code
COPY server ./server
COPY tsconfig.json ./

# Create data directory for SQLite
RUN mkdir -p /app/data

# Environment
ENV NODE_ENV=production
ENV DB_TYPE=sqlite
ENV SQLITE_PATH=/app/data/fortress.db
ENV PORT=9001

EXPOSE 9001

# Run server
CMD ["npx", "tsx", "server/index.ts"]
