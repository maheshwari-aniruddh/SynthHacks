# RadPi — Hotspot Quick Reference

## Connect to RadPi

1. On your device (phone / laptop / tablet), open **Wi-Fi settings**
2. Connect to network: **`RadPi`**
3. Enter password: **`radpi1234`**
4. Open your browser and go to:

```
http://radpi.lan
```

(Alternatively, you can also use **`http://radpi.wifi`** or **`http://radpi.local`**)

That's it. You're using the AI medical imaging system running fully on the Pi.

---

## Power Button Behaviour

| Press | What Happens |
|---|---|
| **Long press ≥ 3 s** (Normal mode) | 3 fast LED flashes → hotspot starts → RadPi launches |
| **Long press ≥ 3 s** (RadPi mode) | 3 slow LED flashes → hotspot stops → back to normal |
| **Short press < 2 s** | Safe shutdown (either mode) |

### LED Guide

| LED pattern | Meaning |
|---|---|
| Normal activity blink | Pi is idle in Normal mode |
| 3 quick flashes | RadPi activating… |
| Slow breathing pulse | RadPi mode is ACTIVE |
| 3 slow flashes | RadPi deactivating… |
| 5 fast flashes then off | Shutting down |

---

## Check Service Status (SSH into Pi)

```bash
# Button handler (always running)
sudo systemctl status radpi-button

# Backend / frontend (only while in RadPi mode)
sudo systemctl status radpi-backend
sudo systemctl status radpi-frontend

# Live logs
sudo journalctl -u radpi-backend -u radpi-frontend -f

# Button handler log
cat /var/log/radpi-button.log
```

---

## Troubleshooting

### `radpi.lan` or `radpi.local` doesn't resolve
- Make sure you're connected to the **RadPi** Wi-Fi network, not your home network or cellular data.
- **One-shot repair**: SSH into the Pi (or open a terminal on the Pi directly) and run:

  ```bash
  cd /home/geet/radpi   # or wherever you put the project
  sudo bash fix_radpi_dns.sh
  ```

  This re-writes every DNS config file, bounces the hotspot so the dnsmasq
  instance actually reloads, and prints a verification table. It is safe to
  run as many times as you want.

- After running the fix, flush your client's DNS cache:
  - **macOS / Brave / Chrome / Safari**: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
  - **Chrome/Brave**: open `brave://net-internals/#dns` → "Clear host cache"
  - **iPhone**: toggle Wi-Fi off and back on
  - **Android**: forget the RadPi network and reconnect

- **How resolution works**:
  - **`http://radpi.lan`** / **`http://radpi.wifi`** / **`http://radpi.home`**: Standard unicast DNS handled by the dnsmasq that NetworkManager spawns for the hotspot AP. Reliable on Android, Windows, macOS, iOS.
  - **`http://radpi.local`**: Multicast DNS (mDNS) handled by Avahi. Works great on macOS/iOS, hit-or-miss on Android (Android Chrome strips `.local`).
- As a guaranteed fallback, you can always use **`http://10.42.0.1`** directly. The frontend will then try to upgrade you to `radpi.lan` automatically.

### Services won't start
```bash
sudo systemctl restart radpi-button
sudo journalctl -u radpi-button -n 50
```

### Hotspot won't come up
```bash
nmcli connection show RadPi-Hotspot   # check profile exists
nmcli connection up RadPi-Hotspot     # try starting it manually
```

### Re-run deploy from scratch
```bash
cd /home/pi/radpi
sudo bash deploy.sh
```

---

## Network Info

| Item | Value |
|---|---|
| Pi's IP (hotspot) | `10.42.0.1` |
| Frontend port | `80` |
| Backend API port | `8000` |
| mDNS hostname | `radpi.local` |
