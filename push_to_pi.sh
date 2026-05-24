#!/usr/bin/env bash
# =============================================================================
#  RadPi — Hotspot Push & Deploy Script
#  Syncs local changes from your laptop to the Raspberry Pi over Wi-Fi
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[push]${RESET} $*"; }
success() { echo -e "${GREEN}[push] ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}[push] ⚠${RESET} $*"; }
error()   { echo -e "${RED}[push] ✗ $*${RESET}" >&2; exit 1; }

PI_HOST="10.42.0.1"
PI_USER="geet"
PI_DIR="/home/${PI_USER}/radpi"

echo -e "${BOLD}${CYAN}══ RadPi Laptop-to-Pi Push Sync ══${RESET}\n"

# 1. Verify connection
info "Checking connection to Raspberry Pi (${PI_HOST})..."
if ! ping -c 1 -W 2 "${PI_HOST}" &>/dev/null; then
    # Fallback to local mDNS hostname
    PI_HOST="radpi.local"
    info "10.42.0.1 not reachable. Trying mDNS hostname (${PI_HOST})..."
    if ! ping -c 1 -W 2 "${PI_HOST}" &>/dev/null; then
        error "Could not connect to the Raspberry Pi.\n  Please make sure your laptop is connected to the 'RadPi' Wi-Fi hotspot!"
    fi
fi
success "Connection active! Using host: ${PI_HOST}"

# 2. Sync files via rsync
info "Syncing local changes to ${PI_USER}@${PI_HOST}:${PI_DIR}..."
rsync -avz --delete --progress \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='backend/venv/' \
  --exclude='venv-button/' \
  --exclude='backend/weights/llm/' \
  --exclude='backend/weights/brain_mri/' \
  --exclude='backend/weights/brain_mri*' \
  --exclude='backend/weights/cataract/' \
  --exclude='backend/weights/cataract*' \
  --exclude='backend/weights/dental.pt' \
  --exclude='backend/weights/dermatology.pth' \
  --exclude='backend/weights/fundus.bin' \
  --exclude='backend/weights/tb.safetensors' \
  --exclude='backend/weights/tb_config.json' \
  --exclude='*.log' \
  --exclude='patients.db' \
  --exclude='.DS_Store' \
  ./ "${PI_USER}@${PI_HOST}:${PI_DIR}/"

success "Files transferred successfully."

# 3. Remote build and restart services
info "Triggering remote build and service restart on the Pi..."
ssh "${PI_USER}@${PI_HOST}" -t "
  cd ${PI_DIR} && \
  if [ ! -f .env.local ]; then \
    echo '==== Re-creating missing .env.local from .env.pi ====' && \
    cp .env.pi .env.local && \
    chmod 600 .env.local; \
  else \
    echo '==== Syncing .env.pi changes to .env.local ====' && \
    cp .env.pi .env.local && \
    chmod 600 .env.local; \
  fi && \
  echo '==== Building Next.js production bundle on the Pi ====' && \
  npm run build && \
  echo '==== Ensuring public/ and static/ files are in standalone bundle ====' && \
  mkdir -p .next/standalone/public && \
  mkdir -p .next/standalone/.next/static && \
  cp -r public/. .next/standalone/public/ 2>/dev/null || true && \
  cp -r .next/static/. .next/standalone/.next/static/ 2>/dev/null || true && \
  echo '==== Restarting RadPi systemd services ====' && \
  sudo systemctl restart radpi-frontend radpi-backend
"

echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Push & Deployment Successful!  🚀${RESET}"
echo -e "${BOLD}${GREEN}  Open: http://radpi.lan (or http://10.42.0.1)${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${RESET}"
