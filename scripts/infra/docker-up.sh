#!/bin/bash
# Start Docker test infrastructure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Starting Docker test infrastructure..."

# Check if docker-compose exists
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "docker-compose not found. Please install Docker Compose."
    exit 1
fi

# Use docker compose v2 if available, fallback to docker-compose
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

cd "$PROJECT_ROOT"

# Start only Redis for testing
$COMPOSE_CMD -f docker-compose.yml up -d redis

# Wait for Redis to be ready
echo "Waiting for Redis to be ready..."
for i in {1..30}; do
    if docker exec talksy-redis redis-cli ping 2>/dev/null | grep -q PONG; then
        echo "Redis is ready"
        break
    fi
    sleep 1
done

echo ""
echo "Docker infrastructure started:"
echo "  Redis: localhost:6379"
echo ""
