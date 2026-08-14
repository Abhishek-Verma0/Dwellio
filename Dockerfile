# One container, both processes. Node is the base because the Next build is the
# fussier of the two; Python comes from apt.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Deps first, source after — Docker then reuses these layers when only code changes.
COPY backend/requirements.txt backend/
RUN python3 -m venv /venv && /venv/bin/pip install --no-cache-dir -r backend/requirements.txt

COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci

COPY frontend/ frontend/
RUN cd frontend && npm run build

COPY backend/ backend/

# Next binds $PORT and is the only thing Render's proxy sees. uvicorn stays on
# loopback — nothing outside the container can reach it directly.
#
# ponytail: `wait -n` instead of supervisord. It returns the moment EITHER child
# exits, so the container dies and Render restarts it whole. Add a real
# supervisor the day restarting just the dead process is worth the dependency.
CMD ["bash", "-c", "(cd backend && /venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000) & (cd frontend && npm start) & wait -n; exit 1"]
