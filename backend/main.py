from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import uuid
import shutil
import numpy as np
import cv2
from pathlib import Path

from models import chest_xray, dr, skin_cancer, brain_mri, bone_fracture, dental, tb, cataract


def _dicom_to_png(dcm_path: str) -> str:
    """Read a DICOM file and write a normalized PNG alongside it. Returns PNG path."""
    import pydicom
    from pydicom.pixel_data_handlers.util import apply_voi_lut

    ds = pydicom.dcmread(dcm_path)
    arr = ds.pixel_array
    try:
        arr = apply_voi_lut(arr, ds)
    except Exception:
        pass
    arr = arr.astype(np.float32)
    # Handle MONOCHROME1 (inverted) photometric interpretation
    if getattr(ds, "PhotometricInterpretation", "") == "MONOCHROME1":
        arr = arr.max() - arr
    arr -= arr.min()
    if arr.max() > 0:
        arr = arr / arr.max() * 255.0
    arr = arr.astype(np.uint8)
    if arr.ndim == 2:
        arr = cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)
    png_path = dcm_path.rsplit(".", 1)[0] + ".png"
    cv2.imwrite(png_path, arr)
    return png_path

app = FastAPI(title="RadPi Medical AI Pipeline")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

async def handle_upload(image: UploadFile):
    ext = Path(image.filename).suffix
    file_id = str(uuid.uuid4())
    temp_file = f"temp_{file_id}{ext}"
    with open(temp_file, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)
    # Convert DICOM to PNG so downstream model code can use PIL/cv2 unchanged
    if ext.lower() in (".dcm", ".dicom"):
        try:
            png_path = _dicom_to_png(temp_file)
            os.remove(temp_file)
            return png_path
        except Exception as e:
            print(f"DICOM conversion failed: {e}")
    return temp_file

@app.post("/analyze/chest-xray")
async def analyze_chest_xray(file: UploadFile = File(...)):
    temp_file = await handle_upload(file)
    try:
        return chest_xray.predict(temp_file)
    finally:
        if os.path.exists(temp_file): os.remove(temp_file)

@app.post("/analyze/dr")
async def analyze_dr(file: UploadFile = File(...)):
    temp_file = await handle_upload(file)
    try:
        return dr.predict(temp_file)
    finally:
        if os.path.exists(temp_file): os.remove(temp_file)

@app.post("/analyze/skin-cancer")
async def analyze_skin_cancer(file: UploadFile = File(...)):
    temp_file = await handle_upload(file)
    try:
        return skin_cancer.predict(temp_file)
    finally:
        if os.path.exists(temp_file): os.remove(temp_file)

@app.post("/analyze/brain-mri")
async def analyze_brain_mri(file: UploadFile = File(...)):
    temp_file = await handle_upload(file)
    try:
        return brain_mri.predict(temp_file)
    finally:
        if os.path.exists(temp_file): os.remove(temp_file)

@app.post("/analyze/bone-fracture")
async def analyze_bone_fracture(file: UploadFile = File(...)):
    temp_file = await handle_upload(file)
    try:
        return bone_fracture.predict(temp_file)
    finally:
        if os.path.exists(temp_file): os.remove(temp_file)

@app.post("/analyze/dental")
async def analyze_dental(file: UploadFile = File(...)):
    temp_file = await handle_upload(file)
    try:
        return dental.predict(temp_file)
    finally:
        if os.path.exists(temp_file): os.remove(temp_file)

@app.post("/analyze/tb")
async def analyze_tb(file: UploadFile = File(...)):
    temp_file = await handle_upload(file)
    try:
        return tb.predict(temp_file)
    finally:
        if os.path.exists(temp_file): os.remove(temp_file)

@app.post("/analyze/cataract")
async def analyze_cataract(file: UploadFile = File(...)):
    temp_file = await handle_upload(file)
    try:
        return cataract.predict(temp_file)
    finally:
        if os.path.exists(temp_file): os.remove(temp_file)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
