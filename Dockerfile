# Build frontend 
FROM node:20-alpine AS frontend-build 
WORKDIR /app/frontend 
COPY frontend/package*.json ./ 
RUN npm ci 
COPY frontend/ ./ 
RUN npm run build 
 
# Production image 
FROM node:20-alpine 
WORKDIR /app 
 
# Install backend dependencies 
COPY backend/package*.json ./ 
RUN npm ci --only=production 
 
# Copy backend source 
COPY backend/src/ ./src/ 
 
# Copy built frontend 
COPY --from=frontend-build /app/frontend/dist ./public 
 
# Create uploads directory 
RUN mkdir -p uploads 
 
EXPOSE 3001 
 
ENV NODE_ENV=production 
ENV PORT=3001 
 
CMD ["node", "src/index.js"] 
