# ==============================================================================
# Multi-stage production build for Unified Config Diff & Merge Editor
# Stage 1: Build static assets using Node Alpine Linux (latest)
# Stage 2: Serve high-performance HTTP on port 80 via Nginx Alpine Linux (latest)
#          (Upstream reverse proxy terminates TLS/HTTPS certificates)
# ==============================================================================

# -----------------------------
# Stage 1: Builder
# -----------------------------
FROM node:alpine AS builder

WORKDIR /app

# Copy package manifests first to optimize Docker layer caching
COPY package.json package-lock.json* ./

# Install project dependencies
RUN npm install

# Copy application source code and configuration
COPY . .

# Compile TypeScript and bundle production distribution
RUN npm run build

# -----------------------------
# Stage 2: Runtime Web Server
# -----------------------------
FROM nginx:alpine AS runner

# Remove default boilerplate configuration
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy custom Nginx configuration with SPA fallback, gzip, security headers, and healthcheck
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled SPA production assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port 80
EXPOSE 80

# Container healthcheck against /healthz endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/healthz || exit 1

# Start Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
