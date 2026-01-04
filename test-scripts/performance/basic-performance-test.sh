#!/bin/bash

# Comprehensive API Testing Script for Talksy Application
# Tests all endpoints, measures latencies, and generates reports

set -e  # Exit on any error

# Configuration
BASE_URL="http://localhost:3000"
REPORT_FILE="api_test_report_$(date +%Y%m%d_%H%M%S).txt"
LOG_FILE="api_test_log_$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Initialize report
echo "Talksy API Test Report - $(date)" > $REPORT_FILE
echo "========================================" >> $REPORT_FILE
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

# Function to test WebSocket connection
test_websocket() {
    log "Testing WebSocket connection..."
    print_status "INFO" "WebSocket testing requires a WebSocket client. Manual verification needed."
    echo "WebSocket testing requires a WebSocket client. Manual verification needed." >> $REPORT_FILE
}

# Function to test health endpoints
test_health() {
    log "Testing health endpoints..."
    test_endpoint "GET" "/health" "Health Check" "200"
    test_endpoint "GET" "/health/detailed" "Detailed Health Check" "200"
}

# Function to test API response times
test_response_times() {
    log "Testing response times..."
    
    # Test multiple requests to calculate average response time
    local total_time=0
    local count=5
    local fast_requests=0
    local slow_requests=0
    
    for i in $(seq 1 $count); do
        local start_time=$(date +%s.%N)
        local response=$(curl -s -o /dev/null -w "%{http_code}:%{time_total}" "$BASE_URL/health")
        local end_time=$(date +%s.%N)
        local curl_time=$(echo $response | cut -d':' -f2)
        total_time=$(echo "$total_time + $curl_time" | bc)
        
        if (( $(echo "$curl_time < 0.5" | bc -l) )); then
            ((fast_requests++))
        else
            ((slow_requests++))
        fi
        
        log "Request $i response time: ${curl_time}s"
    done
    
    local avg_time=$(echo "scale=3; $total_time / $count" | bc)
    print_status "INFO" "Average response time over $count requests: ${avg_time}s"
    print_status "INFO" "Fast responses (<0.5s): $fast_requests, Slow responses (>=0.5s): $slow_requests"
    
    echo "Average response time: ${avg_time}s" >> $REPORT_FILE
    echo "Fast responses (<0.5s): $fast_requests, Slow responses (>=0.5s): $slow_requests" >> $REPORT_FILE
}

# Function to test error handling
test_error_handling() {
    log "Testing error handling..."
    test_endpoint "GET" "/nonexistent-endpoint" "Non-existent endpoint (should return 404)" "404"
}

# Function to run load test
run_load_test() {
    log "Running basic load test..."
    print_status "INFO" "Running 10 concurrent requests to health endpoint"
    
    local start_time=$(date +%s.%N)
    for i in {1..10}; do
        curl -s "$BASE_URL/health" > /dev/null &
    done
    wait  # Wait for all background jobs to complete
    local end_time=$(date +%s.%N)
    
    local duration=$(echo "$end_time - $start_time" | bc)
    print_status "INFO" "Completed 10 concurrent requests in ${duration}s"
    
    echo "Load test: 10 concurrent requests completed in ${duration}s" >> $REPORT_FILE
}

# Function to test API performance
test_performance() {
    log "Testing API performance..."
    
    # Test various endpoints for performance
    local endpoints=("/health" "/health/detailed")
    local results=()
    
    for endpoint in "${endpoints[@]}"; do
        local start_time=$(date +%s.%N)
        curl -s "$BASE_URL$endpoint" > /dev/null
        local end_time=$(date +%s.%N)
        local duration=$(echo "$end_time - $start_time" | bc)
        results+=("$endpoint: ${duration}s")
        log "Performance test for $endpoint: ${duration}s"
    done
    
    print_status "INFO" "Performance test completed for all endpoints"
    for result in "${results[@]}"; do
        echo "Performance: $result" >> $REPORT_FILE
    done
}

# Main test execution
main() {
    log "Starting comprehensive API tests for Talksy application..."
    print_status "INFO" "Base URL: $BASE_URL"
    print_status "INFO" "Report will be saved to: $REPORT_FILE"
    
    # Check if the application is running
    if ! curl -s --connect-timeout 5 "$BASE_URL/health" > /dev/null; then
        print_status "FAIL" "Application is not responding at $BASE_URL. Please start the application first."
        exit 1
    fi
    
    print_status "INFO" "Application is responding. Starting tests..."
    
    # Run all tests
    test_health
    test_response_times
    test_error_handling
    test_performance
    run_load_test
    test_websocket
    
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
    
    # Performance summary
    print_status "INFO" "Performance summary:"
    local avg_time=$(grep "Average response time" $REPORT_FILE | tail -1 | grep -o '[0-9.]*s' | sed 's/s//')
    if (( $(echo "$avg_time < 0.2" | bc -l) )); then
        print_status "INFO" "Performance: Excellent (avg response < 0.2s)"
    elif (( $(echo "$avg_time < 0.5" | bc -l) )); then
        print_status "INFO" "Performance: Good (avg response < 0.5s)"
    else
        print_status "WARN" "Performance: Could be improved (avg response >= 0.5s)"
    fi
}

# Run the main function
main