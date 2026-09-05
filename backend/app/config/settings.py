"""
Central configuration for the flood-forecast API.

Everything here is either a fixed model/location constant, or a value
read from an environment variable with a sane default -- nothing in
this module performs I/O.
"""

import os

LAT, LON = 13.6192, 123.1814

# IMPORTANT:
# These are intentionally NOT reduced.
#
# The trained model expects a 14-day future decoder input.
# We request 16 forecast days so there is enough future data available
# around the current date while preserving the existing pipeline.
FORECAST_DAYS = 16
PAST_DAYS_FOR_WINDOW = 16

# ---------------------------------------------------------------------------
# CACHE SETTINGS
# ---------------------------------------------------------------------------
#
# The model/input data is NOT changed by caching.
#
# The same Open-Meteo response is reused for this period instead of sending
# another API request every time a frontend endpoint is called.
#
# The model and both endpoints only ever consume DAILY aggregates (and an
# hourly breakdown used for daily means) -- there is no benefit to
# refreshing more often than every few hours, since a forecast that is a
# few hours old makes no meaningful difference to a 14-day-ahead flood
# outlook. A longer TTL means far fewer Open-Meteo requests with no loss
# of model accuracy.
#
# Configurable via WEATHER_CACHE_TTL_MINUTES (Render env var) so this can
# be tuned without a redeploy. Defaults to 180 minutes (3 hours).
#
CACHE_TTL_SECONDS = int(
    os.environ.get("WEATHER_CACHE_TTL_MINUTES", "180")
) * 60

# Maximum number of Open-Meteo attempts when the server is rate-limited
# or temporarily unavailable.
MAX_WEATHER_ATTEMPTS = 4

# Connection/read timeout.
WEATHER_REQUEST_TIMEOUT = 30

# ---------------------------------------------------------------------------
# FAILURE COOLDOWN (CIRCUIT BREAKER)
# ---------------------------------------------------------------------------
#
# Without this, every single incoming request that arrives while the cache
# is stale re-runs the FULL 4-attempt/~7.5-minute backoff loop against
# Open-Meteo -- even if Open-Meteo failed one second ago. Under real
# traffic (or a keep-alive cron hitting a weather-backed endpoint) this
# turns one outage into a continuous retry storm that can itself be the
# reason the free-tier rate limit never clears.
#
# Once a fetch exhausts all retries, we remember that failure and skip
# contacting Open-Meteo entirely for this cooldown window -- stale/fallback
# data is served immediately instead. This caps Open-Meteo request volume
# during an outage to roughly once per cooldown window, no matter how much
# traffic hits the API.
#
# Configurable via WEATHER_FAILURE_COOLDOWN_MINUTES. Defaults to 5 minutes.
#
FAILURE_COOLDOWN_SECONDS = int(
    os.environ.get("WEATHER_FAILURE_COOLDOWN_MINUTES", "5")
) * 60

# ---------------------------------------------------------------------------
# RESTART-PROOF FALLBACK CACHE (Upstash)
# ---------------------------------------------------------------------------
#
# The in-memory cache above disappears on every restart (crash, deploy,
# spin-down, etc). On Render, that includes ordinary spin-downs on the Free
# tier, not just full redeploys -- local disk gets wiped every time too, so
# it can't help here. Instead, the last successful Open-Meteo response is
# written to Upstash Redis (see below) and reloaded at startup, so the
# flood forecast keeps working off the last-known-good weather data as long
# as the server has EVER fetched successfully at least once before.
#
# This does NOT change what data feeds the model. It's still the exact
# same Open-Meteo response, just given a longer, restart-proof lifetime
# as a fallback.
#
# If the fallback data being used is older than this, the flood forecast
# will still be served, but flagged as significantly stale so the
# frontend can show a "may be outdated" warning.
SIGNIFICANT_STALENESS_MINUTES = 180  # 3 hours


# ===========================================================================
# MODEL REGISTRY (multi-algorithm forecasting)
# ===========================================================================
#
# model.py (the training script) trains THREE encoder-decoder architectures
# on the exact same data/features/horizon: LSTM, GRU, and CNN. All three are
# saved to disk. Previously, main.py only ever loaded and served the GRU
# model. This registry is what lets the API load all three and return their
# outputs side by side, instead of picking just one.
#
# "key" is the short id used in API responses / query params (?model=gru).
# "label" is a human-readable name for display.
# "file" is the .h5 filename produced by model.py.
#
# Every model in this registry is trained against the SAME
# flood_scaler.pkl / feature_metadata.json -- they only differ in the
# encoder architecture, so their outputs are directly comparable.
# ===========================================================================

MODEL_REGISTRY = {
    "gru": {
        "label": "GRU Encoder-Decoder",
        "file": "flood_gru_14day_encdec_model.h5",
    },
    "lstm": {
        "label": "LSTM Encoder-Decoder",
        "file": "flood_lstm_14day_encdec_model.h5",
    },
    "cnn": {
        "label": "CNN Encoder-Decoder",
        "file": "flood_cnn_14day_encdec_model.h5",
    },
}

# Model used for single-model endpoints (e.g. /api/predict-flood) and as
# the "primary" entry when a caller doesn't ask for a specific algorithm.
# Configurable via env var so the primary model can be swapped without a
# code change.
DEFAULT_MODEL_KEY = os.environ.get("FLOOD_DEFAULT_MODEL", "gru")

SCALER_FILE = "flood_scaler.pkl"
FEATURE_METADATA_FILE = "feature_metadata.json"
