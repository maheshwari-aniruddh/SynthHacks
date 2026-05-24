# Radpi Onboarding Guide

Welcome to **Radpi**, a diagnostic intelligence system designed for the Raspberry Pi 5.

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20 or later.
- **Python**: v3.12 or later.
- **Hardware**: Optimized for Raspberry Pi 5 (8GB), but runs on macOS/Linux/WSL2.

### 2. Environment Setup
Clone the repository and install dependencies:

#### Frontend (Next.js)
```bash
cd Documents/PycharmProjects/Radpi
npm install
```

#### Backend (FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Model Weights
The system expects weights in `backend/weights/` and `Models/`.
- Download Qwen 2.5 GGUF models into `backend/weights/llm/`.
- Ensure `.pt` and `.h5` files are present in `Models/`.

### 4. Running the Project
Open two terminals:

**Terminal 1: Backend**
```bash
cd backend
source venv/bin/activate
python main.py
```

**Terminal 2: Frontend**
```bash
npm run dev
```

---

## 🏗️ Architecture

Radpi uses a **Hybrid Edge Architecture**:
- **Frontend**: Next.js 16 (App Router) + Three.js for 3D visualizations.
- **Backend**: FastAPI (Python) for heavy-lifting inference.
- **Intelligence**:
  - **Vision**: PyTorch/TensorFlow (INT8 Quantized) for X-ray/MRI/Skin/Dental analysis.
  - **Text**: On-device LLMs (Qwen 2.5) for clinical report generation via llama-cpp-python.

---

## 📂 Project Structure

- `src/app/`: Next.js pages and routes.
- `src/components/`: Reusable React components (UI/3D).
- `backend/main.py`: Main API entry point.
- `backend/models/`: Modular prediction logic per modality.
- `backend/weights/`: Local LLM and vision model weights.
- `Models/`: Standalone model files.
- `static/`: Temporary storage for generated masks and heatmaps.

---

## 🛠️ Development Workflow

- **Adding a Modality**:
  1. Add model logic in `backend/models/{name}.py`.
  2. Register in `backend/main.py`'s `lifespan` and `analyze` endpoint.
  3. Update `src/lib/modules.ts` (if exists) and `src/app/page.tsx`.
- **UI Changes**: Follow the `shadcn/ui` pattern using Tailwind and Radix primitives.

---

## 📚 Key Concepts

- **Point of Care**: All inference is local. No data leaves the device.
- **INT8 Quantization**: Crucial for running 10+ models on a 2.4GHz CPU.
- **DICOM Support**: Native handling of medical imaging standards via `pydicom`.
