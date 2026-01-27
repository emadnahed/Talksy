#!/bin/bash
# Talksy cURL-based API Integration Test Suite
# Tests HTTP and WebSocket endpoints

set -e

# Environment configuration
ENV=${1:-local}
VERBOSE=${VERBOSE:-false}

# Set API URL based on environment
case $ENV in
    local)
        API_URL=${API_URL:-"http://localhost:3000"}
        WS_URL=${WS_URL:-"ws://localhost:3000"}
        ;;
    docker)
        API_URL=${API_URL:-"http://localhost:3000"}
        WS_URL=${WS_URL:-"ws://localhost:3000"}
        ;;
    vps)
        API_URL=${VPS_API_URL:-"http://your-vps:3000"}
        WS_URL=${VPS_WS_URL:-"ws://your-vps:3000"}
        ;;
    staging)
        API_URL=${STAGING_API_URL:-"https://staging.example.com"}
        WS_URL=${STAGING_WS_URL:-"wss://staging.example.com"}
        ;;
    production)
        API_URL=${PRODUCTION_API_URL:-"https://api.example.com"}
        WS_URL=${PRODUCTION_WS_URL:-"wss://api.example.com"}
        ;;
    *)
        echo "Unknown environment: $ENV"
        echo "Usage: $0 [local|docker|vps|staging|production]"
        exit 1
        ;;
esac

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# Print header
print_header() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           Talksy API Integration Test Suite                   ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Environment: $ENV"
    echo "API URL:     $API_URL"
    echo "Verbose:     $VERBOSE"
    echo ""
}

# Print section header
print_section() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

# Test function
run_test() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local expected_status="$4"
    local data="$5"
    local headers="$6"

    echo -n "► Testing: $name... "

    # Build curl command
    local curl_cmd="curl -s -w '%{http_code}' -o /tmp/curl_response.txt"
    curl_cmd="$curl_cmd -X $method"
    curl_cmd="$curl_cmd '$API_URL$endpoint'"

    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$data'"
    fi

    if [ -n "$headers" ]; then
        curl_cmd="$curl_cmd $headers"
    fi

    # Execute curl
    local status_code
    status_code=$(eval $curl_cmd 2>/dev/null)

    # Check result
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $status_code)"
        ((PASSED++))

        if [ "$VERBOSE" = "true" ]; then
            echo "  Response:"
            if command -v jq &> /dev/null; then
                cat /tmp/curl_response.txt | jq . 2>/dev/null || cat /tmp/curl_response.txt
            else
                cat /tmp/curl_response.txt
            fi
            echo ""
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (Expected: $expected_status, Got: $status_code)"
        ((FAILED++))

        # Always show response on failure
        echo "  Response:"
        cat /tmp/curl_response.txt
        echo ""
    fi
}

# Test API connectivity
test_connectivity() {
    echo -n "► Testing: API connectivity... "
    if curl -s "$API_URL/health" | grep -q "ok"; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} - API not reachable at $API_URL"
        ((FAILED++))
        return 1
    fi
}

# Run tests
print_header

# Check API connectivity first
if ! test_connectivity; then
    echo ""
    echo -e "${RED}API is not reachable. Please ensure the server is running.${NC}"
    echo "Start with: npm run start:dev"
    exit 1
fi

# Health Check Endpoints
print_section "Health Check Endpoints"
run_test "GET /health" "GET" "/health" "200"
run_test "GET /health/detailed" "GET" "/health/detailed" "200"

# Root Endpoint
print_section "Root Endpoint"
run_test "GET /" "GET" "/" "200"

# Invalid Endpoints
print_section "Error Handling"
run_test "GET /nonexistent (404)" "GET" "/nonexistent" "404"

# WebSocket Info (if available via HTTP)
print_section "WebSocket Gateway Info"
echo "► Note: WebSocket tests require socket.io-client"
echo "  Full WebSocket testing is done via E2E tests"

# Print summary
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Passed:  ${GREEN}$PASSED${NC}"
echo -e "  Failed:  ${RED}$FAILED${NC}"
echo -e "  Skipped: ${YELLOW}$SKIPPED${NC}"
echo ""

TOTAL=$((PASSED + FAILED))
if [ $TOTAL -gt 0 ]; then
    PASS_RATE=$((PASSED * 100 / TOTAL))
    echo "  Pass Rate: $PASS_RATE%"
fi
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
