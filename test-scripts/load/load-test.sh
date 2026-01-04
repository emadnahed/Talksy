#!/bin/bash

# API Load Testing Script for Talksy Application
# Tests application under various load conditions

set -e  # Exit on any error

# Configuration
BASE_URL="${API_BASE_URL:-http://localhost:3000}"
REPORTS_DIR="timely-reports"
mkdir -p $REPORTS_DIR
REPORT_FILE="$REPORTS_DIR/api_load_test_report_$(date +%Y%m%d_%H%M%S).txt"
LOG_FILE="$REPORTS_DIR/api_load_test_log_$(date +%Y%m%d_%H%M%S).log"

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
echo "Talksy API Load Test Report - $(date)" > $REPORT_FILE
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

# Function to run basic load test
run_basic_load_test() {
    log "Running basic load test..."

    print_status "INFO" "Basic Load Test"

    local concurrent_requests=10
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
    echo "Basic Load Test Results:" >> $REPORT_FILE
    echo "  Concurrent Requests: $concurrent_requests" >> $REPORT_FILE
    echo "  Total Time: ${duration}s" >> $REPORT_FILE
    echo "  Throughput: $(echo "scale=2; $concurrent_requests / $duration" | bc) requests/sec" >> $REPORT_FILE
}

# Function to run medium load test
run_medium_load_test() {
    log "Running medium load test..."

    print_status "INFO" "Medium Load Test"

    local concurrent_requests=50
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
    echo "Medium Load Test Results:" >> $REPORT_FILE
    echo "  Concurrent Requests: $concurrent_requests" >> $REPORT_FILE
    echo "  Total Time: ${duration}s" >> $REPORT_FILE
    echo "  Throughput: $(echo "scale=2; $concurrent_requests / $duration" | bc) requests/sec" >> $REPORT_FILE
}

# Function to run high load test
run_high_load_test() {
    log "Running high load test..."

    print_status "INFO" "High Load Test"

    local concurrent_requests=100
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
    echo "High Load Test Results:" >> $REPORT_FILE
    echo "  Concurrent Requests: $concurrent_requests" >> $REPORT_FILE
    echo "  Total Time: ${duration}s" >> $REPORT_FILE
    echo "  Throughput: $(echo "scale=2; $concurrent_requests / $duration" | bc) requests/sec" >> $REPORT_FILE
}

# Function to run stress test
run_stress_test() {
    log "Running stress test..."

    print_status "INFO" "Stress Test"

    local concurrent_requests=200
    local start_time=$(date +%s.%N)

    print_status "INFO" "Running $concurrent_requests concurrent requests to health endpoint (stress test)..."

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
    echo "Stress Test Results:" >> $REPORT_FILE
    echo "  Concurrent Requests: $concurrent_requests" >> $REPORT_FILE
    echo "  Total Time: ${duration}s" >> $REPORT_FILE
    echo "  Throughput: $(echo "scale=2; $concurrent_requests / $duration" | bc) requests/sec" >> $REPORT_FILE
}

# Function to test sustained load
run_sustained_load_test() {
    log "Running sustained load test..."

    print_status "INFO" "Sustained Load Test"

    local duration_seconds=60
    local interval=5
    local requests_per_interval=10
    local total_requests=0

    print_status "INFO" "Running sustained load test for ${duration_seconds}s..."

    local start_time=$(date +%s.%N)
    local current_time=$start_time
    local end_test_time=$(echo "$start_time + $duration_seconds" | bc)

    while (( $(echo "$current_time < $end_test_time" | bc -l) )); do
        # Start requests for this interval
        for i in $(seq 1 $requests_per_interval); do
            curl -s "$BASE_URL/health" > /dev/null &
            ((total_requests++))
        done
        wait  # Wait for all requests in this interval to complete

        sleep $interval
        current_time=$(date +%s.%N)
    done

    local actual_duration=$(echo "$(date +%s.%N) - $start_time" | bc)

    print_status "PERF" "Completed $total_requests requests over ${actual_duration}s"
    print_status "PERF" "Average rate: $(echo "scale=2; $total_requests / $actual_duration" | bc) requests/sec"

    # Add to report
    echo "Sustained Load Test Results:" >> $REPORT_FILE
    echo "  Duration: ${actual_duration}s" >> $REPORT_FILE
    echo "  Total Requests: $total_requests" >> $REPORT_FILE
    echo "  Average Rate: $(echo "scale=2; $total_requests / $actual_duration" | bc) requests/sec" >> $REPORT_FILE
}

# Main test execution
main() {
    log "Starting API load tests for Talksy application..."
    print_status "INFO" "Base URL: $BASE_URL"
    print_status "INFO" "Report will be saved to: $REPORT_FILE"

    # Check if the application is running
    if ! curl -s --connect-timeout 5 "$BASE_URL/health" > /dev/null; then
        print_status "FAIL" "Application is not responding at $BASE_URL. Please start the application first."
        exit 1
    fi

    print_status "INFO" "Application is responding. Starting load tests..."
    print_separator

    # Run load tests
    run_basic_load_test
    print_separator
    run_medium_load_test
    print_separator
    run_high_load_test
    print_separator
    run_stress_test
    print_separator
    run_sustained_load_test
    print_separator

    # Summary
    local passed=$(grep -c "\[PASS\]" $REPORT_FILE)
    local failed=$(grep -c "\[FAIL\]" $REPORT_FILE)
    local info=$(grep -c "\[INFO\]" $REPORT_FILE)
    local perf=$(grep -c "\[PERFORMANCE\]" $REPORT_FILE)
    local total=$((passed + failed))

    print_status "INFO" "Load tests completed. Summary:"
    print_status "INFO" "Total: $total, Passed: $passed, Failed: $failed"
    print_status "INFO" "Additional Info: $info, Performance Metrics: $perf"

    # Overall rating
    local success_rate=$(echo "scale=2; $passed * 100 / $total" | bc)
    print_separator
    if (( $(echo "$success_rate == 100" | bc -l) )); then
        print_status "PERF" "Overall Rating: ⭐⭐⭐⭐⭐ Excellent"
        print_status "PERF" "All load tests passed successfully!"
    elif (( $(echo "$success_rate >= 90" | bc -l) )); then
        print_status "PERF" "Overall Rating: ⭐⭐⭐⭐ Very Good"
        print_status "PERF" "Most load tests passed with minor issues."
    elif (( $(echo "$success_rate >= 75" | bc -l) )); then
        print_status "PERF" "Overall Rating: ⭐⭐⭐ Good"
        print_status "PERF" "Majority of load tests passed."
    else
        print_status "PERF" "Overall Rating: ⭐⭐ Needs Improvement"
        print_status "PERF" "Many load tests failed. Review the report for details."
    fi

    echo "" >> $REPORT_FILE
    echo "Final Load Test Summary:" >> $REPORT_FILE
    echo "========================" >> $REPORT_FILE
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