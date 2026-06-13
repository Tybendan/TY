FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npx vite build

FROM node:20-slim
WORKDIR /app

RUN apt-get update && install -y python3 make g++ sqlite && rmrf /var/lib/apt/lists/*

COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

COPY backend/src ./backend/src

COPY --from=frontend-builder /app/dist ./backend/public

WORKDIR /app/backend

EXPOSE 3001

CMD ["node", "src/index.js"]
