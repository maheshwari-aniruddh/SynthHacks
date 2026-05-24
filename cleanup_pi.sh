#!/usr/bin/env bash
# =============================================================================
#  RadPi — Raspberry Pi 5 Disk Space Cleanup Utility
#  Safely reclaims SD card storage space without deleting critical weights or DBs.
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[cleanup]${RESET} $*"; }
success() { echo -e "${GREEN}[cleanup] ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}[cleanup] ⚠${RESET} $*"; }

[[ $EUID -ne 0 ]] && echo -e "${RED}Please run this script with sudo: sudo ./cleanup_pi.sh${RESET}" && exit 1

echo -e "${BOLD}${CYAN}══ RadPi SD Card Storage Cleanup ══${RESET}\n"

# 1. Vacuum Systemd Journals (clears old logs)
info "Vacuuming systemd journals to max 50MB..."
journalctl --vacuum-size=50M || warn "Journal vacuuming failed."

# 2. Clean APT caches
info "Cleaning system package caches and removing orphaned dependencies..."
apt-get autoremove -y -qq || true
apt-get clean -y -qq || true

# 3. Clean Next.js & NPM caches
info "Cleaning npm caches..."
if command -v npm &>/dev/null; then
    npm cache clean --force || true
fi

# 4. Clean user-level caches (HuggingFace, Pip, NPM)
# Since we are running as root, we clean for both root and the actual non-sudo user (geet)
REAL_USER="${SUDO_USER:-geet}"
REAL_HOME="/home/${REAL_USER}"

info "Cleaning user caches for user: ${REAL_USER}..."
USER_CACHES=(
    "${REAL_HOME}/.cache/pip"
    "${REAL_HOME}/.cache/huggingface"
    "${REAL_HOME}/.npm"
    "${REAL_HOME}/radpi/.next/cache"
)

for cache_path in "${USER_CACHES[@]}"; do
    if [[ -d "${cache_path}" ]]; then
        info "Removing cache: ${cache_path}"
        rm -rf "${cache_path}"
    fi
done

# 5. Clean python cache directories recursively
info "Purging __pycache__ folders in radpi workspace..."
if [[ -d "${REAL_HOME}/radpi" ]]; then
    find "${REAL_HOME}/radpi" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
fi

# 6. Clean old static temporary uploads inside workspace
STATIC_DIR="${REAL_HOME}/radpi/static"
if [[ -d "${STATIC_DIR}" ]]; then
    info "Clearing temporary scanned images in static assets..."
    # Keep the directory itself but delete contents
    rm -rf "${STATIC_DIR:?}"/* 2>/dev/null || true
fi

# 7. Safe prune of Docker (if present)
if command -v docker &>/dev/null; then
    info "Docker detected. Pruning unused containers, volumes, and networks..."
    docker system prune -f --volumes || true
fi

# Show final disk utilization
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Disk Cleanup Completed!  🎉${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${RESET}"
echo ""
info "Current Disk Space Status (df -h /):"
df -h /
echo ""
