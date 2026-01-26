#!/bin/bash
# Stop Docker test infrastructure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Stopping Docker test infrastructure..."

# Use docker compose v2 if available, fallback to docker-compose
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

cd "$PROJECT_ROOT"

$COMPOSE_CMD -f docker-compose.yml down

echo "Docker infrastructure stopped"
