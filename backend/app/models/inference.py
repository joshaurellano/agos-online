"""
Runs one (or all) loaded flood models against the same input windows,
and formats the 14-day forecast payloads returned by the API.

Every algorithm in the registry consumes the exact same
[past_window, future_window] input pair -- they were trained on the
same scaler/feature contract -- so build_prediction_windows() only
needs to run ONCE per request no matter how many algorithms are asked
for. That single Open-Meteo-derived input is then fed through each
requested model's own forward pass.
"""

import datetime

import numpy as np

from app.config.settings import MODEL_REGISTRY, DEFAULT_MODEL_KEY
from app.features.windows import build_prediction_windows
from app.weather.client import fetch_weather
from app.weather.cache import get_cache_status
from app.features.aggregation import get_live_metrics
from app.utils.alerts import probability_to_alert_level
from app.models.registry import registry


class ModelUnavailableError(Exception):
    """Raised when a requested algorithm key isn't loaded/available."""
    pass


def _require_model(model_key):
    if not registry.ready:
        raise ModelUnavailableError(
            "Model registry is not ready -- scaler/feature_metadata.json "
            "failed to load. Check server logs at startup."
        )

    if not registry.is_model_available(model_key):
        err = registry.load_errors.get(model_key, "unknown reason")
        raise ModelUnavailableError(
            f"Model '{model_key}' is not available ({err}). "
            f"Available models: {registry.available_keys()}"
        )


def _predict_probs(model_key, past_window, future_window):
    """Single forward pass for one algorithm. Returns a (horizon,) array."""
    model = registry.get_model(model_key)

    model_input = [
        np.expand_dims(past_window, axis=0),
        np.expand_dims(future_window, axis=0),
    ]

    return model.predict(model_input, verbose=0)[0]


def _today_from_weather(weather_data):
    current_time = weather_data.get("current", {}).get("time", "")

    if current_time:
        try:
            return datetime.datetime.fromisoformat(current_time).date(), current_time
        except Exception:
            pass

    return datetime.date.today(), current_time


def _build_forecast_entries(probs, today, future_enriched):
    """
    Same per-day shape the original API returned: date, day_ahead,
    flood_probability, alert_level, confidence_band, plus the enriched
    Open-Meteo fields for that day.
    """
    forecast_out = []

    for day_offset in range(len(probs)):
        forecast_date = today + datetime.timedelta(days=day_offset + 1)
        p = float(probs[day_offset])
        enriched = future_enriched[day_offset] if day_offset < len(future_enriched) else {}

        forecast_out.append({
            "date": forecast_date.isoformat(),
            "day_ahead": day_offset + 1,
            "flood_probability": round(p, 4),
            "alert_level": probability_to_alert_level(p),
            "confidence_band": (
                "high" if day_offset < 3 else
                "moderate" if day_offset < 7 else
                "outlook-only"
            ),
            "soil_moisture_vwc": enriched.get("soil_moisture_vwc"),
            "pressure_msl_hpa": enriched.get("pressure_msl_hpa"),
            "surface_pressure_hpa": enriched.get("surface_pressure_hpa"),
            "wind_gusts_kph": enriched.get("wind_gusts_kph"),
            "rainfall_mm": enriched.get("rainfall_mm"),
            "wind_speed_max_kph": enriched.get("wind_speed_max_kph"),
        })

    return forecast_out


def _meta_block(model_key, feature_metadata):
    info = MODEL_REGISTRY[model_key]
    reliability = registry.get_reliability(model_key)

    return {
        "model_key": model_key,
        "engine": (
            f"{info['label']} 14-Day Model (single forward pass, decoder "
            "driven by Open-Meteo's actual 14-day forecast)"
        ),
        "note": (
            "Days 1-3 = high confidence, Days 4-7 = moderate, "
            "Days 8-14 = general trend/outlook only. Longer lead times "
            "inherit both the model's uncertainty and Open-Meteo forecast "
            "uncertainty. If weather_cache.status is 'stale_fallback', "
            "this forecast is based on the last successful Open-Meteo "
            "fetch rather than a fresh one -- check "
            "weather_cache.age_minutes and significantly_stale."
        ),
        "assumptions": [
            (
                "Decoder input (rain/wind/typhoon-signal features for the "
                "next 14 days) comes directly from Open-Meteo's forecast, "
                "not a blind extrapolation of past patterns."
            ),
            (
                "Antecedent moisture is a proxy derived from computed "
                "rainfall API. No live soil-moisture sensor."
            ),
            (
                "prev_flood defaults to 0 in the encoder because there is "
                "no live ground-truth flood feed. Excluded entirely from "
                "the decoder."
            ),
            (
                "Typhoon signal is a proxy derived from forecasted "
                "wind-speed thresholds."
            ),
        ],
        "model_reliability": {
            "avg_precision": reliability.get("avg_precision_across_14day_horizon"),
            "avg_recall": reliability.get("avg_recall_across_14day_horizon"),
            "avg_f1": reliability.get("avg_f1_across_14day_horizon"),
            "avg_false_alarm_rate": reliability.get("avg_false_alarm_rate"),
            "measured_on": reliability.get("measured_on"),
            "plain_language": (
                "Treat flood_probability as a decision-support signal, "
                "not a certainty score."
            ),
        },
        "enriched_metrics_used_by_model": feature_metadata.get("enriched_features_used", []),
        "enriched_metrics_note": (
            "soil_moisture_vwc / pressure_msl_hpa / surface_pressure_hpa / "
            "wind_gusts_kph are fetched from Open-Meteo. They only feed "
            "the model when listed in enriched_metrics_used_by_model."
        ),
    }


def forecast_with_model(model_key):
    """
    Full single-algorithm 14-day flood forecast, in the same response
    shape the original (GRU-only) /api/forecast-flood used to return.
    """
    _require_model(model_key)

    (
        past_window,
        future_window,
        past_dates,
        future_dates,
        future_enriched,
    ) = build_prediction_windows(registry.feature_metadata, registry.scaler)

    probs = _predict_probs(model_key, past_window, future_window)

    weather_data = fetch_weather()
    live_metrics = get_live_metrics(weather_data)
    today, current_time = _today_from_weather(weather_data)

    forecast_out = _build_forecast_entries(probs, today, future_enriched)

    return {
        "status": "success",
        "generated_at": current_time,
        "weather_cache": get_cache_status(),
        "model_input_past_dates": past_dates,
        "model_input_forecast_dates": future_dates,
        "live_metrics": live_metrics,
        "meta": _meta_block(model_key, registry.feature_metadata),
        "forecast": forecast_out,
    }


def compare_models(model_keys=None):
    """
    Runs every requested (default: every AVAILABLE) algorithm against
    the SAME input windows -- one Open-Meteo fetch and one feature-
    engineering pass, shared across all algorithms -- and returns their
    14-day forecasts side by side plus a simple ensemble (mean) and an
    agreement flag per day.
    """
    if not registry.ready:
        raise ModelUnavailableError(
            "Model registry is not ready -- scaler/feature_metadata.json "
            "failed to load. Check server logs at startup."
        )

    keys = model_keys or registry.available_keys()
    missing = [k for k in keys if not registry.is_model_available(k)]
    if missing:
        raise ModelUnavailableError(
            f"Requested model(s) not available: {missing}. "
            f"Available models: {registry.available_keys()}"
        )
    if not keys:
        raise ModelUnavailableError("No models are available to compare.")

    (
        past_window,
        future_window,
        past_dates,
        future_dates,
        future_enriched,
    ) = build_prediction_windows(registry.feature_metadata, registry.scaler)

    weather_data = fetch_weather()
    live_metrics = get_live_metrics(weather_data)
    today, current_time = _today_from_weather(weather_data)

    per_model = {}
    probs_by_key = {}

    for key in keys:
        probs = _predict_probs(key, past_window, future_window)
        probs_by_key[key] = probs
        per_model[key] = {
            "label": MODEL_REGISTRY[key]["label"],
            "meta": _meta_block(key, registry.feature_metadata),
            "forecast": _build_forecast_entries(probs, today, future_enriched),
        }

    # ------------------------------------------------------------------
    # DAY-BY-DAY COMPARISON TABLE (ensemble mean + spread + agreement)
    # ------------------------------------------------------------------
    horizon = len(next(iter(probs_by_key.values())))
    comparison = []

    for day_offset in range(horizon):
        forecast_date = today + datetime.timedelta(days=day_offset + 1)

        day_probs = {key: float(probs_by_key[key][day_offset]) for key in keys}
        values = list(day_probs.values())
        mean_p = sum(values) / len(values)
        alert_levels = {key: probability_to_alert_level(p) for key, p in day_probs.items()}

        comparison.append({
            "date": forecast_date.isoformat(),
            "day_ahead": day_offset + 1,
            "probabilities": {key: round(p, 4) for key, p in day_probs.items()},
            "alert_levels": alert_levels,
            "ensemble_mean_probability": round(mean_p, 4),
            "ensemble_alert_level": probability_to_alert_level(mean_p),
            "spread": round(max(values) - min(values), 4),
            "models_agree": len(set(alert_levels.values())) == 1,
        })

    return {
        "status": "success",
        "generated_at": current_time,
        "weather_cache": get_cache_status(),
        "model_input_past_dates": past_dates,
        "model_input_forecast_dates": future_dates,
        "live_metrics": live_metrics,
        "models_compared": keys,
        "default_model": DEFAULT_MODEL_KEY,
        "per_model": per_model,
        "comparison": comparison,
    }
