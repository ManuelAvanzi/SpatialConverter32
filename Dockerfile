# SpatialConverter — server Node/Express (viewer statico + API piattaforma).
# App JS pura (no build step, no dipendenze native): un solo stage basta.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund


COPY . .

RUN chown -R node:node /app
USER node

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3003/api/config >/dev/null 2>&1 || exit 1

CMD ["node", "server/index.js"]
