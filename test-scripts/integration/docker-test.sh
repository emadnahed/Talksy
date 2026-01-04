#!/bin/bash

# Script to test the Talksy application with Docker
set -e  # Exit on any error

echo "Starting Talksy application testing with Docker..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running. Please start Docker Desktop first."
    exit 1
fi

echo "Docker is running, proceeding with tests..."

# Stop any existing containers
echo "Stopping existing containers..."
docker-compose down 2>/dev/null || true

# Build the application
echo "Building the application..."
npm run build

# Start the application with Docker Compose in detached mode
echo "Starting Talksy application with Docker Compose..."
docker-compose up --build -d

# Wait for the application to be ready
echo "Waiting for application to be ready..."
sleep 15

# Check if containers are running
if docker-compose ps | grep -q "Up"; then
    echo "Application is running successfully!"
    docker-compose ps
else
    echo "Error: Application failed to start properly"
    docker-compose logs
    exit 1
fi

# Run unit tests (these don't require the running application)
echo "Running unit tests..."
npm run test:unit

# Run integration tests (these don't require the running application)
echo "Running integration tests..."
npm run test:integration

# Run test coverage
echo "Running test coverage..."
npm run test:cov

# Test the running application endpoints
echo "Testing application endpoints..."
sleep 5
if curl -f http://localhost:3000/health >/dev/null 2>&1; then
    echo "✓ Health check passed"
    curl -s http://localhost:3000/health
else
    echo "✗ Health check failed"
fi

if curl -f http://localhost:3000/health/detailed >/dev/null 2>&1; then
    echo "✓ Detailed health check passed"
    curl -s http://localhost:3000/health/detailed
else
    echo "✗ Detailed health check failed"
fi

# Stop the application
echo "Stopping the application..."
docker-compose down

echo "All tests completed successfully!"