#!/bin/bash
# Stop the Talksy Docker stack
# Usage: ./scripts/infra/stop-docker.sh [dev|test|prod|all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Environment (default: dev)
ENV=${1:-dev}

# Use docker compose v2 if available
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

cd "$PROJECT_ROOT"

stop_env() {
    local env=$1
    local compose_file

    case $env in
        dev|development)
            compose_file="$PROJECT_ROOT/docker/docker-compose.dev.yml"
            ;;
        test)
            compose_file="$PROJECT_ROOT/docker/docker-compose.test.yml"
            ;;
        prod|production)
            compose_file="$PROJECT_ROOT/docker/docker-compose.prod.yml"
            ;;
        *)
            return
            ;;
    esac

    if [ -f "$compose_file" ]; then
        echo -e "${YELLOW}Stopping $env stack...${NC}"
        $COMPOSE_CMD -f "$compose_file" down
        echo -e "${GREEN}$env stack stopped${NC}"
    fi
}

echo ""
echo -e "${YELLOW}Stopping Talksy Docker stack...${NC}"
echo ""

if [ "$ENV" = "all" ]; then
    stop_env "dev"
    stop_env "test"
    stop_env "prod"
else
    stop_env "$ENV"
fi

echo ""
echo -e "${GREEN}Docker stack stopped${NC}"
echo ""
