# Naga City Brgy. Triangulo — 14-Day Flood Forecast API

FastAPI backend serving a 14-day encoder-decoder flood forecast, using
Open-Meteo forecast data as known future ("decoder") input. Three
algorithms are trained on the same data/features/horizon —
**GRU, LSTM, and CNN** — and can be queried individually or compared
side by side.

## Project layout

```
.
├── main.py                     # entrypoint: `python main.py` / `uvicorn main:app`
├── requirements.txt
├── .env.example
├── flood_ml_dataset_clean.csv
├── flood_ml_dataset_backfilled.csv
│
├── training/
│   └── train_models.py         # trains LSTM + GRU + CNN, saves .h5/.pkl/.json (run from project root)
│
└── app/                        # the serving application
    ├── main.py                 # FastAPI app assembly (CORS, routers, startup)
    │
    ├── config/
    │   └── settings.py         # constants, cache TTLs, MODEL_REGISTRY
    │
    ├── utils/
    │   └── alerts.py           # WMO labels, wind→signal, probability→alert-level
    │
    ├── weather/
    │   ├── cache.py            # in-process TTL cache + status
    │   ├── persistence.py      # Upstash Redis restart-proof fallback
    │   └── client.py           # Open-Meteo fetch, retries, circuit breaker
    │
    ├── features/
    │   ├── aggregation.py      # hourly→daily aggregation, live_metrics
    │   ├── engineering.py      # engineer_daily_features (mirrors training preprocessing)
    │   └── windows.py          # builds the encoder/decoder model input tensors
    │
    ├── models/
    │   ├── registry.py         # loads scaler + feature_metadata.json + every .h5 model
    │   └── inference.py        # runs one/all models, formats forecast responses
    │
    └── api/
        ├── routes_diagnostics.py  # /, /api/test-openmeteo, /api/models
        ├── routes_weather.py      # /api/forecast
        └── routes_flood.py        # /api/forecast-flood/*, /api/predict-flood/*
```

Each layer only depends on the ones above it in this list (config →
utils → weather → features → models → api), so nothing is circular and
each piece can be tested or swapped independently — e.g. adding a 4th
algorithm is just one entry in `MODEL_REGISTRY` plus a `.h5` file.

## Running it

```bash
pip install -r requirements.txt
python main.py            # http://127.0.0.1:8000
```

or in production:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

`training/train_models.py` must be run from the project root so the
`.h5` / `.pkl` / `.json` files it writes land next to `main.py`:

```bash
python training/train_models.py
```

## API

### Per-algorithm flood forecast (14 days)

```
GET /api/forecast-flood/gru
GET /api/forecast-flood/lstm
GET /api/forecast-flood/cnn
```

Each returns the same shape: `forecast` (a list of 14 daily entries
with `flood_probability`, `alert_level`, `confidence_band`, and the
enriched weather fields for that day), plus `meta.model_reliability`
for that specific algorithm.

### Compare all algorithms

```
GET /api/forecast-flood/compare
```

Runs GRU/LSTM/CNN against the *same* input window (one Open-Meteo
fetch, shared feature engineering) and returns:
- `per_model`: each algorithm's full forecast + reliability, keyed by `gru`/`lstm`/`cnn`
- `comparison`: a day-by-day table with each model's probability/alert
  level, an `ensemble_mean_probability`, `spread` (max − min
  probability across models), and a `models_agree` flag

### Day-1-only convenience endpoints

```
GET /api/predict-flood            # default model (FLOOD_DEFAULT_MODEL, "gru" unless overridden)
GET /api/predict-flood/{model}    # model = gru | lstm | cnn
```

### Backward-compatible default

```
GET /api/forecast-flood           # same shape as the original single-model API, backed by FLOOD_DEFAULT_MODEL
```

### Weather / diagnostics

```
GET /api/forecast          # 48h hourly + 14-day daily weather (no flood model involved)
GET /api/models            # which algorithms are actually loaded and ready
GET /api/test-openmeteo    # raw Open-Meteo connectivity check
GET /                      # health check
```

## Notes

- All flood-forecast endpoints share **one** cached Open-Meteo response
  per cache window (`WEATHER_CACHE_TTL_MINUTES`, default 3h) — calling
  `/compare` doesn't cost 3x the upstream requests.
- If a given algorithm's `.h5` file is missing, the other algorithms
  still load and serve fine; only that one endpoint reports an error
  (check `/api/models` to see what's actually loaded).
- `FLOOD_DEFAULT_MODEL` (env var, default `gru`) controls which
  algorithm backs the legacy `/api/forecast-flood` and
  `/api/predict-flood` paths.
