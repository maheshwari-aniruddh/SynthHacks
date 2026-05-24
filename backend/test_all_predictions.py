import os
import sys
import torch
import numpy as np
from PIL import Image

BASE_DIR = "backend"
sys.path.insert(0, BASE_DIR)
sys.path.insert(0, os.path.join(BASE_DIR, "models"))

import chest_xray
import bone_fracture
import tb
import malaria
import wound_burn

FIXTURES = {
    "bone_fracture": [
        "bimalleolar_fracture.jpg",
        "olecranon_fracture.jpg",
        "tibia_fracture.jpg"
    ],
    "chest_xray": [
        "chest_xray_normal_pa.png",
        "chest_xray_pneumonia.jpg"
    ],
    "malaria": [
        "malaria_plasmodium_ring.jpg"
    ],
    "tb": [
        "tb_xray_1.jpg",
        "tb_xray_2.jpg"
    ],
    "wound_burn": [
        "first_degree_burn.jpg",
        "cellulitis_infection.jpg"
    ]
}

print("=== DIAGNOSING ALL MODEL PREDICTIONS ===")

for modality, filenames in FIXTURES.items():
    print(f"\n--- Modality: {modality} ---")
    module = sys.modules.get(modality) or sys.modules.get(f"models.{modality}")
    if not module:
        # try importing directly
        if modality == "chest_xray":
            module = chest_xray
        elif modality == "bone_fracture":
            module = bone_fracture
        elif modality == "tb":
            module = tb
        elif modality == "malaria":
            module = malaria
        elif modality == "wound_burn":
            module = wound_burn
            
    for fname in filenames:
        img_path = f"backend/test_fixtures/{modality}/{fname}"
        if not os.path.exists(img_path):
            print(f"Error: {img_path} not found!")
            continue
            
        res = module.predict(img_path)
        print(f"File: {fname}")
        print(f"  Top Label: {res['top_label']} (prob: {res['top_probability']:.4f})")
        print(f"  Distribution: {res['distribution'][:3]}")
        if "detections" in res:
            print(f"  Detections: {res['detections']}")
