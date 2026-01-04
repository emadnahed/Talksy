#!/bin/bash

# API Performance Testing Script for Talksy Application
# Tests response times and performance metrics

set -e  # Exit on any error

# Configuration
BASE_URL="${API_BASE_URL:-http://localhost:3000}"
REPORTS_DIR="timely-reports"
mkdir -p $REPORTS_DIR
REPORT_FILE="$REPORTS_DIR/api_performance_test_report_$(date +%Y%m%d_%H%M%S).txt"
LOG_FILE="$REPORTS_DIR/api_performance_test_log_$(date +%Y%m%d_%H%M%S).log"

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
echo "Talksy API Performance Test Report - $(date)" > $REPORT_FILE
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

# Function to test response times with statistics
test_response_times() {
    log "Testing response times with statistics..."

    print_status "INFO" "Response Time Analysis"

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

# Function to run load test
run_load_test() {
    log "Running load test..."

    print_status "INFO" "Load Test Results"

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

    print_status "INFO" "Stability Test"

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

# Main test execution
main() {
    log "Starting API performance tests for Talksy application..."
    print_status "INFO" "Base URL: $BASE_URL"
    print_status "INFO" "Report will be saved to: $REPORT_FILE"

    # Check if the application is running
    if ! curl -s --connect-timeout 5 "$BASE_URL/health" > /dev/null; then
        print_status "FAIL" "Application is not responding at $BASE_URL. Please start the application first."
        exit 1
    fi

    print_status "INFO" "Application is responding. Starting performance tests..."
    print_separator

    # Run performance tests
    test_response_times
    print_separator
    run_load_test
    print_separator
    test_stability
    print_separator

    # Summary
    local passed=$(grep -c "\[PASS\]" $REPORT_FILE)
    local failed=$(grep -c "\[FAIL\]" $REPORT_FILE)
    local info=$(grep -c "\[INFO\]" $REPORT_FILE)
    local perf=$(grep -c "\[PERFORMANCE\]" $REPORT_FILE)
    local total=$((passed + failed))

    print_status "INFO" "Performance tests completed. Summary:"
    print_status "INFO" "Total: $total, Passed: $passed, Failed: $failed"
    print_status "INFO" "Additional Info: $info, Performance Metrics: $perf"

    # Overall rating
    local success_rate=$(echo "scale=2; $passed * 100 / $total" | bc)
    print_separator
    if (( $(echo "$success_rate == 100" | bc -l) )); then
        print_status "PERF" "Overall Rating: ⭐⭐⭐⭐⭐ Excellent"
        print_status "PERF" "All performance tests passed successfully!"
    elif (( $(echo "$success_rate >= 90" | bc -l) )); then
        print_status "PERF" "Overall Rating: ⭐⭐⭐⭐ Very Good"
        print_status "PERF" "Most performance tests passed with minor issues."
    elif (( $(echo "$success_rate >= 75" | bc -l) )); then
        print_status "PERF" "Overall Rating: ⭐⭐⭐ Good"
        print_status "PERF" "Majority of performance tests passed."
    else
        print_status "PERF" "Overall Rating: ⭐⭐ Needs Improvement"
        print_status "PERF" "Many performance tests failed. Review the report for details."
    fi

    echo "" >> $REPORT_FILE
    echo "Final Performance Summary:" >> $REPORT_FILE
    echo "=========================" >> $REPORT_FILE
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