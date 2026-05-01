# =============================================================================
# Mandi-Agent Backend — Production Dockerfile
# =============================================================================
FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# The project imports as `from mandi_agent.backend...` so we install
# under /workspace/mandi_agent and set PYTHONPATH to /workspace
WORKDIR /workspace/mandi_agent

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Dependencies layer (cached unless requirements.txt changes)
# ---------------------------------------------------------------------------
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Application code
# ---------------------------------------------------------------------------
COPY . .

# The package root must be visible as `mandi_agent` on sys.path
ENV PYTHONPATH=/workspace

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "mandi_agent.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
