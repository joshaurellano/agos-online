import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['PYTHONHASHSEED'] = '0'

import json
import numpy as np
import pandas as pd
import tensorflow as tf
import matplotlib.pyplot as plt
import seaborn as sns
import joblib
from tensorflow.keras.models import Model
from tensorflow.keras.layers import (
    LSTM, GRU, Dense, Dropout, Input, Conv1D, GlobalMaxPooling1D,
    RepeatVector, Concatenate, TimeDistributed, Reshape
)
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import (f1_score, cohen_kappa_score, precision_score,
                              recall_score, accuracy_score, confusion_matrix,
                              roc_auc_score)
import warnings
warnings.filterwarnings('ignore')

SEED = 42
np.random.seed(SEED)
tf.random.set_seed(SEED)
tf.config.experimental.enable_op_determinism()

# ────────────────────────────────────────────────────────────────
# CONFIG
# ────────────────────────────────────────────────────────────────
WINDOW_SIZE = 7     # past days the encoder sees
HORIZON = 14        # future days the decoder forecasts

# ────────────────────────────────────────────────────────────────
# STEP 0: DATASET LOADING (backfilled Open-Meteo data preferred,
#   falls back to the original clean dataset if the backfilled CSV
#   isn't present in the working directory)
# ────────────────────────────────────────────────────────────────
DATA_FILE_CANDIDATES = ["flood_ml_dataset_backfilled.csv", "flood_ml_dataset_clean.csv"]

# Columns that only exist in the Open-Meteo-backfilled dataset. When present,
# preprocess_flood_data() automatically adds them as extra model features --
# no code change needed to "turn on" enrichment, it's detected from the CSV.
ENRICHED_COLUMNS = ["soil_moisture_mean", "pressure_msl_mean",
                     "surface_pressure_mean", "wind_gusts_10m_max"]


def load_flood_dataset(candidates=DATA_FILE_CANDIDATES):
    """
    Tries each candidate CSV in order (backfilled first) and loads the first
    one that exists on disk. Returns (df, path_used, used_backfilled).
    """
    for path in candidates:
        if os.path.exists(path):
            df = pd.read_csv(path)
            used_backfilled = (path == "flood_ml_dataset_backfilled.csv")
            return df, path, used_backfilled
    raise FileNotFoundError(
        f"Wala sa mga sumusunod na CSV ang nahanap sa iyong direktoryo: {candidates}"
    )


# ────────────────────────────────────────────────────────────────
# STEP 1: FEATURE ENGINEERING (unchanged from v1, no leakage --
#   plus optional enriched Open-Meteo features when the backfilled
#   dataset is what got loaded)
# ────────────────────────────────────────────────────────────────
def preprocess_flood_data(df):
    df.columns = df.columns.str.strip().str.lower()

    def find_col(possible_names):
        for col in df.columns:
            if any(name.lower() in col.lower() for name in possible_names):
                return col
        return None

    col_month    = find_col(['month'])
    col_rain     = find_col(['rainfall_mm', 'rainfall'])
    col_signal   = find_col(['typhoon_signal', 'signal'])
    col_moisture = find_col(['antecedent_moisture', 'moisture'])
    col_humidity = find_col(['humidity', 'rh'])
    col_wind     = find_col(['wind', 'windspeed'])
    col_target   = find_col(['flood_occurred', 'flood_occurrence', 'flood'])

    rain = df[col_rain].astype(float)

    df['rain_3h']     = rain.rolling(3,  min_periods=1).sum()
    df['rain_6h']     = rain.rolling(6,  min_periods=1).sum()
    df['rain_12h']    = rain.rolling(12, min_periods=1).sum()
    df['rain_24h']    = rain.rolling(24, min_periods=1).sum()
    df['rain_7d_avg'] = rain.rolling(7,  min_periods=1).mean()

    api = np.zeros(len(rain))
    for i in range(1, len(rain)):
        api[i] = 0.85 * api[i - 1] + rain.iloc[i]
    df['api_5d'] = api

    df['month_sin'] = np.sin(2 * np.pi * df[col_month].astype(float) / 12)
    df['month_cos'] = np.cos(2 * np.pi * df[col_month].astype(float) / 12)

    df['prev_flood'] = df[col_target].astype(float).shift(1).fillna(0)

    features = ['rain_3h', 'rain_6h', 'rain_12h', 'rain_24h', 'rain_7d_avg',
                'api_5d', col_signal, col_moisture, 'month_sin', 'month_cos', 'prev_flood']

    if col_humidity:
        features.append(col_humidity)
    if col_wind:
        features.append(col_wind)

    # Enriched Open-Meteo columns -- only present when trained on
    # flood_ml_dataset_backfilled.csv. Added by exact name (not fuzzy
    # find_col) since these are already unambiguous, fixed column names.
    enriched_used = [c for c in ENRICHED_COLUMNS if c in df.columns]
    features.extend(enriched_used)

    features = [f for f in features if f and f in df.columns]
    df[features] = df[features].astype(float).fillna(0)

    return df, features, col_target, col_moisture, col_signal, enriched_used


# ────────────────────────────────────────────────────────────────
# STEP 2: ENCODER/DECODER SEQUENCE CREATION
#   X_past[i]   = 7-day window of ALL features ending at day i        (encoder input)
#   X_future[i] = 14-day window of KNOWN/FORECASTABLE features         (decoder input)
#                 for the days AFTER that window (excludes prev_flood)
#   y[i]        = flood_occurred for those same 14 future days
# ────────────────────────────────────────────────────────────────
def create_sequences_encdec(X_scaled, future_col_idx, target, window=WINDOW_SIZE, horizon=HORIZON):
    X_past, X_future, y = [], [], []
    n = len(X_scaled)
    for i in range(n - window - horizon + 1):
        X_past.append(X_scaled[i:i + window])
        X_future.append(X_scaled[i + window: i + window + horizon][:, future_col_idx])
        y.append(target[i + window: i + window + horizon])
    return np.array(X_past), np.array(X_future), np.array(y)


# ────────────────────────────────────────────────────────────────
# STEP 3: WEIGHTED BINARY CROSSENTROPY (unchanged)
# ────────────────────────────────────────────────────────────────
def make_weighted_bce(pos_weight):
    pos_weight = tf.constant(pos_weight, dtype=tf.float32)

    def weighted_bce(y_true, y_pred):
        y_pred = tf.clip_by_value(y_pred, 1e-7, 1 - 1e-7)
        loss = -(pos_weight * y_true * tf.math.log(y_pred) +
                  (1.0 - y_true) * tf.math.log(1.0 - y_pred))
        return tf.reduce_mean(loss)

    return weighted_bce


# ────────────────────────────────────────────────────────────────
# STEP 4: ENCODER-DECODER MODEL BUILDER
#   encoder_type in {"lstm", "gru", "cnn"} controls how the past
#   window is summarized into a context vector. The decoder half
#   (repeat context + concat future features + TimeDistributed Dense)
#   is identical across all three so results stay comparable.
# ────────────────────────────────────────────────────────────────
def build_encdec(encoder_type, past_shape, future_shape, horizon, loss_fn):
    past_input = Input(shape=past_shape, name="past_input")
    future_input = Input(shape=future_shape, name="future_input")

    if encoder_type == "lstm":
        x = LSTM(64, return_sequences=True)(past_input)
        x = Dropout(0.3)(x)
        context = LSTM(32)(x)
    elif encoder_type == "gru":
        x = GRU(64, return_sequences=True)(past_input)
        x = Dropout(0.3)(x)
        context = GRU(32)(x)
    elif encoder_type == "cnn":
        x = Conv1D(64, kernel_size=3, activation='relu', padding='same')(past_input)
        x = Dropout(0.3)(x)
        x = Conv1D(32, kernel_size=3, activation='relu', padding='same')(x)
        x = Dropout(0.3)(x)
        context = GlobalMaxPooling1D()(x)
    else:
        raise ValueError(f"Unknown encoder_type: {encoder_type}")

    context_rep = RepeatVector(horizon)(context)                       # (batch, horizon, 32)
    decoder_in = Concatenate(axis=-1)([context_rep, future_input])     # (batch, horizon, 32+n_future_feats)
    d = TimeDistributed(Dense(32, activation='relu'))(decoder_in)
    d = Dropout(0.2)(d)
    out = TimeDistributed(Dense(1, activation='sigmoid'))(d)
    out = Reshape((horizon,))(out)

    model = Model(inputs=[past_input, future_input], outputs=out, name=f"{encoder_type}_encdec")
    model.compile(optimizer=tf.keras.optimizers.Adam(0.001), loss=loss_fn, metrics=['accuracy'])
    return model


# ────────────────────────────────────────────────────────────────
# STEP 5: PER-HORIZON-DAY EVALUATION (same as v1, adapted for the
#   two-input [X_past, X_future] format)
# ────────────────────────────────────────────────────────────────
def evaluate_multihorizon(model, X_test, y_test, name, horizon=HORIZON):
    y_prob = model.predict(X_test, verbose=0)   # X_test = [X_past_test, X_future_test]
    y_pred = (y_prob > 0.5).astype(int)

    rows = []
    for day in range(horizon):
        yt = y_test[:, day]
        yp = y_pred[:, day]
        ypr = y_prob[:, day]

        acc  = accuracy_score(yt, yp)
        prec = precision_score(yt, yp, zero_division=0)
        rec  = recall_score(yt, yp, zero_division=0)
        f1   = f1_score(yt, yp, zero_division=0)
        kap  = cohen_kappa_score(yt, yp)
        try:
            auc = roc_auc_score(yt, ypr)
        except Exception:
            auc = float('nan')

        cm = confusion_matrix(yt, yp)
        tn, fp, fn, tp = cm.ravel() if cm.size == 4 else (0, 0, 0, 0)
        far = fp / (fp + tn + 1e-9)
        mer = fn / (fn + tp + 1e-9)

        rows.append({
            'model': name, 'horizon_day': day + 1, 'accuracy': acc,
            'precision': prec, 'recall': rec, 'f1_score': f1,
            'cohens_kappa': kap, 'auc_roc': auc,
            'false_alarm_rate': far, 'missed_event_rate': mer,
            'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)
        })

    result_df = pd.DataFrame(rows)
    result_df.to_csv(f"{name}_per_horizon_metrics.csv", index=False)

    print(f"\n{'=' * 60}")
    print(f"  {name} — 14-DAY FORECAST VALIDATION (per-horizon summary)")
    print(f"{'=' * 60}")
    print(f"  Day 1  (tomorrow)   -> Acc: {result_df.iloc[0]['accuracy']:.3f}  "
          f"F1: {result_df.iloc[0]['f1_score']:.3f}  AUC: {result_df.iloc[0]['auc_roc']:.3f}")
    mid = horizon // 2 - 1
    print(f"  Day {mid+1}  (mid-range)   -> Acc: {result_df.iloc[mid]['accuracy']:.3f}  "
          f"F1: {result_df.iloc[mid]['f1_score']:.3f}  AUC: {result_df.iloc[mid]['auc_roc']:.3f}")
    print(f"  Day {horizon} (furthest out)  -> Acc: {result_df.iloc[-1]['accuracy']:.3f}  "
          f"F1: {result_df.iloc[-1]['f1_score']:.3f}  AUC: {result_df.iloc[-1]['auc_roc']:.3f}")
    print(f"  Overall Accuracy (avg across all 14 days): {result_df['accuracy'].mean():.4f}")
    print(f"  Overall F1-Score (avg across all 14 days): {result_df['f1_score'].mean():.4f}")

    try:
        plt.figure(figsize=(9, 5))
        plt.plot(result_df['horizon_day'], result_df['f1_score'], marker='o', label='F1-Score')
        plt.plot(result_df['horizon_day'], result_df['auc_roc'], marker='s', label='AUC-ROC')
        plt.plot(result_df['horizon_day'], result_df['accuracy'], marker='^', label='Accuracy')
        plt.xlabel('Forecast Horizon (days ahead)')
        plt.ylabel('Score')
        plt.title(f'{name} — Forecast Skill vs. Horizon Day (with forecast input)')
        plt.ylim(0, 1)
        plt.legend()
        plt.grid(alpha=0.3)
        plt.savefig(f"{name}_horizon_skill_chart.png", dpi=300, bbox_inches='tight')
        plt.close()
    except Exception as e:
        print(f"Warning: hindi nagawa ang horizon skill chart para sa {name}: {e}")

    try:
        fig, axes = plt.subplots(1, 2, figsize=(10, 4))
        for ax, day_idx, label in [(axes[0], 0, 'Day 1'), (axes[1], horizon - 1, f'Day {horizon}')]:
            row = result_df.iloc[day_idx]
            cm = [[row['tn'], row['fp']], [row['fn'], row['tp']]]
            sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax,
                        xticklabels=['No Flood', 'Flood'], yticklabels=['No Flood', 'Flood'])
            ax.set_title(f"{name} — {label}")
            ax.set_ylabel('True')
            ax.set_xlabel('Predicted')
        plt.tight_layout()
        plt.savefig(f"{name}_confusion_matrix_day1_vs_day{horizon}.png", dpi=300, bbox_inches='tight')
        plt.close()
    except Exception as e:
        print(f"Warning: hindi nagawa ang confusion matrix plot para sa {name}: {e}")

    return result_df


# ────────────────────────────────────────────────────────────────
# MAIN EXECUTION PIPELINE
# ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    df, csv_path, used_backfilled = load_flood_dataset()
    print(f"Dataset Loaded! Gamit: {csv_path}"
          + (" (ENRICHED/backfilled Open-Meteo data)" if used_backfilled
             else " (original/clean dataset -- backfilled CSV not found, fell back)"))
    print(f"Hugis ng Data: {df.shape}")

    df_processed, features, target_col, col_moisture, col_signal, enriched_used = preprocess_flood_data(df)
    print(f"Encoder (past) features ({len(features)}): {features}")
    if enriched_used:
        print(f"  -> includes {len(enriched_used)} enriched Open-Meteo feature(s): {enriched_used}")

    # Decoder only gets features that are actually knowable in advance:
    # prev_flood depends on an outcome we don't know yet, so it's excluded.
    FUTURE_FEATURES = [f for f in features if f != 'prev_flood']
    future_col_idx = [features.index(f) for f in FUTURE_FEATURES]
    print(f"Decoder (future/forecast) features ({len(FUTURE_FEATURES)}): {FUTURE_FEATURES}")

    X_raw = df_processed[features].values
    y_raw = df_processed[target_col].astype(int).values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_raw)
    joblib.dump(scaler, "flood_scaler.pkl")
    print("-> Na-save na ang: flood_scaler.pkl")

    X_past_seq, X_future_seq, y_seq = create_sequences_encdec(
        X_scaled, future_col_idx, y_raw, window=WINDOW_SIZE, horizon=HORIZON
    )
    print(f"Sequence shapes -> X_past: {X_past_seq.shape}  X_future: {X_future_seq.shape}  y: {y_seq.shape}")

    (X_past_train, X_past_test,
     X_future_train, X_future_test,
     y_train, y_test) = train_test_split(
        X_past_seq, X_future_seq, y_seq, test_size=0.2, shuffle=False
    )

    flood_rate = y_train.mean()
    auto_pos_weight = (1 - flood_rate) / max(flood_rate, 1e-6)
    pos_weight = 3.5  # tuned value; see v1 script comments for the sweep that picked this
    print(f"Flood rate sa training set: {flood_rate:.3f}")
    print(f"  auto-computed pos_weight would have been: {auto_pos_weight:.2f} (too aggressive)")
    print(f"  pos_weight ginamit (tuned): {pos_weight:.2f}")
    loss_fn = make_weighted_bce(pos_weight)

    early_stopping = EarlyStopping(monitor='val_loss', patience=8, restore_best_weights=True)
    reduce_lr = ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=4, min_lr=1e-5)

    past_shape = (X_past_train.shape[1], X_past_train.shape[2])
    future_shape = (X_future_train.shape[1], X_future_train.shape[2])

    all_results = []
    saved_models = {}

    for encoder_type, out_name, out_file in [
        ("lstm", "LSTM", "flood_lstm_14day_encdec_model.h5"),
        ("gru",  "GRU",  "flood_gru_14day_encdec_model.h5"),
        ("cnn",  "CNN",  "flood_cnn_14day_encdec_model.h5"),
    ]:
        print(f"\n>>> Nag-ti-train na ang {out_name} (encoder-decoder, 14-day, w/ forecast input)...")
        m = build_encdec(encoder_type, past_shape, future_shape, HORIZON, loss_fn)
        m.fit(
            [X_past_train, X_future_train], y_train,
            validation_split=0.1, epochs=60, batch_size=32,
            callbacks=[early_stopping, reduce_lr], verbose=0
        )
        result_df = evaluate_multihorizon(m, [X_past_test, X_future_test], y_test, out_name)
        all_results.append(result_df)
        m.save(out_file)
        saved_models[out_name] = m
        print(f"-> Na-save na ang: {out_file}")

    combined = pd.concat(all_results, ignore_index=True)
    combined.to_csv("all_models_per_horizon_metrics.csv", index=False)
    print("\n-> Na-save na ang: all_models_per_horizon_metrics.csv")

    # Metadata contract for the API. future_feature_order is new in v2 --
    # it tells the backend exactly which columns (and in what order) go
    # into the decoder, separately from feature_order (encoder/past).
    gru_metrics = all_results[1]  # order: [LSTM, GRU, CNN]
    reliability = {
        "measured_on": "held-out test split (20% of sequential data, never seen in training)",
        "avg_precision_across_14day_horizon": float(gru_metrics['precision'].mean()),
        "avg_recall_across_14day_horizon": float(gru_metrics['recall'].mean()),
        "avg_f1_across_14day_horizon": float(gru_metrics['f1_score'].mean()),
        "avg_false_alarm_rate": float(gru_metrics['false_alarm_rate'].mean()),
        "honest_caveat": (
            f"Dataset has {len(df_processed)} days of history and "
            f"{int(y_raw.sum())} flood events total. Metrics beyond ~day 7-10 also "
            "inherit Open-Meteo's own forecast uncertainty at longer lead times, "
            "on top of the model's own error -- treat flood_probability as "
            "decision-support, not a certainty score."
        ),
    }

    metadata = {
        "window_size": WINDOW_SIZE,
        "horizon": HORIZON,
        "feature_order": features,               # encoder input columns, in order
        "future_feature_order": FUTURE_FEATURES,  # decoder input columns, in order (subset of feature_order)
        "target_column": target_col,
        "flood_rate_training": float(flood_rate),
        "pos_weight_used": pos_weight,
        "dataset_used": csv_path,
        "used_backfilled_data": used_backfilled,
        "enriched_features_used": enriched_used,
        "antecedent_moisture_column": col_moisture,
        "antecedent_moisture_min": float(df_processed[col_moisture].min()),
        "antecedent_moisture_max": float(df_processed[col_moisture].max()),
        "api_5d_min": float(df_processed['api_5d'].min()),
        "api_5d_max": float(df_processed['api_5d'].max()),
        "typhoon_signal_column": col_signal,
        "note": ("typhoon_signal sa dataset ay 0-4 (parehong scale ng "
                 "wind_to_signal() thresholds sa API backend, kaya walang "
                 "kailangang i-remap dito). prev_flood ay EXCLUDED sa "
                 "future_feature_order dahil hindi ito known-in-advance. "
                 "enriched_features_used (kung meron) ay dapat ma-fetch din "
                 "ng main.py mula sa live Open-Meteo call -- ito ang "
                 "nag-uugnay sa training dataset at live inference "
                 "features, kaya laging kasama ito sa feature_order/"
                 "future_feature_order kapag backfilled ang ginamit."),
        "reliability": reliability,
    }
    with open("feature_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    print("-> Na-save na ang: feature_metadata.json (kasama na ang future_feature_order)")

    print("\n[TAPOS NA!] Encoder-decoder models (LSTM/GRU/CNN) na gumagamit ng")
    print("            Open-Meteo forecast bilang known future input ay nai-save.")