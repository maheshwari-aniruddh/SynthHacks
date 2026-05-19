import cv2
import numpy as np
import torch

def get_gradcam(model, input_tensor, target_layer, target_class=None):
    feature_maps = []
    gradients = []

    def save_feature_map(module, input, output):
        feature_maps.append(output)

    def save_gradient(module, grad_input, grad_output):
        gradients.append(grad_output[0])

    handle_f = target_layer.register_forward_hook(save_feature_map)
    handle_g = target_layer.register_full_backward_hook(save_gradient)

    model.zero_grad()
    if not input_tensor.requires_grad:
        input_tensor.requires_grad = True
        
    output = model(input_tensor)
    
    if target_class is None:
        target_class = output.argmax(dim=1).item()
        
    output[0, target_class].backward()

    pooled_gradients = torch.mean(gradients[0], dim=[0, 2, 3])
    
    for i in range(feature_maps[0].shape[1]):
        feature_maps[0][:, i, :, :] *= pooled_gradients[i]
        
    heatmap = torch.mean(feature_maps[0], dim=1).squeeze().detach().cpu().numpy()
    heatmap = np.maximum(heatmap, 0)
    
    max_val = np.max(heatmap)
    if max_val > 0:
        heatmap /= max_val

    handle_f.remove()
    handle_g.remove()

    return heatmap

def get_yolo_heatmap(result, img_shape):
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

def apply_and_save_heatmap(img_path, heatmap_array, save_path, alpha=0.5):
    img = cv2.imread(img_path)
    if img is None:
        return False
    
    heatmap = cv2.resize(heatmap_array, (img.shape[1], img.shape[0]))
    heatmap = np.uint8(255 * heatmap)
    heatmap_colored = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
    
    overlayed = cv2.addWeighted(img, 1-alpha, heatmap_colored, alpha, 0)
    cv2.imwrite(str(save_path), overlayed)
    return True
