#!/bin/bash
# Stop Docker test infrastructure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Stopping Docker test infrastructure..."

# Check if Docker daemon is running
if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon not running, nothing to stop"
    exit 0
fi

# Use docker compose v2 if available, fallback to docker-compose
if docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

cd "$PROJECT_ROOT"

$COMPOSE_CMD -f docker-compose.yml down 2>/dev/null || true

echo "Docker infrastructure stopped"
