#!/bin/bash
# Run tests against remote environment (VPS/Staging/Production)
# Usage: ./scripts/test-orchestrator/run-remote.sh <environment>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Environment
ENV=${1:-vps}

# Load environment URLs
case $ENV in
    vps)
        API_URL=${VPS_API_URL:-http://localhost:3000}
        ;;
    staging)
        API_URL=${STAGING_API_URL:-http://staging.example.com:3000}
        ;;
    production)
        API_URL=${PRODUCTION_API_URL:-http://api.example.com:3000}
        ;;
    *)
        echo -e "${RED}Unknown environment: $ENV${NC}"
        echo "Usage: $0 [vps|staging|production]"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Talksy Remote Test Runner - ${ENV}                      ${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Target: $API_URL"
echo ""

cd "$PROJECT_ROOT"

# Step 0: Clean up any local processes that might interfere
echo -e "${YELLOW}► Step 0: Cleaning up local processes...${NC}"
pkill -f 'nest start' 2>/dev/null || true
pkill -f 'node dist/main' 2>/dev/null || true
pkill -f 'k6 run' 2>/dev/null || true
rm -rf .pids .logs 2>/dev/null || true
echo -e "${GREEN}  Local processes cleaned up${NC}"
echo ""

# Step 1: Verify remote is accessible
echo -e "${YELLOW}► Step 1: Verifying remote accessibility...${NC}"
if curl -s "$API_URL/health" 2>/dev/null | grep -q "ok"; then
    echo -e "${GREEN}  Remote is healthy${NC}"
else
    echo -e "${RED}  Remote is not accessible at $API_URL${NC}"
    echo "  Please ensure the application is running on the remote server."
    exit 1
fi

# Step 2: Run unit tests (local only)
echo -e "${YELLOW}► Step 2: Running unit tests...${NC}"
npm run test:unit
echo -e "${GREEN}  Unit tests passed${NC}"

# Step 3: Run API tests against remote
echo -e "${YELLOW}► Step 3: Running API tests against remote...${NC}"
ENV=$ENV API_URL=$API_URL ./scripts/test-api.sh
echo -e "${GREEN}  API tests passed${NC}"

# Step 4: Run k6 load tests against remote
echo -e "${YELLOW}► Step 4: Running k6 load tests...${NC}"
if command -v k6 &> /dev/null; then
    k6 run --env ENV=$ENV test/k6/run-all.js
    echo -e "${GREEN}  K6 tests completed${NC}"
else
    echo -e "${YELLOW}  K6 not installed, skipping load tests${NC}"
fi

# Step 5: Run K6 latency tests against remote
echo -e "${YELLOW}► Step 5: Running K6 latency tests...${NC}"
if command -v k6 &> /dev/null; then
    k6 run --env BASE_URL=$API_URL --env SMOKE=true test/k6/scenarios/all-endpoints-latency.js
    echo -e "${GREEN}  K6 latency tests completed${NC}"
else
    echo -e "${YELLOW}  K6 not installed, skipping latency tests${NC}"
fi

# Step 6: Run K6 cache stress tests against remote
echo -e "${YELLOW}► Step 6: Running K6 cache stress tests...${NC}"
if command -v k6 &> /dev/null; then
    k6 run --env BASE_URL=$API_URL --env SMOKE=true test/k6/scenarios/redis-cache-stress.js
    echo -e "${GREEN}  K6 cache stress tests completed${NC}"
else
    echo -e "${YELLOW}  K6 not installed, skipping cache stress tests${NC}"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           All Remote Tests Passed!                            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
