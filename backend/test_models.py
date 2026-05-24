"""End-to-end smoke test for the 7 RadPi modality endpoints.

Downloads small, publicly-available sample images from Wikimedia Commons into
backend/test_fixtures/{modality}/ and POSTs each one to the running FastAPI
server. Asserts the unified response shape produced by
``utils.create_unified_response``.

Usage:
    # backend must be running (uvicorn main:app on 127.0.0.1:8000)
    python backend/test_models.py                       # all modalities
    python backend/test_models.py --modality chest_xray # one modality
    python backend/test_models.py --no-download         # reuse local files
    python backend/test_models.py --base-url http://host:8000

Exits non-zero if any test failed.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Dict, List, Tuple

import requests

# ---------------------------------------------------------------------------
# ANSI colour helpers (no-op when stdout is not a TTY)
# ---------------------------------------------------------------------------
_USE_COLOR = sys.stdout.isatty()


def _c(code: str, msg: str) -> str:
    if not _USE_COLOR:
        return msg
    return f"\033[{code}m{msg}\033[0m"


def green(msg: str) -> str: return _c("32", msg)
def red(msg: str) -> str: return _c("31", msg)
def yellow(msg: str) -> str: return _c("33", msg)
def cyan(msg: str) -> str: return _c("36", msg)
def bold(msg: str) -> str: return _c("1", msg)


# ---------------------------------------------------------------------------
# Sample images per modality.
#
# All URLs are Wikimedia Commons Special:FilePath links that 302-redirect to
# the real image. Every URL was verified to return content-type image/* at the
# time this file was written. URL keys use the spec slug (underscore form);
# the FastAPI endpoint slug (hyphen form) is computed by replacing "_" -> "-".
# ---------------------------------------------------------------------------
SAMPLE_IMAGES: Dict[str, List[Tuple[str, str]]] = {
    "chest_xray": [
        (
            "https://commons.wikimedia.org/wiki/Special:FilePath/Chest_Xray_PA_3-8-2010.png",
            "chest_xray_normal_pa.png",
        ),
        (
            "https://commons.wikimedia.org/wiki/Special:FilePath/Pneumonia_x-ray.jpg",
            "chest_xray_pneumonia.jpg",
        ),
    ],
    "bone_fracture": [
        (
            "https://commons.wikimedia.org/wiki/Special:FilePath/X-ray%20of%20bimalleolar%20fracture.jpg",
            "bimalleolar_fracture.jpg",
        ),
        (
            "https://commons.wikimedia.org/wiki/Special:FilePath/Olecranon%20Fracture%20X-Ray.jpg",
            "olecranon_fracture.jpg",
        ),
        (
            "https://commons.wikimedia.org/wiki/Special:FilePath/Subtle%20tibia%20fracture%20-%20X-ray.jpg",
            "tibia_fracture.jpg",
        ),
    ],
    "tb": [
        (
            "https://commons.wikimedia.org/wiki/Special:FilePath/Tuberculosis-x-ray-1.jpg",
            "tb_xray_1.jpg",
        ),
        (
            "https://commons.wikimedia.org/wiki/Special:FilePath/Tuberculosis-x-ray.jpg",
            "tb_xray_2.jpg",
        ),
    ],
    "wound_burn": [
        (
            "https://commons.wikimedia.org/wiki/Special:FilePath/First-degree_burn.jpg",
            "first_degree_burn.jpg",
        ),
        (
            "https://commons.wikimedia.org/wiki/Special:FilePath/Cellulitis_Left_Leg.JPG",
            "cellulitis_infection.jpg",
        ),
    ],
    "malaria": [
        (
            "https://commons.wikimedia.org/wiki/Special:FilePath/Plasmodium_ring.JPG",
            "malaria_plasmodium_ring.jpg",
        ),
    ],
}

# Modality slug used in URLs is the hyphenated form (e.g. "chest-xray").
# The directory and SAMPLE_IMAGES key use the underscore form.
_DEFAULT_USER_AGENT = "RadPi-test/1.0 (https://github.com/; contact: dev@radpi.local)"

FIXTURES_ROOT = Path(__file__).parent / "test_fixtures"


# ---------------------------------------------------------------------------
# Download helpers
# ---------------------------------------------------------------------------
def _endpoint_slug(modality: str) -> str:
    """Map fixture/key slug to the FastAPI route slug."""
    return modality.replace("_", "-")


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def download_image(url: str, dest: Path, *, force: bool = False) -> Tuple[bool, str]:
    """Download ``url`` to ``dest``. Returns (ok, message)."""
    if dest.exists() and not force:
        size = dest.stat().st_size
        return True, f"cached ({size:,} B)"
    try:
        ensure_dir(dest.parent)
        with requests.get(
            url,
            stream=True,
            timeout=30,
            headers={"User-Agent": _DEFAULT_USER_AGENT},
            allow_redirects=True,
        ) as r:
            if r.status_code != 200:
                return False, f"HTTP {r.status_code}"
            ctype = r.headers.get("content-type", "").lower()
            if not ctype.startswith("image/"):
                return False, f"not image (content-type={ctype!r})"
            tmp = dest.with_suffix(dest.suffix + ".part")
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(64 * 1024):
                    if chunk:
                        f.write(chunk)
            tmp.replace(dest)
        return True, f"downloaded ({dest.stat().st_size:,} B)"
    except Exception as e:  # noqa: BLE001
        return False, f"error: {e!r}"


def download_all(modalities: List[str], *, no_download: bool) -> Dict[str, List[Path]]:
    """Populate fixtures. Returns a map modality -> list of existing local paths."""
    out: Dict[str, List[Path]] = {}
    for m in modalities:
        out[m] = []
        mdir = FIXTURES_ROOT / m
        ensure_dir(mdir)
        for url, fname in SAMPLE_IMAGES[m]:
            dest = mdir / fname
            if no_download and dest.exists():
                print(f"  {cyan(m + '/' + fname)}: skipped (--no-download, present)")
                out[m].append(dest)
                continue
            if no_download and not dest.exists():
                print(f"  {yellow(m + '/' + fname)}: skipped (--no-download, missing)")
                continue
            ok, msg = download_image(url, dest)
            tag = green("OK") if ok else red("FAIL")
            print(f"  [{tag}] {m}/{fname}: {msg}")
            if ok:
                out[m].append(dest)
    return out


# ---------------------------------------------------------------------------
# HTTP inference + assertions
# ---------------------------------------------------------------------------
def _content_type_for(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
        ".dcm": "application/dicom",
    }.get(ext, "application/octet-stream")


def call_analyze(base_url: str, modality: str, image: Path, *, timeout: float = 120.0):
    """POST one image, return (status_code, json_or_text, latency_ms)."""
    url = f"{base_url.rstrip('/')}/analyze/{_endpoint_slug(modality)}"
    with open(image, "rb") as f:
        files = {"file": (image.name, f, _content_type_for(image))}
        t0 = time.perf_counter()
        try:
            r = requests.post(url, files=files, timeout=timeout)
        except requests.RequestException as e:
            return None, f"request error: {e!r}", (time.perf_counter() - t0) * 1000.0
        latency_ms = (time.perf_counter() - t0) * 1000.0
    try:
        body = r.json()
    except ValueError:
        body = r.text
    return r.status_code, body, latency_ms


def _assert_response_shape(body) -> List[str]:
    """Return a list of error messages; empty list means OK."""
    errs: List[str] = []
    if not isinstance(body, dict):
        return [f"response is not a JSON object (got {type(body).__name__})"]

    # top_label
    top_label = body.get("top_label")
    if not isinstance(top_label, str) or not top_label.strip():
        errs.append(f"top_label not a non-empty string (got {top_label!r})")

    # top_probability in [0, 1]
    top_prob = body.get("top_probability")
    if not isinstance(top_prob, (int, float)) or isinstance(top_prob, bool):
        errs.append(f"top_probability not numeric (got {type(top_prob).__name__})")
    else:
        if not (0.0 <= float(top_prob) <= 1.0):
            errs.append(f"top_probability out of [0,1] (got {top_prob})")

    # is_indeterminate bool
    if not isinstance(body.get("is_indeterminate"), bool):
        errs.append(f"is_indeterminate not bool (got {type(body.get('is_indeterminate')).__name__})")

    # distribution list
    dist = body.get("distribution")
    if not isinstance(dist, list):
        errs.append(f"distribution not a list (got {type(dist).__name__})")
    return errs


# ---------------------------------------------------------------------------
# Per-modality run
# ---------------------------------------------------------------------------
def run_modality(base_url: str, modality: str, images: List[Path]) -> Tuple[int, int, List[str]]:
    """Run all images for one modality. Returns (passed, total, failures)."""
    passed = 0
    failures: List[str] = []
    total = len(images)
    print(bold(cyan(f"\n=== {modality}  (endpoint: /analyze/{_endpoint_slug(modality)})  [{total} image(s)] ===")))
    if total == 0:
        msg = f"{modality}: no fixture images available"
        print(red("  " + msg))
        failures.append(msg)
        return 0, 0, failures

    for img in images:
        status, body, latency_ms = call_analyze(base_url, modality, img)
        latency_str = f"{latency_ms:7.1f} ms"
        prefix = f"  {img.name:<45s} {latency_str}"

        if status != 200:
            failures.append(f"{modality}/{img.name}: HTTP {status} body={body!r}")
            print(f"{prefix}  [{red('FAIL')}] HTTP {status}: {str(body)[:200]}")
            continue

        errs = _assert_response_shape(body)
        if errs:
            for e in errs:
                failures.append(f"{modality}/{img.name}: {e}")
            print(f"{prefix}  [{red('FAIL')}] " + "; ".join(errs))
            continue

        top_label = body["top_label"]
        top_prob = float(body["top_probability"])
        n_classes = len(body["distribution"])
        passed += 1
        print(
            f"{prefix}  [{green('PASS')}] "
            f"top={top_label!r} p={top_prob:.3f} classes={n_classes}"
        )

    return passed, total, failures


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--modality",
        choices=sorted(SAMPLE_IMAGES.keys()),
        help="Test only this modality (default: all).",
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("RADPI_BASE_URL", "http://127.0.0.1:8000"),
        help="Backend base URL (default: %(default)s).",
    )
    parser.add_argument(
        "--no-download",
        action="store_true",
        help="Skip downloading; use only what's already on disk.",
    )
    parser.add_argument(
        "--skip-readiness",
        action="store_true",
        help="Do not probe /readyz before running tests.",
    )
    args = parser.parse_args()

    modalities = [args.modality] if args.modality else sorted(SAMPLE_IMAGES.keys())

    ensure_dir(FIXTURES_ROOT)
    print(bold("Fixtures root: ") + str(FIXTURES_ROOT))
    print(bold("Base URL:      ") + args.base_url)
    print(bold("Modalities:    ") + ", ".join(modalities))

    # Readiness probe
    if not args.skip_readiness:
        try:
            r = requests.get(f"{args.base_url.rstrip('/')}/readyz", timeout=5)
            if r.status_code == 200:
                print(green("readyz OK: ") + str(r.json()))
            else:
                print(yellow(f"readyz returned HTTP {r.status_code} — continuing anyway"))
        except requests.RequestException as e:
            print(red(f"Cannot reach backend at {args.base_url}: {e!r}"))
            print(red("Aborting. Start the backend (uvicorn main:app) or pass --base-url."))
            return 2

    # Downloads
    print(bold("\nDownloading / verifying fixtures:"))
    available = download_all(modalities, no_download=args.no_download)

    # Run tests
    total_passed = 0
    total_count = 0
    all_failures: List[str] = []
    per_modality_summary: List[Tuple[str, int, int]] = []

    for m in modalities:
        passed, count, failures = run_modality(args.base_url, m, available.get(m, []))
        total_passed += passed
        total_count += count
        all_failures.extend(failures)
        per_modality_summary.append((m, passed, count))

    # Summary
    print(bold(cyan("\n" + "=" * 60)))
    print(bold("Summary"))
    print(bold(cyan("=" * 60)))
    for m, p, n in per_modality_summary:
        if n == 0:
            tag = red("NO IMAGES")
        elif p == n:
            tag = green(f"PASS {p}/{n}")
        else:
            tag = red(f"FAIL {p}/{n}")
        print(f"  {m:<14s}  {tag}")

    overall = f"{total_passed}/{total_count} image(s) passed"
    if all_failures:
        print(red(bold("\nFAILED: ")) + overall)
        for f in all_failures:
            print(red("  - ") + f)
        return 1

    print(green(bold("\nALL TESTS PASSED: ")) + overall)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
