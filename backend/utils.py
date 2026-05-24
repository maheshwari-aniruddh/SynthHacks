import logging
import os
import cv2
import numpy as np
import torch
from pathlib import Path

logger = logging.getLogger(__name__)

STATIC_DIR = Path("static")
MASKS_DIR = STATIC_DIR / "masks"
EXP_DIR = STATIC_DIR / "explanations"

# All 8 modality subdirs created on startup; individual helpers also create on demand.
_MODALITY_SUBDIRS = [
    "chest_xray", "bone_fracture", "wound_burn", "tb", "malaria",
]

for d in [MASKS_DIR, EXP_DIR]:
    d.mkdir(parents=True, exist_ok=True)

for _sub in _MODALITY_SUBDIRS:
    (MASKS_DIR / _sub).mkdir(parents=True, exist_ok=True)
    (EXP_DIR / _sub).mkdir(parents=True, exist_ok=True)


def pick_clinical_label(
    distribution: list[dict],
    *,
    normal_label: str = "Normal",
    normal_threshold: float = 0.55,
    priority: list[str] | None = None,
    screening_positive: str | None = None,
    screening_min: float = 0.42,
    screening_margin: float = 0.10,
) -> tuple[str, float, list[dict]]:
    """Pick a clinically consistent top label that matches the distribution.

  Rules:
  1. If every finding is below *normal_threshold*, return Normal.
  2. Among near-max scores (within 0.12), prefer *priority* order so e.g.
     Pneumonia wins over Mass when both are elevated on the same film.
  3. For screening modalities (TB, malaria), bias toward the positive class
     when the model is uncertain — a missed case is worse than a referral.
  """
    if not distribution:
        return normal_label, 0.0, []

    items = sorted(
        [{"label": d["label"], "probability": float(d["probability"])} for d in distribution],
        key=lambda x: x["probability"],
        reverse=True,
    )
    max_prob = items[0]["probability"]

    # Binary screening classifiers (TB, malaria): never treat low max_prob as
    # "automatically normal" — use explicit clearance threshold on the negative class.
    if screening_positive and len(items) == 2:
        pos = next(x for x in items if x["label"] == screening_positive)
        neg = next(x for x in items if x["label"] != screening_positive)
        if neg["probability"] >= normal_threshold:
            return neg["label"], neg["probability"], items
        if pos["probability"] >= screening_min and pos["probability"] >= neg["probability"] - screening_margin:
            return pos["label"], pos["probability"], [pos, neg]
        chosen = items[0]
        return chosen["label"], chosen["probability"], items

    if max_prob < normal_threshold:
        normal_prob = max(0.0, min(1.0, 1.0 - max_prob))
        out = [{"label": normal_label, "probability": normal_prob}] + items[:5]
        return normal_label, normal_prob, out

    near_max = [x for x in items if x["probability"] >= max_prob - 0.12]
    if priority:
        order = {label: idx for idx, label in enumerate(priority)}

        def _rank(entry: dict) -> tuple:
            return (order.get(entry["label"], len(priority)), -entry["probability"])

        chosen = min(near_max, key=_rank)
    else:
        chosen = items[0]

    if screening_positive:
        pos = next((x for x in items if x["label"] == screening_positive), None)
        if pos and pos["probability"] >= screening_min:
            neg_prob = next(
                (x["probability"] for x in items if x["label"] != screening_positive),
                0.0,
            )
            if pos["probability"] >= neg_prob - screening_margin:
                chosen = pos

    return chosen["label"], chosen["probability"], items


def enhance_xray_contrast(image_path: str) -> "np.ndarray":
    """CLAHE on a grayscale X-ray — helps ViT / DenseNet on low-contrast films."""
    import cv2

    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(img)
    return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2RGB)


def suppress_attention_border(attn_grid: "np.ndarray", border_frac: float = 0.08) -> "np.ndarray":
    """Zero ViT patch attention near image borders (common artifact source)."""
    import numpy as np

    grid = attn_grid.copy()
    h, w = grid.shape
    by, bx = max(1, int(h * border_frac)), max(1, int(w * border_frac))
    grid[:by, :] = 0
    grid[-by:, :] = 0
    grid[:, :bx] = 0
    grid[:, -bx:] = 0
    peak = grid.max()
    if peak > 0:
        grid /= peak
    return grid


def create_unified_response(
    top_label: str,
    top_probability: float,
    distribution: list,
    segmentation: dict,
    explanation: dict,
    raw: dict = None,
    modality: str = "",
    model_version: str = "1.0.0",
    weights_sha: str = "",
    inference_ts: str = "",
    request_id: str = "",
    detections: list = None,
):
    import datetime

    top_probability = float(top_probability)
    is_indeterminate = top_probability < 0.30
    if is_indeterminate:
        top_label = "Indeterminate — refer for clinical review"

    if not inference_ts:
        inference_ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    distribution = sorted(distribution, key=lambda x: x["probability"], reverse=True)
    # Keep headline result aligned with the distribution the UI renders.
    if distribution:
        headline = next((d for d in distribution if d["label"] == top_label), distribution[0])
        top_label = headline["label"]
        top_probability = float(headline["probability"])
        distribution = [headline] + [d for d in distribution if d["label"] != top_label]

    # Ensure frontend compatibility by copying heatmap_url into segmentation if present in explanation
    if explanation and isinstance(explanation, dict) and "heatmap_url" in explanation:
        if segmentation and isinstance(segmentation, dict):
            segmentation["heatmap_url"] = explanation["heatmap_url"]

    resp = {
        "modality": modality,
        "model_version": model_version,
        "weights_sha": weights_sha,
        "inference_ts": inference_ts,
        "top_label": top_label,
        "top_probability": top_probability,
        "is_indeterminate": is_indeterminate,
        "distribution": distribution,
        "segmentation": segmentation,
        "explanation": explanation,
        "raw": raw or {},
    }
    if detections is not None:
        resp["detections"] = detections
    if request_id:
        resp["request_id"] = request_id
    return resp


def save_mask(module_name: str, file_id: str, label: str, binary_mask, color=(0, 255, 0, 128)):
    mask_dir = MASKS_DIR / module_name
    mask_dir.mkdir(parents=True, exist_ok=True)

    h, w = binary_mask.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    mask_indices = binary_mask > 0
    rgba[mask_indices] = color

    filename = f"{file_id}_{label}.png"
    filepath = mask_dir / filename
    cv2.imwrite(str(filepath), cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
    return f"/static/masks/{module_name}/{filename}"


def save_heatmap(module_name: str, file_id: str, img_path: str, heatmap_array, alpha=0.6):
    exp_dir = EXP_DIR / module_name
    exp_dir.mkdir(parents=True, exist_ok=True)

    img = cv2.imread(img_path)
    if img is None:
        return ""

    heatmap_array = np.array(heatmap_array, dtype=np.float32)
    heatmap_array = np.maximum(heatmap_array, 0)
    max_val = heatmap_array.max()

    # Guard: if the entire heatmap is zero, the GradCAM produced no meaningful activation.
    # Applying COLORMAP_JET to a zero array yields solid blue — return empty to signal failure.
    if max_val == 0:
        logger.warning("[save_heatmap] %s: heatmap is all-zeros (no gradient activation). Skipping.", module_name)
        return ""

    heatmap_array /= max_val

    heatmap = cv2.resize(heatmap_array, (img.shape[1], img.shape[0]))
    heatmap = np.uint8(255 * heatmap)
    heatmap_colored = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)

    # 50/50 blend keeps anatomy visible while showing hot-spot attention clearly
    overlayed = cv2.addWeighted(img, 1 - alpha, heatmap_colored, alpha, 0)

    filename = f"{file_id}_gradcam.png"
    filepath = exp_dir / filename
    cv2.imwrite(str(filepath), overlayed)
    return f"/static/explanations/{module_name}/{filename}"



def extract_yolo_heatmap(result, img_shape):
    heatmap = np.zeros(img_shape[:2], dtype=np.float32)
    boxes = result.boxes
    if len(boxes) > 0:
        for box in boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            w, h = (x2 - x1) // 2, (y2 - y1) // 2
            Y, X = np.ogrid[: img_shape[0], : img_shape[1]]
            dist_from_center = np.sqrt(
                ((X - cx) / max(w, 1)) ** 2 + ((Y - cy) / max(h, 1)) ** 2
            )
            mask = np.exp(-dist_from_center)
            heatmap = np.maximum(heatmap, mask * conf)
    return heatmap


def generate_dummy_mask(img_path: str):
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return np.zeros((224, 224), dtype=np.uint8)
    _, mask = cv2.threshold(img, 128, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    return mask
