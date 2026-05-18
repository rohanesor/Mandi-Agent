# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the Expo web app
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS web-builder

ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
ARG EXPO_PUBLIC_API_URL

WORKDIR /app/mobile
COPY mobile/ .

RUN npm ci && \
    EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL \
    EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY \
    EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL \
    npx expo export --platform web

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: Python backend runtime
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace/mandi_agent

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencies layer (cached unless requirements.txt changes)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/

# Copy web build from stage 1
COPY --from=web-builder /app/mobile/dist /workspace/mandi_agent/web

ENV PYTHONPATH=/workspace

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "mandi_agent.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
