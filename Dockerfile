FROM node:20-slim

WORKDIR /app

# Install build tools for better-sqlite3
RUN apt-get update && install -y python3 make g++ sqlite3 && rm -rf /var/lib/apt/lists/*

# Install dependencies for both frontend and backend
COPY workspace/backendpackage*.json ./backend/
COPY workspace/frontend/package*.json ./frontend/

RUN cd backend && npm install --production
RUN cd frontend && npm install

# Copy source code
COPY workspace/backend/src ./backend
COPY workspace/frontend ./front

# Build frontend
RUN cd frontend && npx tsc && npx vite build

# Move built frontend to backend/public
RUN mkdir -p && cpr frontend/dist/* backend/public/

WORKDIR /app/backend

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "src/index.js"]
