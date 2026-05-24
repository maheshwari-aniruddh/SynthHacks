from ultralytics import YOLO
import os

model = YOLO("Models/bone_fracture_seg_yolov8m.pt")
img_path = "backend/test_fixtures/bone_fracture/tibia_fracture.jpg"

print("--- Testing tibia_fracture.jpg with different conf thresholds ---")
for conf in [0.25, 0.20, 0.15, 0.10, 0.05, 0.02]:
    res = model(img_path, conf=conf, verbose=False)[0]
    boxes = res.boxes
    print(f"Conf={conf:.2f}: {len(boxes)} boxes detected.")
    if len(boxes) > 0:
        for box, cls, c in zip(boxes.xyxy, boxes.cls, boxes.conf):
            print(f"  Class: {model.names[int(cls)]}, Conf: {float(c):.4f}, Box: {box.tolist()}")
