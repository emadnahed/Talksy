#!/bin/bash
# Check status of Talksy infrastructure (local and Docker)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PID_DIR="$PROJECT_ROOT/.pids"

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Talksy Infrastructure Status                        ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check Local Services
echo -e "${BLUE}Local Services:${NC}"

# API Server
echo -n "  API Server:     "
if [ -f "$PID_DIR/api.pid" ]; then
    API_PID=$(cat "$PID_DIR/api.pid")
    if kill -0 "$API_PID" 2>/dev/null; then
        if curl -s "http://localhost:3000/health" 2>/dev/null | grep -q "ok"; then
            echo -e "${GREEN}RUNNING${NC} (PID: $API_PID, port: 3000)"
        else
            echo -e "${YELLOW}STARTING${NC} (PID: $API_PID)"
        fi
    else
        echo -e "${RED}NOT RUNNING${NC}"
    fi
else
    if curl -s "http://localhost:3000/health" 2>/dev/null | grep -q "ok"; then
        echo -e "${GREEN}RUNNING${NC} (port: 3000)"
    else
        echo -e "${RED}NOT RUNNING${NC}"
    fi
fi

# Redis
echo -n "  Redis:          "
if redis-cli ping 2>/dev/null | grep -q PONG; then
    echo -e "${GREEN}RUNNING${NC} (port: 6379)"
elif redis-cli -p 6380 ping 2>/dev/null | grep -q PONG; then
    echo -e "${GREEN}RUNNING${NC} (port: 6380)"
else
    echo -e "${RED}NOT RUNNING${NC}"
fi

echo ""

# Check Docker Containers
echo -e "${BLUE}Docker Containers:${NC}"

if ! docker info &>/dev/null; then
    echo "  Docker is not running"
else
    # Dev containers
    echo -n "  Dev App:        "
    if docker ps --filter "name=talksy-dev-app" --filter "status=running" -q | grep -q .; then
        echo -e "${GREEN}RUNNING${NC}"
    else
        echo -e "${RED}NOT RUNNING${NC}"
    fi

    echo -n "  Dev Redis:      "
    if docker ps --filter "name=talksy-dev-redis" --filter "status=running" -q | grep -q .; then
        echo -e "${GREEN}RUNNING${NC}"
    else
        echo -e "${RED}NOT RUNNING${NC}"
    fi

    # Test containers
    echo -n "  Test App:       "
    if docker ps --filter "name=talksy-test-app" --filter "status=running" -q | grep -q .; then
        echo -e "${GREEN}RUNNING${NC}"
    else
        echo -e "${RED}NOT RUNNING${NC}"
    fi

    echo -n "  Test Redis:     "
    if docker ps --filter "name=talksy-test-redis" --filter "status=running" -q | grep -q .; then
        echo -e "${GREEN}RUNNING${NC}"
    else
        echo -e "${RED}NOT RUNNING${NC}"
    fi

    # Prod containers
    echo -n "  Prod App:       "
    if docker ps --filter "name=talksy-prod-app" --filter "status=running" -q | grep -q .; then
        echo -e "${GREEN}RUNNING${NC}"
    else
        echo -e "${RED}NOT RUNNING${NC}"
    fi

    echo -n "  Prod Redis:     "
    if docker ps --filter "name=talksy-prod-redis" --filter "status=running" -q | grep -q .; then
        echo -e "${GREEN}RUNNING${NC}"
    else
        echo -e "${RED}NOT RUNNING${NC}"
    fi
fi

echo ""

# API Health Check
echo -e "${BLUE}API Health Checks:${NC}"

check_health() {
    local name=$1
    local url=$2
    echo -n "  $name: "
    local response=$(curl -s -w "%{http_code}" -o /tmp/health_response.txt "$url" 2>/dev/null)
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}HEALTHY${NC}"
    elif [ -n "$response" ] && [ "$response" != "000" ]; then
        echo -e "${YELLOW}HTTP $response${NC}"
    else
        echo -e "${RED}UNREACHABLE${NC}"
    fi
}

check_health "Local (3000)" "http://localhost:3000/health"
check_health "Docker Dev (3000)" "http://localhost:3000/health"
check_health "Docker Test (3001)" "http://localhost:3001/health"

echo ""
