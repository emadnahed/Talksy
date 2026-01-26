#!/bin/bash
# Start local test infrastructure (Redis)

set -e

REDIS_TEST_PORT=${REDIS_TEST_PORT:-6380}

echo "Starting local test infrastructure..."
echo "Redis port: $REDIS_TEST_PORT"

# Check if Redis is already running on test port
if nc -z localhost $REDIS_TEST_PORT 2>/dev/null; then
    echo "Redis is already running on port $REDIS_TEST_PORT"
    exit 0
fi

# Try to start Redis
if command -v redis-server &> /dev/null; then
    echo "Starting Redis on port $REDIS_TEST_PORT..."
    redis-server --port $REDIS_TEST_PORT --daemonize yes --pidfile /tmp/redis-test.pid

    # Wait for Redis to be ready
    for i in {1..30}; do
        if redis-cli -p $REDIS_TEST_PORT ping 2>/dev/null | grep -q PONG; then
            echo "Redis started successfully on port $REDIS_TEST_PORT"
            exit 0
        fi
        sleep 0.5
    done

    echo "Failed to start Redis"
    exit 1
else
    echo "redis-server not found. Please install Redis or use Docker."
    echo "  macOS: brew install redis"
    echo "  Ubuntu: sudo apt install redis-server"
    echo ""
    echo "Or use Docker: npm run infra:docker:up"
    exit 1
fi
