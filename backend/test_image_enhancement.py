from ultralytics import YOLO
import cv2
import numpy as np

model = YOLO("Models/bone_fracture_seg_yolov8m.pt")
img_path = "backend/test_fixtures/bone_fracture/tibia_fracture.jpg"

# Read image
img = cv2.imread(img_path)
print("Original shape:", img.shape)

# Convert to grayscale
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Test different image enhancements
print("\n--- Testing original image ---")
res = model(img, verbose=False)[0]
print(f"Original: {len(res.boxes)} boxes.")

# 1. Standard Histogram Equalization
equalized = cv2.equalizeHist(gray)
equalized_bgr = cv2.cvtColor(equalized, cv2.COLOR_GRAY2BGR)
res = model(equalized_bgr, verbose=False)[0]
print(f"Standard Equalized: {len(res.boxes)} boxes.")

# 2. CLAHE (Contrast Limited Adaptive Histogram Equalization)
for clip in [1.0, 2.0, 3.0, 4.0]:
    for grid in [8, 16]:
        clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=(grid, grid))
        cl_img = clahe.apply(gray)
        cl_bgr = cv2.cvtColor(cl_img, cv2.COLOR_GRAY2BGR)
        res = model(cl_bgr, verbose=False)[0]
        if len(res.boxes) > 0:
            print(f"CLAHE (clip={clip}, grid={grid}): {len(res.boxes)} boxes detected!")
            for box, cls, conf in zip(res.boxes.xyxy, res.boxes.cls, res.boxes.conf):
                print(f"  Class: {model.names[int(cls)]}, Conf: {float(conf):.4f}")
