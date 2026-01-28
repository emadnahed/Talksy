#!/bin/bash
# Start Docker test infrastructure (MongoDB + Redis)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Starting Docker test infrastructure..."

# Check if Docker daemon is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        echo -e "${RED}Error: Docker daemon is not running.${NC}"
        echo ""
        echo "Please start Docker Desktop or the Docker daemon:"
        echo "  - macOS: Open Docker Desktop application"
        echo "  - Linux: sudo systemctl start docker"
        echo ""
        return 1
    fi
    return 0
}

if ! check_docker; then
    exit 1
fi

# Check if docker-compose exists
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}docker-compose not found. Please install Docker Compose.${NC}"
    exit 1
fi

# Use docker compose v2 if available, fallback to docker-compose
if docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

cd "$PROJECT_ROOT"

# Start MongoDB and Redis for testing
echo "Starting MongoDB and Redis..."
$COMPOSE_CMD -f docker-compose.yml up -d mongodb redis

# Wait for MongoDB to be ready
echo "Waiting for MongoDB to be ready..."
for i in {1..30}; do
    if docker exec talksy-mongodb mongosh --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
        echo -e "${GREEN}MongoDB is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}MongoDB health check timed out, but continuing...${NC}"
    fi
    sleep 1
done

# Wait for Redis to be ready
echo "Waiting for Redis to be ready..."
for i in {1..30}; do
    if docker exec talksy-redis redis-cli ping 2>/dev/null | grep -q PONG; then
        echo -e "${GREEN}Redis is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}Redis health check timed out, but continuing...${NC}"
    fi
    sleep 1
done

echo ""
echo -e "${GREEN}Docker infrastructure started:${NC}"
echo "  MongoDB: localhost:27017"
echo "  Redis:   localhost:6379"
echo ""
