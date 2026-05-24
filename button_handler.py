#!/usr/bin/env python3
"""
RadPi Button Handler
====================
Runs at boot as a systemd service (radpi-button.service).

Button behaviour
----------------
  Normal mode + LONG press  (≥ 3 s)  → activate RadPi mode
  RadPi mode  + LONG press  (≥ 3 s)  → deactivate RadPi mode
  Either mode + SHORT press (< 2 s)  → safe shutdown

LED behaviour
-------------
  Normal mode activating  : 3 fast flashes
  RadPi mode active       : slow breathing pulse
  RadPi mode deactivating : 3 slow flashes
  Shutdown                : 5 fast flashes then off
"""

import os
import sys
import time
import threading
import subprocess
import logging

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [radpi-button] %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("/var/log/radpi-button.log", delay=True),
    ],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config  (edit these to match your setup)
# ---------------------------------------------------------------------------
LONG_PRESS_SECS  = 1.5          # seconds to hold for mode toggle (MUST be < Pi 5 hardware cut at ~3-4s)
SHORT_PRESS_SECS = 0.5          # max seconds for a "short" press (tap)
HOTSPOT_CON      = "RadPi-Hotspot"   # nmcli connection name
BACKEND_SVC      = "radpi-backend"
FRONTEND_SVC     = "radpi-frontend"
STATE_FILE       = "/var/lib/radpi_state"
LED_PATH         = "/sys/class/leds/ACT"   # Pi 5 green activity LED

# ---------------------------------------------------------------------------
# LED helpers
# ---------------------------------------------------------------------------
_breathe_stop   = threading.Event()
_breathe_thread = None


def _led(attr: str, value: str) -> None:
    try:
        with open(f"{LED_PATH}/{attr}", "w") as fh:
            fh.write(value)
    except OSError as exc:
        log.warning("LED %s=%s failed: %s", attr, value, exc)


def led_heartbeat() -> None:
    """Restore the default Pi activity blink."""
    _stop_breathe()
    _led("trigger", "heartbeat")


def led_off() -> None:
    _led("trigger", "none")
    _led("brightness", "0")


def _flash(count: int, on_ms: int, off_ms: int) -> None:
    _stop_breathe()
    _led("trigger", "none")
    for _ in range(count):
        _led("brightness", "1")
        time.sleep(on_ms / 1000)
        _led("brightness", "0")
        time.sleep(off_ms / 1000)


def led_flash_fast(count: int = 3) -> None:
    _flash(count, 120, 80)


def led_flash_slow(count: int = 3) -> None:
    _flash(count, 700, 400)


def _breathe_worker() -> None:
    """Simulate a breathing pulse via rapid PWM-style toggling."""
    _led("trigger", "none")
    # Use timer trigger for a reliable slow blink that looks like breathing
    _led("trigger", "timer")
    _led("delay_on",  "900")
    _led("delay_off", "1100")
    # Just keep the thread alive so we can stop it cleanly
    while not _breathe_stop.is_set():
        _breathe_stop.wait(timeout=1.0)
    # On exit restore manual control so the caller can take over
    _led("trigger", "none")


def _stop_breathe() -> None:
    global _breathe_thread
    _breathe_stop.set()
    if _breathe_thread and _breathe_thread.is_alive():
        _breathe_thread.join(timeout=3)
    _breathe_thread = None


def led_breathe() -> None:
    global _breathe_thread
    _stop_breathe()
    _breathe_stop.clear()
    _breathe_thread = threading.Thread(target=_breathe_worker, daemon=True, name="led-breathe")
    _breathe_thread.start()


# ---------------------------------------------------------------------------
# State persistence
# ---------------------------------------------------------------------------
def get_state() -> str:
    try:
        return open(STATE_FILE).read().strip()
    except FileNotFoundError:
        return "NORMAL"


def set_state(state: str) -> None:
    with open(STATE_FILE, "w") as fh:
        fh.write(state)
    log.info("Mode → %s", state)


# ---------------------------------------------------------------------------
# System commands
# ---------------------------------------------------------------------------
def _run(cmd: list[str], check: bool = False) -> int:
    log.info("$ %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        log.warning("rc=%d stderr=%s", result.returncode, result.stderr.strip())
    return result.returncode


def start_radpi() -> None:
    log.info("Activating RadPi mode …")
    led_flash_fast(3)

    _run(["nmcli", "connection", "up", HOTSPOT_CON])
    time.sleep(2)  # wait for hotspot to assign IP

    _run(["systemctl", "start", BACKEND_SVC])
    _run(["systemctl", "start", FRONTEND_SVC])

    led_breathe()
    set_state("RADPI")
    log.info("RadPi mode ACTIVE  →  connect to Wi-Fi '%s'  →  http://radpi.local", HOTSPOT_CON)


def stop_radpi() -> None:
    log.info("Deactivating RadPi mode …")
    _stop_breathe()
    led_flash_slow(3)

    _run(["systemctl", "stop", FRONTEND_SVC])
    _run(["systemctl", "stop", BACKEND_SVC])
    _run(["nmcli", "connection", "down", HOTSPOT_CON])

    led_heartbeat()
    set_state("NORMAL")
    log.info("Returned to NORMAL mode")


def safe_shutdown() -> None:
    log.info("Safe shutdown …")
    led_flash_fast(5)
    time.sleep(0.3)
    led_off()
    _run(["systemctl", "poweroff"])


# ---------------------------------------------------------------------------
# Button detection
# ---------------------------------------------------------------------------
def find_power_button():
    """Scan /dev/input/* for a device that exposes KEY_POWER."""
    try:
        import evdev
    except ImportError:
        log.error("evdev not installed — run: pip install evdev")
        return None

    for path in evdev.list_devices():
        try:
            dev = evdev.InputDevice(path)
            caps = dev.capabilities()
            if evdev.ecodes.EV_KEY in caps:
                if evdev.ecodes.KEY_POWER in caps[evdev.ecodes.EV_KEY]:
                    log.info("Power button found: %s  (%s)", path, dev.name)
                    return dev
        except Exception:
            pass

    log.error("No power button found in /dev/input — check that this script runs as root")
    return None


def event_loop(device) -> None:
    """Block-read button events and drive the state machine."""
    import evdev

    log.info("Listening on %s …", device.path)
    try:
        device.grab()
        log.info("Exclusively grabbed %s", device.path)
    except OSError as e:
        log.warning("Could not grab device exclusively (systemd might still intercept): %s", e)

    press_start: float | None = None

    for event in device.read_loop():
        if event.type != evdev.ecodes.EV_KEY:
            continue
        if event.code != evdev.ecodes.KEY_POWER:
            continue

        if event.value == 1:                        # key-down
            press_start = time.monotonic()

        elif event.value == 0 and press_start:      # key-up
            duration = time.monotonic() - press_start
            press_start = None
            log.info("Button held for %.2f s", duration)

            if duration < SHORT_PRESS_SECS:
                safe_shutdown()
            elif duration >= LONG_PRESS_SECS:
                if get_state() == "NORMAL":
                    start_radpi()
                else:
                    stop_radpi()
            # durations between SHORT_PRESS_SECS and LONG_PRESS_SECS are ignored


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def _resume_radpi_worker() -> None:
    log.info("Resume thread started — waiting for NetworkManager to become ready...")
    # Wait for NetworkManager to be ready (up to 30 seconds)
    nm_ready = False
    start_time = time.monotonic()
    while time.monotonic() - start_time < 30:
        res = subprocess.run(["nmcli", "general", "status"], capture_output=True, text=True)
        if res.returncode == 0:
            nm_ready = True
            break
        time.sleep(1)

    if nm_ready:
        log.info("NetworkManager is ready, resuming RadPi services and hotspot...")
        try:
            start_radpi()
        except Exception as e:
            log.error("Failed to automatically resume RadPi mode: %s", e)
    else:
        log.error("NetworkManager was not ready within timeout. Cannot resume RadPi mode.")


def main() -> None:
    log.info("RadPi button handler v1.0 starting")

    # If we rebooted while RadPi was active, resume the hotspot and services in a background thread
    if get_state() == "RADPI":
        log.info("Resuming RadPi mode (was active before reboot) — spawning resume thread")
        led_breathe()
        threading.Thread(target=_resume_radpi_worker, daemon=True, name="resume-radpi").start()
    else:
        led_heartbeat()

    device = find_power_button()
    if device is None:
        sys.exit(1)

    try:
        event_loop(device)
    except KeyboardInterrupt:
        log.info("Interrupted — cleaning up")
        try:
            device.ungrab()
        except:
            pass
        led_heartbeat()
    except Exception as exc:
        log.exception("Fatal: %s", exc)
        try:
            device.ungrab()
        except:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
