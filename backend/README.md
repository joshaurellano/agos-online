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
    │   ├── client.py           # Open-Meteo fetch, retries, circuit breaker
    │   ├── pagasa_client.py    # scrapes PAGASA's Pili AWS station (ground truth)
    │   └── calibration.py      # bias-corrects Open-Meteo against PAGASA
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
GET /api/test-pagasa       # raw PAGASA AWS connectivity/parse check
GET /api/calibration       # PAGASA bias-correction status (samples, per-field bias)
GET /                      # health check
```

## PAGASA ground-truth calibration

Open-Meteo is a numerical-weather-model estimate, not an instrument
reading. PAGASA operates a real Automated Weather Station (AWS) network,
and **"Pili, Camarines Sur AWS" (site 5037)** — ~15 km from the Naga City
forecast point, also the site of Naga Airport — is the closest official
station. It's treated as ground truth: every fresh Open-Meteo fetch is
bias-corrected against it before being cached and fed into the model.

How it works:

- PAGASA doesn't publish a documented API, only a live HTML table at
  `bagong.pagasa.dost.gov.ph/automated-weather-station`. `pagasa_client.py`
  scrapes that page for station 5037's row, discarding readings that are
  stale or unparseable (a few stations on that page are known to report
  stuck/broken timestamps).
- Each time `fetch_weather()` performs a genuine live Open-Meteo call
  (i.e. once per `WEATHER_CACHE_TTL_MINUTES` window, not once per
  request), `calibration.py` pairs that response with a fresh PAGASA
  reading and stores the sample (persisted via Upstash so it survives a
  restart, bounded to `PAGASA_CALIBRATION_MAX_SAMPLES`).
- Once a field has at least `PAGASA_CALIBRATION_MIN_SAMPLES` paired
  samples, its bias (median PAGASA − Open-Meteo difference) is applied
  as a correction to every Open-Meteo value of that field — current,
  hourly, and daily alike. Below that threshold, raw Open-Meteo values
  pass through unmodified.
- **Corrected fields:** humidity, wind speed, pressure (surface + MSL),
  temperature.
- **Not corrected:** precipitation (Open-Meteo's is an hourly
  accumulation, PAGASA's is an instantaneous mm/hr rate — not directly
  comparable, and it's the single most safety-critical model input, so
  an ill-founded correction here is a worse failure mode than leaving it
  untouched). Soil moisture and wind gusts also aren't corrected, since
  PAGASA's public AWS table doesn't report either. Rainfall bias is
  still tracked and visible via `/api/calibration` for transparency.

Env vars: `PAGASA_CALIBRATION_ENABLED` (default `true`),
`PAGASA_CALIBRATION_MIN_SAMPLES` (default `20`),
`PAGASA_CALIBRATION_MAX_SAMPLES` (default `500`),
`PAGASA_MAX_READING_AGE_MINUTES` (default `180`).

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
