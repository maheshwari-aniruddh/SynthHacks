import torch
import torchxrayvision as xrv
import torchvision.transforms as T
from PIL import Image
import numpy as np

model = xrv.models.DenseNet(weights="densenet121-res224-all")
model.eval()

transform = T.Compose([
    xrv.datasets.XRayCenterCrop(),
    xrv.datasets.XRayResizer(224)
])

img_pil = Image.open("backend/test_fixtures/chest_xray/chest_xray_normal_pa.png").convert("RGB")
img_l = np.array(img_pil.convert("L"))
img = xrv.datasets.normalize(img_l, 255)
img = transform(img[None])
img_tensor = torch.from_numpy(img).unsqueeze(0)

with torch.no_grad():
    preds = model(img_tensor).squeeze().numpy()

for label, prob in zip(xrv.datasets.default_pathologies, preds):
    print(f"{label}: {prob:.4f}")
