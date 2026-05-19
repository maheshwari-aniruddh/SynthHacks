# RadPi Model Comparison

## Edge-Deployable Medical Imaging Models for Raspberry Pi 5

Comprehensive cross-modality survey of pretrained, INT8-quantized models that fit a Raspberry Pi 5 inference target across six clinical domains: brain MRI, chest X-ray, bone fracture X-ray, dental panoramic X-ray, dermatology, and fundus/retinal imaging.

---

## Hardware Target

| Spec | Value |
|---|---|
| Board | Raspberry Pi 5 |
| CPU | Broadcom BCM2712, quad-core ARM Cortex-A76 @ 2.4 GHz |
| RAM | 8 GB LPDDR4X-4267 |
| Architecture | ARM64 (aarch64) |
| Accelerator | None (CPU-only inference) |
| OS | Raspberry Pi OS 64-bit (Debian Bookworm) |
| Runtime | ONNX Runtime 1.17+ (ARM64 build) or TFLite Runtime 2.15+ |
| Quantization | INT8 post-training quantization mandatory for all models |
| Performance envelope | 100-300 ms per inference for MobileNet/EfficientNet-B0/YOLOv8n class models at 224x224; 0.5-2 s per image for compact U-Net segmentation at 128x256 |

Every model listed below is selected against this envelope. 3D networks (e.g. MONAI SegResNet, BraTS 3D U-Net) are explicitly excluded for memory reasons. Vision transformers larger than ViT-Tiny / SigLIP-base are excluded for latency reasons.

---

## Deployment Pipeline

The conversion path is identical across modalities and is the single most important standardization decision in the project.

**PyTorch path:**

```
.pt or .pth  ->  torch.onnx.export(model, dummy, "model.onnx", opset_version=17)
             ->  onnxruntime.quantization.quantize_dynamic(per_channel=True, weight_type=QInt8)
             ->  ort.InferenceSession("model.int8.onnx", providers=["CPUExecutionProvider"])
```

**Keras / TensorFlow path:**

```
.h5 or .keras  ->  tf.lite.TFLiteConverter.from_keras_model(model)
               ->  converter.optimizations = [tf.lite.Optimize.DEFAULT]
               ->  converter.representative_dataset = rep_data_gen   # for full INT8
               ->  tflite_runtime.interpreter.Interpreter("model.int8.tflite")
```

**Ultralytics YOLO path:**

```
model.export(format="onnx", imgsz=640, opset=17, simplify=True, int8=True)
```

Expected speedups from INT8: 2-4x size reduction, 2-3x latency improvement on Cortex-A76 vs FP32.

---

## Executive Summary

Primary pick per modality. Full per-modality tables follow.

| Modality | Task | Best model | Arch | Size | Format | License | Est. inference |
|---|---|---|---|---|---|---|---|
| Brain MRI | 4-class tumor | alanjafari/BrainTumorAI | YOLOv8n | 14 MB | .pt -> ONNX | MIT | <1 s |
| Brain MRI | Tumor segmentation | wdika/SEG_UNet_BraTS2023AdultGlioma | AttentionUNet | ~30 MB | .atommic -> PyTorch | Apache-2.0 | 1-2 s |
| Chest X-ray | 18-pathology classification | mlmed/torchxrayvision densenet121-res224-all | DenseNet121 (7.9M) | ~30 MB | .pt | Apache-2.0 | 1-2 s |
| Chest X-ray | Lung field segmentation | imlab-uiip/lung-segmentation-2d | U-Net | ~30 MB | .hdf5 (Keras) | none stated | 1-2 s |
| Bone fracture | Detection | RuiyangJu/Bone_Fracture_Detection_YOLOv8 | YOLOv8n | ~12 MB | .pt -> ONNX | AGPL-3.0 | <1 s (3-10 FPS) |
| Bone fracture | Segmentation | None publicly available | -- | -- | -- | -- | use Grad-CAM |
| Dental | Tooth segmentation | SerdarHelli Teeth U-Net | Keras U-Net | 161 MB | .h5 -> TFLite | none stated | 1-3 s |
| Dental | Pathology detection | SubGlitch1/DentalXrayAI | YOLOv8n | ~6 MB | .pt -> ONNX | none stated | <1 s |
| Dermatology | Lesion classification | HugsVision/Skin-Cancer MobileNetV2 | MobileNetV2 | 9.2 MB | .pth -> ONNX | Apache-2.0 | ~150 ms |
| Dermatology | Lesion segmentation | Ahmed-Selem/Shifaa-Skin-Cancer-UNet | Tiny U-Net (128px) | <5 MB | PyTorch | MIT | <1 s |
| Fundus | DR 5-class grading | EfficientNet-B0 on APTOS (train from notebooks) | EfficientNet-B0 | ~20 MB | .pt -> TFLite | varies (MIT/Apache) | 0.5-1 s |
| Fundus | Retinal vessel segmentation | orobix/retina-unet | Patch U-Net (48x48) | <10 MB | Keras | none stated | <1 s |

---

## 1. Brain MRI

Clinical task: 4-class tumor classification (glioma, meningioma, pituitary, no tumor) on T1-CE axial slices, plus per-pixel tumor segmentation. Input is a single 2D slice. 3D volumetric BraTS pipelines (SegResNet, nnU-Net 3D) are out of scope for the Pi 5.

### 1a. Classification

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| **alanjafari/BrainTumorAI** | huggingface.co/alanjafari/BrainTumorAI | YOLOv8n classifier | 3.2M / 14 MB | .pt -> ONNX | MIT | Msoud Nickparvar (7,023 imgs) | ~99% top-1 (reported) | OK (good) | YOLO classification head, not detection; export with `model.export(format='onnx')` |
| ShabGaming/Brain_MRI_Tumor_Classification | huggingface.co/ShabGaming/Brain_MRI_Tumor_Classification | CNN | ~25 MB | .pt | varies | Kaggle MRI | ~95% | OK (good) | Less polished card, retrain on Msoud for parity |
| hassaanik/Tumor_Detection | huggingface.co/hassaanik/Tumor_Detection | CNN | small | .pt | varies | binary tumor / no-tumor | ~95% | OK (good) | Binary only, not 4-class; useful as a triage stage |
| MobileNetV2 fine-tune notebook (Kaggle, slashblade) | kaggle.com/code/slashblade/brain-tumor-classification-mobilenet-v2 | MobileNetV2 transfer | 3.5M / ~14 MB | .h5 -> TFLite | notebook (Apache-style) | Msoud Nickparvar | ~98% | OK (excellent) | Code, not weights; you train it (1-2h on a GPU) and ship TFLite INT8 |
| google/vit-base-patch16-224 fine-tunes (various HF forks) | huggingface.co/models?search=brain+mri+vit | ViT-Base | 86M / ~340 MB | .pt | Apache-2.0 | varies | high | NO (too big) | Listed only to flag the temptation; do not deploy |

**Recommendation.** Ship `alanjafari/BrainTumorAI` as the default. 14 MB, MIT-licensed, exports cleanly to ONNX, gives sub-second inference. Keep the Kaggle MobileNetV2 notebook in reserve for cases where you want full INT8 TFLite from the ground up or need to retrain on local data.

### 1b. Segmentation

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| **wdika/SEG_UNet_BraTS2023AdultGlioma** | huggingface.co/wdika/SEG_UNet_BraTS2023AdultGlioma | 2D AttentionUNet | ~30 MB | .atommic -> PyTorch | Apache-2.0 | BraTS 2023 Adult Glioma | Dice ~0.88 (whole tumor) | OK (warning, 1-2 s) | `.atommic` format requires the ATOMMIC library to load; convert to TorchScript at packaging time |
| Mehrdad-Noori/Brain-Tumor-Segmentation | github.com/Mehrdad-Noori/Brain-Tumor-Segmentation | 2D U-Net (Keras) | ~10M | training code only | MIT | LGG MRI Segmentation | Dice 0.91 | OK (excellent) | No saved weights; train then convert .h5 -> TFLite INT8 |
| adityajn105/brain-tumor-segmentation-unet | github.com/adityajn105/brain-tumor-segmentation-unet | U-Net (Keras) | ~8M | training code only | MIT | LGG FLAIR | Dice 0.90 | OK (good) | Train yourself; simple architecture, fast on Pi |
| sdsubhajitdas/Brain-Tumor-Segmentation | github.com/sdsubhajitdas/Brain-Tumor-Segmentation | U-Net (PyTorch) | ~10M | training code only | MIT | LGG | Dice ~0.89 | OK (good) | Train, then `torch.onnx.export`, quantize |
| MONAI SegResNet (BraTS) | github.com/Project-MONAI/MONAI | 3D SegResNet | ~50M | .pt | Apache-2.0 | BraTS 3D volumes | Dice 0.92 (WT) | NO (3D, >8 GB peak) | Volumetric pipeline; do not attempt |

**Recommendation.** Use `wdika/SEG_UNet_BraTS2023AdultGlioma` as the only segmentation model with downloadable checkpoints in this list. Convert to TorchScript at packaging time so deployments don't carry the ATOMMIC dependency. If license clarity matters more than ready weights, train the `adityajn105` U-Net on LGG FLAIR (a half-day on a single GPU) and ship a TFLite INT8 build.

### Datasets

| Dataset | URL | Size |
|---|---|---|
| Brain Tumor MRI Dataset (Msoud Nickparvar) | kaggle.com/datasets/masoudnickparvar/brain-tumor-mri-dataset | 7,023 imgs, 4 classes |
| Figshare Brain Tumor (Jun Cheng) + masks | figshare.com/articles/dataset/brain_tumor_dataset/1512427 | 3,064 T1-CE + masks |
| LGG MRI Segmentation (Mateusz Buda) | kaggle.com/datasets/mateuszbuda/lgg-mri-segmentation | 3,929 FLAIR + masks |
| BraTS 2020 Training Data | kaggle.com/datasets/awsaf49/brats2020-training-data | 371 multimodal 3D |
| Simezu/brain-tumour-MRI-scan (HF mirror) | huggingface.co/datasets/Simezu/brain-tumour-MRI-scan | 7,023 imgs |

---

## 2. Chest X-ray

Clinical task: multi-pathology classification, binary pneumonia screening, lung field segmentation, and tuberculosis detection on AP/PA chest radiographs.

### 2a. Classification

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| **mlmed/torchxrayvision densenet121-res224-all** | github.com/mlmed/torchxrayvision | DenseNet121 | 7.9M / ~30 MB | .pt | Apache-2.0 | NIH + CheXpert + RSNA + MIMIC combined | AUC 0.78-0.85 across 18 pathologies | OK (good, 1-2 s) | Multiple checkpoints (`-all`, `-nih`, `-chex`, `-rsna`); weights auto-download on first import |
| ayushirathour/chest-xray-pneumonia-detection | huggingface.co/ayushirathour/chest-xray-pneumonia-detection | MobileNetV2 | 3.5M / ~14 MB | .h5 | MIT | Mooney Pneumonia | 96% acc binary | OK (excellent, ~150 ms TFLite) | Binary pneumonia only |
| keremberke/yolov8m-chest-xray-classification | huggingface.co/keremberke/yolov8m-chest-xray-classification | YOLOv8m (cls) | ~50 MB | .pt | AGPL-3.0 | binary normal/pneumonia | ~95% | OK (warning, m-size is borderline) | AGPL is restrictive for closed-source distribution |
| ishans24/covid19-detection-xray | huggingface.co/ishans24/covid19-detection-xray | VGG19 | ~80 MB | .h5 | varies | COVID/Normal/Pneumonia 3-class | ~93% | NO (too big, slow) | Replace with EfficientNet-B0 finetune if you need COVID class |
| MMClassification CheXNet reference | github.com/arnoweng/CheXNet | DenseNet121 | 7M / ~28 MB | .pth | MIT | NIH ChestX-ray14 | AUC 0.84 (14 path) | OK (good) | Predecessor to torchxrayvision; use torchxrayvision instead |

**Recommendation.** `torchxrayvision densenet121-res224-all` is the single most clinically comprehensive option for Pi deployment. Use it as the default. Layer `ayushirathour` MobileNetV2 as a faster front-line pneumonia screen if the device is operating in low-power mode and only needs a binary readout.

### 2b. Lung segmentation

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| **ianpan/chest-x-ray-basic** | huggingface.co/ianpan/chest-x-ray-basic | EffNetV2-S + U-Net | 22.2M | safetensors | none stated | CheXpert + NIH + CheXmask | Dice 0.943-0.957 (lungs+heart) | OK (good, 1-2 s) | Segments right lung, left lung, and heart; no formal license listed |
| **imlab-uiip/lung-segmentation-2d** | github.com/imlab-uiip/lung-segmentation-2d | Standard U-Net | ~10M / ~30 MB | .hdf5 (Keras) | none stated | Montgomery + JSRT | Dice ~0.97 | OK (excellent) | Pretrained `trained_model.hdf5` ships in the repo; no training needed |
| IlliaOvcharenko/lung-segmentation | github.com/IlliaOvcharenko/lung-segmentation | U-Net + VGG11 encoder | ~25M | .pt | none stated | Montgomery + Shenzhen | Dice 0.961 | OK (good) | PyTorch; convert to ONNX |

**Recommendation.** Prefer `imlab-uiip/lung-segmentation-2d` for true plug-and-play deployment. The repo ships a pretrained `trained_model.hdf5`, convert it directly to TFLite INT8. If you need lungs *and* heart segmented (cardiothoracic ratio computation), switch to `ianpan/chest-x-ray-basic` and accept the missing-license risk.

### 2c. TB classification

No standalone pretrained TB model with downloadable weights was located on HuggingFace, Kaggle, or GitHub releases. The recommended approach is to fine-tune MobileNetV2 or EfficientNet-B0 on the combined Montgomery + Shenzhen datasets (~800 images). `torchxrayvision` indirectly detects TB-related radiographic patterns (infiltration, consolidation) without dedicated TB labels.

### Datasets

| Dataset | URL | Size |
|---|---|---|
| Chest X-Ray Images (Pneumonia) - Paul Mooney | kaggle.com/datasets/paultimothymooney/chest-xray-pneumonia | 5,863 imgs |
| NIH ChestX-ray14 | kaggle.com/datasets/nih-chest-xrays/data | 112,120 imgs, 14 labels |
| CheXpert (Stanford) | aimi.stanford.edu/datasets/chexpert-chest-x-rays | 224,316 CXRs |
| COVID-19 Radiography Database | kaggle.com/datasets/tawsifurrahman/covid19-radiography-database | ~21K imgs |
| Montgomery County TB CXR | kaggle.com/datasets/raddar/tuberculosis-chest-xrays-montgomery | 138 CXRs + masks |
| Shenzhen Hospital TB CXR | lhncbc.nlm.nih.gov/...Shenzhen-Hospital-CXR-Set | 662 CXRs |
| TB Chest X-ray (Tawsifur Rahman) | kaggle.com/datasets/tawsifurrahman/tuberculosis-tb-chest-xray-dataset | 4,200 imgs |

---

## 3. Bone Fracture X-ray

Clinical task: fracture detection on extremity (wrist, hand, ankle, etc.) radiographs. Localization via bounding boxes is the standard output; per-pixel segmentation has no public weights.

### 3a. Detection / classification

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| **RuiyangJu/Bone_Fracture_Detection_YOLOv8** | github.com/RuiyangJu/Bone_Fracture_Detection_YOLOv8 | YOLOv8n | 3.2M / ~12 MB | .pt | AGPL-3.0 | GRAZPEDWRI-DX (20,327 wrist X-rays) | mAP50 ~0.65 | OK (excellent, 3-10 FPS) | `best.pt` on GitHub releases; AGPL is restrictive for closed-source product |
| nandodeomkar/autotrain-bone-fracture-detection | huggingface.co/nandodeomkar/autotrain-bone-fracture-detection | Swin-Tiny | ~28M / ~110 MB | .pt | Apache-2.0 | classification only | 92.3% acc, AUC 0.972 | OK (warning, Swin is slower) | Image-level classification, no localization |
| prithivMLmods/Bone-Fracture-Detection | huggingface.co/prithivMLmods/Bone-Fracture-Detection | SigLIP2-base (Transformer) | ~94M FP32 / ~95 MB INT8 | safetensors | Apache-2.0 | mixed | high | OK (warning, borderline for 8 GB) | Vision transformer; INT8 helps but latency is 2-3 s |
| mo26-web/Bone-Fracture-Classification | github.com/mo26-web/Bone-Fracture-Classification | MobileNetV3 | 5.4M / ~22 MB | training code only | varies | mixed | 95% acc | OK (excellent, 30-40 FPS quantized) | Train yourself; PyTorch ARM tutorial covers the path end-to-end |
| mdciri/YOLOv7-Bone-Fracture-Detection | github.com/mdciri/YOLOv7-Bone-Fracture-Detection | YOLOv7-p6 | ~80M | .pt + ONNX | GPL-3.0 | wrist + hand | mAP50 ~0.70 | NO (YOLOv7-p6 too large) | Use YOLOv8n above instead |

**Recommendation.** `RuiyangJu/Bone_Fracture_Detection_YOLOv8` is the standout: ready weights, smallest footprint, real bounding-box output. The AGPL license is the only flag - if RadPi will be distributed as a closed-source product, train the `mo26-web` MobileNetV3 on the same GRAZPEDWRI-DX dataset and ship under a permissive license.

### 3b. Segmentation: explicit gap

**No publicly available pretrained fracture segmentation model with downloadable weights exists.** Confirmed across HuggingFace, Kaggle, GitHub releases, and TensorFlow Hub. The `FracAtlas` GitHub repo contains a YOLOv8s_seg training notebook with COCO-format segmentation masks but no published weights. Two recommended workarounds:

1. **Grad-CAM on the classification model.** Run YOLOv8n + Grad-CAM++ on the detection head to generate localization heatmaps. Minimal extra compute, ships with `pytorch-grad-cam`.
2. **Train YOLOv8n-seg on FracAtlas.** 4,083 images with masks. Half a day on a single GPU. Ship the resulting `.pt` as the project's first original artifact.

### Datasets

| Dataset | URL | Size |
|---|---|---|
| GRAZPEDWRI-DX | figshare.com/articles/dataset/GRAZPEDWRI-DX/14825193 | 20,327 wrist X-rays + bboxes |
| FracAtlas | figshare.com/articles/dataset/FracAtlas/22717560 | 4,083 imgs (717 fractured) + seg masks |
| Bone Fracture Multi-Region (Kaggle) | kaggle.com/datasets/bmadushanirodrigo/fracture-multi-region-x-ray-data | 10,580 imgs |
| MURA (Stanford) | stanfordmlgroup.github.io/competitions/mura | 40,561 imgs, 7 upper-extremity types |
| FracAtlas on HuggingFace | huggingface.co/datasets/yh0701/FracAtlas_dataset | HF mirror |

---

## 4. Dental Panoramic X-ray

Clinical task: tooth-by-tooth segmentation on panoramic radiographs and caries / pathology detection. Most underserved of the six modalities; only two production-ready model families exist.

### 4a. Tooth segmentation

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| **SerdarHelli Teeth U-Net** | huggingface.co/SerdarHelli/Segmentation-of-Teeth-in-Panoramic-X-ray-Image-Using-U-Net | Keras U-Net | ~40M / 161 MB | .h5 -> TFLite | none stated | SerdarHelli panoramic (116 imgs + masks) | Dice ~0.93 (binary teeth) | OK (warning, 1-3 s) | Binary teeth-vs-background only, not per-tooth; 161 MB is large but quantizes to ~40 MB INT8 |
| devichand579/Instance_seg_teeth (BB-UNet) | github.com/devichand579/Instance_seg_teeth | YOLOv8 + U-Net | varies | training code only | varies | OdontoAI | per-tooth instance seg | OK (warning) | Two-stage pipeline; heavier to maintain |
| IvisionLab/deep-dental-image | github.com/IvisionLab/deep-dental-image | Mask R-CNN (Detectron2) | ~50M / 350-500 MB | .pt | Apache-2.0 | DNS / OdontoAI | high | NO (too big) | Detectron2 stack is heavy; out of scope |

**Recommendation.** `SerdarHelli` is the only ready-to-use option. Ship the 161 MB `dental_xray_seg.h5`, convert to TFLite INT8 (~40 MB), accept binary teeth segmentation as the v1 capability. Per-tooth FDI numbering needs a second-stage classifier or the `devichand579` two-stage pipeline.

### 4b. Pathology detection

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| **SubGlitch1/DentalXrayAI** | github.com/SubGlitch1/DentalXrayAI | YOLOv8n | 3.2M / ~6 MB | .pt -> ONNX | none stated | DENTEX (MICCAI 2023) | mAP50 0.458 (4 pathology classes) | OK (excellent, <1 s) | Pretrained `best.pt` in repo; missing license is the only concern |
| AndreyGermanov/yolov8_caries_detector | github.com/AndreyGermanov/yolov8_caries_detector | YOLOv8n | 3.2M / ~6 MB | .pt -> ONNX | varies | caries-only | mAP50 ~0.55 | OK (excellent) | Single-class caries; pair with SubGlitch1 for broader pathology |
| AI-RESEARCHER-2024/AI-in-Dentistry | huggingface.co/AI-RESEARCHER-2024/AI-in-Dentistry | MobileNetV2 cls | 3.5M / ~14 MB | .h5 | varies | oral diseases | ~90% acc | OK (excellent) | Image-level classification, no localization |

**Recommendation.** `SubGlitch1/DentalXrayAI` for any pathology localization need - covers four DENTEX classes (caries, periapical lesions, deep caries, impacted teeth). Pair with `AndreyGermanov/yolov8_caries_detector` if caries-specific sensitivity matters. Both are ~6 MB and run in well under a second after ONNX INT8 quantization.

### Datasets

| Dataset | URL | Notes |
|---|---|---|
| DENTEX (MICCAI 2023) | huggingface.co/datasets/ibrahimhamamci/DENTEX | 2,332 panoramic X-rays, hierarchical annotations |
| OdontoAI Open Panoramic Radiographs | github.com/IvisionLab/OdontoAI-Open-Panoramic-Radiographs | 4,000 imgs, instance seg |
| DNS Panoramic Images | github.com/IvisionLab/dns-panoramic-images | 543 imgs, COCO format |
| Tufts Dental Database | tdd.ece.tufts.edu | 1,000 panoramic, multimodal |
| Teeth Segmentation (Kaggle) | kaggle.com/datasets/humansintheloop/teeth-segmentation-on-dental-x-ray-images | seg masks |
| Oral Diseases (Kaggle) | kaggle.com/datasets/salmansajid05/oral-diseases/data | classification |

---

## 5. Dermatology

Clinical task: melanoma / non-melanoma skin lesion classification on dermoscopy or smartphone photos, plus lesion boundary segmentation. Richest model ecosystem of the six modalities.

### 5a. Classification

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| **HugsVision/Skin-Cancer MobileNetV2** | huggingface.co/spaces/HugsVision/Skin-Cancer | MobileNetV2 | 2.3M / 9.2 MB | .pth -> ONNX | Apache-2.0 | HAM10000 | ~88% acc | OK (excellent, ~150 ms) | Weights are inside a HF Space at `models/MobileNetV2/best_model.pth` - download manually |
| **junaid54541/Skin-Cancer-Classification-Tflite-Model** | github.com/junaid54541/Skin-Cancer-Classification-Tflite-Model | MobileNet variant | ~5 MB | .tflite | varies | HAM10000 | ~85% | OK (excellent, ~100 ms) | Already TFLite, no conversion needed; just `tflite_runtime` |
| lizardwine/Melanoma-003 | huggingface.co/lizardwine/Melanoma-003 | MobileNetV2 | ~14 MB | .keras | Apache-2.0 | melanoma binary | ~90% | OK (excellent) | Binary mel/non-mel |
| syaha/skin_cancer_detection_model | huggingface.co/syaha/skin_cancer_detection_model | CNN (Keras) | ~30 MB | .h5 | varies | ISIC | ~87% | OK (good) | Older architecture; prefer HugsVision |
| Anwarkh1/Skin_Cancer-Image_Classification | huggingface.co/Anwarkh1/Skin_Cancer-Image_Classification | ViT-base | 86M / ~340 MB | .pt | varies | HAM10000 | ~90% | NO (too big) | Listed for completeness; do not deploy |
| hasibzunair/melanet | huggingface.co/hasibzunair/melanet | EfficientNet-B0 | ~20 MB | .pt | varies | binary | ~92% | OK (good) | Good fallback if HugsVision unavailable |

**Recommendation.** `HugsVision/Skin-Cancer MobileNetV2` at 9.2 MB is the optimal model. For zero-conversion deployment, `junaid54541` ships a `.tflite` directly - run with `tflite_runtime.interpreter` and skip the conversion step entirely. Both produce 100-300 ms latency on Pi 5.

### 5b. Lesion segmentation

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| **Ahmed-Selem/Shifaa-Skin-Cancer-UNet** | huggingface.co/Ahmed-Selem/Shifaa-Skin-Cancer-UNet | Tiny U-Net (16->32->64->128), 128x128 grayscale | <1M / <5 MB | PyTorch | MIT | ISIC subset | Dice 0.9175 | OK (excellent, <1 s) | Lightest segmentation model in this entire survey |
| JCruan519/MALUNet | github.com/JCruan519/MALUNet | Multi-Attention Lightweight U-Net | ~1M | training code only | varies | ISIC | Dice 0.91 | OK (excellent) | Purpose-built lightweight from BIBM 2022; train yourself |
| DevBhuyan/Skin-Lesion-Segmentation | huggingface.co/DevBhuyan/Skin-Lesion-Segmentation | U-Net + DenseNet encoder | ~30 MB | .h5 (Keras) | varies | ISIC | Jaccard 0.9086 | OK (good) | Heavier than Shifaa, marginally more accurate |
| martinijfb/Skin-Lesion-Segmentation | github.com/martinijfb/Skin-Lesion-Segmentation | U-Net | ~15 MB | .pt | varies | ISIC | Dice ~0.89 | OK (good) | Weights live in `Models/` folder of the repo |
| VNOpenAI/skin-lesion-segmentation | github.com/VNOpenAI/skin-lesion-segmentation | U-Net + DoubleUNet | varies | Keras + ONNX export | varies | ISIC | Dice ~0.90 | OK (good) | Ships ONNX export script |

**Recommendation.** `Ahmed-Selem/Shifaa-Skin-Cancer-UNet` for maximum speed on Pi - 128x128 grayscale input keeps it well under 1 s. Upgrade to `MALUNet` if you need higher accuracy and are willing to train (1-2 hours on a GPU).

### Datasets

| Dataset | URL | Notes |
|---|---|---|
| HAM10000 (Kaggle) | kaggle.com/datasets/kmader/skin-cancer-mnist-ham10000 | 10,015 dermoscopy imgs, 7 classes |
| HAM10000 (Harvard Dataverse) | dataverse.harvard.edu/...doi:10.7910/DVN/DBW86T | canonical source |
| ISIC Challenge Data (all years) | challenge.isic-archive.com/data | up to 33K images |
| PH2 Dataset | fc.up.pt/addi/ph2 database.html | 200 dermoscopy imgs |
| DermNet (Kaggle) | kaggle.com/datasets/shubhamgoel27/dermnet | broad clinical dermatology |

---

## 6. Fundus / DR / Cataract

Clinical task: diabetic retinopathy 5-class grading, multi-disease ocular classification (cataract, glaucoma, AMD), retinal vessel segmentation, and optic disc/cup segmentation.

### 6a. Diabetic retinopathy classification (5-class)

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| **jdelgado2002/diabetic_retinopathy_detection** | huggingface.co/jdelgado2002/diabetic_retinopathy_detection | fastai ResNet-50 | 25M / ~98 MB | .pkl | MIT | APTOS 2019 | Quadratic Kappa 0.84 | OK (warning, big) | fastai `.pkl` is a pickled Python object - load with `fastai.load_learner`, not `torch.load`; pickle = security audit |
| **APTOS competition solutions (mikelkl)** | github.com/mikelkl/APTOS2019 | EfficientNet-B5 / B0 | varies | training code only | MIT | APTOS 2019 | Kappa 0.92 (winner) | OK (excellent if EfficientNet-B0) | Retrain on B0 backbone, ~20 MB INT8 |
| ArjTheHacker/diabetic-retinopathy-detection | huggingface.co/ArjTheHacker/diabetic-retinopathy-detection | CNN | ~30 MB | .pt | varies | APTOS | ~85% acc | OK (good) | Less mature card |
| khornlund/aptos2019 | github.com/khornlund/aptos2019 | EfficientNet | training code only | MIT | APTOS | high | OK (excellent if B0) | Solid training pipeline |
| tahsin314 APTOS solution | github.com/tahsin314/APTOS2019 | mixed | training code only | MIT | APTOS | high | OK (good) | Another competition reference |

**Recommendation.** `jdelgado2002/diabetic_retinopathy_detection` is the only download-ready DR-classification weight, but the 98 MB ResNet-50 + fastai pickle is awkward. Best long-term path: retrain EfficientNet-B0 on APTOS 2019 using the `mikelkl` notebook (~5.3M params, ~20 MB INT8 TFLite, sub-second Pi inference). Avoid the pickle in production.

### 6b. Ocular disease classification (cataract, glaucoma, AMD)

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| JordiCorbilla/ocular-disease-deep-learning | github.com/JordiCorbilla/ocular-disease-intelligent-recognition-deep-learning | InceptionV3 (~92 MB) + VGG | ~92 MB each | .h5 | varies | ODIR-2019, 8 classes | F1 ~0.75 | OK (warning, heavy) | Two-network dual-eye ensemble; pick single-eye Inception |
| **talhaanwarch/ODIR2019 (EfficientNetB3)** | github.com/talhaanwarch/ODIR2019 | EfficientNet-B3 | ~12M / ~48 MB | .h5 | varies | ODIR-2019 | F1 0.901 | OK (excellent) | Single-eye single-network; cleanest Pi-friendly option |
| dduwa/ocular-disease-recognition | github.com/dduwa/ocular-disease-recognition | MobileNet / EfficientNet / VGG | varies | .h5 | varies | ODIR-5K | varies | OK (excellent if MobileNet variant) | Use the MobileNet variant for max Pi speed |

**Recommendation.** `talhaanwarch/ODIR2019` EfficientNet-B3 single-eye at ~48 MB. ODIR-2019 is dual-eye natively but a single-eye fork avoids the dual-input plumbing on-device. Convert to TFLite INT8 -> ~15 MB, sub-second inference.

### 6c. Retinal vessel segmentation

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| **orobix/retina-unet** | github.com/orobix/retina-unet | Patch-based 48x48 U-Net | ~500K / <5 MB | Keras | varies | DRIVE | AUC 0.979 | OK (excellent) | Tiny; patch inference reassembles full image |
| **VesselSeg-Pytorch (lee-zq)** | github.com/lee-zq/VesselSeg-Pytorch | UNet / Dense U-Net / LadderNet | varies, ~5-15 MB | .pt | varies | DRIVE + STARE + CHASE_DB1 | Sens 0.81+ | OK (excellent) | Pretrained weights for all three standard retinal datasets |
| TommyGiak/retinal_vessel_segmentation | github.com/TommyGiak/retinal_vessel_segmentation | U-Net | small | .pt | varies | DRIVE | Dice ~0.81 | OK (excellent) | PyTorch, simple |
| Retina-Seg ensemble (vineet1992) | github.com/vineet1992/Retina-Seg | ensemble of U-Nets | ~50 MB | .pt | varies | DRIVE | Dice ~0.82 | OK (warning, ensemble cost) | Ensemble is slow; pick the single best member |

**Recommendation.** `orobix/retina-unet` for absolute minimum footprint. If you need cross-dataset robustness (DRIVE + STARE + CHASE_DB1), use `VesselSeg-Pytorch` and ship the LadderNet checkpoint.

### 6d. Optic disc / cup segmentation

| Model | URL | Arch | Params / Size | Format | License | Dataset | Reported metric | Pi 5 fit | Gotcha |
|---|---|---|---|---|---|---|---|---|---|
| seva100/optic-nerve-cnn | github.com/seva100/optic-nerve-cnn | Keras U-Net | small | .h5 in `models_weights/` | varies | RIM-ONE / Drishti-GS | Dice 0.93+ | OK (good) | Plug-and-play |
| HzFu/AGNet | github.com/HzFu/AGNet | Attention-Gated U-Net (PyTorch) | ~10M | .pt | varies | REFUGE / Drishti-GS | Dice 0.94 | OK (good) | Convert to ONNX |

**Recommendation.** `seva100/optic-nerve-cnn` for Keras shops, `HzFu/AGNet` for PyTorch shops. Both are small enough to ship alongside the vessel-segmentation model without crowding the 8 GB budget.

### Datasets

| Dataset | URL | Notes |
|---|---|---|
| APTOS 2019 Blindness Detection | kaggle.com/competitions/aptos2019-blindness-detection | 5-class DR |
| Kaggle DR Detection (EyePACS 2015) | kaggle.com/competitions/diabetic-retinopathy-detection | 88K imgs |
| ODIR-5K | kaggle.com/datasets/andrewmvd/ocular-disease-recognition-odir5k | 8-class ocular disease |
| DRIVE | drive.grand-challenge.org | vessel seg, 40 imgs |
| STARE | cecas.clemson.edu/~ahoover/stare | vessel seg, 20 imgs |
| CHASE_DB1 | blogs.kingston.ac.uk/retinal/chasedb1 | vessel seg, 28 imgs |
| IDRiD | kaggle.com/datasets/mariaherrerot/idrid-dataset | DR + lesion seg |
| Eye Disease Dataset (HF) | huggingface.co/datasets/Falah/eye-disease-dataset | mixed |

---

## Gaps and Cautions

These are the items that will trip up an integration team and should be tracked as project risks.

**1. Bone fracture segmentation has no public pretrained weights.** Confirmed across HuggingFace, Kaggle, GitHub releases, and TensorFlow Hub. The only path forward is to train YOLOv8n-seg on FracAtlas (4,083 images with masks) or ship Grad-CAM heatmaps from the YOLOv8n detection model as a localization proxy.

**2. Tuberculosis classification has no standalone pretrained model.** TorchXRayVision detects TB-related patterns (infiltration, consolidation) indirectly. For dedicated TB inference, fine-tune MobileNetV2 or EfficientNet-B0 on combined Montgomery + Shenzhen (~800 images).

**3. Dental panoramic remains the most underserved modality.** Only two production-ready model families (`SerdarHelli` U-Net for segmentation, `SubGlitch1` YOLOv8n for pathology detection). Both have unclear or missing license headers.

**4. fastai pickle format in the DR classifier.** `jdelgado2002/diabetic_retinopathy_detection` ships as a fastai `.pkl`, which is a pickled Python object - it executes arbitrary code on load. Do not deploy it as-is on edge devices. Either re-export as TorchScript / ONNX inside a sandboxed pipeline, or retrain EfficientNet-B0 from the `mikelkl` notebook.

**5. ATOMMIC dependency for the brain segmentation model.** `wdika/SEG_UNet_BraTS2023AdultGlioma` uses the `.atommic` format, which requires the ATOMMIC library to load. Convert to TorchScript at packaging time so deployments don't carry the dependency.

**6. License gaps are common in this ecosystem.** Half the lung, dental, vessel, and DR models above have no license file. Treat them as "research use only" until clarified. See the license matrix below.

**7. 3D networks are out of scope.** MONAI SegResNet, BraTS 3D U-Net, nnU-Net 3D pipelines exceed 8 GB peak memory on Pi 5 and run at 30+ s per volume. Always use the 2D-slice variant.

**8. ViT-Base and SigLIP-base are borderline.** Listed for completeness but practical latency on Pi 5 is 2-3 s even after INT8 quantization. Prefer CNNs (MobileNet, EfficientNet-B0, DenseNet121) wherever possible.

---

## License Risk Matrix

| License class | Models | Notes |
|---|---|---|
| **Permissive (MIT / Apache-2.0)** | alanjafari/BrainTumorAI, ayushirathour pneumonia, wdika brain seg, prithivMLmods bone, lizardwine derm, jdelgado2002 DR, Ahmed-Selem Shifaa | Safe for commercial use including closed-source distribution |
| **AGPL-3.0 (network-share copyleft)** | RuiyangJu YOLOv8 fracture, keremberke YOLOv8m chest, all Ultralytics YOLOv8 pretrained weights | If RadPi is ever a hosted service, AGPL forces source release. Train your own YOLOv8 weights on the same datasets and re-license to MIT under your training pipeline, or switch to MobileNetV3 (`mo26-web`) under a permissive license. |
| **GPL-3.0 (copyleft)** | mdciri YOLOv7 fracture | Same concern as AGPL for closed-source distribution |
| **No license stated** | ianpan chest, imlab-uiip lung, SerdarHelli dental, SubGlitch1 dental, AndreyGermanov caries, orobix retina, VesselSeg-Pytorch, seva100 optic | Treat as "research only" until you contact the author. Several have HF Space demos which implicitly suggest non-commercial intent. |
| **Notebook / training code only** | mo26-web bone, Mehrdad-Noori brain seg, MALUNet derm, mikelkl APTOS | License attaches to your retrained weights, not the original; you control distribution |

---

## Conclusion

The MobileNetV2 / EfficientNet-B0 / YOLOv8n architecture family consistently delivers the best accuracy-to-size ratio for Raspberry Pi 5 deployment across all six medical imaging domains. Dermatology and chest X-ray are saturated with mature pretrained options. Brain MRI, fundus, and bone fracture detection each have one strong primary pick that ships ready-to-run. Dental panoramic and bone fracture segmentation remain genuine gaps requiring either custom training or workaround strategies (Grad-CAM, binary instead of per-instance segmentation). For every module, INT8 post-training quantization to ONNX or TFLite is mandatory: it halves inference latency, quarters model size, and keeps the full six-modality pipeline well under the Pi 5's 8 GB RAM ceiling.
