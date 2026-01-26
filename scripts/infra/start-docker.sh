#!/bin/bash
# Start the complete Talksy stack in Docker
# Usage: ./scripts/infra/start-docker.sh [dev|test|prod]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Environment (default: dev)
ENV=${1:-dev}

# Validate environment
case $ENV in
    dev|development)
        COMPOSE_FILE="$PROJECT_ROOT/docker/docker-compose.dev.yml"
        ENV_NAME="Development"
        API_PORT=3000
        ;;
    test)
        COMPOSE_FILE="$PROJECT_ROOT/docker/docker-compose.test.yml"
        ENV_NAME="Test"
        API_PORT=3001
        ;;
    prod|production)
        COMPOSE_FILE="$PROJECT_ROOT/docker/docker-compose.prod.yml"
        ENV_NAME="Production"
        API_PORT=3000
        ;;
    *)
        echo -e "${RED}Unknown environment: $ENV${NC}"
        echo "Usage: $0 [dev|test|prod]"
        exit 1
        ;;
esac

# Check if compose file exists
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}Compose file not found: $COMPOSE_FILE${NC}"
    exit 1
fi

# Use docker compose v2 if available
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Talksy Docker Stack - $ENV_NAME                        ${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_ROOT"

# Step 1: Build images
echo -e "${YELLOW}► Building Docker images...${NC}"
$COMPOSE_CMD -f "$COMPOSE_FILE" build
echo -e "${GREEN}  Images built${NC}"

# Step 2: Start containers
echo -e "${YELLOW}► Starting containers...${NC}"
$COMPOSE_CMD -f "$COMPOSE_FILE" up -d

# Step 3: Wait for services to be healthy
echo -e "${YELLOW}► Waiting for services to be ready...${NC}"

# Wait for Redis
echo "  Waiting for Redis..."
for i in {1..30}; do
    if $COMPOSE_CMD -f "$COMPOSE_FILE" exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
        echo -e "${GREEN}  Redis is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}  Redis failed to start${NC}"
        exit 1
    fi
    sleep 1
done

# Wait for API
echo "  Waiting for API server..."
for i in {1..60}; do
    if curl -s "http://localhost:$API_PORT/health" 2>/dev/null | grep -q "ok"; then
        echo -e "${GREEN}  API server is ready${NC}"
        break
    fi
    if [ $i -eq 60 ]; then
        echo -e "${RED}  API server failed to start${NC}"
        $COMPOSE_CMD -f "$COMPOSE_FILE" logs app
        exit 1
    fi
    sleep 1
done

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Talksy Docker Stack Started!                        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Environment: $ENV_NAME"
echo "  API:         http://localhost:$API_PORT"
echo "  WebSocket:   ws://localhost:$API_PORT"
echo "  Health:      http://localhost:$API_PORT/health"
echo ""
echo "  View logs:   npm run docker:logs:$ENV"
echo "  Stop:        npm run stop:docker:$ENV"
echo ""
