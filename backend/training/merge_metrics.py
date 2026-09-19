"""
Run this AFTER training all 3 models (train_lstm.py, train_gru.py,
train_cnn.py) to combine their individual per-horizon metrics CSVs into
one file:

    python training/merge_metrics.py

Writes:
    all_models_per_horizon_metrics.csv

app/models/registry.py reads this file to give each algorithm its own
reliability numbers (precision/recall/F1/false-alarm-rate) instead of
only the default model having them. If you only trained 1 or 2 of the
3 algorithms, this still works -- it just combines whichever
{NAME}_per_horizon_metrics.csv files exist.
"""

import os
import pandas as pd

FILES = [
    ("LSTM", "LSTM_per_horizon_metrics.csv"),
    ("GRU", "GRU_per_horizon_metrics.csv"),
    ("CNN", "CNN_per_horizon_metrics.csv"),
]

if __name__ == "__main__":
    frames = []
    for label, path in FILES:
        if os.path.exists(path):
            frames.append(pd.read_csv(path))
            print(f"-> Found {path}")
        else:
            print(f"-> Skipping {label}: {path} not found (train it first if you want it included)")

    if not frames:
        raise SystemExit(
            "No per-horizon metrics CSVs found. Run at least one of "
            "train_lstm.py / train_gru.py / train_cnn.py first."
        )

    combined = pd.concat(frames, ignore_index=True)
    combined.to_csv("all_models_per_horizon_metrics.csv", index=False)
    print(f"\n-> Saved: all_models_per_horizon_metrics.csv ({len(frames)} model(s) combined)")
