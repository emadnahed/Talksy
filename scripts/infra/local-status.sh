#!/bin/bash
# Check local test infrastructure status

REDIS_TEST_PORT=${REDIS_TEST_PORT:-6380}

echo "Checking local test infrastructure status..."
echo ""

# Check Redis
echo -n "Redis (port $REDIS_TEST_PORT): "
if redis-cli -p $REDIS_TEST_PORT ping 2>/dev/null | grep -q PONG; then
    echo "RUNNING"
else
    echo "NOT RUNNING"
fi

echo ""
