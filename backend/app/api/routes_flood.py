"""
Flood-forecast endpoints.

Each algorithm gets its own endpoint so a caller (or frontend tab) can
ask for exactly one model's 14-day forecast:

    GET /api/forecast-flood/gru
    GET /api/forecast-flood/lstm
    GET /api/forecast-flood/cnn

...and one endpoint returns all available algorithms side by side,
including a simple ensemble mean and a day-by-day agreement flag:

    GET /api/forecast-flood/compare

For backward compatibility with any existing frontend built against the
original single-model API, the old paths still work and are routed to
the configured DEFAULT_MODEL_KEY (GRU by default):

    GET /api/forecast-flood        -> same as /api/forecast-flood/{default}
    GET /api/predict-flood         -> day-1-only summary, default model
"""

from fastapi import APIRouter, HTTPException

from app.config.settings import MODEL_REGISTRY, DEFAULT_MODEL_KEY
from app.models.registry import registry
from app.models.inference import (
    forecast_with_model,
    compare_models,
    ModelUnavailableError,
)
from app.weather.client import WeatherUnavailableError
from app.weather.cache import get_cache_status

router = APIRouter()


def _not_ready_response(message):
    return {
        "status": "error",
        "message": message,
        "forecast": [],
    }


def _run_forecast(model_key):
    if not registry.ready:
        return _not_ready_response(
            "Model registry is not available. Siguraduhing nasa parehong "
            f"folder ang flood_scaler.pkl at feature_metadata.json, "
            "pati na ang bawat .h5 model file."
        )

    try:
        return forecast_with_model(model_key)

    except ModelUnavailableError as err:
        return _not_ready_response(str(err))

    except WeatherUnavailableError as err:
        return {
            "status": "error",
            "error_type": "weather_unavailable",
            "message": f"Hindi ma-access ang weather forecast: {err}",
            "weather_cache": get_cache_status(),
            "forecast": [],
        }

    except Exception as err:
        return {
            "status": "error",
            "message": f"Hindi na-compute ang forecast: {err}",
            "weather_cache": get_cache_status(),
            "forecast": [],
        }


# ===========================================================================
# PER-ALGORITHM ENDPOINTS
# ===========================================================================

@router.get("/api/forecast-flood/gru")
def forecast_flood_gru():
    return _run_forecast("gru")


@router.get("/api/forecast-flood/lstm")
def forecast_flood_lstm():
    return _run_forecast("lstm")


@router.get("/api/forecast-flood/cnn")
def forecast_flood_cnn():
    return _run_forecast("cnn")


# ===========================================================================
# COMPARISON ENDPOINT (all algorithms, side by side)
# ===========================================================================

@router.get("/api/forecast-flood/compare")
def forecast_flood_compare():
    if not registry.ready:
        return _not_ready_response(
            "Model registry is not available. Siguraduhing nasa parehong "
            f"folder ang flood_scaler.pkl at feature_metadata.json, "
            "pati na ang bawat .h5 model file."
        )

    try:
        return compare_models()

    except ModelUnavailableError as err:
        return _not_ready_response(str(err))

    except WeatherUnavailableError as err:
        return {
            "status": "error",
            "error_type": "weather_unavailable",
            "message": f"Hindi ma-access ang weather forecast: {err}",
            "weather_cache": get_cache_status(),
            "per_model": {},
            "comparison": [],
        }

    except Exception as err:
        return {
            "status": "error",
            "message": f"Hindi na-compute ang comparison: {err}",
            "weather_cache": get_cache_status(),
            "per_model": {},
            "comparison": [],
        }


# ===========================================================================
# BACKWARD-COMPATIBLE / DEFAULT-MODEL ENDPOINTS
# ===========================================================================

@router.get("/api/forecast-flood")
def forecast_flood_default():
    """Same response shape as before this refactor -- now backed by
    whichever model DEFAULT_MODEL_KEY points at (GRU unless overridden
    via the FLOOD_DEFAULT_MODEL env var)."""
    return _run_forecast(DEFAULT_MODEL_KEY)


@router.get("/api/predict-flood")
def predict_flood():
    """
    Convenience endpoint: returns only TODAY's flood prediction (day_ahead=0)
    for the default model. Reuses forecast_with_model(), which in turn uses
    the same weather cache.
    """
    full = _run_forecast(DEFAULT_MODEL_KEY)

    if full["status"] != "success" or not full["forecast"]:
        return full

    today_entry = full["forecast"][0]

    return {
        "status": "success",
        "model_key": DEFAULT_MODEL_KEY,
        "alert_level": today_entry["alert_level"],
        "probability": today_entry["flood_probability"],
        "live_metrics": full.get("live_metrics", {}),
        "weather_cache": full.get("weather_cache", {}),
        "meta": full["meta"],
    }


@router.get("/api/predict-flood/{model_key}")
def predict_flood_for_model(model_key: str):
    """Same as /api/predict-flood, but for a specific algorithm."""
    if model_key not in MODEL_REGISTRY:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown model '{model_key}'. Valid options: {list(MODEL_REGISTRY)}",
        )

    full = _run_forecast(model_key)

    if full["status"] != "success" or not full["forecast"]:
        return full

    today_entry = full["forecast"][0]

    return {
        "status": "success",
        "model_key": model_key,
        "alert_level": today_entry["alert_level"],
        "probability": today_entry["flood_probability"],
        "live_metrics": full.get("live_metrics", {}),
        "weather_cache": full.get("weather_cache", {}),
        "meta": full["meta"],
    }