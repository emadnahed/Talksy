#!/usr/bin/env bash
# scripts/deploy.sh — Unified deploy script for dual deployment
# Usage:
#   ./scripts/deploy.sh all                 # Deploy both environments
#   ./scripts/deploy.sh production          # Deploy production (main branch, port 3000)
#   ./scripts/deploy.sh staging             # Deploy staging (staging branch, port 3001)
#   ./scripts/deploy.sh status              # Show container status
#   ./scripts/deploy.sh down:prod           # Tear down production
#   ./scripts/deploy.sh down:staging        # Tear down staging
#   ./scripts/deploy.sh down:all            # Tear down everything

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOME_BRANCH="main"

# Colors
log()     { echo -e "\033[0;36m[DEPLOY]\033[0m $*"; }
success() { echo -e "\033[0;32m[OK]\033[0m $*"; }
warn()    { echo -e "\033[1;33m[WARN]\033[0m $*"; }
fail()    { echo -e "\033[0;31m[FAIL]\033[0m $*"; exit 1; }

# Detect docker compose command
COMPOSE_CMD="docker compose"
if ! docker compose version &>/dev/null 2>&1; then
  if command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
  else
    fail "Neither 'docker compose' nor 'docker-compose' found"
  fi
fi

compose_prod() {
  $COMPOSE_CMD -p talksy-prod \
    --env-file "$REPO_DIR/.env.prod" \
    -f "$REPO_DIR/docker-compose.base.yml" \
    -f "$REPO_DIR/docker-compose.prod.yml" \
    "$@"
}

compose_staging() {
  $COMPOSE_CMD -p talksy-staging \
    --env-file "$REPO_DIR/.env.staging" \
    -f "$REPO_DIR/docker-compose.base.yml" \
    -f "$REPO_DIR/docker-compose.staging.yml" \
    "$@"
}

deploy_env() {
  local env="$1"
  local branch env_file app_port compose_fn

  case "$env" in
    production)
      branch="main"
      env_file=".env.prod"
      app_port=3000
      compose_fn="compose_prod"
      ;;
    staging)
      branch="staging"
      env_file=".env.staging"
      app_port=3001
      compose_fn="compose_staging"
      ;;
    *) fail "Unknown environment: $env" ;;
  esac

  log "Deploying $env (branch: $branch)..."
  cd "$REPO_DIR"

  # Check env file exists
  [ -f "$env_file" ] || fail "$env_file not found. Copy .env.example to $env_file and fill in values."

  # Switch to target branch
  local current_branch
  current_branch=$(git branch --show-current)
  if [ "$current_branch" != "$branch" ]; then
    log "Switching to $branch branch..."
    git checkout "$branch"
  fi

  # Pull latest
  log "Pulling latest from $branch..."
  git pull origin "$branch" 2>&1 | tail -3

  # Build and start
  log "Building and starting containers..."
  $compose_fn build --parallel
  $compose_fn up -d

  # Health check
  log "Waiting for app on port $app_port..."
  local retries=30
  while [ $retries -gt 0 ]; do
    if curl -sf "http://localhost:${app_port}/health" &>/dev/null; then
      break
    fi
    retries=$((retries - 1))
    if [ $retries -eq 0 ]; then
      warn "App not responding on port $app_port after 30s (may still be starting)"
    fi
    sleep 1
  done

  if [ $retries -gt 0 ]; then
    success "$env is live on port $app_port"
  fi

  # Show status
  $compose_fn ps
}

show_status() {
  echo ""
  echo "=== Production ==="
  if [ -f "$REPO_DIR/.env.prod" ]; then
    compose_prod ps 2>/dev/null || echo "  Not running"
  else
    echo "  .env.prod not found"
  fi
  echo ""
  echo "=== Staging ==="
  if [ -f "$REPO_DIR/.env.staging" ]; then
    compose_staging ps 2>/dev/null || echo "  Not running"
  else
    echo "  .env.staging not found"
  fi
  echo ""
}

# --- Main ---

cd "$REPO_DIR"
docker info &>/dev/null || fail "Docker is not running"

COMMAND="${1:-}"

case "$COMMAND" in
  all)
    # Stash uncommitted changes
    STASHED=false
    if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
      git stash push -m "deploy-auto-stash-$(date +%s)"
      STASHED=true
    fi

    deploy_env production
    deploy_env staging

    # Return to home branch
    if [ "$(git branch --show-current)" != "$HOME_BRANCH" ]; then
      git checkout "$HOME_BRANCH"
    fi
    if $STASHED; then
      git stash pop || true
    fi
    success "Both environments deployed"
    ;;

  production|staging)
    STASHED=false
    if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
      git stash push -m "deploy-auto-stash-$(date +%s)"
      STASHED=true
    fi

    deploy_env "$COMMAND"

    if [ "$(git branch --show-current)" != "$HOME_BRANCH" ]; then
      git checkout "$HOME_BRANCH"
    fi
    if $STASHED; then
      git stash pop || true
    fi
    ;;

  status)
    show_status
    ;;

  down:prod)
    log "Tearing down production..."
    compose_prod down
    success "Production stopped"
    ;;

  down:staging)
    log "Tearing down staging..."
    compose_staging down
    success "Staging stopped"
    ;;

  down:all)
    log "Tearing down all environments..."
    compose_prod down 2>/dev/null || true
    compose_staging down 2>/dev/null || true
    success "All environments stopped"
    ;;

  *)
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  all           Deploy both environments"
    echo "  production    Deploy production (main branch, port 3000)"
    echo "  staging       Deploy staging (staging branch, port 3001)"
    echo "  status        Show container status"
    echo "  down:prod     Tear down production"
    echo "  down:staging  Tear down staging"
    echo "  down:all      Tear down everything"
    exit 1
    ;;
esac
