#!/bin/bash
# Stop local test infrastructure (Redis)

set -e

REDIS_TEST_PORT=${REDIS_TEST_PORT:-6380}

echo "Stopping local test infrastructure..."

# Stop Redis if running on test port
if [ -f /tmp/redis-test.pid ]; then
    PID=$(cat /tmp/redis-test.pid 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "Stopping Redis (PID: $PID)..."
        kill "$PID"
        rm -f /tmp/redis-test.pid
        echo "Redis stopped"
    else
        rm -f /tmp/redis-test.pid
        echo "Redis PID file exists but process not running"
    fi
else
    # Try to stop via redis-cli
    if redis-cli -p $REDIS_TEST_PORT ping 2>/dev/null | grep -q PONG; then
        echo "Stopping Redis on port $REDIS_TEST_PORT..."
        redis-cli -p $REDIS_TEST_PORT shutdown nosave 2>/dev/null || true
        echo "Redis stopped"
    else
        echo "No Redis running on port $REDIS_TEST_PORT"
    fi
fi

echo "Local infrastructure stopped"
