from ultralytics import YOLO

model = YOLO("Models/bone_fracture_seg_yolov8m.pt")
print("Model names:", model.names)
print("Model task:", model.task)
print("Model type:", type(model))
