#!/usr/bin/env bash
# =============================================================================
#  RadPi — Transparent DNS Redirection Script
#  Redirects all client DNS traffic to local dnsmasq (10.42.0.1:53)
# =============================================================================

set -euo pipefail

# 1. Create a custom iptables chain to prevent duplicate rules
iptables -t nat -N RADPI_DNS_REDIRECT 2>/dev/null || true
iptables -t nat -F RADPI_DNS_REDIRECT

# 2. Redirect port 53 (UDP & TCP) traffic to local DNS server (10.42.0.1:53)
iptables -t nat -A RADPI_DNS_REDIRECT -p udp --dport 53 -j DNAT --to-destination 10.42.0.1:53
iptables -t nat -A RADPI_DNS_REDIRECT -p tcp --dport 53 -j DNAT --to-destination 10.42.0.1:53

# 3. Intercept incoming traffic on the wlan0 interface
iptables -t nat -C PREROUTING -i wlan0 -j RADPI_DNS_REDIRECT 2>/dev/null || \
iptables -t nat -A PREROUTING -i wlan0 -j RADPI_DNS_REDIRECT

# 4. Handle packet masquerading for redirected DNS queries
iptables -t nat -C POSTROUTING -p udp -d 10.42.0.1 --dport 53 -j MASQUERADE 2>/dev/null || \
iptables -t nat -A POSTROUTING -p udp -d 10.42.0.1 --dport 53 -j MASQUERADE

iptables -t nat -C POSTROUTING -p tcp -d 10.42.0.1 --dport 53 -j MASQUERADE 2>/dev/null || \
iptables -t nat -A POSTROUTING -p tcp -d 10.42.0.1 --dport 53 -j MASQUERADE

echo "RadPi transparent DNS redirection active."
