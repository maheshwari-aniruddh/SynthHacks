import os
import requests
from huggingface_hub import hf_hub_download
from ultralytics import YOLO
import shutil

# Ensure weights directory exists
WEIGHTS_DIR = "weights"
os.makedirs(WEIGHTS_DIR, exist_ok=True)

def download_file(url, filename):
    path = os.path.join(WEIGHTS_DIR, filename)
    if os.path.exists(path):
        print(f"Already exists: {filename}")
        return path
    print(f"Downloading {filename} from {url}...")
    try:
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        with open(path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return path
    except Exception as e:
        print(f"Failed to download {filename}: {e}")
        return None

def download_hf(repo_id, filename, local_name, subfolder=None):
    path = os.path.join(WEIGHTS_DIR, local_name)
    if os.path.exists(path):
        print(f"Already exists: {local_name}")
        return path
    print(f"Downloading {local_name} from HF {repo_id}...")
    try:
        hf_path = hf_hub_download(repo_id=repo_id, filename=filename, subfolder=subfolder)
        shutil.copy(hf_path, path)
        return path
    except Exception as e:
        print(f"Failed to download from HF {repo_id}: {e}")
        return None

def main():
    print("--- Starting Weight Downloads ---")
    
    # 1. Brain MRI (alanjafari/BrainTumorAI -> yolov8m.pt)
    download_hf("alanjafari/BrainTumorAI", "yolov8m.pt", "brain_mri.pt")
    
    # 2. Chest X-ray (torchxrayvision handles this automatically)
    print("Chest X-ray: Handled by torchxrayvision cache.")

    # 3. Bone Fracture (GitHub Release - reliable)
    download_file("https://github.com/RuiyangJu/Bone_Fracture_Detection_YOLOv8/releases/download/v1.0/best.pt", "bone_fracture.pt")
    
    # 4. Dental (SubGlitch1/DentalXrayAI -> best.pt)
    download_hf("SubGlitch1/DentalXrayAI", "best.pt", "dental.pt")
    
    # 5. Dermatology (HugsVision/Skin-Cancer -> best_model.pth)
    download_hf("HugsVision/Skin-Cancer", "best_model.pth", "dermatology.pth", subfolder="models/MobileNetV2")
    
    # 6. Fundus (jdelgado2002/diabetic_retinopathy_detection -> pytorch_model.bin)
    download_hf("jdelgado2002/diabetic_retinopathy_detection", "pytorch_model.bin", "fundus.bin")

    print("--- Weight Download Attempt Finished ---")

if __name__ == "__main__":
    main()
