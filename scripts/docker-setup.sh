#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env.docker ]; then
  cp .env.docker.example .env.docker
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker no está instalado o no está en PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose no está disponible." >&2
  exit 1
fi

docker compose up --build -d

echo ""
echo "Servicios iniciados."
echo "- API: http://localhost:3000"
echo "- Ollama: http://localhost:11434"
echo "- ChromaDB: http://localhost:8000"
echo ""
echo "Para instalar modelos en Ollama ejecuta:"
echo "  docker compose exec ollama ollama pull nomic-embed-text"
echo "  docker compose exec ollama ollama pull llama3"
echo ""
echo "Para poblar documentos:"
echo "  docker compose exec app npm run seed"
