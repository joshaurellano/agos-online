"""
Builds the two model input tensors (encoder "past" window + decoder
"future" window) from a single Open-Meteo response.

    past_window:   window_size x n_features    (encoder input)
    future_window: horizon x n_future_features  (decoder input, driven
                    by Open-Meteo's actual forecast rather than a blind
                    extrapolation of past patterns)

IMPORTANT: feature engineering is performed across the complete
past+future timeline before slicing, preserving the original
API-5D/antecedent-moisture behavior.

This module needs the fitted `scaler` (StandardScaler) that the caller
already loaded via app.models.registry -- it's passed in explicitly
rather than imported as a global, since every algorithm in the
registry shares the same scaler/feature contract.
"""

import datetime

import numpy as np

from app.weather.client import fetch_weather
from app.features.aggregation import hourly_to_daily_mean
from app.features.engineering import engineer_daily_features


def build_prediction_windows(meta, scaler):
    """
    Builds BOTH model inputs from ONE Open-Meteo response.

        past_window:
            window_size × n_features

        future_window:
            horizon × n_future_features

    The future decoder features come from Open-Meteo's actual forecast.

    IMPORTANT:
    Feature engineering is performed across the complete past+future
    timeline before slicing, preserving the existing API-5D behavior.
    """

    # ----------------------------------------------------------------------
    # ONE WEATHER FETCH
    # ----------------------------------------------------------------------

    data = fetch_weather()

    daily_time = data.get(
        "daily",
        {}
    ).get(
        "time",
        []
    )

    d_precip = data.get(
        "daily",
        {}
    ).get(
        "precipitation_sum",
        []
    )

    d_wind = data.get(
        "daily",
        {}
    ).get(
        "wind_speed_10m_max",
        []
    )

    d_pressure_msl = data.get(
        "daily",
        {}
    ).get(
        "pressure_msl_mean",
        []
    )

    d_surface_pressure = data.get(
        "daily",
        {}
    ).get(
        "surface_pressure_mean",
        []
    )

    d_wind_gusts = data.get(
        "daily",
        {}
    ).get(
        "wind_gusts_10m_max",
        []
    )

    # ----------------------------------------------------------------------
    # HOURLY
    # ----------------------------------------------------------------------

    h_time = data.get(
        "hourly",
        {}
    ).get(
        "time",
        []
    )

    h_hum = data.get(
        "hourly",
        {}
    ).get(
        "relative_humidity_2m",
        []
    )

    h_soil = data.get(
        "hourly",
        {}
    ).get(
        "soil_moisture_0_to_1cm",
        []
    )

    daily_humidity = hourly_to_daily_mean(
        h_hum,
        h_time,
        daily_time,
        default=80.0
    )

    daily_soil_moisture = hourly_to_daily_mean(
        h_soil,
        h_time,
        daily_time,
        default=0.0
    )

    # ----------------------------------------------------------------------
    # TODAY FROM OPEN-METEO
    # ----------------------------------------------------------------------
    #
    # Uses Open-Meteo's own timezone-aware current timestamp.
    # ----------------------------------------------------------------------

    current_time = data.get(
        "current",
        {}
    ).get(
        "time",
        ""
    )

    today_str = (
        current_time[:10]
        if current_time
        else datetime.date.today().isoformat()
    )

    n_all = len(daily_time)

    # ----------------------------------------------------------------------
    # SAFE DAILY VALUE
    # ----------------------------------------------------------------------

    def _daily(arr, i, default):

        v = (
            arr[i]
            if i < len(arr)
            else None
        )

        if v is None:
            return default

        return float(v)

    # ----------------------------------------------------------------------
    # DAILY ARRAYS
    # ----------------------------------------------------------------------

    rain = [
        _daily(
            d_precip,
            i,
            0.0
        )
        for i in range(n_all)
    ]

    wind = [
        _daily(
            d_wind,
            i,
            0.0
        )
        for i in range(n_all)
    ]

    hum = [
        daily_humidity[i]
        if i < len(daily_humidity)
        else 80.0
        for i in range(n_all)
    ]

    pressure_msl_arr = [
        _daily(
            d_pressure_msl,
            i,
            0.0
        )
        for i in range(n_all)
    ]

    surface_pressure_arr = [
        _daily(
            d_surface_pressure,
            i,
            0.0
        )
        for i in range(n_all)
    ]

    wind_gusts_arr = [
        _daily(
            d_wind_gusts,
            i,
            0.0
        )
        for i in range(n_all)
    ]

    soil_moisture_arr = [
        daily_soil_moisture[i]
        if i < len(daily_soil_moisture)
        else 0.0
        for i in range(n_all)
    ]

    # ----------------------------------------------------------------------
    # ENGINEER ALL FEATURES
    # ----------------------------------------------------------------------

    feat_matrix = engineer_daily_features(
        daily_time,
        rain,
        hum,
        wind,
        meta,
        daily_soil_moisture=soil_moisture_arr,
        daily_pressure_msl=pressure_msl_arr,
        daily_surface_pressure=surface_pressure_arr,
        daily_wind_gusts=wind_gusts_arr,
    )

    # ----------------------------------------------------------------------
    # SCALE USING TRAINING SCALER
    # ----------------------------------------------------------------------

    feat_scaled = scaler.transform(
        feat_matrix
    )

    # ----------------------------------------------------------------------
    # IDENTIFY PAST/FUTURE POSITIONS
    # ----------------------------------------------------------------------

    past_positions = [
        i
        for i, d in enumerate(daily_time)
        if d <= today_str
    ]

    future_positions = [
        i
        for i, d in enumerate(daily_time)
        if d > today_str
    ]

    window = meta[
        "window_size"
    ]

    horizon = meta[
        "horizon"
    ]

    future_col_idx = [
        meta[
            "feature_order"
        ].index(f)
        for f in meta[
            "future_feature_order"
        ]
    ]

    # ======================================================================
    # PAST / ENCODER BLOCK
    # ======================================================================

    if len(past_positions) >= window:

        past_block = feat_scaled[
            past_positions[-window:]
        ]

        past_dates = [
            daily_time[i]
            for i in past_positions[-window:]
        ]

    else:

        have = (
            feat_scaled[past_positions]
            if past_positions
            else np.zeros(
                (
                    0,
                    feat_scaled.shape[1]
                )
            )
        )

        pad = np.zeros(
            (
                window - len(past_positions),
                feat_scaled.shape[1]
            )
        )

        past_block = np.vstack(
            [
                pad,
                have
            ]
        )

        past_dates = (
            [None] *
            (
                window
                -
                len(past_positions)
            )
            +
            [
                daily_time[i]
                for i in past_positions
            ]
        )

    # ======================================================================
    # FUTURE / DECODER BLOCK
    # ======================================================================

    future_idx = future_positions[
        :horizon
    ]

    if len(future_idx) >= horizon:

        future_block = (
            feat_scaled[
                future_idx
            ][:, future_col_idx]
        )

        future_dates = [
            daily_time[i]
            for i in future_idx
        ]

    else:

        have = (
            feat_scaled[
                future_idx
            ][:, future_col_idx]
            if future_idx
            else
            np.zeros(
                (
                    0,
                    len(future_col_idx)
                )
            )
        )

        pad = np.zeros(
            (
                horizon - len(future_idx),
                len(future_col_idx)
            )
        )

        future_block = np.vstack(
            [
                have,
                pad
            ]
        )

        future_dates = (
            [
                daily_time[i]
                for i in future_idx
            ]
            +
            [
                None
            ] *
            (
                horizon
                -
                len(future_idx)
            )
        )

    # ======================================================================
    # RAW FORECAST VALUES FOR API RESPONSE
    # ======================================================================

    future_enriched = []

    for idx in future_idx:

        future_enriched.append({

            "rainfall_mm":
                round(
                    rain[idx],
                    2
                ),

            "wind_speed_max_kph":
                round(
                    wind[idx],
                    2
                ),

            "soil_moisture_vwc":
                round(
                    soil_moisture_arr[idx],
                    4
                ),

            "pressure_msl_hpa":
                round(
                    pressure_msl_arr[idx],
                    2
                ),

            "surface_pressure_hpa":
                round(
                    surface_pressure_arr[idx],
                    2
                ),

            "wind_gusts_kph":
                round(
                    wind_gusts_arr[idx],
                    2
                ),
        })

    while len(future_enriched) < horizon:

        future_enriched.append({

            "rainfall_mm":
                None,

            "wind_speed_max_kph":
                None,

            "soil_moisture_vwc":
                None,

            "pressure_msl_hpa":
                None,

            "surface_pressure_hpa":
                None,

            "wind_gusts_kph":
                None,
        })

    return (
        past_block,
        future_block,
        past_dates,
        future_dates,
        future_enriched
    )
