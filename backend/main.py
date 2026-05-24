import os
import sys
import types

# --- SHIMS & OFFLINE MODE ---
# 1. Shim 'imp' module (removed in Python 3.12) for older libraries (Keras/TF)
if sys.version_info >= (3, 12):
    if "imp" not in sys.modules:
        imp_shim = types.ModuleType("imp")
        # Add basic attributes used by many libraries
        imp_shim.find_module = lambda name, path=None: None
        imp_shim.load_module = lambda name, file, filename, details: None
        imp_shim.get_suffixes = lambda: []
        sys.modules["imp"] = imp_shim

# 2. Force HuggingFace and Transformers into OFFLINE mode
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
# ----------------------------

import logging
import tempfile
import hashlib
import uuid
import shutil
import numpy as np
import cv2
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List, Dict
from pydantic import BaseModel

import asyncio
import time
import threading

_ml_semaphore = threading.Semaphore(1)
_llm_semaphore = asyncio.Semaphore(1)

async def cleanup_static_files():
    """Background task to clean up old files in static/"""
    while True:
        try:
            static_dir = Path("static")
            if static_dir.exists():
                now = time.time()
                for p in static_dir.glob("*"):
                    if p.is_file() and now - p.stat().st_mtime > 3600:  # 1 hour
                        p.unlink(missing_ok=True)
        except Exception as e:
            logger.error("Cleanup task error: %s", e)
        await asyncio.sleep(600)  # Run every 10 minutes

# Limit threads to 1 to prevent power spikes on powerbanks
import torch
torch.set_num_threads(1)
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, StreamingResponse, PlainTextResponse

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
_root_logger = logging.getLogger()
_root_logger.setLevel(logging.INFO)
if not _root_logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] [req=%(request_id)s] %(message)s",
        defaults={"request_id": "-"},
    ))
    _root_logger.addHandler(_handler)
logger = logging.getLogger(__name__)

import contextvars
_request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class _RequestIDFilter(logging.Filter):
    def filter(self, record):
        record.request_id = _request_id_var.get("-")
        return True


for _h in logging.root.handlers:
    _h.addFilter(_RequestIDFilter())

# ---------------------------------------------------------------------------
# DICOM helpers
# ---------------------------------------------------------------------------

def _is_dicom(data: bytes) -> bool:
    """Detect DICOM by magic bytes at offset 128 (not filename)."""
    return len(data) >= 132 and data[128:132] == b"DICM"


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


# ---------------------------------------------------------------------------
# MIME sniffing from raw bytes
# ---------------------------------------------------------------------------
_MAGIC: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"II*\x00", "image/tiff"),
    (b"MM\x00*", "image/tiff"),
]

_ALLOWED_MIMES = {"image/jpeg", "image/png", "application/dicom", "image/tiff"}
_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


def _sniff_mime(header: bytes) -> Optional[str]:
    for magic, mime in _MAGIC:
        if header[: len(magic)] == magic:
            return mime
    if len(header) >= 132 and header[128:132] == b"DICM":
        return "application/dicom"
    return None


# ---------------------------------------------------------------------------
# Model registry (loaded at startup via lifespan)
# ---------------------------------------------------------------------------
_MODALITY_MODULES: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load all model modules once at startup and store on app.state."""
    logger.info("Initializing offline SQLite database...")
    try:
        from database import init_db
        init_db()
    except Exception as e:
        logger.error("Failed to initialize database: %s", e)

    logger.info("Loading model modules …")
    from models import chest_xray, bone_fracture, tb, malaria, wound_burn

    _MODALITY_MODULES.update(
        {
            "chest-xray": chest_xray,
            "bone-fracture": bone_fracture,
            "tb": tb,
            "malaria": malaria,
            "wound-burn": wound_burn,
        }
    )
    app.state.models = _MODALITY_MODULES
    app.state.model_loaded = {k: True for k in _MODALITY_MODULES}
    logger.info("All model modules loaded: %s", list(_MODALITY_MODULES.keys()))
    cleanup_task = asyncio.create_task(cleanup_static_files())
    yield
    cleanup_task.cancel()
    logger.info("Shutting down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="RadPi Medical AI Pipeline", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


# ---------------------------------------------------------------------------
# Request-ID middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def _request_id_middleware(request: Request, call_next):
    rid = str(uuid.uuid4())
    _request_id_var.set(rid)
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response


# ---------------------------------------------------------------------------
# Upload helper
# ---------------------------------------------------------------------------
def handle_upload(image: UploadFile) -> tuple[str, str]:
    """
    Validate, write to a secure temp file, convert DICOM if needed.
    Returns (temp_file_path, request_id).
    Raises HTTPException on validation failure.
    Raises – the caller must clean up in a try/finally.
    """
    request_id = str(uuid.uuid4())

    # Read first 16 bytes for sniffing, then read rest
    header = image.file.read(16)
    rest = image.file.read()
    raw = header + rest

    # Size check
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit.")

    # MIME check
    content_type = (image.content_type or "").split(";")[0].strip()
    if not content_type or content_type == "application/octet-stream":
        content_type = _sniff_mime(header) or ""
    if content_type not in _ALLOWED_MIMES:
        sniffed = _sniff_mime(header)
        if sniffed in _ALLOWED_MIMES:
            content_type = sniffed
        else:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported media type: {content_type or 'unknown'}. "
                       f"Accepted: {sorted(_ALLOWED_MIMES)}",
            )

    # Determine extension
    is_dicom = _is_dicom(raw[:132]) if len(raw) >= 132 else False
    if is_dicom:
        ext = ".dcm"
    else:
        ext = Path(image.filename or "upload").suffix or ".bin"

    # Write to secure temp file
    tmp_fd, temp_path = tempfile.mkstemp(dir=tempfile.gettempdir(), prefix="radpi_", suffix=ext)
    try:
        with os.fdopen(tmp_fd, "wb") as f:
            f.write(raw)
    except Exception:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        raise

    # DICOM → PNG conversion
    if is_dicom:
        try:
            png_path = _dicom_to_png(temp_path)
            os.unlink(temp_path)
            return png_path, request_id
        except Exception as e:
            os.unlink(temp_path)
            logger.error("DICOM conversion failed: %s", e)
            raise HTTPException(status_code=422, detail=f"DICOM conversion failed: {e}")

    return temp_path, request_id


# ---------------------------------------------------------------------------
# Health / readiness
# ---------------------------------------------------------------------------
@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/readyz")
def readyz():
    loaded = getattr(app.state, "model_loaded", {})
    return {"ready": bool(loaded), "models": loaded}


# ---------------------------------------------------------------------------
# Unified /analyze/{modality} endpoint
# ---------------------------------------------------------------------------
@app.post("/analyze/{modality}")
def analyze(modality: str, file: UploadFile = File(...), patient_id: Optional[str] = None):
    # Robustness: convert underscores to hyphens so both e.g. brain_mri and brain-mri are accepted
    modality_key = modality.replace("_", "-")
    modules = getattr(app.state, "models", _MODALITY_MODULES)
    if modality_key not in modules:
        raise HTTPException(status_code=404, detail=f"Unknown modality '{modality}'. "
                                                     f"Available: {sorted(modules.keys())}")

    temp_file, request_id = handle_upload(file)
    try:
        t0 = time.monotonic()
        with _ml_semaphore:
            result = modules[modality_key].predict(temp_file, file_id=request_id)
        inference_ms = int((time.monotonic() - t0) * 1000)
        result["request_id"] = request_id
        result["inference_ms"] = inference_ms

        # Auto-save to patient database if patient_id is provided. We capture
        # full traceability (model version, weights hash, latency) so every
        # row in `scans` is defensibly auditable.
        if patient_id:
            try:
                import database
                mask_url = ""
                classes = result.get("segmentation", {}).get("classes", [])
                if classes:
                    mask_url = classes[0].get("mask_url", "")
                heatmap_url = result.get("explanation", {}).get("heatmap_url", "")

                db_scan = database.add_scan(
                    patient_id=patient_id,
                    modality=modality_key,
                    prediction=result.get("top_label", "Unknown"),
                    confidence=float(result.get("top_probability", 0.0)),
                    mask_url=mask_url,
                    heatmap_url=heatmap_url,
                    llm_report="",
                    model_version=result.get("model_version"),
                    weights_sha=result.get("weights_sha"),
                    inference_ms=inference_ms,
                    actor="radpi-system",
                )
                result["saved_scan_id"] = db_scan["id"]
                result["db_save_status"] = "Success"
            except ValueError as ve:
                logger.warning("Could not auto-save scan: %s", ve)
                result["db_save_status"] = f"Failed: {ve}"
            except Exception as de:
                logger.error("Database save failed: %s", de)
                result["db_save_status"] = f"Error: {de}"

        return result
    finally:
        if os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
            except OSError as e:
                logger.warning("Could not delete temp file %s: %s", temp_file, e)


# ---------------------------------------------------------------------------
# Deprecated per-modality aliases → redirect to unified route
# ---------------------------------------------------------------------------
@app.post("/analyze/chest-xray-legacy", include_in_schema=False)
def _alias_chest_xray(file: UploadFile = File(...)):
    return RedirectResponse(url="/analyze/chest-xray", status_code=307)


# ---------------------------------------------------------------------------
# Patient Database Endpoints
# ---------------------------------------------------------------------------
class PatientCreate(BaseModel):
    patient_id: str
    name: str
    age: int
    sex: str
    notes: Optional[str] = ""
    phone: Optional[str] = None
    village: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    emergency_contact: Optional[str] = None


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    sex: Optional[str] = None
    notes: Optional[str] = None
    phone: Optional[str] = None
    village: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    emergency_contact: Optional[str] = None


class ExaminationCreate(BaseModel):
    chief_complaint: Optional[str] = None
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    heart_rate: Optional[int] = None
    spo2: Optional[int] = None
    temperature_c: Optional[float] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    triage_level: Optional[str] = "NORMAL"
    clinician_name: Optional[str] = None
    outcome: Optional[str] = "PENDING"
    outcome_notes: Optional[str] = None


class ExaminationUpdate(BaseModel):
    chief_complaint: Optional[str] = None
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    heart_rate: Optional[int] = None
    spo2: Optional[int] = None
    temperature_c: Optional[float] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    triage_level: Optional[str] = None
    clinician_name: Optional[str] = None
    outcome: Optional[str] = None
    outcome_notes: Optional[str] = None


class ScanCreate(BaseModel):
    modality: str
    prediction: str
    confidence: float
    mask_url: Optional[str] = ""
    heatmap_url: Optional[str] = ""
    llm_report: Optional[str] = ""
    examination_id: Optional[int] = None
    model_version: Optional[str] = None
    weights_sha: Optional[str] = None
    inference_ms: Optional[int] = None


class ScanReportUpdate(BaseModel):
    llm_report: str


class ScanReview(BaseModel):
    reviewer: str
    clinician_override: Optional[str] = None


# --- Patients ---------------------------------------------------------------
@app.post("/api/patients")
def api_create_patient(req: PatientCreate):
    import database
    try:
        return database.create_patient(**req.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to create patient: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.get("/api/patients")
def api_get_patients(
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    import database
    try:
        return database.get_patients(limit=limit, offset=offset)
    except Exception as e:
        logger.error("Failed to retrieve patients: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.get("/api/patients/search")
def api_search_patients(q: str = Query(..., min_length=1), limit: int = Query(50, ge=1, le=500)):
    """Free-text search over patient ID, name, village, phone."""
    import database
    try:
        return database.search_patients(q, limit=limit)
    except Exception as e:
        logger.error("Patient search failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.get("/api/patients/{patient_id}")
def api_get_patient(patient_id: str):
    import database
    try:
        patient = database.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail=f"Patient '{patient_id}' not found.")
        return patient
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to retrieve patient detail: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.patch("/api/patients/{patient_id}")
def api_update_patient(patient_id: str, req: PatientUpdate):
    import database
    try:
        payload = {k: v for k, v in req.model_dump().items() if v is not None}
        return database.update_patient(patient_id, **payload)
    except ValueError as e:
        msg = str(e)
        status = 404 if "not found" in msg.lower() else 400
        raise HTTPException(status_code=status, detail=msg)
    except Exception as e:
        logger.error("Failed to update patient: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.delete("/api/patients/{patient_id}")
def api_delete_patient(patient_id: str):
    import database
    try:
        ok = database.delete_patient(patient_id)
        if not ok:
            raise HTTPException(status_code=404, detail=f"Patient '{patient_id}' not found.")
        return {"status": "deleted", "patient_id": patient_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete patient: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


# --- Scans ------------------------------------------------------------------
@app.post("/api/patients/{patient_id}/scans")
def api_add_scan(patient_id: str, req: ScanCreate):
    import database
    try:
        return database.add_scan(
            patient_id=patient_id,
            modality=req.modality,
            prediction=req.prediction,
            confidence=req.confidence,
            mask_url=req.mask_url or "",
            heatmap_url=req.heatmap_url or "",
            llm_report=req.llm_report or "",
            examination_id=req.examination_id,
            model_version=req.model_version,
            weights_sha=req.weights_sha,
            inference_ms=req.inference_ms,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to add scan record: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.get("/api/scans")
def api_list_scans(
    patient_id: Optional[str] = None,
    modality: Optional[str] = None,
    since: Optional[str] = None,
    unreviewed: bool = False,
    limit: int = Query(200, ge=1, le=2000),
):
    import database
    try:
        return database.list_scans(
            patient_id=patient_id,
            modality=modality,
            since_iso=since,
            only_unreviewed=unreviewed,
            limit=limit,
        )
    except Exception as e:
        logger.error("Failed to list scans: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.put("/api/scans/{scan_id}/report")
def api_update_scan_report(scan_id: int, req: ScanReportUpdate):
    import database
    try:
        updated = database.update_scan_report(scan_id, req.llm_report)
        if not updated:
            raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found.")
        return {"status": "success", "message": f"Scan {scan_id} report updated."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update scan report: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.put("/api/scans/{scan_id}/review")
def api_review_scan(scan_id: int, req: ScanReview):
    """Clinician marks a scan as reviewed and optionally overrides the AI label."""
    import database
    try:
        return database.review_scan(scan_id, req.reviewer, req.clinician_override)
    except ValueError as e:
        msg = str(e)
        status = 404 if "not found" in msg.lower() else 400
        raise HTTPException(status_code=status, detail=msg)
    except Exception as e:
        logger.error("Failed to review scan: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


# --- Examinations -----------------------------------------------------------
@app.post("/api/patients/{patient_id}/examinations")
def api_create_examination(patient_id: str, req: ExaminationCreate):
    import database
    try:
        return database.create_examination(patient_id, **req.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to create examination: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.get("/api/examinations")
def api_list_examinations(
    patient_id: Optional[str] = None,
    triage_level: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
):
    import database
    try:
        return database.list_examinations(
            patient_id=patient_id,
            triage_level=triage_level,
            limit=limit,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to list examinations: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.get("/api/examinations/{exam_id}")
def api_get_examination(exam_id: int):
    import database
    exam = database.get_examination(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail=f"Examination {exam_id} not found.")
    return exam


@app.patch("/api/examinations/{exam_id}")
def api_update_examination(exam_id: int, req: ExaminationUpdate):
    import database
    try:
        payload = {k: v for k, v in req.model_dump().items() if v is not None}
        return database.update_examination(exam_id, **payload)
    except ValueError as e:
        msg = str(e)
        status = 404 if "not found" in msg.lower() else 400
        raise HTTPException(status_code=status, detail=msg)
    except Exception as e:
        logger.error("Failed to update examination: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


# --- Stats / audit / export -------------------------------------------------
@app.get("/api/stats")
def api_stats():
    """Aggregate dashboard counters: patients, scans, triage queue, latency."""
    import database
    try:
        return database.get_stats()
    except Exception as e:
        logger.error("Failed to compute stats: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.get("/api/audit")
def api_audit(
    limit: int = Query(100, ge=1, le=1000),
    entity_type: Optional[str] = None,
):
    import database
    try:
        return database.list_audit_log(limit=limit, entity_type=entity_type)
    except Exception as e:
        logger.error("Failed to read audit log: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.get("/api/export/patients.csv")
def api_export_patients_csv():
    import database
    try:
        csv_text = database.export_patients_csv()
    except Exception as e:
        logger.error("Patient CSV export failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="radpi_patients.csv"'},
    )


@app.get("/api/export/scans.csv")
def api_export_scans_csv(patient_id: Optional[str] = None):
    import database
    try:
        csv_text = database.export_scans_csv(patient_id=patient_id)
    except Exception as e:
        logger.error("Scan CSV export failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    filename = f"radpi_scans_{patient_id}.csv" if patient_id else "radpi_scans.csv"
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Offline LLM Report & Chat Endpoints
# ---------------------------------------------------------------------------
class ReportRequest(BaseModel):
    modality: str
    predicted_class: str
    confidence: float
    age: Optional[str] = "unknown"
    sex: Optional[str] = "unknown"
    complaint: Optional[str] = ""
    model_mode: str = "detailed"


@app.post("/api/llm/report")
async def generate_report(req: ReportRequest):
    system_prompt = (
        "You are an expert offline clinical assistant built into the RadPi medical system. "
        "Your task is to write a brief, highly structured clinical finding report "
        "based on the AI classification results and the patient's symptoms. "
        "Write in clear, formal medical English. Keep it concise. "
        "Include sections: 1. FINDINGS (discuss AI prediction), 2. CLINICAL CORRELATION (discuss complaint), "
        "3. URGENCY (Routine / Urgent / Emergency), and 4. RECOMMENDED NEXT STEPS. "
        "Do not add conversational intro/outro text. "
        "End with a standard clinical AI decision support disclaimer."
    )

    prompt = (
        f"Scan Modality: {req.modality}\n"
        f"AI Classification: {req.predicted_class} (Confidence: {req.confidence * 100:.1f}%)\n"
        f"Patient Age: {req.age}, Sex: {req.sex}\n"
        f"Patient Complaint: {req.complaint}\n"
    )

    async def event_generator():
        # Load model INSIDE the semaphore to prevent concurrent load races.
        # Use run_in_executor so the blocking llama-cpp load doesn't freeze the event loop.
        async with _llm_semaphore:
            loop = asyncio.get_event_loop()
            try:
                from llm import llm_manager
                await loop.run_in_executor(None, llm_manager.load_model, req.model_mode)
            except Exception as e:
                logger.error("Failed to load LLM for report: %s", e)
                yield f"[Error: Failed to load LLM engine: {e}]"
                return
            try:
                for chunk in llm_manager.generate(prompt, system_prompt):
                    yield chunk
            except Exception as e:
                logger.error("Error generating report: %s", e)
                yield f"\n[Generation Error: {e}]"
            finally:
                # Unload on the executor too so GC + RAM free doesn't block the loop
                await loop.run_in_executor(None, llm_manager.unload_model)

    return StreamingResponse(event_generator(), media_type="text/plain")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    history: List[ChatMessage]
    latest_message: str
    scan_modality: str
    scan_result: str
    model_mode: str = "detailed"


@app.post("/api/llm/chat")
async def chat_interaction(req: ChatRequest):
    system_prompt = (
        f"You are a highly capable, knowledgeable offline clinical and technical assistant built into the RadPi medical system.\n"
        f"You are assisting a clinician who just performed a {req.scan_modality} scan which predicted '{req.scan_result}'.\n"
        f"Your role is two-fold:\n"
        f"1. CASE ADVISOR: Answer medical, biological, or technical questions about this active scan, differential diagnoses, or clinical guidelines.\n"
        f"2. GENERAL COPILOT: Engage freely in broader discussions about clinical workflows, hospital roadmaps, medical history, future development plans, or general healthcare topics.\n"
        f"Write in clear, formal, and highly professional English. Keep responses structured and useful.\n"
        f"Disclaimer: Remember that you are an AI assistant and the final medical decision is always the clinician's."
    )

    # Format history into the prompt
    formatted_history = ""
    for msg in req.history[-6:]:
        formatted_history += f"{msg.role}: {msg.content}\n"
    formatted_history += f"user: {req.latest_message}\n"

    async def event_generator():
        # Load model INSIDE the semaphore to prevent concurrent load races.
        # Use run_in_executor so the blocking llama-cpp load doesn't freeze the event loop.
        async with _llm_semaphore:
            loop = asyncio.get_event_loop()
            try:
                from llm import llm_manager
                await loop.run_in_executor(None, llm_manager.load_model, req.model_mode)
            except Exception as e:
                logger.error("Failed to load LLM for chat: %s", e)
                yield f"[Error: Failed to load LLM engine: {e}]"
                return
            try:
                for chunk in llm_manager.generate(formatted_history, system_prompt):
                    yield chunk
            except Exception as e:
                logger.error("Error generating chat: %s", e)
                yield f"\n[Generation Error: {e}]"
            finally:
                await loop.run_in_executor(None, llm_manager.unload_model)

    return StreamingResponse(event_generator(), media_type="text/plain")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
