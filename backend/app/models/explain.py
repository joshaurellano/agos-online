"""
On-demand SHAP explainability for the flood-forecast models.

Unlike the polled /api/predict-flood and /api/forecast-flood endpoints,
this is NOT meant to be called every 30s -- it runs a genuine (not
illustrative) Kernel SHAP computation against the live model, which
costs a handful of vectorized model.predict() batches per call. Callers
should fetch it once when a user opens an analytics view, not on a timer.

Design
------
Each of the 16 named encoder features (see feature_metadata.json's
feature_order) is treated as ONE "player" in the Shapley coalition game,
spanning all 7 encoder timesteps together -- this matches how a person
would ask "how much did rainfall, as a whole, matter?" rather than
"how much did timestep 3 of rainfall matter?", and keeps the game to 16
players (fast, well within KernelExplainer's comfort zone) instead of
16 x 7 = 112.

Baseline ("average conditions"): every feature is StandardScaler-
transformed before it reaches the model, so a scaled value of exactly 0
IS the training-set mean for that feature (the same scaler fit at
training time is reused here). That makes an all-zero encoder window a
mathematically justified SHAP baseline -- no separate background sample
needs to be drawn from the training CSV at request time.

shap.KernelExplainer is model-agnostic (it only ever calls a plain
Python predict function), so it has none of DeepExplainer/
GradientExplainer's version-compatibility issues with a given TF/Keras
build -- it treats the model as a black box, the same way it would
treat an sklearn model.
"""

import numpy as np

try:
    import shap
    SHAP_AVAILABLE = True
except Exception as _shap_import_error:  # noqa: BLE001 -- diagnostic, see print below
    SHAP_AVAILABLE = False
    print(f"⚠️ WARNING: could not import shap ({type(_shap_import_error).__name__}): {_shap_import_error}")

from app.features.windows import build_prediction_windows
from app.models.registry import registry


class ModelUnavailableError(Exception):
    """Raised when a requested algorithm key isn't loaded/available, or
    when the shap package itself isn't installed."""
    pass


# Human-readable label + unit for each feature_metadata.json feature_order
# entry, used to label the SHAP bar chart / table on the frontend.
FEATURE_INFO = {
    "rain_3h":              {"label": "3h Cumulative Rainfall",                    "unit": "mm"},
    "rain_6h":               {"label": "6h Cumulative Rainfall",                    "unit": "mm"},
    "rain_12h":              {"label": "12h Cumulative Rainfall",                   "unit": "mm"},
    "rain_24h":              {"label": "24h Cumulative Rainfall",                   "unit": "mm"},
    "rain_7d_avg":           {"label": "7-Day Rainfall Average",                    "unit": "mm"},
    "api_5d":                {"label": "Antecedent Precipitation Index (5-day)",    "unit": ""},
    "typhoon_signal":        {"label": "Typhoon Signal (PAGASA)",                   "unit": "signal"},
    "antecedent_moisture":   {"label": "Antecedent Moisture Proxy",                 "unit": ""},
    "month_sin":             {"label": "Seasonal Encoding (sin)",                   "unit": ""},
    "month_cos":             {"label": "Seasonal Encoding (cos)",                   "unit": ""},
    "prev_flood":            {"label": "Previous-Day Flood Flag",                   "unit": ""},
    "typhoon_max_wind_kph":  {"label": "Max Wind Speed",                            "unit": "kph"},
    "soil_moisture_mean":    {"label": "Soil Moisture",                             "unit": "VWC"},
    "pressure_msl_mean":     {"label": "Sea-Level Pressure",                        "unit": "hPa"},
    "surface_pressure_mean": {"label": "Surface Pressure",                          "unit": "hPa"},
    "wind_gusts_10m_max":    {"label": "Wind Gusts (max)",                          "unit": "kph"},
}


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


def _day1_probs_from_masks(model, mask_batch, past_window, future_window):
    """
    Vectorized predict function handed to SHAP as "f". mask_batch is
    (n_samples, n_features) of 0/1 -- 1 keeps that feature at its real
    live value (across all 7 encoder timesteps at once), 0 replaces it
    with the scaled-zero baseline. Since the baseline IS zero, "replace
    with baseline" is just "multiply by the mask" -- no separate
    baseline array needs to be blended in.

    future_window (the decoder input) is held fixed at the real
    Open-Meteo forecast for every sample: this endpoint explains what in
    the recent past / antecedent conditions drove TODAY's prediction,
    not the weather forecast itself.
    """
    n = mask_batch.shape[0]
    mask_expanded = mask_batch[:, np.newaxis, :]                    # (n, 1, n_features)
    past_batch = mask_expanded * past_window[np.newaxis, :, :]       # (n, window, n_features)
    future_batch = np.repeat(future_window[np.newaxis, :, :], n, axis=0)

    probs = np.asarray(model.predict([past_batch, future_batch], verbose=0))
    # TimeDistributed(Dense(1, sigmoid)) output is (n, horizon, 1); be
    # tolerant of a (n, horizon) shape too in case that ever changes.
    if probs.ndim == 3:
        return probs[:, 0, 0]
    return probs[:, 0]


def explain_model(model_key):
    """
    Runs KernelSHAP for one algorithm against the current live input
    window and returns per-feature Shapley contributions to TODAY's
    (day-1) flood probability, sorted by absolute impact.
    """
    if not SHAP_AVAILABLE:
        raise ModelUnavailableError(
            "The 'shap' package is not installed on this server. "
            "Run: pip install -r requirements.txt"
        )

    _require_model(model_key)

    (
        past_window,
        future_window,
        past_dates,
        future_dates,
        future_enriched,
        past_window_raw,
    ) = build_prediction_windows(registry.feature_metadata, registry.scaler)

    model = registry.get_model(model_key)
    feature_order = registry.feature_metadata["feature_order"]
    n_features = len(feature_order)

    def f(mask_batch):
        return _day1_probs_from_masks(model, np.asarray(mask_batch), past_window, future_window)

    # Baseline mask = all-zero (every feature at its scaled/training-mean
    # baseline, i.e. "an average day"). Explained instance = all-one mask
    # (every feature at its real live value, i.e. "today"). KernelSHAP
    # attributes the gap between the two across the 16 named features.
    background = np.zeros((1, n_features))
    explainer = shap.KernelExplainer(f, background)
    raw_shap_values = explainer.shap_values(np.ones((1, n_features)), nsamples="auto")

    shap_values = np.asarray(raw_shap_values).reshape(-1)          # (n_features,)
    base_value = float(np.asarray(explainer.expected_value).reshape(-1)[0])
    predicted_value = float(f(np.ones((1, n_features)))[0])

    # Most recent encoder timestep's raw (unscaled) value per feature --
    # the single most intuitive "current condition" number to show next
    # to each bar (e.g. rain_24h as of today, not 7 days ago).
    latest_raw = past_window_raw[-1]

    features_out = []
    for i, name in enumerate(feature_order):
        info = FEATURE_INFO.get(name, {"label": name, "unit": ""})
        features_out.append({
            "feature":       name,
            "label":         info["label"],
            "unit":          info["unit"],
            "shap_value":    round(float(shap_values[i]), 5),
            "current_value": round(float(latest_raw[i]), 4),
        })

    features_out.sort(key=lambda x: abs(x["shap_value"]), reverse=True)

    return {
        "status":         "success",
        "model_key":      model_key,
        "base_value":     round(base_value, 4),
        "predicted_value": round(predicted_value, 4),
        "explains":       "day_1_flood_probability",
        "method":         "KernelSHAP (model-agnostic, shap.KernelExplainer)",
        "baseline_definition": (
            "All 16 encoder features held at their StandardScaler-zero "
            "point, which is exactly the training-set mean for every "
            "feature (same scaler fit at training time, reused here)."
        ),
        "features": features_out,
    }
