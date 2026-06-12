#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

echo "▶ Pull ultime modifiche da git..."
git pull --ff-only

echo "▶ Rebuild + restart container..."

docker compose up -d --build

echo "▶ Pulizia immagini orfane (solo dangling, NON tutte)..."

docker image prune -f

echo "▶ Stato container:"
docker compose ps

echo "✅ Deploy completato. Health:"
sleep 3
docker inspect --format='{{.State.Health.Status}}' spatialconverter 2>/dev/null || echo "(healthcheck in avvio)"
