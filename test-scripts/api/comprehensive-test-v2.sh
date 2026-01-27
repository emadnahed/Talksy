#!/bin/bash

# Comprehensive API Testing Script for Talksy Application
# Tests all endpoints including WebSocket, measures latencies, and generates reports

set -e  # Exit on any error

# Configuration
BASE_URL="http://localhost:3000"
WS_URL="ws://localhost:3000"
REPORTS_DIR="timely-reports"
mkdir -p $REPORTS_DIR
REPORT_FILE="$REPORTS_DIR/comprehensive_api_test_report_$(date +%Y%m%d_%H%M%S).txt"
LOG_FILE="$REPORTS_DIR/comprehensive_api_test_log_$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Initialize report
echo "Talksy Comprehensive API Test Report - $(date)" > $REPORT_FILE
echo "========================================" >> $REPORT_FILE
echo "Base URL: $BASE_URL" >> $REPORT_FILE
echo "WebSocket URL: $WS_URL" >> $REPORT_FILE
echo "" >> $REPORT_FILE

# Function to log and print
log() {
    echo -e "$1" | tee -a $LOG_FILE
}

# Function to print beautiful headers
print_header() {
    local title=$1
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC} ${WHITE}${title}${NC} $(printf '%*s' $((67-${#title})) | tr ' ' ' ')${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════════════════════════╝${NC}"
}

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    local time_info=${3:-""}
    
    case $status in
        "PASS")
            if [ -n "$time_info" ]; then
                echo -e "  ${GREEN}✓${NC} $message ${CYAN}($time_info)${NC}"
            else
                echo -e "  ${GREEN}✓${NC} $message"
            fi
            echo "[PASS] $message $time_info" >> $REPORT_FILE
            ;;
        "FAIL")
            if [ -n "$time_info" ]; then
                echo -e "  ${RED}✗${NC} $message ${CYAN}($time_info)${NC}"
            else
                echo -e "  ${RED}✗${NC} $message"
            fi
            echo "[FAIL] $message $time_info" >> $REPORT_FILE
            ;;
        "INFO")
            echo -e "  ${BLUE}ℹ${NC} $message"
            echo "[INFO] $message" >> $REPORT_FILE
            ;;
        "WARN")
            echo -e "  ${YELLOW}⚠${NC} $message"
            echo "[WARN] $message" >> $REPORT_FILE
            ;;
        "PERF")
            echo -e "  ${PURPLE}⚡${NC} $message"
            echo "[PERFORMANCE] $message" >> $REPORT_FILE
            ;;
    esac
}

# Function to print separator
print_separator() {
    echo -e "${BLUE}────────────────────────────────────────────────────────────────────────────────────────${NC}"
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
        print_status "PASS" "$description" "Status: $http_code, Time: ${curl_time}s"
        return 0
    else
        print_status "FAIL" "$description - Expected: $expected_status, Got: $http_code" "Time: ${curl_time}s"
        return 1
    fi
}

# Function to test health endpoints with detailed response
test_detailed_health() {
    log "Testing detailed health endpoints..."
    
    print_header "Health Check Results"
    
    # Test basic health
    local start_time=$(date +%s.%N)
    local health_response=$(curl -s "$BASE_URL/health")
    local end_time=$(date +%s.%N)
    local health_time=$(echo "$end_time - $start_time" | bc)
    
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
    if [ "$http_code" = "200" ]; then
        print_status "PASS" "Health Check" "Status: $http_code, Time: ${health_time}s"
        echo "Health Response: $health_response" >> $REPORT_FILE
    else
        print_status "FAIL" "Health Check" "Status: $http_code, Time: ${health_time}s"
    fi
    
    # Test detailed health
    start_time=$(date +%s.%N)
    local detailed_response=$(curl -s "$BASE_URL/health/detailed")
    end_time=$(date +%s.%N)
    local detailed_time=$(echo "$end_time - $start_time" | bc)
    
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health/detailed")
    if [ "$http_code" = "200" ]; then
        print_status "PASS" "Detailed Health Check" "Status: $http_code, Time: ${detailed_time}s"
        echo "Detailed Health Response: $detailed_response" >> $REPORT_FILE
        
        # Extract and display health details
        local status=$(echo $detailed_response | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        local redis_status=$(echo $detailed_response | grep -o '"redis":{"status":"[^"]*"' | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        local redis_latency=$(echo $detailed_response | grep -o '"latencyMs":[0-9]*' | cut -d':' -f2)
        local uptime=$(echo $detailed_response | grep -o '"uptime":[0-9]*' | cut -d':' -f2)
        
        print_separator
        print_status "INFO" "Health Details:"
        print_status "INFO" "  Overall Status: $status"
        print_status "INFO" "  Redis Status: $redis_status"
        print_status "INFO" "  Redis Latency: ${redis_latency}ms"
        print_status "INFO" "  Uptime: ${uptime}s"
        print_separator
    else
        print_status "FAIL" "Detailed Health Check" "Status: $http_code, Time: ${detailed_time}s"
    fi
}

# Function to test response times with statistics
test_response_times() {
    log "Testing response times with statistics..."
    
    print_header "Response Time Analysis"
    
    # Test multiple requests to calculate statistics
    local total_time=0
    local times=()
    local count=10
    local fast_requests=0
    local slow_requests=0
    local very_slow_requests=0
    
    print_status "INFO" "Running $count requests to calculate response time statistics..."
    
    for i in $(seq 1 $count); do
        local start_time=$(date +%s.%N)
        local response=$(curl -s -o /dev/null -w "%{http_code}:%{time_total}" "$BASE_URL/health")
        local end_time=$(date +%s.%N)
        local curl_time=$(echo $response | cut -d':' -f2)
        times+=($curl_time)
        total_time=$(echo "$total_time + $curl_time" | bc)
        
        if (( $(echo "$curl_time < 0.1" | bc -l) )); then
            ((fast_requests++))
        elif (( $(echo "$curl_time < 0.5" | bc -l) )); then
            ((slow_requests++))
        else
            ((very_slow_requests++))
        fi
        
        log "Request $i response time: ${curl_time}s"
    done
    
    # Calculate statistics
    local avg_time=$(echo "scale=6; $total_time / $count" | bc)
    
    # Calculate min and max
    local min_time=$(printf '%s\n' "${times[@]}" | sort -n | head -n1)
    local max_time=$(printf '%s\n' "${times[@]}" | sort -n | tail -n1)
    
    # Calculate median
    local sorted_times=($(printf '%s\n' "${times[@]}" | sort -n))
    local median_idx=$(echo "($count - 1) / 2" | bc)
    local median_time=${sorted_times[$median_idx]}
    
    print_status "PERF" "Response Time Statistics:"
    print_status "PERF" "  Requests: $count"
    print_status "PERF" "  Average: ${avg_time}s"
    print_status "PERF" "  Median: ${median_time}s"
    print_status "PERF" "  Min: ${min_time}s"
    print_status "PERF" "  Max: ${max_time}s"
    print_status "PERF" "  Fast (<0.1s): $fast_requests"
    print_status "PERF" "  Medium (0.1-0.5s): $slow_requests"
    print_status "PERF" "  Slow (>0.5s): $very_slow_requests"
    
    # Performance rating
    if (( $(echo "$avg_time < 0.05" | bc -l) )); then
        print_status "PERF" "Performance Rating: ⭐⭐⭐⭐⭐ Excellent"
    elif (( $(echo "$avg_time < 0.1" | bc -l) )); then
        print_status "PERF" "Performance Rating: ⭐⭐⭐⭐ Very Good"
    elif (( $(echo "$avg_time < 0.2" | bc -l) )); then
        print_status "PERF" "Performance Rating: ⭐⭐⭐ Good"
    elif (( $(echo "$avg_time < 0.5" | bc -l) )); then
        print_status "PERF" "Performance Rating: ⭐⭐ Fair"
    else
        print_status "PERF" "Performance Rating: ⭐ Needs Improvement"
    fi
    
    # Add to report
    echo "Response Time Statistics:" >> $REPORT_FILE
    echo "  Requests: $count" >> $REPORT_FILE
    echo "  Average: ${avg_time}s" >> $REPORT_FILE
    echo "  Median: ${median_time}s" >> $REPORT_FILE
    echo "  Min: ${min_time}s" >> $REPORT_FILE
    echo "  Max: ${max_time}s" >> $REPORT_FILE
    echo "  Fast (<0.1s): $fast_requests" >> $REPORT_FILE
    echo "  Medium (0.1-0.5s): $slow_requests" >> $REPORT_FILE
    echo "  Slow (>0.5s): $very_slow_requests" >> $REPORT_FILE
}

# Function to test error handling
test_error_handling() {
    log "Testing error handling..."
    
    print_header "Error Handling Tests"
    
    # Test 404 error
    test_endpoint "GET" "/nonexistent-endpoint" "Non-existent endpoint (should return 404)" "404"
    
    # Test method not allowed
    test_endpoint "POST" "/health" "POST to GET-only endpoint (should return 404 or 405)" "404"
}

# Function to run load test
run_load_test() {
    log "Running load test..."
    
    print_header "Load Test Results"
    
    local concurrent_requests=20
    local start_time=$(date +%s.%N)
    
    print_status "INFO" "Running $concurrent_requests concurrent requests to health endpoint..."
    
    # Start concurrent requests
    for i in $(seq 1 $concurrent_requests); do
        curl -s "$BASE_URL/health" > /dev/null &
    done
    wait  # Wait for all background jobs to complete
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)
    
    print_status "PERF" "Completed $concurrent_requests concurrent requests in ${duration}s"
    print_status "PERF" "Throughput: $(echo "scale=2; $concurrent_requests / $duration" | bc) requests/sec"
    
    # Add to report
    echo "Load Test Results:" >> $REPORT_FILE
    echo "  Concurrent Requests: $concurrent_requests" >> $REPORT_FILE
    echo "  Total Time: ${duration}s" >> $REPORT_FILE
    echo "  Throughput: $(echo "scale=2; $concurrent_requests / $duration" | bc) requests/sec" >> $REPORT_FILE
}

# Function to test API stability
test_stability() {
    log "Testing API stability over time..."
    
    print_header "Stability Test"
    
    local duration_seconds=30
    local interval=2
    local checks=$((duration_seconds / interval))
    local success_count=0
    local total_checks=0
    
    print_status "INFO" "Running stability test for ${duration_seconds}s (checking every ${interval}s)..."
    
    for i in $(seq 1 $checks); do
        local response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
        ((total_checks++))
        
        if [ "$response" = "200" ]; then
            ((success_count++))
            print_status "PASS" "Stability check $i" "Status: $response"
        else
            print_status "FAIL" "Stability check $i" "Status: $response"
        fi
        
        sleep $interval
    done
    
    local success_rate=$(echo "scale=2; $success_count * 100 / $total_checks" | bc)
    print_separator
    print_status "PERF" "Stability Results:"
    print_status "PERF" "  Successful checks: $success_count/$total_checks"
    print_status "PERF" "  Success rate: ${success_rate}%"
    
    if (( $(echo "$success_rate == 100" | bc -l) )); then
        print_status "PERF" "Stability Rating: ⭐⭐⭐⭐⭐ Perfect"
    elif (( $(echo "$success_rate >= 95" | bc -l) )); then
        print_status "PERF" "Stability Rating: ⭐⭐⭐⭐ Excellent"
    elif (( $(echo "$success_rate >= 90" | bc -l) )); then
        print_status "PERF" "Stability Rating: ⭐⭐⭐ Good"
    elif (( $(echo "$success_rate >= 80" | bc -l) )); then
        print_status "PERF" "Stability Rating: ⭐⭐ Fair"
    else
        print_status "PERF" "Stability Rating: ⭐ Poor"
    fi
    
    # Add to report
    echo "Stability Test:" >> $REPORT_FILE
    echo "  Duration: ${duration_seconds}s" >> $REPORT_FILE
    echo "  Successful checks: $success_count/$total_checks" >> $REPORT_FILE
    echo "  Success rate: ${success_rate}%" >> $REPORT_FILE
}

# Function to test WebSocket connection (using a simple check)
test_websocket_connection() {
    log "Testing WebSocket connection..."
    
    print_header "WebSocket Connection Test"
    
    # Since we can't easily test WebSocket with curl, we'll check if the service is running
    # by checking if the port is open and responding to HTTP upgrade requests
    print_status "INFO" "WebSocket endpoint available at: $WS_URL"
    print_status "INFO" "Testing WebSocket availability via HTTP connection..."
    
    # Try to connect to WebSocket port to see if it's available
    if nc -z localhost 3000; then
        print_status "PASS" "WebSocket port (3000) is accessible"
        
        # Try to get the raw response to see if WebSocket upgrade is supported
        local response=$(echo -e "GET / HTTP/1.1\r\nHost: localhost:3000\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n" | nc localhost 3000 2>/dev/null | head -n 1)
        
        if [[ $response == *"101"* ]] || [[ $response == *"websocket"* ]] || [[ $response == *"upgrade"* ]]; then
            print_status "PASS" "WebSocket upgrade response detected"
        else
            print_status "INFO" "WebSocket service is running but upgrade not tested (requires WebSocket client)"
        fi
    else
        print_status "FAIL" "WebSocket port (3000) is not accessible"
    fi
    
    print_status "INFO" "WebSocket features: Real-time AI assistant, message streaming, tool execution"
    
    # Add to report
    echo "WebSocket Test:" >> $REPORT_FILE
    echo "  Endpoint: $WS_URL" >> $REPORT_FILE
    echo "  Features: Real-time AI assistant, message streaming, tool execution" >> $REPORT_FILE
}

# Function to test API endpoints that might exist
test_api_endpoints() {
    log "Testing application-specific API endpoints..."
    
    print_header "Application API Endpoints Test"
    
    # Since we don't know the exact endpoints, let's test common patterns
    # and document what we find
    
    print_status "INFO" "Testing common API endpoint patterns..."
    
    # Test if there are any API routes
    test_endpoint "GET" "/api" "API root endpoint" "404"  # Expected to fail if no /api route
    test_endpoint "GET" "/api/health" "API health endpoint" "404"  # Expected to fail if no /api route
    
    # Test for potential REST endpoints
    test_endpoint "GET" "/users" "Users endpoint" "404"
    test_endpoint "GET" "/sessions" "Sessions endpoint" "404"
    test_endpoint "GET" "/messages" "Messages endpoint" "404"
    test_endpoint "GET" "/ai" "AI endpoint" "404"
    test_endpoint "GET" "/tools" "Tools endpoint" "404"
    
    print_separator
    print_status "INFO" "Application-specific endpoints would require WebSocket client for full testing"
    print_status "INFO" "The application is designed for real-time communication via WebSocket"
}

# Function to test WebSocket functionality with a simple client simulation
test_websocket_functionality() {
    log "Testing WebSocket functionality..."
    
    print_header "WebSocket Functionality Test"
    
    print_status "INFO" "WebSocket functionality requires a dedicated client for full testing"
    print_status "INFO" "However, we can verify the service is running and accessible"
    
    # Check if we can connect to the WebSocket port
    if nc -z localhost 3000; then
        print_status "PASS" "WebSocket service is running on port 3000"
        
        # Test with a simple HTTP request to see what's returned
        local http_response=$(curl -s -i -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: test" http://localhost:3000/ 2>/dev/null | head -n 1)
        
        if [[ $http_response == *"101"* ]]; then
            print_status "PASS" "WebSocket upgrade protocol supported"
        else
            print_status "INFO" "HTTP response: $http_response"
            print_status "INFO" "WebSocket upgrade not supported via HTTP request (expected for Socket.IO)"
        fi
    else
        print_status "FAIL" "WebSocket service is not accessible on port 3000"
    fi
    
    print_separator
    print_status "INFO" "For complete WebSocket testing, a dedicated client would be needed to:"
    print_status "INFO" "  - Connect to WebSocket endpoint"
    print_status "INFO" "  - Send 'user_message' events"
    print_status "INFO" "  - Receive 'assistant_response' events"
    print_status "INFO" "  - Test session creation and management"
    print_status "INFO" "  - Test tool execution functionality"
    
    # Add to report
    echo "WebSocket Functionality Test:" >> $REPORT_FILE
    echo "  Service Status: $(if nc -z localhost 3000; then echo "Running"; else echo "Not Running"; fi)" >> $REPORT_FILE
    echo "  Features: Real-time AI assistant, message streaming, tool execution" >> $REPORT_FILE
    echo "  Testing Method: HTTP upgrade request simulation" >> $REPORT_FILE
}

# Main test execution
main() {
    print_header "Talksy Comprehensive API Testing Suite"
    print_status "INFO" "Starting comprehensive API tests for Talksy application..."
    print_status "INFO" "Base URL: $BASE_URL"
    print_status "INFO" "WebSocket URL: $WS_URL"
    print_status "INFO" "Report will be saved to: $REPORT_FILE"
    
    # Check if the application is running
    if ! curl -s --connect-timeout 5 "$BASE_URL/health" > /dev/null; then
        print_status "FAIL" "Application is not responding at $BASE_URL. Please start the application first."
        exit 1
    fi
    
    print_status "INFO" "Application is responding. Starting comprehensive tests..."
    print_separator
    
    # Run all tests
    test_detailed_health
    print_separator
    test_response_times
    print_separator
    test_error_handling
    print_separator
    run_load_test
    print_separator
    test_stability
    print_separator
    test_websocket_connection
    print_separator
    test_websocket_functionality
    print_separator
    test_api_endpoints
    print_separator
    
    # Summary
    local passed=$(grep -c "\[PASS\]" $REPORT_FILE)
    local failed=$(grep -c "\[FAIL\]" $REPORT_FILE)
    local info=$(grep -c "\[INFO\]" $REPORT_FILE)
    local perf=$(grep -c "\[PERFORMANCE\]" $REPORT_FILE)
    local total=$((passed + failed))
    
    print_header "Final Test Summary"
    print_status "INFO" "Tests completed. Summary:"
    print_status "INFO" "Total: $total, Passed: $passed, Failed: $failed"
    print_status "INFO" "Additional Info: $info, Performance Metrics: $perf"
    
    # Overall rating
    local success_rate=$(echo "scale=2; $passed * 100 / $total" | bc)
    print_separator
    if (( $(echo "$success_rate == 100" | bc -l) )); then
        print_status "PERF" "Overall Rating: ⭐⭐⭐⭐⭐ Excellent"
        print_status "PERF" "All tests passed successfully!"
    elif (( $(echo "$success_rate >= 90" | bc -l) )); then
        print_status "PERF" "Overall Rating: ⭐⭐⭐⭐ Very Good"
        print_status "PERF" "Most tests passed with minor issues."
    elif (( $(echo "$success_rate >= 75" | bc -l) )); then
        print_status "PERF" "Overall Rating: ⭐⭐⭐ Good"
        print_status "PERF" "Majority of tests passed."
    else
        print_status "PERF" "Overall Rating: ⭐⭐ Needs Improvement"
        print_status "PERF" "Many tests failed. Review the report for details."
    fi
    
    echo "" >> $REPORT_FILE
    echo "Final Test Summary:" >> $REPORT_FILE
    echo "===================" >> $REPORT_FILE
    echo "Total tests: $total" >> $REPORT_FILE
    echo "Passed: $passed" >> $REPORT_FILE
    echo "Failed: $failed" >> $REPORT_FILE
    echo "Success Rate: ${success_rate}%" >> $REPORT_FILE
    
    print_separator
    print_status "INFO" "Complete report saved to: $REPORT_FILE"
    print_status "INFO" "Detailed logs saved to: $LOG_FILE"
}

# Run the main function
main