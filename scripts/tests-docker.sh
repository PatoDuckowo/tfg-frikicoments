#!/usr/bin/env bash
# Ejecuta los tests dentro de Docker contra la MySQL de pruebas (nunca contra producción).
# Necesita el contenedor tfg-db-prueba y ~/tfg-prueba/db.env con sus credenciales.
set -euo pipefail
set -a; . ~/tfg-prueba/db.env; set +a
cd "$(dirname "$0")/.."
docker run --rm --network tfg-prueba -v "$PWD":/app:ro -w /app \
  -e DB_HOST=tfg-db-prueba -e DB_PORT=3306 -e DB_USER="$MYSQL_USER" -e DB_PASSWORD="$MYSQL_PASSWORD" -e DB_NAME=frikicoments_tests \
  node:20-alpine npm test --silent
