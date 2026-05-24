import os
from huggingface_hub import hf_hub_download
import shutil

os.makedirs("../Models", exist_ok=True)

models_to_download = [
    ("adeebaai/bone-fracture-yolov8", "best.pt", "bone_fracture_seg_yolov8m.pt"),
    ("LazerX69/Dental-anomalies-yolov8", "best.pt", "dental_yolov8.pt"),
    ("bsenst/skin-cancer-HAM10k", "xception_v4_1_07_0.699.h5", "skin_cancer_efficientnetv2s.h5"),
]

for repo_id, filename, save_name in models_to_download:
    try:
        path = hf_hub_download(repo_id=repo_id, filename=filename)
        shutil.copy(path, f"../Models/{save_name}")
        print(f"Success: {save_name}")
    except Exception as e:
        print(f"Failed {repo_id}: {e}")
