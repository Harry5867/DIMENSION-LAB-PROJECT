FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY packages/algorithms/package.json ./packages/algorithms/
COPY packages/contracts/package.json ./packages/contracts/
RUN npm ci --include=dev

COPY tsconfig.json vite.config.ts tailwind.config.js ./
COPY backend ./backend
COPY frontend ./frontend
COPY packages ./packages
COPY public ./public
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production LAB_BIND_HOST=0.0.0.0 PORT=5000

# The backend starts from TypeScript and uses tsx at runtime.
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend ./backend
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 5000
CMD ["node", "--import", "tsx", "backend/src/index.ts"]
