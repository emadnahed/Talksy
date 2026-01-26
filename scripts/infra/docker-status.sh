#!/bin/bash
# Check Docker test infrastructure status

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Checking Docker test infrastructure status..."
echo ""

cd "$PROJECT_ROOT"

# Check if Docker is running
if ! docker info &>/dev/null; then
    echo "Docker is not running"
    exit 1
fi

# Check Redis container
echo -n "Redis container: "
if docker ps --filter "name=talksy-redis" --filter "status=running" -q | grep -q .; then
    echo "RUNNING"
    echo -n "  Connectivity: "
    if docker exec talksy-redis redis-cli ping 2>/dev/null | grep -q PONG; then
        echo "OK"
    else
        echo "FAILED"
    fi
else
    echo "NOT RUNNING"
fi

# Check API container if exists
echo -n "API container: "
if docker ps --filter "name=talksy-app" --filter "status=running" -q | grep -q .; then
    echo "RUNNING"
else
    echo "NOT RUNNING"
fi

echo ""
