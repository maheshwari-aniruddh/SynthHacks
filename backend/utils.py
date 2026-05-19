import os
import cv2
import numpy as np
import torch
from pathlib import Path

STATIC_DIR = Path("static")
MASKS_DIR = STATIC_DIR / "masks"
EXP_DIR = STATIC_DIR / "explanations"

for d in [MASKS_DIR, EXP_DIR]:
    d.mkdir(parents=True, exist_ok=True)
    
for sub in ["brain_mri", "chest_xray", "bone_fracture", "dental", "skin_cancer", "dr"]:
    (MASKS_DIR / sub).mkdir(parents=True, exist_ok=True)
    (EXP_DIR / sub).mkdir(parents=True, exist_ok=True)

def create_unified_response(top_label, top_probability, distribution, segmentation, explanation, raw=None):
    distribution = sorted(distribution, key=lambda x: x["probability"], reverse=True)
    return {
        "top_label": top_label,
        "top_probability": float(top_probability),
        "distribution": distribution,
        "segmentation": segmentation,
        "explanation": explanation,
        "raw": raw or {}
    }

def save_mask(module_name, file_id, label, binary_mask, color=(0, 255, 0, 128)):
    h, w = binary_mask.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    mask_indices = binary_mask > 0
    rgba[mask_indices] = color
    
    filename = f"{file_id}_{label}.png"
    filepath = MASKS_DIR / module_name / filename
    cv2.imwrite(str(filepath), cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
    return f"/static/masks/{module_name}/{filename}"

def save_heatmap(module_name, file_id, img_path, heatmap_array, alpha=0.7):
    img = cv2.imread(img_path)
    if img is None: return ""
    
    # Increase contrast by sharpening the peaks (Power transformation)
    heatmap_array = np.power(heatmap_array, 1.5)
    heatmap_array = np.maximum(heatmap_array, 0)
    if heatmap_array.max() > 0:
        heatmap_array /= heatmap_array.max()
        
    heatmap = cv2.resize(heatmap_array, (img.shape[1], img.shape[0]))
    heatmap = np.uint8(255 * heatmap)
    heatmap_colored = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
    
    # Using a higher alpha for the heatmap to make it pop
    overlayed = cv2.addWeighted(img, 0.4, heatmap_colored, alpha, 0)
    
    filename = f"{file_id}_gradcam.png"
    filepath = EXP_DIR / module_name / filename
    cv2.imwrite(str(filepath), overlayed)
    return f"/static/explanations/{module_name}/{filename}"

def extract_yolo_heatmap(result, img_shape):
    heatmap = np.zeros(img_shape[:2], dtype=np.float32)
    boxes = result.boxes
    if len(boxes) > 0:
        for box in boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])
            cx, cy = (x1+x2)//2, (y1+y2)//2
            w, h = (x2-x1)//2, (y2-y1)//2
            Y, X = np.ogrid[:img_shape[0], :img_shape[1]]
            dist_from_center = np.sqrt(((X - cx)/max(w,1))**2 + ((Y-cy)/max(h,1))**2)
            mask = np.exp(-dist_from_center)
            heatmap = np.maximum(heatmap, mask * conf)
    return heatmap

def generate_dummy_mask(img_path):
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is None: return np.zeros((224, 224), dtype=np.uint8)
    _, mask = cv2.threshold(img, 128, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    return mask
