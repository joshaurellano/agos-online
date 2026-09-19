FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MPLBACKEND=Agg \
    TF_CPP_MIN_LOG_LEVEL=2

WORKDIR /app

# System deps needed by tensorflow at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Application
COPY main.py .
COPY app ./app

# Pre-trained models and metadata
COPY flood_gru_14day_encdec_model.h5 .
COPY flood_lstm_14day_encdec_model.h5 .
COPY flood_cnn_14day_encdec_model.h5 .
COPY flood_scaler.pkl .
COPY feature_metadata.json .

# Per-model held-out test metrics (registry.py's _load_per_model_reliability
# reads this at startup for LSTM/CNN's real precision/recall/f1/false-alarm
# numbers). Without it, those two models silently fall back to a shared
# placeholder reliability block instead of their own measured performance.
COPY all_models_per_horizon_metrics.csv .

EXPOSE 8080

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]