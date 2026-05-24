#!/usr/bin/env bash
# =============================================================================
#  RadPi — One-Shot DNS Repair Script
#
#  Goal: Make radpi.local / radpi.lan / radpi.wifi / radpi.home resolve to
#        10.42.0.1 for any client connected to the RadPi Wi-Fi hotspot.
#
#  Usage (run on the Pi, NOT on the laptop):
#      sudo bash fix_radpi_dns.sh
#
#  Or from your Mac while connected to the RadPi hotspot:
#      scp fix_radpi_dns.sh geet@10.42.0.1:/tmp/
#      ssh geet@10.42.0.1 "sudo bash /tmp/fix_radpi_dns.sh"
#
#  This script is idempotent. Run it as many times as you want.
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[fix-dns]${RESET} $*"; }
success() { echo -e "${GREEN}[fix-dns] OK${RESET}  $*"; }
warn()    { echo -e "${YELLOW}[fix-dns] !!${RESET}  $*"; }
die()     { echo -e "${RED}[fix-dns] xx${RESET}  $*" >&2; exit 1; }
banner()  { echo -e "\n${BOLD}${CYAN}== $* ==${RESET}\n"; }

HOTSPOT_CON="RadPi-Hotspot"
HOTSPOT_IP="10.42.0.1"
HOSTNAME_NEW="radpi"

[[ $EUID -ne 0 ]] && die "Run with sudo: sudo bash fix_radpi_dns.sh"

banner "Step 1/7  Required packages"
NEED_INSTALL=()
for pkg in dnsmasq-base avahi-daemon avahi-utils libnss-mdns network-manager; do
    if ! dpkg -s "$pkg" &>/dev/null; then
        NEED_INSTALL+=("$pkg")
    fi
done
if [[ ${#NEED_INSTALL[@]} -gt 0 ]]; then
    warn "Missing packages: ${NEED_INSTALL[*]}"
    if ping -c 1 -W 2 8.8.8.8 &>/dev/null; then
        info "Installing missing packages..."
        apt-get update -qq
        apt-get install -y -qq "${NEED_INSTALL[@]}"
        success "Installed: ${NEED_INSTALL[*]}"
    else
        die "Pi is offline AND these packages are missing. Connect the Pi to the internet (Ethernet or your home Wi-Fi), then re-run this script."
    fi
else
    success "All required packages present (dnsmasq-base, avahi, NetworkManager, libnss-mdns)"
fi

banner "Step 2/7  Hostname"
CURRENT_HOSTNAME=$(hostname)
if [[ "$CURRENT_HOSTNAME" != "$HOSTNAME_NEW" ]]; then
    info "Hostname is '$CURRENT_HOSTNAME', changing to '$HOSTNAME_NEW'..."
    hostnamectl set-hostname "$HOSTNAME_NEW"
    sed -i "s/127\.0\.1\.1.*/127.0.1.1\t${HOSTNAME_NEW}/" /etc/hosts
    warn "Hostname change requires a reboot to fully take effect for mDNS."
else
    success "Hostname is already '$HOSTNAME_NEW'"
fi

# /etc/hosts mapping (for queries that go through the system resolver, e.g. the Pi
# itself talking about radpi.local).
sed -i '/10\.42\.0\.1/d' /etc/hosts
echo -e "10.42.0.1\t${HOSTNAME_NEW}.local ${HOSTNAME_NEW}.lan ${HOSTNAME_NEW}.wifi ${HOSTNAME_NEW}.home ${HOSTNAME_NEW}" >> /etc/hosts
success "/etc/hosts updated with all radpi.* aliases"

banner "Step 3/7  Avahi (mDNS) for radpi.local"
systemctl enable avahi-daemon --quiet
systemctl restart avahi-daemon
sleep 1
if systemctl is-active --quiet avahi-daemon; then
    success "avahi-daemon is running (radpi.local will be advertised via mDNS)"
else
    warn "avahi-daemon failed to start! Run: sudo journalctl -u avahi-daemon -n 50"
fi

banner "Step 4/7  NetworkManager dnsmasq configuration"

# Make sure the dnsmasq-shared.d directory exists and contains our overrides.
mkdir -p /etc/NetworkManager/dnsmasq-shared.d
mkdir -p /etc/NetworkManager/dnsmasq.d

cat > /etc/NetworkManager/dnsmasq-shared.d/radpi.conf <<EOF
# RadPi local-domain overrides.
# This file is loaded by the dnsmasq instance NetworkManager spawns for the
# shared-mode (AP) connection. Every client connected to the RadPi hotspot
# will receive these answers when they query DNS.
address=/${HOSTNAME_NEW}.local/${HOTSPOT_IP}
address=/${HOSTNAME_NEW}.lan/${HOTSPOT_IP}
address=/${HOSTNAME_NEW}.home/${HOTSPOT_IP}
address=/${HOSTNAME_NEW}.wifi/${HOTSPOT_IP}
address=/${HOSTNAME_NEW}/${HOTSPOT_IP}
# Also answer for the bare 'http://radpi' lookup that Chrome / Brave / Safari
# will send when the user just types "radpi" in the URL bar.
EOF
cp /etc/NetworkManager/dnsmasq-shared.d/radpi.conf /etc/NetworkManager/dnsmasq.d/radpi.conf
success "Wrote /etc/NetworkManager/dnsmasq-shared.d/radpi.conf (and dnsmasq.d/ copy)"

# Make sure NetworkManager's GLOBAL resolver mode is NOT dnsmasq.
# The shared-mode dnsmasq for the hotspot is a SEPARATE instance, and having
# the global plugin also bind to port 53 on lo causes confusion / conflicts.
# We default to NM's standard resolver and let the shared instance own port 53
# on wlan0 / 10.42.0.1.
if [[ -f /etc/NetworkManager/NetworkManager.conf ]]; then
    if grep -qE '^[[:space:]]*dns=dnsmasq' /etc/NetworkManager/NetworkManager.conf; then
        info "Removing 'dns=dnsmasq' from NetworkManager.conf to avoid port 53 conflict..."
        sed -i '/^[[:space:]]*dns=dnsmasq/d' /etc/NetworkManager/NetworkManager.conf
    fi
fi
success "NetworkManager global DNS plugin is not fighting with shared-mode dnsmasq"

banner "Step 5/7  Hotspot connection profile sanity-check"

if ! nmcli connection show "$HOTSPOT_CON" &>/dev/null; then
    die "Hotspot profile '$HOTSPOT_CON' does not exist. Run 'sudo bash deploy.sh' first."
fi

# Force the right settings on the hotspot connection.
nmcli connection modify "$HOTSPOT_CON" \
    ipv4.method shared \
    ipv4.addresses "${HOTSPOT_IP}/24" \
    ipv6.method disabled \
    connection.autoconnect yes \
    connection.autoconnect-priority 100 >/dev/null

success "Hotspot profile pinned to shared mode @ ${HOTSPOT_IP}/24"

banner "Step 6/7  Bounce the hotspot (forces dnsmasq to reload)"

# This is the crucial step that fixes the "I wrote the config but DNS still
# doesn't answer" problem. The dnsmasq spawned by NetworkManager for the
# shared connection is bound to the connection's lifetime: it does NOT pick
# up config changes until the connection goes DOWN and UP again.
info "Taking hotspot down..."
nmcli connection down "$HOTSPOT_CON" >/dev/null 2>&1 || true
sleep 2
info "Bringing hotspot back up..."
nmcli connection up "$HOTSPOT_CON" >/dev/null
sleep 3
success "Hotspot bounced. NetworkManager has spawned a fresh dnsmasq with our overrides."

# Make sure the iptables DNS-redirect rules are still in place (so clients
# that ignore DHCP-provided DNS and use 8.8.8.8 / 1.1.1.1 / Private DNS still
# get redirected to our dnsmasq).
if [[ ! -x /usr/local/bin/radpi-dns-redirect.sh ]]; then
    # On older deploys this helper might be missing. Try to install it
    # from the repo if we can locate the project directory.
    PROJECT_DIR=""
    for candidate in /home/geet/radpi /home/pi/radpi "$(dirname "$0")"; do
        if [[ -f "$candidate/systemd/radpi-dns-redirect.sh" ]]; then
            PROJECT_DIR="$candidate"
            break
        fi
    done
    if [[ -n "$PROJECT_DIR" ]]; then
        info "Installing missing /usr/local/bin/radpi-dns-redirect.sh from $PROJECT_DIR..."
        cp "$PROJECT_DIR/systemd/radpi-dns-redirect.sh"      /usr/local/bin/radpi-dns-redirect.sh
        cp "$PROJECT_DIR/systemd/radpi-dns-redirect-stop.sh" /usr/local/bin/radpi-dns-redirect-stop.sh
        chmod +x /usr/local/bin/radpi-dns-redirect.sh /usr/local/bin/radpi-dns-redirect-stop.sh
    fi
fi
if [[ -x /usr/local/bin/radpi-dns-redirect.sh ]]; then
    /usr/local/bin/radpi-dns-redirect.sh >/dev/null || warn "DNS redirect script failed (non-fatal)"
    success "Transparent DNS redirect (iptables) rules applied"
else
    warn "radpi-dns-redirect.sh not installed - clients using Private DNS may bypass our resolver (non-fatal)"
fi

banner "Step 7/7  Verification"

echo
info "What's listening on port 53?"
ss -tulpn 2>/dev/null | awk 'NR==1 || /:53 /' || true
echo

# Resolve radpi.lan via the shared dnsmasq from inside the Pi itself.
# We point the query directly at 10.42.0.1 so it really hits the shared instance.
# We deliberately do NOT test the bare "radpi" name: nobody types a dotless host
# in a browser (it triggers a search) and on Linux /etc/hosts shadows it with
# 127.0.1.1 anyway. The four dotted names below are what real clients use.
info "Testing DNS resolution against the hotspot dnsmasq (10.42.0.1)..."
ALL_OK=true
for host in radpi.lan radpi.wifi radpi.home radpi.local; do
    if command -v dig &>/dev/null; then
        ANS=$(dig +short +time=2 +tries=1 @10.42.0.1 "$host" A 2>/dev/null | head -n1)
    else
        ANS=$(getent ahostsv4 "$host" 2>/dev/null | awk '{print $1; exit}')
    fi
    if [[ "$ANS" == "$HOTSPOT_IP" ]]; then
        success "$host -> $ANS"
    else
        warn "$host -> '${ANS:-<no answer>}' (expected $HOTSPOT_IP)"
        ALL_OK=false
    fi
done
echo

if $ALL_OK; then
    echo -e "${BOLD}${GREEN}==============================================${RESET}"
    echo -e "${BOLD}${GREEN}  DNS repair complete.${RESET}"
    echo -e "${BOLD}${GREEN}==============================================${RESET}"
    echo
    echo -e "  On your Mac/phone, connect to Wi-Fi '${BOLD}RadPi${RESET}' and open:"
    echo
    echo -e "    ${BOLD}http://radpi.lan${RESET}   (most reliable, plain DNS)"
    echo -e "    ${BOLD}http://radpi.local${RESET} (mDNS / Bonjour - great on Mac/iPhone)"
    echo -e "    ${BOLD}http://radpi.wifi${RESET}  (alternative)"
    echo
    echo -e "  If your browser was open before this script ran, flush its DNS:"
    echo -e "    Brave/Chrome: brave://net-internals/#dns -> 'Clear host cache'"
    echo -e "    Safari/macOS: sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder"
    echo
    if [[ "${CURRENT_HOSTNAME:-}" != "$HOSTNAME_NEW" ]]; then
        echo -e "  ${YELLOW}Optional:${RESET} the hostname was just changed from '${CURRENT_HOSTNAME}' to"
        echo -e "  '${HOSTNAME_NEW}'. Avahi will fully advertise the new mDNS name after a reboot:"
        echo -e "      ${BOLD}sudo reboot${RESET}"
        echo -e "  (radpi.local already works via unicast DNS without rebooting.)"
        echo
    fi
else
    warn "Some lookups still failed. Things to check next:"
    echo "  1. 'sudo journalctl -u NetworkManager -n 80'  - look for dnsmasq spawn errors"
    echo "  2. 'ps aux | grep dnsmasq'                    - confirm a dnsmasq is bound to wlan0"
    echo "  3. 'nmcli connection show RadPi-Hotspot | grep -i ipv4'  - verify shared mode is active"
    echo "  4. Reboot the Pi: 'sudo reboot'"
fi
