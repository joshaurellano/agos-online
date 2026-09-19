"""
Small pure-ish helpers for turning a raw Open-Meteo response into
daily-aggregated values and the "live_metrics" block used by the API.
"""

import numpy as np

from app.utils.alerts import wind_to_signal

def hourly_to_daily_mean(
    hourly_vals,
    hourly_time,
    target_dates,
    default=None
):
    """
    Aggregates an hourly Open-Meteo array into a daily mean.

    Null values are ignored.
    """

    out = []

    for d in target_dates:

        vals = [
            v
            for t, v in zip(hourly_time, hourly_vals)
            if t.startswith(d) and v is not None
        ]

        if vals:
            out.append(float(np.mean(vals)))
        else:
            out.append(default)

    return out


def get_current_soil_moisture(data):
    """
    Open-Meteo does not provide a current soil-moisture variable.

    Therefore, use the hourly soil-moisture reading corresponding to
    current.time.
    """

    current_time = data.get(
        "current",
        {}
    ).get(
        "time",
        ""
    )

    if not current_time:
        return None

    prefix = current_time[:13]

    h_time = data.get(
        "hourly",
        {}
    ).get(
        "time",
        []
    )

    h_soil = data.get(
        "hourly",
        {}
    ).get(
        "soil_moisture_0_to_1cm",
        []
    )

    for t, v in zip(h_time, h_soil):

        if t.startswith(prefix) and v is not None:
            return float(v)

    return None


def get_live_metrics(data):

    current = data.get(
        "current",
        {}
    )

    wind_kph = current.get(
        "wind_speed_10m",
        0.0
    )

    return {

        "rainfall_mm":
            current.get(
                "precipitation",
                0.0
            ),

        "humidity":
            current.get(
                "relative_humidity_2m",
                None
            ),

        "wind_signal":
            wind_to_signal(wind_kph),

        "max_wind_kph":
            wind_kph,

        "pressure_msl_hpa":
            current.get(
                "pressure_msl",
                None
            ),

        "surface_pressure_hpa":
            current.get(
                "surface_pressure",
                None
            ),

        "wind_gusts_kph":
            current.get(
                "wind_gusts_10m",
                None
            ),

        "soil_moisture_vwc":
            get_current_soil_moisture(data),

        "feels_like_c":
            current.get(
                "apparent_temperature",
                None
            ),

        "is_day":
            bool(
                current.get(
                    "is_day",
                    1
                )
            ),
    }
