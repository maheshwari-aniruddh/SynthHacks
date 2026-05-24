# Radpi: Diagnostic Intelligence at the Point of Care

## Project Overview
Diagnostic intelligence system for Raspberry Pi 5. 8 imaging modalities (INT8-quantized), CPU-only offline inference, and on-device clinical report generation.

## Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Three.js (@react-three/fiber).
- **Backend**: Python 3.12, FastAPI, PyTorch 2.5, TensorFlow 2.18, llama-cpp-python.
- **Models**: YOLOv8 (Detection), ViT/DenseNet (Classification), U-Net (Segmentation), Qwen 2.5 (LLM).

## Core Commands
### Frontend (Root)
- `npm run dev`: Start dev server (Port 3000)
- `npm run build`: Build for production
- `npm run lint`: Run ESLint

### Backend (`/backend`)
- `python main.py`: Start FastAPI (Port 8000)
- `pip install -r requirements.txt`: Install dependencies
- `python test_models.py`: Verify model loading and inference

## Architecture & Conventions
- **Structure**:
  - `src/app`: Page components and routing.
  - `src/components`: UI components (GlassCard, SpotlightCard, etc).
  - `backend/main.py`: API gateway and unified `/analyze/{modality}` route.
  - `backend/models`: Domain-specific vision logic.
  - `backend/weights`: GGUF/LLM weights.
  - `Models/`: Standard model checkpoints (.pt, .h5, .pth).
- **Inference**:
  - INT8 quantization is mandatory for Pi 5 performance.
  - `torch.set_num_threads(2)` is used for CPU optimization.
  - Images are converted to PNG via DICOM helpers if uploaded in `.dcm`.
- **Code Style**:
  - **Python**: PEP 8 (snake_case), Pydantic schemas, explicit logging with `request_id`.
  - **TypeScript**: camelCase, functional components, strong typing.
- **Database**: Local SQLite via `backend/patients.db` (Schema in `database.py`).
