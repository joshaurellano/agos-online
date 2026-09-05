"""
Feature engineering that mirrors model.py's preprocess_flood_data(),
but operates on a single live Open-Meteo response instead of the
training CSV -- this is what turns raw daily rain/humidity/wind (etc.)
into the exact feature columns the models were trained on, in the
exact order recorded in feature_metadata.json's "feature_order".
"""

import datetime
import math

import numpy as np

from app.utils.alerts import wind_to_signal

def engineer_daily_features(
    daily_dates,
    daily_rain,
    daily_humidity,
    daily_wind,
    meta,
    daily_soil_moisture=None,
    daily_pressure_msl=None,
    daily_surface_pressure=None,
    daily_wind_gusts=None
):

    n = len(daily_rain)

    rain = np.array(
        daily_rain,
        dtype=float
    )

    humidity = np.array(
        daily_humidity,
        dtype=float
    )

    wind = np.array(
        daily_wind,
        dtype=float
    )

    # ----------------------------------------------------------------------
    # ENRICHED FEATURES
    # ----------------------------------------------------------------------

    soil_moisture = (
        np.array(
            daily_soil_moisture,
            dtype=float
        )
        if daily_soil_moisture is not None
        else np.zeros(n)
    )

    pressure_msl = (
        np.array(
            daily_pressure_msl,
            dtype=float
        )
        if daily_pressure_msl is not None
        else np.zeros(n)
    )

    surface_pressure = (
        np.array(
            daily_surface_pressure,
            dtype=float
        )
        if daily_surface_pressure is not None
        else np.zeros(n)
    )

    wind_gusts = (
        np.array(
            daily_wind_gusts,
            dtype=float
        )
        if daily_wind_gusts is not None
        else np.zeros(n)
    )

    # ----------------------------------------------------------------------
    # ROLLING FUNCTIONS
    # ----------------------------------------------------------------------

    def rolling_sum(arr, w):

        out = np.zeros(n)

        for i in range(n):

            start = max(
                0,
                i - w + 1
            )

            out[i] = arr[
                start:i + 1
            ].sum()

        return out

    def rolling_mean(arr, w):

        out = np.zeros(n)

        for i in range(n):

            start = max(
                0,
                i - w + 1
            )

            out[i] = arr[
                start:i + 1
            ].mean()

        return out

    # ----------------------------------------------------------------------
    # RAINFALL FEATURES
    # ----------------------------------------------------------------------

    rain_3h = rolling_sum(
        rain,
        3
    )

    rain_6h = rolling_sum(
        rain,
        6
    )

    rain_12h = rolling_sum(
        rain,
        12
    )

    rain_24h = rolling_sum(
        rain,
        24
    )

    rain_7d_avg = rolling_mean(
        rain,
        7
    )

    # ----------------------------------------------------------------------
    # API-5D
    # ----------------------------------------------------------------------

    api_5d = np.zeros(n)

    for i in range(1, n):

        api_5d[i] = (
            0.85 * api_5d[i - 1]
            + rain[i]
        )

    # ----------------------------------------------------------------------
    # TYPHOON SIGNAL
    # ----------------------------------------------------------------------

    typhoon_signal = np.array(
        [
            wind_to_signal(w)
            for w in wind
        ],
        dtype=float
    )

    # ----------------------------------------------------------------------
    # ANTECEDENT MOISTURE PROXY
    # ----------------------------------------------------------------------

    api_min = meta[
        "api_5d_min"
    ]

    api_max = meta[
        "api_5d_max"
    ]

    am_min = meta[
        "antecedent_moisture_min"
    ]

    am_max = meta[
        "antecedent_moisture_max"
    ]

    denom = max(
        api_max - api_min,
        1e-6
    )

    antecedent_moisture = (
        am_min
        +
        (
            np.clip(
                api_5d,
                api_min,
                api_max
            )
            - api_min
        )
        / denom
        *
        (
            am_max - am_min
        )
    )

    # ----------------------------------------------------------------------
    # SEASONAL FEATURES
    # ----------------------------------------------------------------------

    month_sin = np.zeros(n)
    month_cos = np.zeros(n)

    for i, d in enumerate(daily_dates):

        try:

            m = datetime.datetime.strptime(
                d,
                "%Y-%m-%d"
            ).month

        except Exception:

            m = datetime.datetime.now().month

        month_sin[i] = math.sin(
            2 * math.pi * m / 12
        )

        month_cos[i] = math.cos(
            2 * math.pi * m / 12
        )

    # ----------------------------------------------------------------------
    # PREVIOUS FLOOD
    # ----------------------------------------------------------------------
    #
    # No live ground-truth flood feed.
    # Therefore default to zero.
    #
    # This remains encoder-only.
    # It is NOT passed into the future decoder.
    # ----------------------------------------------------------------------

    prev_flood = np.zeros(n)

    # ----------------------------------------------------------------------
    # FEATURE MAP
    # ----------------------------------------------------------------------

    feature_map = {

        "rain_3h":
            rain_3h,

        "rain_6h":
            rain_6h,

        "rain_12h":
            rain_12h,

        "rain_24h":
            rain_24h,

        "rain_7d_avg":
            rain_7d_avg,

        "api_5d":
            api_5d,

        "typhoon_signal":
            typhoon_signal,

        "antecedent_moisture":
            antecedent_moisture,

        "month_sin":
            month_sin,

        "month_cos":
            month_cos,

        "prev_flood":
            prev_flood,

        # Humidity aliases
        "humidity":
            humidity,

        "relative_humidity_2m":
            humidity,

        # Wind aliases
        "wind":
            wind,

        "windspeed":
            wind,

        "typhoon_max_wind_kph":
            wind,

        # Enriched Open-Meteo fields
        "soil_moisture_mean":
            soil_moisture,

        "pressure_msl_mean":
            pressure_msl,

        "surface_pressure_mean":
            surface_pressure,

        "wind_gusts_10m_max":
            wind_gusts,
    }

    # ----------------------------------------------------------------------
    # PRESERVE TRAINING FEATURE ORDER
    # ----------------------------------------------------------------------

    ordered_cols = []

    for feat_name in meta[
        "feature_order"
    ]:

        if feat_name in feature_map:

            ordered_cols.append(
                feature_map[feat_name]
            )

        else:

            # Defensive fallback.
            ordered_cols.append(
                np.zeros(n)
            )

    return np.stack(
        ordered_cols,
        axis=1
    )
