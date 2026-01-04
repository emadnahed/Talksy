# Talksy Testing Configuration
# This file contains common configuration values for all test scripts

# Base URL configuration
export API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
export WS_BASE_URL="${WS_BASE_URL:-ws://localhost:3000}"

# Test configuration
export REPORTS_DIR="${REPORTS_DIR:-timely-reports}"
export LOG_LEVEL="${LOG_LEVEL:-INFO}"

# Performance test configuration
export DEFAULT_REQUEST_COUNT="${DEFAULT_REQUEST_COUNT:-10}"
export LOAD_TEST_CONCURRENT_REQUESTS="${LOAD_TEST_CONCURRENT_REQUESTS:-20}"
export STABILITY_TEST_DURATION="${STABILITY_TEST_DURATION:-30}"  # in seconds
export STABILITY_TEST_INTERVAL="${STABILITY_TEST_INTERVAL:-2}"  # in seconds

# Timeout configuration
export REQUEST_TIMEOUT="${REQUEST_TIMEOUT:-30}"  # in seconds
export CONNECTION_TIMEOUT="${CONNECTION_TIMEOUT:-5}"  # in seconds

# Thresholds for performance metrics
export PERF_THRESHOLD_FAST="${PERF_THRESHOLD_FAST:-0.1}"    # seconds
export PERF_THRESHOLD_MEDIUM="${PERF_THRESHOLD_MEDIUM:-0.5}" # seconds
export PERF_THRESHOLD_SLOW="${PERF_THRESHOLD_SLOW:-1.0}"    # seconds

# Test result thresholds
export MIN_SUCCESS_RATE="${MIN_SUCCESS_RATE:-90}"  # percentage

# Colors for output (ANSI codes)
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export PURPLE='\033[0;35m'
export CYAN='\033[0;36m'
export WHITE='\033[1;37m'
export NC='\033[0m' # No Color

# Create reports directory if it doesn't exist
mkdir -p "$REPORTS_DIR"