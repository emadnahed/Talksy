#!/bin/bash
# Orchestrated test runner for local environment
# Handles: infrastructure startup, API server, all tests, cleanup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_PORT=${API_PORT:-3000}
API_PID=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"

    # Stop API server
    if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
        echo "Stopping API server (PID: $API_PID)..."
        kill "$API_PID" 2>/dev/null || true
        wait "$API_PID" 2>/dev/null || true
    fi

    # Kill any remaining processes on the API port
    if lsof -ti :$API_PORT >/dev/null 2>&1; then
        echo "Killing remaining processes on port $API_PORT..."
        lsof -ti :$API_PORT | xargs kill -9 2>/dev/null || true
    fi

    # Stop infrastructure
    bash "$SCRIPT_DIR/../infra/local-down.sh" 2>/dev/null || true

    echo -e "${GREEN}Cleanup complete${NC}"
}

# Set trap for cleanup
trap cleanup EXIT INT TERM

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Talksy Orchestrated Test Suite (Local)                ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_ROOT"

# Step 0: Kill any existing servers
echo -e "${YELLOW}► Step 0: Cleaning up existing processes...${NC}"
pkill -f 'nest start' 2>/dev/null || true
pkill -f 'node dist/main' 2>/dev/null || true

# Kill any process using the API port
if lsof -ti :$API_PORT >/dev/null 2>&1; then
    echo "  Killing processes on port $API_PORT..."
    lsof -ti :$API_PORT | xargs kill -9 2>/dev/null || true
    sleep 1
fi

docker-compose -f docker/docker-compose.test.yml down 2>/dev/null || true
docker-compose -f docker/docker-compose.dev.yml down 2>/dev/null || true
rm -rf .pids .logs 2>/dev/null || true

# Wait for port to be released
for i in {1..10}; do
    if ! lsof -ti :$API_PORT >/dev/null 2>&1; then
        break
    fi
    echo "  Waiting for port $API_PORT to be released..."
    sleep 1
done

echo -e "${GREEN}  Existing processes cleaned up${NC}"
echo ""

# Step 1: Start infrastructure
echo -e "${YELLOW}► Step 1: Starting local infrastructure...${NC}"
bash "$SCRIPT_DIR/../infra/local-up.sh"
echo ""

# Step 2: Start API server in background
echo -e "${YELLOW}► Step 2: Starting API server...${NC}"
MONGODB_ENABLED=true MONGODB_URI=mongodb://localhost:27017/talksy \
npm run start:dev &
API_PID=$!

# Wait for API to be ready
echo "Waiting for API server to be ready..."
for i in {1..60}; do
    if curl -s "http://localhost:$API_PORT/health" | grep -q "ok"; then
        echo -e "${GREEN}API server is ready${NC}"
        break
    fi
    if [ $i -eq 60 ]; then
        echo -e "${RED}API server failed to start${NC}"
        exit 1
    fi
    sleep 1
done
echo ""

# Step 3: Run Unit Tests
echo -e "${YELLOW}► Step 3: Running Unit Tests...${NC}"
npm run test:unit
echo ""

# Step 4: Run Integration Tests
echo -e "${YELLOW}► Step 4: Running Integration Tests...${NC}"
npm run test:integration
echo ""

# Step 5: Run E2E Tests
echo -e "${YELLOW}► Step 5: Running E2E Tests...${NC}"
npm run test:e2e
echo ""

# Step 6: Run Latency Tests (Jest)
echo -e "${YELLOW}► Step 6: Running Latency Tests...${NC}"
npm run test:latency
echo ""

# Step 7: Run cURL API Tests
echo -e "${YELLOW}► Step 7: Running cURL API Tests...${NC}"
bash "$PROJECT_ROOT/scripts/test-api.sh" local
echo ""

# Step 8: Run K6 Smoke Tests
echo -e "${YELLOW}► Step 8: Running K6 Smoke Tests...${NC}"
if command -v k6 &> /dev/null; then
    npm run test:k6:smoke
else
    echo -e "${YELLOW}k6 not installed, skipping K6 smoke tests${NC}"
    echo "Install with: brew install k6 (macOS) or apt install k6 (Linux)"
fi
echo ""

# Step 9: Run K6 Latency Tests
echo -e "${YELLOW}► Step 9: Running K6 Latency Tests...${NC}"
if command -v k6 &> /dev/null; then
    npm run k6:latency:smoke
else
    echo -e "${YELLOW}k6 not installed, skipping K6 latency tests${NC}"
fi
echo ""

# Step 10: Run K6 Cache Stress Tests
echo -e "${YELLOW}► Step 10: Running K6 Cache Stress Tests...${NC}"
if command -v k6 &> /dev/null; then
    npm run k6:cache:smoke
else
    echo -e "${YELLOW}k6 not installed, skipping K6 cache tests${NC}"
fi
echo ""

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              All Tests Completed Successfully!                ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
