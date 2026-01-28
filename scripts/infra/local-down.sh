#!/bin/bash
# Stop local test infrastructure (MongoDB + Redis)

REDIS_TEST_PORT=${REDIS_TEST_PORT:-6379}
MONGO_TEST_PORT=${MONGO_TEST_PORT:-27017}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Stopping local test infrastructure..."

# Stop MongoDB if running via Docker
stop_mongodb_docker() {
    if docker info >/dev/null 2>&1; then
        cd "$PROJECT_ROOT"
        if docker compose version &> /dev/null 2>&1; then
            docker compose -f docker-compose.yml stop mongodb 2>/dev/null || true
        else
            docker-compose -f docker-compose.yml stop mongodb 2>/dev/null || true
        fi
    fi
}

# Stop local MongoDB
stop_mongodb() {
    # Stop Docker MongoDB if running
    stop_mongodb_docker

    # Kill local mongod if running
    if command -v mongod &> /dev/null && pgrep -f "mongod.*$MONGO_TEST_PORT" >/dev/null 2>&1; then
        echo "Stopping local MongoDB..."
        pkill -f "mongod.*$MONGO_TEST_PORT" 2>/dev/null || true
        rm -rf /tmp/mongodb-test-data 2>/dev/null || true
        echo "MongoDB stopped"
    fi
}

# Stop Redis if running on test port
stop_redis() {
    if [ -f /tmp/redis-test.pid ]; then
        PID=$(cat /tmp/redis-test.pid 2>/dev/null)
        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
            echo "Stopping Redis (PID: $PID)..."
            kill "$PID"
            rm -f /tmp/redis-test.pid
            echo "Redis stopped"
            return
        else
            rm -f /tmp/redis-test.pid
        fi
    fi

    # Try to stop via redis-cli
    if command -v redis-cli &> /dev/null; then
        if redis-cli -p $REDIS_TEST_PORT ping 2>/dev/null | grep -q PONG; then
            echo "Stopping Redis on port $REDIS_TEST_PORT..."
            redis-cli -p $REDIS_TEST_PORT shutdown nosave 2>/dev/null || true
            echo "Redis stopped"
            return
        fi
    fi

    # Stop Docker Redis if running
    if docker info >/dev/null 2>&1; then
        cd "$PROJECT_ROOT"
        if docker compose version &> /dev/null 2>&1; then
            docker compose -f docker-compose.yml stop redis 2>/dev/null || true
        else
            docker-compose -f docker-compose.yml stop redis 2>/dev/null || true
        fi
    fi
}

stop_mongodb
stop_redis

echo "Local infrastructure stopped"
