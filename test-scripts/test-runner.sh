#!/bin/bash

# Talksy Application Test Runner
# Provides easy access to different test scenarios

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

show_help() {
    echo -e "${CYAN}Talksy Application Test Runner${NC}"
    echo ""
    echo -e "${YELLOW}Usage:${NC} ./test-runner.sh [command]"
    echo ""
    echo -e "${GREEN}Available commands:${NC}"
    echo "  all          - Run all tests (unit + integration + e2e + API)"
    echo "  unit         - Run unit tests only"
    echo "  integration  - Run integration tests only"
    echo "  e2e          - Run end-to-end tests only"
    echo "  api          - Run API performance tests"
    echo "  comprehensive - Run comprehensive test suite"
    echo "  docker       - Run tests in Docker environment"
    echo "  coverage     - Run tests with coverage report"
    echo "  help         - Show this help message"
    echo ""
    echo -e "${GREEN}Examples:${NC}"
    echo "  ./test-runner.sh all"
    echo "  ./test-runner.sh api"
    echo "  ./test-runner.sh docker"
}

run_unit_tests() {
    echo -e "${BLUE}Running unit tests...${NC}"
    npm run test:unit
}

run_integration_tests() {
    echo -e "${BLUE}Running integration tests...${NC}"
    npm run test:integration
}

run_e2e_tests() {
    echo -e "${BLUE}Running end-to-end tests...${NC}"
    npm run test:e2e
}

run_api_tests() {
    echo -e "${BLUE}Running API tests...${NC}"
    npm run test:api
}

run_comprehensive_tests() {
    echo -e "${BLUE}Running comprehensive tests...${NC}"
    npm run test:comprehensive
}

run_coverage() {
    echo -e "${BLUE}Running tests with coverage...${NC}"
    npm run test:cov
}

run_docker_tests() {
    echo -e "${BLUE}Running tests in Docker environment...${NC}"
    npm run docker:test:all
}

run_all_tests() {
    echo -e "${BLUE}Running all tests...${NC}"
    npm run test:all
}

case "${1:-help}" in
    "all")
        run_all_tests
        ;;
    "unit")
        run_unit_tests
        ;;
    "integration")
        run_integration_tests
        ;;
    "e2e")
        run_e2e_tests
        ;;
    "api")
        run_api_tests
        ;;
    "comprehensive")
        run_comprehensive_tests
        ;;
    "coverage")
        run_coverage
        ;;
    "docker")
        run_docker_tests
        ;;
    "help"|*)
        show_help
        ;;
esac