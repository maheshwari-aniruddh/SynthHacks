FROM python:3.12-slim-bookworm

WORKDIR /app

# Install system dependencies required for OpenCV and other ML libraries
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY backend/requirements.txt .

# Install dependencies (using the custom index for Pi 5 / ARM64 optimized torch)
RUN pip install --no-cache-dir -r requirements.txt --extra-index-url https://torch.kmtea.eu/whl/stable

# Copy backend and models
COPY backend/ /app/backend/
COPY Models/ /app/Models/

# Setup necessary directories for weights, static files, and database
RUN mkdir -p /app/backend/static /app/backend/weights/llm /app/backend/data

# Set working directory to backend
WORKDIR /app/backend

# Expose the FastAPI port
EXPOSE 8000

# Start the application
CMD ["python", "main.py"]
