"""
Trains ONLY the LSTM encoder-decoder flood-forecast model.

Run from the PROJECT ROOT (not from inside training/):

    python training/train_lstm.py

Writes:
    flood_lstm_14day_encdec_model.h5   <- the model this API serves
    LSTM_per_horizon_metrics.csv       <- per-day accuracy/precision/recall/F1
    LSTM_horizon_skill_chart.png
    LSTM_confusion_matrix_day1_vs_day14.png
    flood_scaler.pkl                   <- shared scaler (safe to overwrite,
                                           deterministic given the same CSV)
    feature_metadata.json              <- shared metadata (same as above)

See training/common.py for the shared preprocessing/architecture code,
and training/README.md for the full workflow across all 3 algorithms.
"""

from common import prepare_training_data, build_encdec, evaluate_multihorizon, HORIZON
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau

if __name__ == "__main__":
    data = prepare_training_data()

    early_stopping = EarlyStopping(monitor='val_loss', patience=8, restore_best_weights=True)
    reduce_lr = ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=4, min_lr=1e-5)

    print("\n>>> Training LSTM (encoder-decoder, 14-day, w/ forecast input)...")
    model = build_encdec("lstm", data["past_shape"], data["future_shape"], HORIZON, data["loss_fn"])
    model.fit(
        [data["X_past_train"], data["X_future_train"]], data["y_train"],
        validation_split=0.1, epochs=60, batch_size=32,
        callbacks=[early_stopping, reduce_lr], verbose=1
    )

    evaluate_multihorizon(
        model, [data["X_past_test"], data["X_future_test"]], data["y_test"], "LSTM"
    )

    model.save("flood_lstm_14day_encdec_model.h5")
    print("-> Saved: flood_lstm_14day_encdec_model.h5")
    print("\n[DONE] LSTM model trained and saved.")
