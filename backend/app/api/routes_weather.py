"""
General 48h-hourly + 14-day-daily weather endpoint. Uses the SAME
cached Open-Meteo response as the flood-forecast endpoints (see
app.weather.client.fetch_weather), so calling this alongside a flood
forecast doesn't cost an extra Open-Meteo request.
"""

import datetime

from fastapi import APIRouter

from app.weather.client import fetch_weather, WeatherUnavailableError
from app.weather.cache import get_cache_status
from app.features.aggregation import hourly_to_daily_mean, get_live_metrics
from app.utils.alerts import wmo_label, wind_to_signal

router = APIRouter()


@router.get("/api/forecast")
def get_forecast():

    try:

        # ------------------------------------------------------------------
        # ONE CACHED WEATHER FETCH
        # ------------------------------------------------------------------

        data = fetch_weather()

        # ------------------------------------------------------------------
        # HOURLY DATA
        # ------------------------------------------------------------------

        hourly_time = data.get(
            "hourly",
            {}
        ).get(
            "time",
            []
        )

        h_precip = data.get(
            "hourly",
            {}
        ).get(
            "precipitation",
            []
        )

        h_precip_prob = data.get(
            "hourly",
            {}
        ).get(
            "precipitation_probability",
            []
        )

        h_apparent_temp = data.get(
            "hourly",
            {}
        ).get(
            "apparent_temperature",
            []
        )

        h_is_day = data.get(
            "hourly",
            {}
        ).get(
            "is_day",
            []
        )

        h_visibility = data.get(
            "hourly",
            {}
        ).get(
            "visibility",
            []
        )

        h_uv_index = data.get(
            "hourly",
            {}
        ).get(
            "uv_index",
            []
        )

        h_dew_point = data.get(
            "hourly",
            {}
        ).get(
            "dew_point_2m",
            []
        )

        h_humidity = data.get(
            "hourly",
            {}
        ).get(
            "relative_humidity_2m",
            []
        )

        h_wind = data.get(
            "hourly",
            {}
        ).get(
            "wind_speed_10m",
            []
        )

        h_temp = data.get(
            "hourly",
            {}
        ).get(
            "temperature_2m",
            []
        )

        h_wmo = data.get(
            "hourly",
            {}
        ).get(
            "weathercode",
            []
        )

        h_soil = data.get(
            "hourly",
            {}
        ).get(
            "soil_moisture_0_to_1cm",
            []
        )

        h_pressure_msl = data.get(
            "hourly",
            {}
        ).get(
            "pressure_msl",
            []
        )

        h_surface_pressure = data.get(
            "hourly",
            {}
        ).get(
            "surface_pressure",
            []
        )

        h_wind_gusts = data.get(
            "hourly",
            {}
        ).get(
            "wind_gusts_10m",
            []
        )

        current_time = data.get(
            "current",
            {}
        ).get(
            "time",
            ""
        )

        # ------------------------------------------------------------------
        # FIND CURRENT HOUR
        # ------------------------------------------------------------------

        start_idx = 0

        if current_time:

            prefix = current_time[:13]

            try:

                start_idx = next(
                    i
                    for i, t in enumerate(hourly_time)
                    if t.startswith(prefix)
                )

            except StopIteration:

                start_idx = 0

        # ------------------------------------------------------------------
        # MINUTELY (15-MIN STEPS) DATA
        # ------------------------------------------------------------------

        minutely_time = data.get(
            "minutely_15",
            {}
        ).get(
            "time",
            []
        )

        m_precip = data.get(
            "minutely_15",
            {}
        ).get(
            "precipitation",
            []
        )

        # First 15-min interval that covers "now" -- ISO8601 strings sort
        # lexicographically the same as chronologically, so a plain string
        # comparison against current_time (minute precision) works here.
        start_idx_m = 0

        if current_time:

            try:

                start_idx_m = next(
                    i
                    for i, t in enumerate(minutely_time)
                    if t >= current_time
                )

            except StopIteration:

                start_idx_m = 0

        # ------------------------------------------------------------------
        # SAFE VALUE
        # ------------------------------------------------------------------

        def _safe_val(
            arr,
            i,
            ndigits=None,
            default=None
        ):

            v = (
                arr[i]
                if i < len(arr)
                else None
            )

            if v is None:
                return default

            if ndigits is not None:
                return round(
                    v,
                    ndigits
                )

            return v

        # ------------------------------------------------------------------
        # MINUTELY OUTPUT
        # ------------------------------------------------------------------
        # Each entry is a 15-minute step. precipitation_mm is Open-Meteo's
        # raw accumulated total for that 15-minute window; rate_mmhr is the
        # same amount expressed as an hourly rate (x4) so the frontend can
        # feed it straight into the same PAGASA hourly thresholds already
        # used for the current/hourly rainfall badges, without a second set
        # of 15-minute-specific thresholds to keep in sync.

        minutely_out = []

        for i in range(
            start_idx_m,
            min(
                start_idx_m + 8,
                len(minutely_time)
            )
        ):

            precip_15 = _safe_val(
                m_precip,
                i,
                2,
                0.0
            ) or 0.0

            minutely_out.append({

                "time":
                    minutely_time[i],

                "precipitation_mm":
                    precip_15,

                "precipitation_rate_mmhr":
                    round(
                        precip_15 * 4,
                        2
                    ),
            })

        # ------------------------------------------------------------------
        # HOURLY OUTPUT
        # ------------------------------------------------------------------

        hourly_out = []

        for i in range(
            start_idx,
            min(
                start_idx + 48,
                len(hourly_time)
            )
        ):

            wind_val = _safe_val(
                h_wind,
                i,
                default=0
            )

            hourly_out.append({

                "time":
                    hourly_time[i],

                "precipitation":
                    _safe_val(
                        h_precip,
                        i,
                        2,
                        0.0
                    ),

                "rain_probability_pct":
                    _safe_val(
                        h_precip_prob,
                        i,
                        default=None
                    ),

                "humidity":
                    _safe_val(
                        h_humidity,
                        i,
                        1,
                        None
                    ),

                "wind_speed_kph":
                    _safe_val(
                        h_wind,
                        i,
                        1,
                        None
                    ),

                "temperature_c":
                    _safe_val(
                        h_temp,
                        i,
                        1,
                        None
                    ),

                "feels_like_c":
                    _safe_val(
                        h_apparent_temp,
                        i,
                        1,
                        None
                    ),

                "is_day":
                    bool(
                        _safe_val(
                            h_is_day,
                            i,
                            default=1
                        )
                    ),

                "visibility_km":
                    _safe_val(
                        [
                            (v / 1000.0 if v is not None else None)
                            for v in h_visibility
                        ],
                        i,
                        1,
                        None
                    ),

                "uv_index":
                    _safe_val(
                        h_uv_index,
                        i,
                        1,
                        None
                    ),

                "dew_point_c":
                    _safe_val(
                        h_dew_point,
                        i,
                        1,
                        None
                    ),

                "weathercode":
                    _safe_val(
                        h_wmo,
                        i,
                        default=None
                    ),

                "condition":
                    wmo_label(
                        _safe_val(
                            h_wmo,
                            i,
                            default=None
                        )
                    ),

                "wind_signal":
                    wind_to_signal(
                        wind_val
                    ),

                "soil_moisture_vwc":
                    _safe_val(
                        h_soil,
                        i,
                        4,
                        None
                    ),

                "pressure_msl_hpa":
                    _safe_val(
                        h_pressure_msl,
                        i,
                        1,
                        None
                    ),

                "surface_pressure_hpa":
                    _safe_val(
                        h_surface_pressure,
                        i,
                        1,
                        None
                    ),

                "wind_gusts_kph":
                    _safe_val(
                        h_wind_gusts,
                        i,
                        1,
                        None
                    ),
            })

        # ------------------------------------------------------------------
        # DAILY DATA
        # ------------------------------------------------------------------

        daily_time = data.get(
            "daily",
            {}
        ).get(
            "time",
            []
        )

        d_precip_sum = data.get(
            "daily",
            {}
        ).get(
            "precipitation_sum",
            []
        )

        d_precip_prob = data.get(
            "daily",
            {}
        ).get(
            "precipitation_probability_max",
            []
        )

        d_wmo = data.get(
            "daily",
            {}
        ).get(
            "weathercode",
            []
        )

        d_temp_max = data.get(
            "daily",
            {}
        ).get(
            "temperature_2m_max",
            []
        )

        d_wind_max = data.get(
            "daily",
            {}
        ).get(
            "wind_speed_10m_max",
            []
        )

        d_pressure_msl_mean = data.get(
            "daily",
            {}
        ).get(
            "pressure_msl_mean",
            []
        )

        d_surface_pressure_mean = data.get(
            "daily",
            {}
        ).get(
            "surface_pressure_mean",
            []
        )

        d_wind_gusts_max = data.get(
            "daily",
            {}
        ).get(
            "wind_gusts_10m_max",
            []
        )

        # ------------------------------------------------------------------
        # SOIL MOISTURE DAILY MEAN
        # ------------------------------------------------------------------

        d_soil_moisture_mean = hourly_to_daily_mean(
            h_soil,
            hourly_time,
            daily_time,
            default=None
        )

        # ------------------------------------------------------------------
        # TODAY
        # ------------------------------------------------------------------

        if current_time:

            today_str = current_time[:10]

        else:

            today_str = datetime.date.today().isoformat()

        # Include today and next 13 days.
        future_idx = [
            i
            for i, d in enumerate(daily_time)
            if d >= today_str
        ]

        daily_out = []

        for i in future_idx[:14]:

            wind_max_val = _safe_val(
                d_wind_max,
                i,
                default=0
            )

            soil_val = (
                d_soil_moisture_mean[i]
                if i < len(
                    d_soil_moisture_mean
                )
                else None
            )

            daily_out.append({

                "date":
                    daily_time[i],

                "precipitation_sum_mm":
                    _safe_val(
                        d_precip_sum,
                        i,
                        1,
                        0.0
                    ),

                "rain_probability_pct":
                    _safe_val(
                        d_precip_prob,
                        i,
                        default=None
                    ),

                "temperature_max_c":
                    _safe_val(
                        d_temp_max,
                        i,
                        1,
                        None
                    ),

                "wind_speed_max_kph":
                    round(
                        wind_max_val,
                        1
                    ),

                "wind_signal":
                    wind_to_signal(
                        wind_max_val
                    ),

                "weathercode":
                    _safe_val(
                        d_wmo,
                        i,
                        default=None
                    ),

                "condition":
                    wmo_label(
                        _safe_val(
                            d_wmo,
                            i,
                            default=None
                        )
                    ),

                "soil_moisture_vwc":
                    (
                        round(
                            soil_val,
                            4
                        )
                        if soil_val is not None
                        else None
                    ),

                "pressure_msl_hpa":
                    _safe_val(
                        d_pressure_msl_mean,
                        i,
                        1,
                        None
                    ),

                "surface_pressure_hpa":
                    _safe_val(
                        d_surface_pressure_mean,
                        i,
                        1,
                        None
                    ),

                "wind_gusts_max_kph":
                    _safe_val(
                        d_wind_gusts_max,
                        i,
                        1,
                        None
                    ),
            })

        # ------------------------------------------------------------------
        # RAINFALL OUTLOOK
        # ------------------------------------------------------------------

        next_6h_rain = sum(
            e["precipitation"] or 0.0
            for e in hourly_out[:6]
        )

        next_12h_rain = sum(
            e["precipitation"] or 0.0
            for e in hourly_out[:12]
        )

        next_24h_rain = sum(
            e["precipitation"] or 0.0
            for e in hourly_out[:24]
        )

        def _max_prob(entries):
            probs = [
                e["rain_probability_pct"]
                for e in entries
                if e["rain_probability_pct"] is not None
            ]
            return max(probs) if probs else None

        next_6h_rain_probability_pct = _max_prob(hourly_out[:6])
        next_12h_rain_probability_pct = _max_prob(hourly_out[:12])
        next_24h_rain_probability_pct = _max_prob(hourly_out[:24])

        # ------------------------------------------------------------------
        # RETURN
        # ------------------------------------------------------------------

        return {

            "status":
                "success",

            "location":
                "Barangay Triangulo, Naga City",

            "generated_at":
                current_time,

            "weather_cache":
                get_cache_status(),

            "outlook": {

                "next_6h_rain_mm":
                    round(
                        next_6h_rain,
                        2
                    ),

                "next_6h_rain_probability_pct":
                    next_6h_rain_probability_pct,

                "next_12h_rain_mm":
                    round(
                        next_12h_rain,
                        2
                    ),

                "next_12h_rain_probability_pct":
                    next_12h_rain_probability_pct,

                "next_24h_rain_mm":
                    round(
                        next_24h_rain,
                        2
                    ),

                "next_24h_rain_probability_pct":
                    next_24h_rain_probability_pct,
            },

            "live_metrics":
                get_live_metrics(
                    data
                ),

            "minutely":
                minutely_out,

            "hourly":
                hourly_out,

            "daily":
                daily_out,
        }

    except WeatherUnavailableError as err:

        # --------------------------------------------------------------
        # OPEN-METEO UNREACHABLE AND NO FALLBACK DATA EXISTS
        # --------------------------------------------------------------

        return {

            "status":
                "error",

            "error_type":
                "weather_unavailable",

            "message":
                f"Hindi makuha ang weather forecast: {err}",

            "weather_cache":
                get_cache_status(),

            "minutely":
                [],

            "hourly":
                [],

            "daily":
                [],
        }

    except Exception as err:

        return {

            "status":
                "error",

            "message":
                f"Hindi makuha ang forecast data: {str(err)}",

            "weather_cache":
                get_cache_status(),

            "minutely":
                [],

            "hourly":
                [],

            "daily":
                [],
        }
