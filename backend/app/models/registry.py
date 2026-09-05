"""
Loads the shared scaler + feature_metadata.json ONCE, then loads every
algorithm listed in app.config.settings.MODEL_REGISTRY (currently GRU,
LSTM, CNN) that has a matching .h5 file on disk.

Design choice: each model is loaded independently, in its own
try/except. If one algorithm's .h5 file is missing or fails to load,
the other algorithms still come up fine -- the API just reports that
one algorithm as unavailable instead of refusing to start. This matters
now that there are three models instead of one: a single bad/missing
file should never take down the other two.

All three algorithms are trained against the exact same scaler and
feature_order/future_feature_order contract (see model.py), so a
single `scaler` / `feature_metadata` pair is shared across all of them.
"""

import csv
import json
import os

try:
    import tensorflow as tf
    import joblib
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False

from app.config.settings import MODEL_REGISTRY, SCALER_FILE, FEATURE_METADATA_FILE


_FALLBACK_RELIABILITY = {
    "measured_on":
        "held-out test split "
        "(fallback -- feature_metadata.json missing 'reliability')",
    "avg_precision_across_14day_horizon": 0.310,
    "avg_recall_across_14day_horizon": 0.575,
    "avg_f1_across_14day_horizon": 0.402,
    "avg_false_alarm_rate": 0.249,
}

# model.py writes this per-horizon-day CSV for ALL THREE algorithms
# (columns: model, horizon_day, accuracy, precision, recall, f1_score,
# auc_roc, false_alarm_rate, ...). When present, it lets every algorithm
# report its OWN reliability numbers instead of only GRU having them
# (feature_metadata.json's "reliability" block is GRU-only, inherited
# from the original single-model API).
ALL_MODELS_METRICS_FILE = "all_models_per_horizon_metrics.csv"

# Maps the "model" column value in that CSV (LSTM/GRU/CNN) to our
# lowercase registry keys.
_CSV_LABEL_TO_KEY = {"LSTM": "lstm", "GRU": "gru", "CNN": "cnn"}


class ModelRegistry:
    """
    Holds the loaded scaler, feature_metadata, and every successfully
    loaded Keras model, keyed by the short id used throughout the API
    ("gru", "lstm", "cnn").
    """

    def __init__(self):
        self.scaler = None
        self.feature_metadata = None
        self.models = {}          # key -> loaded Keras model
        self.load_errors = {}     # key -> error string (why it didn't load)
        self.reliability = {}     # key -> reliability dict
        self.ready = False        # True once scaler+metadata load OK

        self._load()

    # ------------------------------------------------------------------
    # LOAD
    # ------------------------------------------------------------------

    def _load(self):
        if not TF_AVAILABLE:
            print(
                "⚠️ WARNING: tensorflow/joblib not installed -- "
                "model inference is disabled, fallback formula only."
            )
            return

        try:
            with open(FEATURE_METADATA_FILE, "r") as f:
                self.feature_metadata = json.load(f)

            if "future_feature_order" not in self.feature_metadata:
                raise ValueError(
                    f"{FEATURE_METADATA_FILE} has no 'future_feature_order'. "
                    "This looks like a v1 metadata file. Regenerate it by "
                    "re-running model.py."
                )

            self.scaler = joblib.load(SCALER_FILE)
            self.ready = True

            print(
                "🟢 SUCCESS: scaler + feature_metadata loaded "
                f"(encoder features: {len(self.feature_metadata['feature_order'])}, "
                f"decoder features: {len(self.feature_metadata['future_feature_order'])})."
            )

        except Exception as e:
            print(
                f"⚠️ WARNING: Could not load {SCALER_FILE}/"
                f"{FEATURE_METADATA_FILE}: {e}. Model inference disabled "
                f"entirely -- fallback formula only."
            )
            return

        gru_reliability = self.feature_metadata.get("reliability") or _FALLBACK_RELIABILITY
        per_model_reliability = self._load_per_model_reliability()

        for key, info in MODEL_REGISTRY.items():
            file_path = info["file"]

            try:
                if not os.path.exists(file_path):
                    raise FileNotFoundError(f"{file_path} not found on disk")

                self.models[key] = tf.keras.models.load_model(
                    file_path, compile=False
                )

                self.reliability[key] = (
                    per_model_reliability.get(key)
                    or (gru_reliability if key == "gru" else None)
                    or _FALLBACK_RELIABILITY
                )

                print(f"🟢 SUCCESS: [{key}] {info['label']} loaded from {file_path}.")

            except Exception as e:
                self.load_errors[key] = str(e)
                print(f"⚠️ WARNING: [{key}] {info['label']} did not load: {e}")

    def _load_per_model_reliability(self):
        """
        Reads all_models_per_horizon_metrics.csv (written by model.py for
        LSTM/GRU/CNN together) and averages precision/recall/f1/false-alarm
        across the 14-day horizon, per model. Returns {} if the file isn't
        present -- that's expected for older training runs, and callers
        fall back to _FALLBACK_RELIABILITY / the GRU-only block instead.
        """
        if not os.path.exists(ALL_MODELS_METRICS_FILE):
            return {}

        sums = {}
        counts = {}

        try:
            with open(ALL_MODELS_METRICS_FILE, "r", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    key = _CSV_LABEL_TO_KEY.get(row.get("model", "").strip())
                    if key is None:
                        continue

                    bucket = sums.setdefault(key, {
                        "precision": 0.0, "recall": 0.0,
                        "f1_score": 0.0, "false_alarm_rate": 0.0,
                    })
                    counts[key] = counts.get(key, 0) + 1

                    for field in ("precision", "recall", "f1_score", "false_alarm_rate"):
                        try:
                            bucket[field] += float(row.get(field, 0.0) or 0.0)
                        except (TypeError, ValueError):
                            pass
        except Exception as e:
            print(f"⚠️ Could not read {ALL_MODELS_METRICS_FILE}: {e}")
            return {}

        out = {}
        for key, bucket in sums.items():
            n = max(counts.get(key, 1), 1)
            out[key] = {
                "measured_on": "held-out test split (20% of sequential data, never seen in training)",
                "avg_precision_across_14day_horizon": bucket["precision"] / n,
                "avg_recall_across_14day_horizon": bucket["recall"] / n,
                "avg_f1_across_14day_horizon": bucket["f1_score"] / n,
                "avg_false_alarm_rate": bucket["false_alarm_rate"] / n,
            }
        return out

    # ------------------------------------------------------------------
    # ACCESSORS
    # ------------------------------------------------------------------

    def is_model_available(self, key):
        return self.ready and key in self.models

    def get_model(self, key):
        return self.models.get(key)

    def get_reliability(self, key):
        return self.reliability.get(key, _FALLBACK_RELIABILITY)

    def available_keys(self):
        return list(self.models.keys())

    def status(self):
        """Diagnostic summary -- handy for a /api/models endpoint."""
        out = {}
        for key, info in MODEL_REGISTRY.items():
            out[key] = {
                "label": info["label"],
                "file": info["file"],
                "loaded": key in self.models,
                "error": self.load_errors.get(key),
            }
        return out


# Singleton, created once at import time (mirrors how the original
# main.py loaded the model once at module import).
registry = ModelRegistry()
