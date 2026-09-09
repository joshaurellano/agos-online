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

# ---------------------------------------------------------------------------
# LOCAL-DEV OVERRIDE
# ---------------------------------------------------------------------------
#
# The Upstash disk-cache above exists to solve ONE specific problem: Render
# free-tier spin-downs wipe local disk, so without it a restart would have
# zero fallback data until the next successful Open-Meteo call. That
# problem doesn't exist on a local machine -- there's no spin-down, and if
# you can reach Open-Meteo directly there's no reason to ever prefer a
# snapshot that (right after a code change to the request URL, e.g. adding
# a new field) may be structurally out of date, not just old.
#
# If your local .env happens to point at the same Upstash instance as
# production (e.g. copied wholesale), set WEATHER_DISABLE_DISK_CACHE=true
# there to skip loading/writing it entirely and always start from a live
# Open-Meteo fetch. Leave it unset (default: false) everywhere this
# restart-survival behavior is actually wanted, i.e. Render.
DISABLE_DISK_CACHE = os.environ.get(
    "WEATHER_DISABLE_DISK_CACHE", "false"
).strip().lower() in ("1", "true", "yes")


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

# ===========================================================================
# PAGASA CALIBRATION
# ===========================================================================
#
# Open-Meteo is a numerical-weather-model estimate for our coordinates --
# not an actual instrument reading. PAGASA operates a real Automated
# Weather Station (AWS) network, and the closest one to the Naga City
# forecast point (LAT/LON above) is "Pili Camarines Sur AWS" (~15 km away,
# also the site of Naga Airport). That station is treated as ground truth:
# Open-Meteo's live/forecast values are bias-corrected against it before
# they reach feature engineering and the flood model.
#
# PAGASA does not publish a documented public API for AWS observations.
# The only available source is the live HTML table at PAGASA_AWS_URL,
# which lists every AWS station nationwide and is refreshed periodically.
# app.weather.pagasa_client scrapes that table for our one station.
#
# IMPORTANT: this is a bias-correction layer, not a replacement data
# source. It nudges Open-Meteo's numbers toward what the real station
# has been reading on average -- it does NOT swap in PAGASA's raw feed as
# the model's input (PAGASA doesn't publish forecasts, soil moisture, or
# wind gusts, all of which the model needs). Precipitation correction is
# OFF by default (see PAGASA_CALIBRATE_PRECIPITATION below) since PAGASA's
# AWS reports an instantaneous mm/hr rate while Open-Meteo's precipitation
# is an hourly accumulated total -- they're not quite the same quantity,
# and rainfall is the single most safety-critical input to a flood model.
PAGASA_STATION_ID = "5037"
PAGASA_STATION_NAME = "Pili, Camarines Sur AWS"
PAGASA_AWS_URL = "https://bagong.pagasa.dost.gov.ph/automated-weather-station"

PAGASA_CALIBRATION_ENABLED = os.environ.get(
    "PAGASA_CALIBRATION_ENABLED", "true"
).strip().lower() in ("1", "true", "yes")

# A fresh PAGASA sample is recorded each time fetch_weather() performs an
# actual live Open-Meteo call (i.e. once per CACHE_TTL_SECONDS window, not
# once per incoming request) -- see app.weather.client. This keeps PAGASA
# polling frequency tied to the existing cache cadence instead of adding a
# separate scheduler.
#
# How many of those paired (Open-Meteo, PAGASA) samples to keep for
# computing the rolling bias correction. More samples = a more stable
# estimate; fewer = faster to react to genuine station drift/recalibration.
CALIBRATION_MAX_SAMPLES = int(
    os.environ.get("PAGASA_CALIBRATION_MAX_SAMPLES", "500")
)

# Minimum number of samples required before any correction is applied.
# Below this, there isn't enough data to trust a bias estimate yet, so
# raw Open-Meteo values are used unmodified (see get_calibration_status()
# for a way to check readiness/progress).
CALIBRATION_MIN_SAMPLES = int(
    os.environ.get("PAGASA_CALIBRATION_MIN_SAMPLES", "20")
)

# Reject a PAGASA reading if its "Last Updated" timestamp is older than
# this many minutes. The live AWS table is known to contain stations with
# stuck/broken sensors reporting stale or nonsensical (e.g. far-future)
# timestamps -- this filters those out before they can pollute the
# calibration sample set.
PAGASA_MAX_READING_AGE_MINUTES = int(
    os.environ.get("PAGASA_MAX_READING_AGE_MINUTES", "180")
)

# ---------------------------------------------------------------------------
# OPT-IN: PRECIPITATION CALIBRATION AGAINST THE PILI AWS STATION
# ---------------------------------------------------------------------------
#
# Off by default. See the module comment above for why -- PAGASA's AWS
# precipitation reading is an instantaneous mm/hr rate, not an hourly
# accumulated total like Open-Meteo's, so a naive bias estimate here is
# noisier than for temperature/humidity/wind/pressure. Turn this on only
# once you're comfortable with that trade-off (e.g. after watching
# /api/calibration's precipitation bias/sample numbers for a while with
# this still off, to see how noisy it actually looks for your station).
#
# When enabled:
#   - Precipitation gets its own (higher, independently configurable)
#     minimum-sample threshold before any correction is applied --
#     PAGASA_CALIBRATION_MIN_SAMPLES_PRECIPITATION -- separate from the
#     general CALIBRATION_MIN_SAMPLES used for the other fields.
#   - The applied correction is capped in magnitude
#     (PAGASA_PRECIPITATION_BIAS_CAP_MM) so one bad/stale AWS reading
#     can't swing the model's rainfall input by an unbounded amount.
#   - The corrected value is always floored at 0 (rainfall can't go
#     negative).
#   - Only "current" and "hourly" precipitation are corrected. Daily
#     precipitation_sum is deliberately left alone: it's a SUM over 24
#     hours, and additively applying a single hourly-rate-scale bias to
#     a daily total would misapply the unit rather than correct it.
PAGASA_CALIBRATE_PRECIPITATION = os.environ.get(
    "PAGASA_CALIBRATE_PRECIPITATION", "false"
).strip().lower() in ("1", "true", "yes")

CALIBRATION_MIN_SAMPLES_PRECIPITATION = int(
    os.environ.get("PAGASA_CALIBRATION_MIN_SAMPLES_PRECIPITATION", "50")
)

# Maximum absolute correction (mm) that can ever be added to/subtracted
# from a precipitation value, regardless of what the computed median bias
# is. This is a safety clamp on the CORRECTION itself (not just the
# resulting value) -- it exists so a handful of noisy/mistimed
# rate-vs-accumulation sample pairs can't produce a runaway bias that
# meaningfully distorts the flood model's rainfall input.
PRECIPITATION_BIAS_CAP_MM = float(
    os.environ.get("PAGASA_PRECIPITATION_BIAS_CAP_MM", "5.0")
)
