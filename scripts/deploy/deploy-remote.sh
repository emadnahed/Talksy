#!/bin/bash
# Deploy Talksy to a remote server
# Usage: ./scripts/deploy/deploy-remote.sh <environment> <host>
#
# Examples:
#   ./scripts/deploy/deploy-remote.sh vps user@192.168.1.100
#   ./scripts/deploy/deploy-remote.sh staging user@staging.example.com
#   ./scripts/deploy/deploy-remote.sh production user@api.example.com

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Arguments
ENV=${1:-vps}
REMOTE_HOST=${2:-}
REMOTE_DIR=${REMOTE_DIR:-/opt/talksy}

# Validate arguments
if [ -z "$REMOTE_HOST" ]; then
    echo -e "${RED}Error: Remote host is required${NC}"
    echo ""
    echo "Usage: $0 <environment> <host>"
    echo ""
    echo "Environments:"
    echo "  vps         - VPS deployment"
    echo "  staging     - Staging environment"
    echo "  production  - Production environment"
    echo ""
    echo "Examples:"
    echo "  $0 vps user@192.168.1.100"
    echo "  $0 staging user@staging.example.com"
    echo "  $0 production user@api.example.com"
    echo ""
    exit 1
fi

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Talksy Remote Deployment                            ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Environment: $ENV"
echo "  Remote Host: $REMOTE_HOST"
echo "  Remote Dir:  $REMOTE_DIR"
echo ""

# Confirmation for production
if [ "$ENV" = "production" ]; then
    echo -e "${RED}⚠️  WARNING: You are about to deploy to PRODUCTION!${NC}"
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Deployment cancelled"
        exit 0
    fi
fi

cd "$PROJECT_ROOT"

# Step 1: Build locally
echo -e "${YELLOW}► Step 1: Building application...${NC}"
npm run build
echo -e "${GREEN}  Build complete${NC}"

# Step 2: Create deployment package
echo -e "${YELLOW}► Step 2: Creating deployment package...${NC}"
DEPLOY_DIR=$(mktemp -d)
DEPLOY_TAR="$DEPLOY_DIR/talksy-deploy.tar.gz"

tar -czf "$DEPLOY_TAR" \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=coverage \
    --exclude=.pids \
    --exclude=.logs \
    --exclude=test \
    --exclude=timely-reports \
    dist \
    package.json \
    package-lock.json \
    docker \
    envs \
    Dockerfile \
    docker-compose.yml

echo -e "${GREEN}  Package created: $DEPLOY_TAR${NC}"

# Step 3: Upload to remote
echo -e "${YELLOW}► Step 3: Uploading to remote server...${NC}"
ssh "$REMOTE_HOST" "mkdir -p $REMOTE_DIR"
scp "$DEPLOY_TAR" "$REMOTE_HOST:$REMOTE_DIR/"
echo -e "${GREEN}  Upload complete${NC}"

# Step 4: Deploy on remote
echo -e "${YELLOW}► Step 4: Deploying on remote server...${NC}"
ssh "$REMOTE_HOST" << EOF
    set -e
    cd $REMOTE_DIR

    # Backup current deployment
    if [ -d "dist" ]; then
        mv dist dist.backup.\$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
    fi

    # Extract new deployment
    tar -xzf talksy-deploy.tar.gz
    rm talksy-deploy.tar.gz

    # Install dependencies
    npm ci --only=production

    # Setup environment file if not exists
    if [ ! -f "envs/.env.production" ]; then
        if [ -f "envs/.env.production.example" ]; then
            cp envs/.env.production.example envs/.env.production
            echo "⚠️  Created .env.production from example - please configure it!"
        fi
    fi

    # Restart with Docker Compose (preferred)
    if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
        if docker compose version &> /dev/null; then
            docker compose -f docker/docker-compose.prod.yml down || true
            docker compose -f docker/docker-compose.prod.yml up -d --build
        else
            docker-compose -f docker/docker-compose.prod.yml down || true
            docker-compose -f docker/docker-compose.prod.yml up -d --build
        fi
    # Fallback 1: Use PM2 for process management (recommended)
    elif command -v pm2 &> /dev/null; then
        echo "Docker not available, using PM2 for process management..."

        # Create PM2 ecosystem file for better configuration
        cat > ecosystem.config.js << 'PMEOF'
module.exports = {
  apps: [{
    name: 'talksy',
    script: 'dist/main.js',
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: '/var/log/talksy-error.log',
    out_file: '/var/log/talksy-out.log',
    log_file: '/var/log/talksy-combined.log',
    time: true
  }]
};
PMEOF

        # Stop existing process and start with PM2
        pm2 stop talksy 2>/dev/null || true
        pm2 delete talksy 2>/dev/null || true
        pm2 start ecosystem.config.js --env production
        pm2 save

        echo "PM2 process started. Useful commands:"
        echo "  pm2 logs talksy    - View logs"
        echo "  pm2 monit          - Monitor processes"
        echo "  pm2 restart talksy - Restart application"

    # Fallback 2: Use systemd for process management
    elif [ -d "/etc/systemd/system" ] && command -v systemctl &> /dev/null; then
        echo "Docker/PM2 not available, configuring systemd service..."

        # Create systemd service file
        sudo tee /etc/systemd/system/talksy.service > /dev/null << SVCEOF
[Unit]
Description=Talksy API Server
After=network.target

[Service]
Type=simple
User=\$(whoami)
WorkingDirectory=$REMOTE_DIR
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/talksy.log
StandardError=append:/var/log/talksy-error.log
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SVCEOF

        # Reload systemd and start service
        sudo systemctl daemon-reload
        sudo systemctl stop talksy 2>/dev/null || true
        sudo systemctl start talksy
        sudo systemctl enable talksy

        echo "Systemd service configured. Useful commands:"
        echo "  sudo systemctl status talksy  - Check status"
        echo "  sudo journalctl -u talksy -f  - View logs"
        echo "  sudo systemctl restart talksy - Restart service"

    # Fallback 3: Basic nohup (NOT recommended for production)
    else
        echo "⚠️  WARNING: No robust process manager available!"
        echo "   Docker, PM2, and systemd are not available."
        echo "   Using basic nohup - process will NOT auto-restart on crash."
        echo ""
        echo "   For production, please install one of:"
        echo "   - Docker: https://docs.docker.com/engine/install/"
        echo "   - PM2: npm install -g pm2"
        echo "   - Or use a systemd-enabled Linux distribution"
        echo ""

        pkill -f "node dist/main" || true
        nohup node dist/main > /var/log/talksy.log 2>&1 &

        echo "Process started with PID: \$!"
        echo "Logs: tail -f /var/log/talksy.log"
    fi

    echo "Deployment complete!"
EOF

echo -e "${GREEN}  Deployment complete${NC}"

# Step 5: Verify deployment
echo -e "${YELLOW}► Step 5: Verifying deployment...${NC}"
sleep 5

# Extract host without user@
REMOTE_IP=$(echo "$REMOTE_HOST" | sed 's/.*@//')

if curl -s "http://$REMOTE_IP:3000/health" 2>/dev/null | grep -q "ok"; then
    echo -e "${GREEN}  Health check passed!${NC}"
else
    echo -e "${YELLOW}  Health check pending (may take a moment to start)${NC}"
fi

# Cleanup
rm -rf "$DEPLOY_DIR"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Deployment Complete!                                ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  API:         http://$REMOTE_IP:3000"
echo "  WebSocket:   ws://$REMOTE_IP:3000"
echo "  Health:      http://$REMOTE_IP:3000/health"
echo ""
echo "  SSH:         ssh $REMOTE_HOST"
echo ""
echo "  View logs (depends on deployment method):"
echo "    Docker:    ssh $REMOTE_HOST 'docker logs talksy-prod-app -f'"
echo "    PM2:       ssh $REMOTE_HOST 'pm2 logs talksy'"
echo "    systemd:   ssh $REMOTE_HOST 'sudo journalctl -u talksy -f'"
echo "    nohup:     ssh $REMOTE_HOST 'tail -f /var/log/talksy.log'"
echo ""
