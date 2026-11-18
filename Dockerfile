FROM node:24.11.1-alpine3.22 AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

COPY backend ./backend
COPY frontend ./frontend
RUN npm run build

FROM node:24.11.1-alpine3.22 AS runtime

ENV NODE_ENV=production \
    SOTOVOR_HOST=0.0.0.0 \
    SOTOVOR_PORT=3000

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/src ./backend/src
COPY --from=build /app/frontend/dist ./frontend/dist

EXPOSE 3000
USER node

CMD ["node", "backend/src/server.js"]
