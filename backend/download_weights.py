import os
import requests
import ssl
import shutil

# Set environment variables to disable SSL check for huggingface_hub
os.environ["HF_HUB_DISABLE_SSL_VERIFICATION"] = "1"
os.environ["CURL_CA_BUNDLE"] = ""
os.environ["REQUESTS_CA_BUNDLE"] = ""

from huggingface_hub import hf_hub_download, snapshot_download

# Disable SSL verification globally for Python (handles requests and standard libraries)
ssl._create_default_https_context = ssl._create_unverified_context

# Determine weights directory relative to this script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(SCRIPT_DIR, "weights")
MODELS_DIR = os.path.join(SCRIPT_DIR, "../Models")

os.makedirs(WEIGHTS_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

def download_file(url, dest_path):
    if os.path.exists(dest_path):
        print(f"Already exists: {os.path.basename(dest_path)}")
        return dest_path
    print(f"Downloading {os.path.basename(dest_path)} from {url}...")
    try:
        response = requests.get(url, stream=True, timeout=60, verify=False)
        response.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"Successfully downloaded {os.path.basename(dest_path)}")
        return dest_path
    except Exception as e:
        print(f"Failed to download {os.path.basename(dest_path)}: {e}")
        return None

def main():
    print("=== RadPi Offline Weights Sourcing Pipeline ===")

    # 1. Bone Fracture (GitHub Release - highly reliable)
    bone_fracture_path = os.path.join(MODELS_DIR, "bone_fracture_seg_yolov8m.pt")
    download_file(
        "https://github.com/RuiyangJu/Bone_Fracture_Detection_YOLOv8/releases/download/Trained_model/best.pt",
        bone_fracture_path
    )

    # 2. Chest X-ray (Pre-cache via TorchXRayVision library)
    print("Chest X-ray: Pre-caching TorchXRayVision DenseNet weights...")
    try:
        import torchxrayvision as xrv
        xrv.models.DenseNet(weights="densenet121-res224-all")
        print("Chest X-Ray weights successfully cached.")
    except Exception as e:
        print(f"Failed to pre-cache Chest X-Ray weights: {e}")

    # 3. Tuberculosis (TB) Model
    tb_dir = os.path.join(WEIGHTS_DIR, "tb")
    os.makedirs(tb_dir, exist_ok=True)
    print(f"Tuberculosis: Downloading model repository from HF Hub to {tb_dir}...")
    try:
        snapshot_download(
            repo_id="runaksh/chest_xray_tuberculosis_detection",
            local_dir=tb_dir,
            local_dir_use_symlinks=False
        )
        print("Tuberculosis model weights successfully fetched.")
    except Exception as e:
        print(f"Failed to download Tuberculosis model: {e}")

    # 4. Malaria Screening Model
    malaria_dir = os.path.join(WEIGHTS_DIR, "malaria")
    os.makedirs(malaria_dir, exist_ok=True)
    malaria_path = os.path.join(malaria_dir, "model.pth")
    print(f"Malaria: Downloading MobileNetV2 state-dict to {malaria_path}...")
    try:
        if not os.path.exists(malaria_path):
            temp_path = hf_hub_download(
                repo_id="Svetozar1993/LocalMedScan-malaria-mobilenetv2",
                filename="model.pth"
            )
            shutil.copy(temp_path, malaria_path)
            print("Malaria model weights successfully fetched.")
        else:
            print("Malaria: model.pth already exists.")
    except Exception as e:
        print(f"Failed to download Malaria model: {e}")

    # 5. Wound & Burn Care Model
    burn_dir = os.path.join(WEIGHTS_DIR, "wound_burn")
    os.makedirs(burn_dir, exist_ok=True)
    print(f"Wound & Burn Care: Downloading model repository to {burn_dir}...")
    try:
        snapshot_download(
            repo_id="tizzyjcc/autotrain-skin-burns-classification-by-degree-83366142287",
            local_dir=burn_dir,
            local_dir_use_symlinks=False
        )
        print("Wound & Burn Care model weights successfully fetched.")
    except Exception as e:
        print(f"Failed to download Wound & Burn model: {e}")

    # 6. Clinical Report & Chat LLM Models (GGUFs)
    llm_dir = os.path.join(WEIGHTS_DIR, "llm")
    os.makedirs(llm_dir, exist_ok=True)
    print(f"Offline LLM (Fast - Qwen 1.5B): Downloading GGUF to {llm_dir}...")
    try:
        hf_hub_download(
            repo_id="Qwen/Qwen2.5-1.5B-Instruct-GGUF",
            filename="qwen2.5-1.5b-instruct-q4_k_m.gguf",
            local_dir=llm_dir,
            local_dir_use_symlinks=False
        )
        print("Fast GGUF model successfully loaded.")
    except Exception as e:
        print(f"Failed to download Qwen 1.5B LLM: {e}")

    print(f"Offline LLM (Detailed - Qwen 3B): Downloading GGUF to {llm_dir}...")
    try:
        hf_hub_download(
            repo_id="Qwen/Qwen2.5-3B-Instruct-GGUF",
            filename="qwen2.5-3b-instruct-q4_k_m.gguf",
            local_dir=llm_dir,
            local_dir_use_symlinks=False
        )
        print("Detailed GGUF model successfully loaded.")
    except Exception as e:
        print(f"Failed to download Qwen 3B LLM: {e}")

    print("=== Weight Download Pipeline Complete ===")

if __name__ == "__main__":
    main()
