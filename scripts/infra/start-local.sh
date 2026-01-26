#!/bin/bash
# Start the complete Talksy stack locally (without Docker)
# Starts: Redis (optional) + API Server

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
API_PORT=${PORT:-3000}
REDIS_PORT=${REDIS_PORT:-6379}
USE_REDIS=${REDIS_ENABLED:-false}
PID_DIR="$PROJECT_ROOT/.pids"

mkdir -p "$PID_DIR"

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Talksy Local Stack Startup                          ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_ROOT"

# Step 1: Start Redis (if enabled)
if [ "$USE_REDIS" = "true" ]; then
    echo -e "${YELLOW}► Starting Redis...${NC}"
    if command -v redis-server &> /dev/null; then
        if ! nc -z localhost $REDIS_PORT 2>/dev/null; then
            redis-server --port $REDIS_PORT --daemonize yes --pidfile "$PID_DIR/redis.pid"
            sleep 1
            if redis-cli -p $REDIS_PORT ping 2>/dev/null | grep -q PONG; then
                echo -e "${GREEN}  Redis started on port $REDIS_PORT${NC}"
            else
                echo -e "${RED}  Failed to start Redis${NC}"
                exit 1
            fi
        else
            echo -e "${GREEN}  Redis already running on port $REDIS_PORT${NC}"
        fi
    else
        echo -e "${YELLOW}  Redis not installed, running without Redis${NC}"
        export REDIS_ENABLED=false
    fi
else
    echo -e "${YELLOW}► Redis disabled, using in-memory storage${NC}"
fi

# Step 2: Build if needed
echo -e "${YELLOW}► Checking build...${NC}"
if [ ! -d "$PROJECT_ROOT/dist" ] || [ "$PROJECT_ROOT/src" -nt "$PROJECT_ROOT/dist" ]; then
    echo "  Building application..."
    npm run build
fi
echo -e "${GREEN}  Build ready${NC}"

# Step 3: Start API Server
echo -e "${YELLOW}► Starting API Server...${NC}"

# Load environment
if [ -f "$PROJECT_ROOT/envs/.env.local" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/envs/.env.local" | xargs)
fi

# Start in background
npm run start:dev > "$PROJECT_ROOT/.logs/api.log" 2>&1 &
API_PID=$!
echo $API_PID > "$PID_DIR/api.pid"

# Wait for API to be ready
echo "  Waiting for API server..."
for i in {1..60}; do
    if curl -s "http://localhost:$API_PORT/health" 2>/dev/null | grep -q "ok"; then
        echo -e "${GREEN}  API server started on port $API_PORT (PID: $API_PID)${NC}"
        break
    fi
    if [ $i -eq 60 ]; then
        echo -e "${RED}  API server failed to start${NC}"
        cat "$PROJECT_ROOT/.logs/api.log"
        exit 1
    fi
    sleep 1
done

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Talksy Stack Started Successfully!                  ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  API:       http://localhost:$API_PORT"
echo "  WebSocket: ws://localhost:$API_PORT"
echo "  Health:    http://localhost:$API_PORT/health"
if [ "$USE_REDIS" = "true" ]; then
    echo "  Redis:     localhost:$REDIS_PORT"
fi
echo ""
echo "  Logs:      $PROJECT_ROOT/.logs/api.log"
echo ""
echo "  To stop:   npm run stop:local"
echo ""
