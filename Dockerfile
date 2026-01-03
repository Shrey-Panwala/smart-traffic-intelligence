# syntax = docker/dockerfile:1.2
FROM python:3.11-slim

# Avoid interactive prompts and ensure logs flush immediately
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=10000

# System deps for OpenCV, ffmpeg, and general build tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg \
      libglib2.0-0 \
      libsm6 \
      libxrender1 \
      libxext6 \
      libgl1 \
      ca-certificates \
      curl \
      build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only requirement files first to leverage build cache
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# Copy backend source
COPY backend /app/backend

# Create runtime directories used by the app
RUN mkdir -p /app/backend/uploads /app/backend/outputs /app/backend/models

# Expose the port expected by Render unless overridden
EXPOSE 10000

# Use $PORT if provided (Render sets it); default to 10000
CMD ["sh", "-c", "python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
