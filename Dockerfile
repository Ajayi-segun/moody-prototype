FROM node:22-alpine AS frontend
WORKDIR /build
COPY my-react/package.json my-react/package-lock.json ./
RUN npm ci
COPY my-react/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
COPY my-react/backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY my-react/backend/ ./backend/
COPY --from=frontend /build/dist ./dist
ENV TOKA_SERVE_FRONTEND=true
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
