# Multi-stage Docker build for Red Rabbit Orders Microservice
# Target: Alpine Linux, <100MB final image size

# ===========================
# Stage 1: Dependencies & Build
# ===========================
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --only=production=false --silent

# Copy source code
COPY src/ ./src/
COPY config/ ./config/
COPY scripts/ ./scripts/

# Build TypeScript to JavaScript
RUN npm run build

# Remove devDependencies to reduce size
RUN npm prune --production

# ===========================
# Stage 2: Production Runtime
# ===========================
FROM node:18-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S microservice -u 1001

# Set working directory
WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache \
    ca-certificates \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Copy built application from builder stage
COPY --from=builder --chown=microservice:nodejs /app/dist ./dist
COPY --from=builder --chown=microservice:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=microservice:nodejs /app/package*.json ./

# Copy database migrations and scripts
COPY --chown=microservice:nodejs scripts/migrations ./scripts/migrations
COPY --chown=microservice:nodejs scripts/setup-database.ts ./scripts/
COPY --chown=microservice:nodejs scripts/migration-runner.ts ./scripts/

# Create directories for logs and temp files
RUN mkdir -p /app/logs /app/tmp && \
    chown -R microservice:nodejs /app/logs /app/tmp

# Switch to non-root user
USER microservice

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1) \
    }).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/server.js"]

# ===========================
# Labels for metadata
# ===========================
LABEL maintainer="Red Rabbit Team <team@redrabbit.dev>"
LABEL description="Red Rabbit Orders Microservice"
LABEL version="1.0.0"
LABEL org.opencontainers.image.title="redrabbit-orders"
LABEL org.opencontainers.image.description="TypeScript microservice for order management"
LABEL org.opencontainers.image.vendor="Red Rabbit"
LABEL org.opencontainers.image.licenses="MIT"

# ===========================
# Development Stage (Optional)
# ===========================
FROM node:18-alpine AS development

WORKDIR /app

# Install development dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json tsconfig.json ./

# Install all dependencies including dev dependencies
RUN npm ci --silent

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S microservice -u 1001 && \
    chown -R microservice:nodejs /app

USER microservice

# Expose port and debugger port
EXPOSE 3000 9229

# Development command with hot reload
CMD ["npm", "run", "dev"]