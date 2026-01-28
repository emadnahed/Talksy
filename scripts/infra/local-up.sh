#!/bin/bash
# Start local test infrastructure (MongoDB + Redis)
# Prefers local installations, falls back to Docker if available

set -e

REDIS_TEST_PORT=${REDIS_TEST_PORT:-6379}
MONGO_TEST_PORT=${MONGO_TEST_PORT:-27017}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Starting local test infrastructure..."

MONGO_STARTED=false
REDIS_STARTED=false

# Try to start MongoDB
start_mongodb() {
    # Check if MongoDB is already running
    if nc -z localhost $MONGO_TEST_PORT 2>/dev/null; then
        echo -e "${GREEN}MongoDB is already running on port $MONGO_TEST_PORT${NC}"
        return 0
    fi

    # Try local mongod first
    if command -v mongod &> /dev/null; then
        echo "Starting local MongoDB on port $MONGO_TEST_PORT..."
        mkdir -p /tmp/mongodb-test-data
        mongod --port $MONGO_TEST_PORT --dbpath /tmp/mongodb-test-data --fork --logpath /tmp/mongodb-test.log 2>/dev/null || true

        # Wait for MongoDB to be ready
        for i in {1..30}; do
            if nc -z localhost $MONGO_TEST_PORT 2>/dev/null; then
                echo -e "${GREEN}MongoDB started successfully on port $MONGO_TEST_PORT${NC}"
                return 0
            fi
            sleep 0.5
        done
    fi

    # Try Docker if local MongoDB not available
    if docker info >/dev/null 2>&1; then
        echo "Local MongoDB not found, trying Docker..."
        cd "$PROJECT_ROOT"

        # Use docker compose v2 if available
        if docker compose version &> /dev/null 2>&1; then
            COMPOSE_CMD="docker compose"
        else
            COMPOSE_CMD="docker-compose"
        fi

        $COMPOSE_CMD -f docker-compose.yml up -d mongodb 2>/dev/null || true

        # Wait for MongoDB to be ready
        for i in {1..30}; do
            if nc -z localhost $MONGO_TEST_PORT 2>/dev/null; then
                echo -e "${GREEN}MongoDB (Docker) started successfully on port $MONGO_TEST_PORT${NC}"
                return 0
            fi
            sleep 1
        done
    fi

    echo -e "${YELLOW}Warning: MongoDB not available. Tests will use mongodb-memory-server.${NC}"
    return 1
}

# Try to start Redis
start_redis() {
    # Check if Redis is already running
    if nc -z localhost $REDIS_TEST_PORT 2>/dev/null; then
        echo -e "${GREEN}Redis is already running on port $REDIS_TEST_PORT${NC}"
        return 0
    fi

    # Try local redis-server first
    if command -v redis-server &> /dev/null; then
        echo "Starting local Redis on port $REDIS_TEST_PORT..."
        redis-server --port $REDIS_TEST_PORT --daemonize yes --pidfile /tmp/redis-test.pid 2>/dev/null || true

        # Wait for Redis to be ready
        for i in {1..30}; do
            if redis-cli -p $REDIS_TEST_PORT ping 2>/dev/null | grep -q PONG; then
                echo -e "${GREEN}Redis started successfully on port $REDIS_TEST_PORT${NC}"
                return 0
            fi
            sleep 0.5
        done
    fi

    # Try Docker if local Redis not available
    if docker info >/dev/null 2>&1; then
        echo "Local Redis not found, trying Docker..."
        cd "$PROJECT_ROOT"

        # Use docker compose v2 if available
        if docker compose version &> /dev/null 2>&1; then
            COMPOSE_CMD="docker compose"
        else
            COMPOSE_CMD="docker-compose"
        fi

        $COMPOSE_CMD -f docker-compose.yml up -d redis 2>/dev/null || true

        # Wait for Redis to be ready
        for i in {1..30}; do
            if nc -z localhost $REDIS_TEST_PORT 2>/dev/null; then
                echo -e "${GREEN}Redis (Docker) started successfully on port $REDIS_TEST_PORT${NC}"
                return 0
            fi
            sleep 1
        done
    fi

    echo -e "${YELLOW}Warning: Redis not available. In-memory caching will be used.${NC}"
    return 1
}

# Start services
start_mongodb && MONGO_STARTED=true
start_redis && REDIS_STARTED=true

echo ""
echo -e "${GREEN}Local infrastructure status:${NC}"
echo "  MongoDB: $(if $MONGO_STARTED; then echo "localhost:$MONGO_TEST_PORT"; else echo "not available (will use mongodb-memory-server)"; fi)"
echo "  Redis:   $(if $REDIS_STARTED; then echo "localhost:$REDIS_TEST_PORT"; else echo "not available (will use in-memory)"; fi)"
echo ""

# Return success even if some services aren't available (tests will adapt)
exit 0
