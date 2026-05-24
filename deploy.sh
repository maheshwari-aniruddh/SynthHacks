#!/usr/bin/env bash
# =============================================================================
#  RadPi — One-Shot Deployment Script for Raspberry Pi 5
#  Raspberry Pi OS Lite (Bookworm / Debian 12)
# =============================================================================
#
#  Usage (run on the Pi):
#    sudo bash deploy.sh
#
#  What this does:
#    1.  Install system packages (Node 20, Python 3.12, avahi, NetworkManager)
#    2.  Set hostname → radpi  (makes device reachable as radpi.local)
#    3.  Create Wi-Fi hotspot profile "RadPi-Hotspot" (SSID: RadPi)
#    4.  Set up Python venvs + install all ML deps (Pi-optimised ARM64 wheels)
#    5.  Download AI model weights
#    6.  Build Next.js production bundle
#    7.  Write .env.local
#    8.  Install + enable systemd services
#    9.  Optionally reboot
#
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[radpi]${RESET} $*"; }
success() { echo -e "${GREEN}[radpi] ✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}[radpi] ⚠${RESET} $*"; }
die()     { echo -e "${RED}[radpi] ✗ $*${RESET}" >&2; exit 1; }
banner()  { echo -e "\n${BOLD}${CYAN}══ $* ══${RESET}\n"; }

# ── Configuration (edit if needed) ───────────────────────────────────────────
RADPI_USER="${SUDO_USER:-geet}"                  # user that will own the files
RADPI_DIR="/home/${RADPI_USER}/radpi"          # install path
HOTSPOT_SSID="RadPi"                           # Wi-Fi network name
HOTSPOT_PASS="radpi1234"                       # Wi-Fi password (change me!)
HOTSPOT_CON="RadPi-Hotspot"                    # nmcli connection name
HOSTNAME_NEW="radpi"                           # mDNS hostname → radpi.local
NODE_MAJOR="20"                                # Node.js version

# ── Sanity checks ─────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && die "Run with sudo: sudo bash deploy.sh"
[[ "$(uname -m)" != "aarch64" ]] && warn "Not ARM64 — Pi-optimised torch wheels may not work"

banner "RadPi Deploy — Raspberry Pi 5"
info "Install path : ${RADPI_DIR}"
info "Hotspot SSID : ${HOTSPOT_SSID}"
info "Local domain : ${HOSTNAME_NEW}.local"
info "Running as   : ${RADPI_USER}"
echo

# ── Step 1: System packages ───────────────────────────────────────────────────
banner "Step 1/9 — System packages"

info "Checking internet connection..."
if ping -c 1 -W 2 8.8.8.8 &>/dev/null; then
    ONLINE=true
    info "Internet connection detected. Updating apt..."
    apt-get update -qq || true
else
    ONLINE=false
    warn "No internet connection detected. Skipping apt update and relying on pre-installed packages..."
fi

if [ "$ONLINE" = true ]; then
    info "Installing base packages..."
    apt-get install -y -qq \
        git curl wget \
        python3 python3-pip python3-venv python3-dev \
        libgl1 libglib2.0-0 libgomp1 \
        avahi-daemon avahi-utils libnss-mdns \
        network-manager dnsmasq-base \
        build-essential \
        ca-certificates gnupg || warn "Some packages failed to install, continuing..."
else
    info "Checking required base packages..."
    warn "Offline mode: assuming git, curl, wget, python3, avahi, network-manager, etc. are already installed."
fi

# Node.js 20 via NodeSource
if ! command -v node &>/dev/null || [[ "$(node -e 'process.stdout.write(process.version.split(".")[0].slice(1))')" -lt "${NODE_MAJOR}" ]]; then
    if [ "$ONLINE" = true ]; then
        info "Installing Node.js ${NODE_MAJOR}…"
        curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - || true
        apt-get install -y -qq nodejs || die "Failed to install nodejs"
    else
        die "Node.js is not installed or version is below ${NODE_MAJOR}, and device is offline! Please connect the Pi to the internet first to install Node.js."
    fi
else
    info "Node.js $(node --version) already installed"
fi

success "System packages done"

# ── Step 2: Hostname + mDNS ──────────────────────────────────────────────────
banner "Step 2/9 — Hostname & mDNS"

CURRENT_HOSTNAME=$(hostname)
if [[ "$CURRENT_HOSTNAME" != "$HOSTNAME_NEW" ]]; then
    info "Setting hostname to '${HOSTNAME_NEW}'…"
    hostnamectl set-hostname "${HOSTNAME_NEW}"
    # Update /etc/hosts
    sed -i "s/127\.0\.1\.1.*/127.0.1.1\t${HOSTNAME_NEW}/" /etc/hosts
    success "Hostname set → ${HOSTNAME_NEW}"
else
    info "Hostname already '${HOSTNAME_NEW}'"
fi

# Ensure avahi is running
systemctl enable avahi-daemon --quiet
systemctl restart avahi-daemon
success "mDNS active → ${HOSTNAME_NEW}.local"

# Ensure local hotspot IP resolves to all radpi local domains in /etc/hosts for dnsmasq fallback
info "Configuring /etc/hosts for local domains..."
sed -i '/10\.42\.0\.1/d' /etc/hosts
echo -e "10.42.0.1\t${HOSTNAME_NEW}.local ${HOSTNAME_NEW}.lan ${HOSTNAME_NEW}.wifi ${HOSTNAME_NEW}.home ${HOSTNAME_NEW}" >> /etc/hosts

# Configure NetworkManager's dnsmasq helper to resolve radpi domains for connected clients (Android, Windows, etc.)
info "Configuring NetworkManager dnsmasq helper for hotspot clients…"
mkdir -p /etc/NetworkManager/dnsmasq-shared.d
mkdir -p /etc/NetworkManager/dnsmasq.d

# NOTE: we intentionally do NOT enable `dns=dnsmasq` globally in
# NetworkManager.conf. Doing so spawns a SECOND dnsmasq instance that wants to
# bind to port 53 on lo and competes with the shared-mode dnsmasq that NM
# spawns for the hotspot AP. If a previous deploy turned it on, clear it.
if [[ -f /etc/NetworkManager/NetworkManager.conf ]] \
    && grep -qE '^[[:space:]]*dns=dnsmasq' /etc/NetworkManager/NetworkManager.conf; then
    info "Removing legacy 'dns=dnsmasq' from NetworkManager.conf to avoid port 53 conflict..."
    sed -i '/^[[:space:]]*dns=dnsmasq/d' /etc/NetworkManager/NetworkManager.conf
fi

cat > /etc/NetworkManager/dnsmasq-shared.d/radpi.conf <<EOF
# Force radpi.* domains to resolve to the hotspot gateway IP for every
# client connected to the RadPi Wi-Fi AP. Loaded by the dnsmasq instance
# NetworkManager spawns for the shared-mode connection.
address=/${HOSTNAME_NEW}.local/10.42.0.1
address=/${HOSTNAME_NEW}.lan/10.42.0.1
address=/${HOSTNAME_NEW}.home/10.42.0.1
address=/${HOSTNAME_NEW}.wifi/10.42.0.1
address=/${HOSTNAME_NEW}/10.42.0.1
EOF

# Copy config to standard dnsmasq.d folder too just in case some images of
# the OS use the non-shared dnsmasq plugin path.
cp /etc/NetworkManager/dnsmasq-shared.d/radpi.conf /etc/NetworkManager/dnsmasq.d/radpi.conf

success "Hotspot DNS configuration written to both /etc/NetworkManager/dnsmasq-shared.d/ and /etc/NetworkManager/dnsmasq.d/"

# CRITICAL: dnsmasq-base must be installed or NetworkManager will fall back
# to its internal stub resolver which silently IGNORES the dnsmasq-shared.d/
# files we just wrote. This is the #1 cause of "radpi.lan won't resolve".
if ! dpkg -s dnsmasq-base &>/dev/null; then
    if [ "$ONLINE" = true ]; then
        warn "dnsmasq-base not installed — installing now (required for radpi.lan DNS overrides)"
        apt-get install -y -qq dnsmasq-base
    else
        warn "dnsmasq-base is NOT installed and the Pi is offline."
        warn "radpi.lan / radpi.local DNS overrides will not work until you install it."
    fi
fi

# ── Step 3: Wi-Fi hotspot profile ────────────────────────────────────────────
banner "Step 3/9 — Wi-Fi hotspot (NetworkManager)"

# Make sure NetworkManager manages wlan0
if ! systemctl is-active --quiet NetworkManager; then
    systemctl enable NetworkManager --quiet
    systemctl start NetworkManager
    sleep 3
fi

if nmcli connection show "${HOTSPOT_CON}" &>/dev/null; then
    info "Hotspot connection '${HOTSPOT_CON}' already exists — updating configuration"
    nmcli connection modify "${HOTSPOT_CON}" \
        wifi-sec.psk "${HOTSPOT_PASS}" \
        ipv4.method shared \
        ipv4.addresses "10.42.0.1/24" \
        ipv6.method disabled \
        connection.autoconnect yes \
        connection.autoconnect-priority 100
else
    info "Creating hotspot connection '${HOTSPOT_CON}'…"
    nmcli connection add \
        type wifi \
        ifname wlan0 \
        con-name "${HOTSPOT_CON}" \
        autoconnect yes \
        ssid "${HOTSPOT_SSID}" \
        mode ap \
        ipv4.method shared \
        ipv4.addresses "10.42.0.1/24" \
        ipv6.method disabled \
        -- \
        wifi-sec.key-mgmt wpa-psk \
        wifi-sec.psk "${HOTSPOT_PASS}" \
        connection.autoconnect-priority 100
fi

# CRITICAL: the dnsmasq instance NetworkManager spawns for shared-mode is
# bound to the connection. It does NOT pick up changes to
# /etc/NetworkManager/dnsmasq-shared.d/ until the connection is taken down
# and brought back up. Without this bounce, radpi.lan / radpi.local stay
# unresolvable after a re-deploy.
info "Bouncing hotspot to apply DNS config (dnsmasq reload)…"
nmcli connection down "${HOTSPOT_CON}" >/dev/null 2>&1 || true
sleep 2
nmcli connection up "${HOTSPOT_CON}" >/dev/null 2>&1 || warn "Hotspot did not come back up cleanly — check 'nmcli connection show ${HOTSPOT_CON}'"
sleep 2

success "Hotspot profile ready — SSID: ${HOTSPOT_SSID} / pass: ${HOTSPOT_PASS}"
info "The hotspot is set to start automatically on boot with high priority"

# Verify the shared dnsmasq is actually answering for radpi.lan now.
if command -v dig &>/dev/null; then
    DNS_ANS=$(dig +short +time=2 +tries=1 @10.42.0.1 "${HOSTNAME_NEW}.lan" A 2>/dev/null | head -n1 || true)
    if [[ "$DNS_ANS" == "10.42.0.1" ]]; then
        success "DNS check: ${HOSTNAME_NEW}.lan resolves to 10.42.0.1 via the hotspot dnsmasq"
    else
        warn "DNS check: ${HOSTNAME_NEW}.lan returned '${DNS_ANS:-<no answer>}' (expected 10.42.0.1)"
        warn "Run 'sudo bash fix_radpi_dns.sh' after deploy completes to diagnose."
    fi
fi

# ── Step 4: Project directory ─────────────────────────────────────────────────
banner "Step 4/9 — Project files"

if [[ -f "${RADPI_DIR}/package.json" ]]; then
    info "Project already at ${RADPI_DIR}"
else
    # If running from an existing clone, move it; otherwise prompt for git clone
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "${SCRIPT_DIR}/package.json" ]]; then
        info "Copying project from ${SCRIPT_DIR} → ${RADPI_DIR}"
        mkdir -p "${RADPI_DIR}"
        rsync -a --delete \
              --exclude='.git' \
              --exclude='node_modules' \
              --exclude='.next' \
              --exclude='backend/venv' \
              --exclude='venv-button' \
              --exclude='backend/weights' \
              --exclude='*.log' \
              --exclude='patients.db' \
              --exclude='.DS_Store' \
              "${SCRIPT_DIR}/" "${RADPI_DIR}/"
    else
        die "Cannot find project files. Run this script from the radpi project root, or clone the repo to ${RADPI_DIR} first."
    fi
fi

chown -R "${RADPI_USER}:${RADPI_USER}" "${RADPI_DIR}"
success "Project at ${RADPI_DIR}"

# ── Step 5: Python — backend venv ────────────────────────────────────────────
banner "Step 5/9 — Python backend dependencies"

BACKEND_VENV="${RADPI_DIR}/backend/venv"
WHEELS_DIR="${RADPI_DIR}/backend/wheels"

if [[ ! -d "${BACKEND_VENV}" ]]; then
    info "Creating backend venv…"
    sudo -u "${RADPI_USER}" python3 -m venv "${BACKEND_VENV}"
fi

if [ "$ONLINE" = true ]; then
    info "Installing backend requirements (this takes a while on first run)…"
    info "Using Pi 5 ARM64-optimised torch wheels from torch.kmtea.eu"
    sudo -u "${RADPI_USER}" "${BACKEND_VENV}/bin/pip" install --quiet --upgrade pip || true
    sudo -u "${RADPI_USER}" "${BACKEND_VENV}/bin/pip" install \
        --quiet \
        --extra-index-url https://torch.kmtea.eu/whl/stable \
        -r "${RADPI_DIR}/backend/requirements.txt"
elif [[ -d "${WHEELS_DIR}" ]]; then
    info "Offline mode detected. Installing backend requirements from local wheels..."
    sudo -u "${RADPI_USER}" "${BACKEND_VENV}/bin/pip" install \
        --no-index \
        --find-links "${WHEELS_DIR}" \
        -r "${RADPI_DIR}/backend/requirements.txt" || warn "Some wheels failed to install. Check for missing dependencies."
else
    warn "Offline mode: Skipping backend pip installs. Relying on pre-installed or synced backend virtual environment."
fi

success "Backend Python dependencies configured"

# ── Step 5b: Python — button handler venv ────────────────────────────────────
info "Creating button-handler venv…"
BUTTON_VENV="${RADPI_DIR}/venv-button"

if [[ ! -d "${BUTTON_VENV}" ]]; then
    python3 -m venv "${BUTTON_VENV}"
fi

if [ "$ONLINE" = true ]; then
    "${BUTTON_VENV}/bin/pip" install --quiet evdev || true
elif [[ -d "${WHEELS_DIR}" ]]; then
    info "Installing button handler dependencies from local wheels..."
    "${BUTTON_VENV}/bin/pip" install --no-index --find-links "${WHEELS_DIR}" evdev || true
else
    warn "Offline mode: Skipping button handler pip installs. Assuming evdev is already installed in button venv."
fi
success "Button handler venv ready"

# ── Step 6: Download model weights ───────────────────────────────────────────
banner "Step 6/9 — Model weights"

if [[ -f "${RADPI_DIR}/backend/download_weights.py" ]]; then
    if [ "$ONLINE" = true ]; then
        info "Running download_weights.py…"
        cd "${RADPI_DIR}/backend"
        sudo -u "${RADPI_USER}" \
            HF_TOKEN="${HF_TOKEN:-}" \
            "${BACKEND_VENV}/bin/python" download_weights.py \
            && success "Weights downloaded" \
            || warn "download_weights.py exited with errors — check manually"
        cd - >/dev/null
    else
        info "Offline mode: Checking if weights are already present..."
        if [[ -d "${RADPI_DIR}/backend/weights" ]]; then
            success "Weights directory found"
        else
            warn "Weights directory missing and device is offline!"
        fi
    fi
else
    warn "download_weights.py not found — skipping weight download"
fi

# ── Step 7: Next.js production build ─────────────────────────────────────────
banner "Step 7/9 — Next.js build"

cd "${RADPI_DIR}"
if [ "$ONLINE" = true ]; then
    info "npm ci…"
    sudo -u "${RADPI_USER}" npm ci --silent || warn "npm ci failed, relying on existing node_modules"
    
    info "npm run build…"
    sudo -u "${RADPI_USER}" \
        BACKEND_URL="http://127.0.0.1:8000" \
        NODE_ENV=production \
        npm run build
elif [[ -d "${RADPI_DIR}/.next/standalone" ]]; then
    info "Offline mode: Pre-built standalone bundle detected. Skipping build."
else
    warn "Offline mode: No pre-built bundle found. Attempting to build with local node_modules..."
    sudo -u "${RADPI_USER}" \
        BACKEND_URL="http://127.0.0.1:8000" \
        NODE_ENV=production \
        npm run build || warn "Build failed. Ensure node_modules was transferred."
fi

# Copy static assets into standalone build (if not already there)
info "Ensuring public/ and static files are in standalone bundle…"
mkdir -p "${RADPI_DIR}/.next/standalone/public"
mkdir -p "${RADPI_DIR}/.next/standalone/.next/static"
cp -r "${RADPI_DIR}/public/."  "${RADPI_DIR}/.next/standalone/public/"  2>/dev/null || true
cp -r "${RADPI_DIR}/.next/static/." "${RADPI_DIR}/.next/standalone/.next/static/" 2>/dev/null || true

chown -R "${RADPI_USER}:${RADPI_USER}" "${RADPI_DIR}/.next"
cd - >/dev/null
success "Next.js prepared"

# ── Step 8: Environment file ──────────────────────────────────────────────────
banner "Step 8/9 — Environment file"

ENV_FILE="${RADPI_DIR}/.env.local"
if [[ -f "${ENV_FILE}" ]]; then
    warn ".env.local already exists — not overwriting (delete it to reset)"
else
    info "Writing .env.local…"
    cp "${RADPI_DIR}/.env.pi" "${ENV_FILE}"
    # Inject HF_TOKEN if provided
    if [[ -n "${HF_TOKEN:-}" ]]; then
        sed -i "s|^HF_TOKEN=.*|HF_TOKEN=${HF_TOKEN}|" "${ENV_FILE}"
    fi
    chown "${RADPI_USER}:${RADPI_USER}" "${ENV_FILE}"
    chmod 600 "${ENV_FILE}"
    success ".env.local written"
fi

# ── Step 9: systemd services ──────────────────────────────────────────────────
banner "Step 9/9 — systemd services"

SYSTEMD_DIR="/etc/systemd/system"
SERVICES=(radpi-hotspot radpi-button radpi-backend radpi-frontend)

for svc in "${SERVICES[@]}"; do
    src="${RADPI_DIR}/systemd/${svc}.service"
    dst="${SYSTEMD_DIR}/${svc}.service"
    info "Installing ${svc}.service…"
    cp "${src}" "${dst}"
    # Automatically replace hardcoded 'pi' paths/users with the actual RADPI_USER
    sed -i "s|/home/pi|/home/${RADPI_USER}|g" "${dst}"
    sed -i "s|User=pi|User=${RADPI_USER}|g" "${dst}"
    sed -i "s|Group=pi|Group=${RADPI_USER}|g" "${dst}"
    chmod 644 "${dst}"
done

# Install transparent DNS redirection helper scripts
info "Installing transparent DNS redirection scripts to /usr/local/bin/..."
cp "${RADPI_DIR}/systemd/radpi-dns-redirect.sh" "/usr/local/bin/radpi-dns-redirect.sh"
cp "${RADPI_DIR}/systemd/radpi-dns-redirect-stop.sh" "/usr/local/bin/radpi-dns-redirect-stop.sh"
chmod +x "/usr/local/bin/radpi-dns-redirect.sh"
chmod +x "/usr/local/bin/radpi-dns-redirect-stop.sh"

# Disable default power button action in systemd-logind
info "Configuring systemd-logind to ignore default power button action…"
mkdir -p /etc/systemd/logind.conf.d
echo -e "[Login]\nHandlePowerKey=ignore" > /etc/systemd/logind.conf.d/radpi.conf
systemctl restart systemd-logind

systemctl daemon-reload

# Enable all services to start automatically on boot/power-on
systemctl enable radpi-hotspot.service
systemctl enable radpi-button.service
systemctl enable radpi-backend.service
systemctl enable radpi-frontend.service

# Start/restart all services now (doesn't require reboot)
systemctl restart radpi-hotspot.service
systemctl restart radpi-button.service
systemctl restart radpi-backend.service
systemctl restart radpi-frontend.service

success "radpi services enabled and started (including automatic on-boot hotspot)"
info "All services are running. The Wi-Fi hotspot starts automatically as soon as the Pi powers on."

# ── Done ──────────────────────────────────────────────────────────────────────
echo
echo -e "${BOLD}${GREEN}════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  RadPi deployment complete!  🎉${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════${RESET}"
echo
echo -e "  ${BOLD}Wi-Fi hotspot${RESET}  : SSID '${HOTSPOT_SSID}' / pass '${HOTSPOT_PASS}'"
echo -e "  ${BOLD}URL${RESET}            : http://radpi.local"
echo -e "  ${BOLD}Activate${RESET}       : long-press the Pi 5 button (≥ 3 s)"
echo -e "  ${BOLD}Deactivate${RESET}     : long-press again"
echo -e "  ${BOLD}Shutdown${RESET}       : short press (< 2 s)"
echo
echo -e "  ${BOLD}Service status${RESET} : sudo systemctl status radpi-button"
echo -e "  ${BOLD}Live logs${RESET}      : sudo journalctl -u radpi-backend -u radpi-frontend -f"
echo

read -rp "Reboot now to apply hostname change? [y/N] " REBOOT
if [[ "${REBOOT,,}" == "y" ]]; then
    info "Rebooting…"
    reboot
else
    warn "Hostname change requires a reboot before radpi.local resolves correctly"
    info "Run 'sudo reboot' when ready"
fi
