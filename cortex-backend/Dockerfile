# ── Cortex Backend — Dockerfile ───────────────────────────────────────────────
#
# Works on:
#   - Docker Compose (local)
#   - Render (Web Service → Docker)
#   - Any VPS / cloud VM
#
# Playwright Chromium is installed for full scraping capability.
# On Render free tier, set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 to skip it
# and the backend falls back to httpx for scraping (most tasks still work).
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

# System dependencies
# ffmpeg      — audio processing (Whisper)
# curl        — health check probe + downloads
# ca-certs    — HTTPS requests
# chromium deps installed by playwright install --with-deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer-cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers unless explicitly skipped.
# Set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 in Render env vars if you want
# a lighter image without headless Chrome (saves ~400 MB).
ARG PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
RUN if [ "$PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD" = "0" ]; then \
      playwright install chromium --with-deps; \
    else \
      echo "Skipping Playwright browser download"; \
    fi

# Copy application source
COPY . .

# Render injects $PORT; default 8000 for Docker Compose
ENV PORT=8000
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Use shell form so $PORT is expanded at runtime
CMD ["sh", "-c", "python main.py --host 0.0.0.0 --port ${PORT}"]
