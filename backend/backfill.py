"""
Backfills real Open-Meteo historical fields into a NEW copy of the dataset.
The original flood_ml_dataset_clean.csv is never modified.

Run this on your own machine (not in a sandbox) -- it needs real internet
access to archive-api.open-meteo.com.

    pip install pandas requests
    python backfill_openmeteo_features.py

Output: flood_ml_dataset_backfilled.csv (same folder as the input CSV)
"""
import pandas as pd
import requests
import time

INPUT_CSV = "flood_ml_dataset_clean.csv"
OUTPUT_CSV = "flood_ml_dataset_backfilled.csv"

# Same coordinates main.py already uses for the live API -- change this if
# your dataset was actually built for a different location.
LAT, LON = 13.6192, 123.1814
TIMEZONE = "Asia/Manila"

# Fields confirmed available on BOTH the historical archive AND the live
# Forecast API (so what we backfill here can actually be reproduced live
# in main.py later). Left out: precipitation_probability (doesn't exist
# for past dates -- it's a forward-looking ensemble spread) and cape
# (not in the reanalysis-based Historical Weather API; only in the
# Historical Forecast archive, which doesn't go back to 2020).
HOURLY_VARS = [
    "soil_moisture_0_to_7cm",
    "soil_moisture_7_to_28cm",
    "soil_moisture_28_to_100cm",
    "pressure_msl",
    "surface_pressure",
    "wind_gusts_10m",
]


def fetch_archive(start_date, end_date):
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": LAT,
        "longitude": LON,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": ",".join(HOURLY_VARS),
        "timezone": TIMEZONE,
    }
    resp = requests.get(url, params=params, timeout=60)
    resp.raise_for_status()
    return resp.json()


def hourly_to_daily(data):
    """Collapse the hourly JSON response into one row per day."""
    hourly = data["hourly"]
    df = pd.DataFrame({
        "datetime": pd.to_datetime(hourly["time"]),
        "soil_moisture_0_to_7cm": hourly["soil_moisture_0_to_7cm"],
        "soil_moisture_7_to_28cm": hourly["soil_moisture_7_to_28cm"],
        "soil_moisture_28_to_100cm": hourly["soil_moisture_28_to_100cm"],
        "pressure_msl": hourly["pressure_msl"],
        "surface_pressure": hourly["surface_pressure"],
        "wind_gusts_10m": hourly["wind_gusts_10m"],
    })
    df["date"] = df["datetime"].dt.date.astype(str)

    # Soil moisture: mean across the three archive depth bins -> one
    # "soil_moisture_mean" value. NOTE: the live Forecast API reports
    # soil moisture at different depth bins (0-1,1-3,3-9,9-27,27-81cm).
    # main.py will need to average ITS available bins the same way to
    # approximate this same feature at inference time -- the two won't
    # match exactly since the depth ranges differ, but both represent
    # "how wet is the ground right now", which is what actually matters.
    df["soil_moisture_mean"] = df[[
        "soil_moisture_0_to_7cm", "soil_moisture_7_to_28cm", "soil_moisture_28_to_100cm"
    ]].mean(axis=1)

    daily = df.groupby("date").agg(
        soil_moisture_mean=("soil_moisture_mean", "mean"),
        pressure_msl_mean=("pressure_msl", "mean"),
        surface_pressure_mean=("surface_pressure", "mean"),
        wind_gusts_10m_max=("wind_gusts_10m", "max"),
    ).reset_index()

    return daily


def main():
    original = pd.read_csv(INPUT_CSV)
    start_date = original["date"].min()
    end_date = original["date"].max()
    print(f"Backfilling {start_date} -> {end_date} for lat={LAT}, lon={LON} ...")

    # The archive API handles multi-year ranges fine in one call, but if
    # you ever need a much longer range, split into yearly chunks and
    # concat -- left as a single call here since 5 years is well within
    # normal response size.
    data = fetch_archive(start_date, end_date)
    daily = hourly_to_daily(data)

    merged = original.copy()
    merged = merged.merge(daily, on="date", how="left")

    missing = merged[["soil_moisture_mean", "pressure_msl_mean",
                       "surface_pressure_mean", "wind_gusts_10m_max"]].isna().sum()
    if missing.sum() > 0:
        print("WARNING -- missing values after merge (check date format/coverage):")
        print(missing)
        # forward/backward fill small gaps rather than leaving NaN
        merged[["soil_moisture_mean", "pressure_msl_mean",
                "surface_pressure_mean", "wind_gusts_10m_max"]] = (
            merged[["soil_moisture_mean", "pressure_msl_mean",
                    "surface_pressure_mean", "wind_gusts_10m_max"]]
            .ffill().bfill()
        )

    merged.to_csv(OUTPUT_CSV, index=False)
    print(f"-> Wrote {OUTPUT_CSV} ({len(merged)} rows, {len(merged.columns)} columns)")
    print("   Original flood_ml_dataset_clean.csv was NOT modified.")


if __name__ == "__main__":
    main()
