# SpatialConverter — server Node/Express (viewer statico + API piattaforma).
# App JS pura (no build step, no dipendenze native): un solo stage basta.
FROM node:20-alpine

# Cartella di lavoro dentro il container
WORKDIR /app

# Installa solo le dipendenze di produzione (riproducibile via package-lock.json).
# Copiamo prima i manifest per sfruttare la cache di layer di Docker:
# se il codice cambia ma le deps no, npm ci non viene rieseguito.
# --no-audit/--no-fund: build più pulita e veloce.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copia il codice dell'app (server + viewer statico + scripts/tools).
# Esclusioni in .dockerignore (node_modules, .git, GLB pesanti, content/...).
COPY . .

# Sicurezza: NON girare come root. node:alpine fornisce già l'utente "node".
# La cartella è di root dopo le COPY → la rendiamo leggibile, poi droppiamo i privilegi.
RUN chown -R node:node /app
USER node

# Il server ascolta su 3003 (process.env.PORT || 3003).
EXPOSE 3003

# Healthcheck: Docker sa se il server è vivo (non solo "processo presente").
# Riavvio automatico (restart policy) scatta se questo fallisce ripetutamente.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3003/api/config >/dev/null 2>&1 || exit 1

# Avvio: node server/index.js (vedi package.json "start").
CMD ["node", "server/index.js"]
