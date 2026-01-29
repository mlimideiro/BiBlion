# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application (Vite + TypeScript)
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Create the data directory
RUN mkdir -p db_biblion/covers

# Expose the server port
EXPOSE 3000

# Set environment variable to production
ENV NODE_ENV=production

# Run the standalone server
CMD ["node", "dist/main/standalone.js"]
