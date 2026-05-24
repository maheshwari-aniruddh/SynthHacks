import os
import requests
import ssl
import sys
import time
from pathlib import Path
from urllib.parse import quote

# Disable SSL verification globally for Python (handles requests and standard libraries)
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except AttributeError:
    pass

# Determine directories
SCRIPT_DIR = Path(__file__).parent.resolve()
DATASET_DIR = SCRIPT_DIR / "sample_test_images"

# ANSI color helper functions
def _c(code: str, msg: str) -> str:
    if not sys.stdout.isatty():
        return msg
    return f"\033[{code}m{msg}\033[0m"

def green(msg: str) -> str: return _c("32", msg)
def red(msg: str) -> str: return _c("31", msg)
def yellow(msg: str) -> str: return _c("33", msg)
def cyan(msg: str) -> str: return _c("36", msg)
def bold(msg: str) -> str: return _c("1", msg)

# Define dataset of diverse public sample images from Wikimedia Commons for testing
DATASETS = {
    "bone_fracture": [
        (
            "Radial_head_fracture_Mason_Type_1.jpg",
            "radial_head_fracture.jpg",
            "Radial head fracture (Mason Type 1) - elbow injury"
        ),
        (
            "Clavicle_fracture_left_aligned.jpg",
            "clavicle_fracture.jpg",
            "Left clavicle (collarbone) fracture"
        ),
        (
            "Boxers_fracture.png",
            "boxers_fracture.png",
            "Boxer's fracture (5th metacarpal fracture in hand)"
        ),
        (
            "Hand_x-ray.jpg",
            "normal_hand_control.jpg",
            "Normal hand X-ray (negative control)"
        ),
        (
            "Anteroposterior_X-ray_of_the_left_ankle.png",
            "normal_ankle_control.png",
            "Normal ankle X-ray (negative control)"
        )
    ],
    "chest_xray": [
        (
            "Pleural_effusion-x-ray_1.jpg",
            "pleural_effusion.jpg",
            "Pleural effusion (fluid in the lung space)"
        ),
        (
            "Pneumothorax_CO2.jpg",
            "pneumothorax.jpg",
            "Pneumothorax (lung collapse showing air pocket)"
        ),
        (
            "Normal_Chest_X-Ray.jpg",
            "normal_chest_control.jpg",
            "Normal chest X-ray (negative control)"
        )
    ],
    "tb": [
        (
            "Miliary_Tuberculosis_on_Chest_X-ray.jpg",
            "miliary_tb.jpg",
            "Miliary Tuberculosis showing millet-sized lesions"
        ),
        (
            "Normal_CXR.jpg",
            "normal_lung_control.jpg",
            "Normal chest X-ray (negative control for TB)"
        )
    ],
    "malaria": [
        (
            "Plasmodium_falciparum_rings_form_parasites4885_lores.jpg",
            "plasmodium_falciparum_ring_smear.jpg",
            "Plasmodium falciparum ring forms in red blood cells"
        ),
        (
            "Blood_cells_microscope.jpg",
            "normal_blood_smear_control.jpg",
            "Normal red blood cells microscopy smear (negative control)"
        )
    ],
    "wound_burn": [
        (
            "Second_degree_burn_after_one_day.JPG",
            "second_degree_burn.jpg",
            "Second-degree burn with blisters (partial thickness)"
        ),
        (
            "Third_degree_burn_on_calf.jpg",
            "third_degree_burn.jpg",
            "Third-degree burn with necrotic tissue (full thickness)"
        ),
        (
            "Stitched_wound.jpg",
            "laceration_cut.jpg",
            "Laceration / wound with sutures (surgical control)"
        ),
        (
            "Skin_forearm.jpg",
            "normal_skin_control.jpg",
            "Normal healthy skin on forearm (negative control)"
        )
    ]
}

# Conforms to Wikimedia Commons bot/User-Agent policy
_USER_AGENT = "RadPi-test/1.0 (https://github.com/; contact: dev@radpi.local)"

def download_file(wiki_filename: str, dest: Path) -> bool:
    """Download from Wikimedia Special:FilePath endpoint with redirect support."""
    if dest.exists():
        return True
    
    url = f"https://commons.wikimedia.org/wiki/Special:FilePath/{quote(wiki_filename)}"
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        headers = {"User-Agent": _USER_AGENT}
        
        # Download with requests and allow redirects
        r = requests.get(url, stream=True, timeout=30, headers=headers, verify=False, allow_redirects=True)
        r.raise_for_status()
        
        # Verify content-type
        ctype = r.headers.get("content-type", "").lower()
        if not ctype.startswith("image/"):
            print(red(f"      [ERROR] Not an image (content-type={ctype!r}) for {url}"))
            return False
            
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=64 * 1024):
                if chunk:
                    f.write(chunk)
        return True
    except Exception as e:
        print(red(f"      [ERROR] Download failed: {e}"))
        return False

def main():
    print(bold(cyan("\n========================================================")))
    print(bold(cyan("     RadPi Extended Clinical Test Dataset Installer    ")))
    print(bold(cyan("========================================================\n")))
    print(f"Target Directory: {bold(DATASET_DIR)}")
    
    total_downloaded = 0
    total_skipped = 0
    total_failed = 0
    
    for modality, items in DATASETS.items():
        print(f"\n📁 Modality: {bold(yellow(modality.upper()))}")
        mod_dir = DATASET_DIR / modality
        mod_dir.mkdir(parents=True, exist_ok=True)
        
        for wiki_filename, local_name, desc in items:
            dest = mod_dir / local_name
            print(f"  → Downloading: {cyan(local_name)}")
            print(f"    Description: {desc}")
            
            if dest.exists():
                print(green(f"    [SKIP] Already exists locally (cached: {dest.stat().st_size:,} bytes)"))
                total_skipped += 1
            else:
                success = download_file(wiki_filename, dest)
                if success:
                    print(green(f"    [SUCCESS] Downloaded to {dest.name} ({dest.stat().st_size:,} bytes)"))
                    total_downloaded += 1
                else:
                    total_failed += 1
                
                # Sleep to respect Wikimedia rate limits and avoid 429
                time.sleep(1.0)
                    
    print("\n" + bold(cyan("========================================================")))
    print(bold(green("              Installation Summary                      ")))
    print(bold(cyan("========================================================\n")))
    print(f"  * Total Successful Downloads: {bold(green(str(total_downloaded)))}")
    print(f"  * Total Pre-existing/Cached:  {bold(yellow(str(total_skipped)))}")
    print(f"  * Total Failed Downloads:     {bold(red(str(total_failed)))}")
    print(bold(cyan("\n========================================================")))
    
    if total_failed == 0:
        print(bold(green("\nAll test images installed successfully! Ready for drag-and-drop testing.")))
    else:
        print(bold(yellow("\nCompleted with some failures. Some files could not be resolved. Please check your network.")))
        
    print(f"\nYou can find the images structured under:\n  {bold(DATASET_DIR)}\n")

if __name__ == "__main__":
    main()
