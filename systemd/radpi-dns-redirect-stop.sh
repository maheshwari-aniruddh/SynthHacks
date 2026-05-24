#!/usr/bin/env bash
# =============================================================================
#  RadPi — Transparent DNS Redirection Stop Script
#  Cleans up all custom iptables redirect rules
# =============================================================================

set -euo pipefail

# 1. Remove references in PREROUTING
iptables -t nat -D PREROUTING -i wlan0 -j RADPI_DNS_REDIRECT 2>/dev/null || true

# 2. Remove masquerade rules
iptables -t nat -D POSTROUTING -p udp -d 10.42.0.1 --dport 53 -j MASQUERADE 2>/dev/null || true
iptables -t nat -D POSTROUTING -p tcp -d 10.42.0.1 --dport 53 -j MASQUERADE 2>/dev/null || true

# 3. Flush and delete the custom chain
iptables -t nat -F RADPI_DNS_REDIRECT 2>/dev/null || true
iptables -t nat -X RADPI_DNS_REDIRECT 2>/dev/null || true

echo "RadPi transparent DNS redirection stopped."
