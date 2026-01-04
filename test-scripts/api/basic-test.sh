#!/bin/bash

# Basic API Testing Script for Talksy Application
# Tests basic endpoints and measures basic response times

set -e  # Exit on any error

# Source the common test configuration
source "$(dirname "$0")/../test-config.sh" || { echo "Error: Could not load test-config.sh"; exit 1; }

# Configuration
BASE_URL="${API_BASE_URL}"
REPORT_FILE="$REPORTS_DIR/basic_api_test_report_$(date +%Y%m%d_%H%M%S).txt"
LOG_FILE="$REPORTS_DIR/basic_api_test_log_$(date +%Y%m%d_%H%M%S).log"

# Initialize report
echo "Talksy Basic API Test Report - $(date)" > $REPORT_FILE
echo "========================================" >> $REPORT_FILE
echo "Base URL: $BASE_URL" >> $REPORT_FILE
echo "" >> $REPORT_FILE

# Function to log and print
log() {
    echo -e "$1" | tee -a $LOG_FILE
}

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "PASS")
            echo -e "${GREEN}[PASS]${NC} $message"
            echo "[PASS] $message" >> $REPORT_FILE
            ;;
        "FAIL")
            echo -e "${RED}[FAIL]${NC} $message"
            echo "[FAIL] $message" >> $REPORT_FILE
            ;;
        "INFO")
            echo -e "${BLUE}[INFO]${NC} $message"
            echo "[INFO] $message" >> $REPORT_FILE
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} $message"
            echo "[WARN] $message" >> $REPORT_FILE
            ;;
    esac
}

# Function to test an endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3
    local expected_status=${4:-200}
    local data=$5

    log "Testing: $description"
    log "Endpoint: $method $BASE_URL$endpoint"

    local start_time=$(date +%s.%N)

    if [ "$method" = "GET" ]; then
        response=$(curl -s -o /dev/null -w "%{http_code}:%{time_total}" "$BASE_URL$endpoint")
    elif [ "$method" = "POST" ] && [ -n "$data" ]; then
        response=$(curl -s -o /dev/null -w "%{http_code}:%{time_total}" -X POST -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint")
    else
        response=$(curl -s -o /dev/null -w "%{http_code}:%{time_total}" -X $method "$BASE_URL$endpoint")
    fi

    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)

    local http_code=$(echo $response | cut -d':' -f1)
    local curl_time=$(echo $response | cut -d':' -f2)

    if [ "$http_code" = "$expected_status" ]; then
        print_status "PASS" "$description - Status: $http_code, Time: ${curl_time}s"
        return 0
    else
        print_status "FAIL" "$description - Expected: $expected_status, Got: $http_code, Time: ${curl_time}s"
        return 1
    fi
}

# Function to test health endpoints
test_health() {
    log "Testing health endpoints..."
    test_endpoint "GET" "/health" "Health Check" "200"
    test_endpoint "GET" "/health/detailed" "Detailed Health Check" "200"
}

# Function to test error handling
test_error_handling() {
    log "Testing error handling..."
    test_endpoint "GET" "/nonexistent-endpoint" "Non-existent endpoint (should return 404)" "404"
}

# Main test execution
main() {
    log "Starting basic API tests for Talksy application..."
    print_status "INFO" "Base URL: $BASE_URL"
    print_status "INFO" "Report will be saved to: $REPORT_FILE"

    # Check if the application is running
    if ! curl -s --connect-timeout "$CONNECTION_TIMEOUT" "$BASE_URL/health" > /dev/null; then
        print_status "FAIL" "Application is not responding at $BASE_URL. Please start the application first."
        exit 1
    fi

    print_status "INFO" "Application is responding. Starting tests..."

    # Run basic tests
    test_health
    test_error_handling

    # Summary
    local passed=$(grep -c "\[PASS\]" $REPORT_FILE)
    local failed=$(grep -c "\[FAIL\]" $REPORT_FILE)
    local total=$((passed + failed))

    echo "" >> $REPORT_FILE
    echo "Test Summary:" >> $REPORT_FILE
    echo "=============" >> $REPORT_FILE
    echo "Total tests: $total" >> $REPORT_FILE
    echo "Passed: $passed" >> $REPORT_FILE
    echo "Failed: $failed" >> $REPORT_FILE

    print_status "INFO" "Tests completed. Summary:"
    print_status "INFO" "Total: $total, Passed: $passed, Failed: $failed"
    print_status "INFO" "Report saved to: $REPORT_FILE"
}

# Run the main function
main