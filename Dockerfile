FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ sqlite3 && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN cd backend && npm install --production
RUN cd frontend && npm install

COPY backend/src ./backend/src
COPY frontend ./frontend

RUN cd frontend npx vite build

RUN mkdir -p backend/public && cp -r frontend/dist/* backend/public/

WORKDIR /app/backend

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "src/index.js"]
