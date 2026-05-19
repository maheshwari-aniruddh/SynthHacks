import os
from huggingface_hub import hf_hub_download
import requests

os.makedirs("../Models", exist_ok=True)

def download_hf(repo_id, filename, save_name):
    try:
        path = hf_hub_download(repo_id=repo_id, filename=filename)
        os.system(f"cp {path} ../Models/{save_name}")
        print(f"Success: {save_name}")
    except Exception as e:
        print(f"Failed HF {repo_id}: {e}")

def download_url(url, save_name):
    try:
        r = requests.get(url, stream=True)
        r.raise_for_status()
        with open(f"../Models/{save_name}", 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"Success: {save_name}")
    except Exception as e:
        print(f"Failed URL {url}: {e}")

print("Downloading...")
# Bone fracture detection
download_url("https://github.com/RuiyangJu/Bone_Fracture_Detection_YOLOv8/releases/download/v1.0/best.pt", "bone_fracture_seg_yolov8m.pt")

# Dental Caries
download_hf("SubGlitch1/DentalXrayAI", "best.pt", "dental_yolov8.pt")

# Skin Cancer
download_hf("HugsVision/Skin-Cancer", "best_model.pth", "skin_cancer_efficientnetv2s.h5")

# Fundus
download_hf("jdelgado2002/diabetic_retinopathy_detection", "pytorch_model.bin", "dr_mobilenetv3.pth")
