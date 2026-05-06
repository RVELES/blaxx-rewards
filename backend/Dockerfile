# Container do backend Blaxx para Fly.io
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencias primeiro (cache melhor)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Codigo
COPY . .

# Volume montado pelo Fly em /data - banco SQLite vai pra la
RUN mkdir -p /data
ENV DATABASE_URL=sqlite:////data/blaxx.db

# Fly.io define $PORT (geralmente 8080)
ENV PORT=8080
EXPOSE 8080

# Entry: cria tabelas + roda seed (idempotente) e sobe o gunicorn
CMD sh -c "python -c 'from app import create_app; create_app()' && \
           python seed.py && \
           gunicorn --bind 0.0.0.0:${PORT} --workers 2 --timeout 60 run:app"
