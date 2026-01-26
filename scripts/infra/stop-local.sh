#!/bin/bash
# Stop the complete Talksy stack (local)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PID_DIR="$PROJECT_ROOT/.pids"

echo ""
echo -e "${YELLOW}Stopping Talksy local stack...${NC}"

# Stop API Server
if [ -f "$PID_DIR/api.pid" ]; then
    API_PID=$(cat "$PID_DIR/api.pid")
    if kill -0 "$API_PID" 2>/dev/null; then
        echo "  Stopping API server (PID: $API_PID)..."
        kill "$API_PID" 2>/dev/null || true
        # Also kill any nest processes
        pkill -f "nest start" 2>/dev/null || true
        rm -f "$PID_DIR/api.pid"
        echo -e "${GREEN}  API server stopped${NC}"
    else
        rm -f "$PID_DIR/api.pid"
        echo "  API server not running"
    fi
else
    # Try to find and kill nest process
    if pkill -f "nest start" 2>/dev/null; then
        echo -e "${GREEN}  API server stopped${NC}"
    else
        echo "  API server not running"
    fi
fi

# Stop Redis
if [ -f "$PID_DIR/redis.pid" ]; then
    REDIS_PID=$(cat "$PID_DIR/redis.pid")
    if kill -0 "$REDIS_PID" 2>/dev/null; then
        echo "  Stopping Redis (PID: $REDIS_PID)..."
        kill "$REDIS_PID" 2>/dev/null || true
        rm -f "$PID_DIR/redis.pid"
        echo -e "${GREEN}  Redis stopped${NC}"
    else
        rm -f "$PID_DIR/redis.pid"
        echo "  Redis not running"
    fi
else
    # Try redis-cli shutdown
    if redis-cli ping 2>/dev/null | grep -q PONG; then
        redis-cli shutdown nosave 2>/dev/null || true
        echo -e "${GREEN}  Redis stopped${NC}"
    else
        echo "  Redis not running"
    fi
fi

echo ""
echo -e "${GREEN}Talksy local stack stopped${NC}"
echo ""
