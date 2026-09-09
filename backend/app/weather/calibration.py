"""
Bias-correct Open-Meteo weather data against PAGASA's Pili AWS station.

WHAT THIS DOES:
Every time app.weather.client.fetch_weather() performs a genuine live
Open-Meteo call, it also asks this module to record a "sample": the
Open-Meteo values for right now, paired with whatever PAGASA's Pili AWS
was reading at (about) the same moment. Those samples accumulate over
time (bounded to CALIBRATION_MAX_SAMPLES, persisted so they survive a
restart). From them we compute a rolling per-field bias: the median
difference between what PAGASA measured and what Open-Meteo said, for
each field both sources report. That bias is then added to every
Open-Meteo value of the same field -- current, hourly, and daily alike
-- before the data is cached and handed to feature engineering / the
model.

PRECIPITATION (opt-in, off by default -- see PAGASA_CALIBRATE_PRECIPITATION
in app.config.settings):
Open-Meteo's precipitation is an hourly accumulation; PAGASA's AWS reports
an instantaneous mm/hr rate. They aren't quite the same quantity, and
precipitation is the single most safety-critical input to a flood model,
so this correction is disabled unless explicitly turned on. When enabled,
it uses its own (higher) minimum-sample threshold
(CALIBRATION_MIN_SAMPLES_PRECIPITATION), caps the applied correction's
magnitude (PRECIPITATION_BIAS_CAP_MM) so a handful of noisy samples can't
swing it unboundedly, floors the corrected value at 0, and only touches
"current"/"hourly" precipitation -- never "daily" precipitation_sum,
since that's a 24-hour SUM and additively applying an hourly-rate-scale
bias to it would misapply the unit rather than correct it. The rainfall
bias is always tracked and exposed via get_calibration_status() for
visibility, regardless of whether it's actually being applied.

WHAT THIS DELIBERATELY DOES NOT DO:
- It does not correct soil_moisture or wind_gusts -- PAGASA's public AWS
  table doesn't report either, so there is nothing to calibrate against.
- It never invents a bias before the relevant minimum-sample threshold
  has been met -- until then, Open-Meteo values pass through unmodified.
"""

import copy
import statistics
import time

from app.config.settings import (
    PAGASA_CALIBRATION_ENABLED,
    CALIBRATION_MAX_SAMPLES,
    CALIBRATION_MIN_SAMPLES,
    PAGASA_CALIBRATE_PRECIPITATION,
    CALIBRATION_MIN_SAMPLES_PRECIPITATION,
    PRECIPITATION_BIAS_CAP_MM,
    PAGASA_STATION_ID,
    PAGASA_STATION_NAME,
)
from app.weather.pagasa_client import fetch_pagasa_station, PagasaUnavailableError
from app.weather.supabase_store import kv_get, kv_set

CALIBRATION_SAMPLES_KEY = "pagasa_calibration_samples"

# Open-Meteo field -> PAGASA field, for the variables both sources report
# and that are safe to additively bias-correct with the general
# CALIBRATION_MIN_SAMPLES threshold. Precipitation is handled separately
# (see PAGASA_CALIBRATE_PRECIPITATION) since it needs its own threshold,
# a bias magnitude cap, and a non-negative floor.
_FIELD_MAP = {
    "relative_humidity_2m": "humidity_pct",
    "wind_speed_10m": "wind_speed_kph",
    "surface_pressure": "pressure_hpa",
}

# Physically sane bounds each corrected field is clamped to, so a bad
# bias estimate (e.g. computed from too few / noisy samples) can't push
# a value somewhere nonsensical.
_CLAMPS = {
    "relative_humidity_2m": (0.0, 100.0),
    "wind_speed_10m": (0.0, None),
    "surface_pressure": (800.0, 1100.0),
    "pressure_msl": (800.0, 1100.0),
    "temperature_2m": (-10.0, 55.0),
    "precipitation": (0.0, None),
}


_calibration_samples = []
_samples_loaded_from_disk = False


def _clamp(field, value):
    bounds = _CLAMPS.get(field)
    if bounds is None or value is None:
        return value
    lo, hi = bounds
    if lo is not None:
        value = max(lo, value)
    if hi is not None:
        value = min(hi, value)
    return value


def _persist_samples():
    kv_set(CALIBRATION_SAMPLES_KEY, _calibration_samples)


def _load_samples_from_disk():
    global _calibration_samples, _samples_loaded_from_disk

    if _samples_loaded_from_disk:
        return

    _samples_loaded_from_disk = True

    stored = kv_get(CALIBRATION_SAMPLES_KEY)

    if stored:
        _calibration_samples = stored
        print(
            f"🟡 Loaded {len(_calibration_samples)} persisted PAGASA "
            "calibration samples from Supabase."
        )


def record_sample(open_meteo_data):
    """
    Attempts to pair the just-fetched Open-Meteo response with a fresh
    PAGASA reading and store the sample. Best-effort: any failure (PAGASA
    page unreachable, station row stale/missing, etc.) is swallowed --
    calibration simply doesn't gain a sample this cycle, and Open-Meteo
    keeps serving requests exactly as before.
    """

    if not PAGASA_CALIBRATION_ENABLED:
        return

    _load_samples_from_disk()

    try:
        pagasa = fetch_pagasa_station(PAGASA_STATION_ID)
    except PagasaUnavailableError as err:
        print(f"⚠️ Skipping PAGASA calibration sample: {err}")
        return

    current = open_meteo_data.get("current", {}) or {}

    # Pair PAGASA's temperature against the Open-Meteo hourly temperature
    # for the current hour, since Open-Meteo's "current" block doesn't
    # include a raw temperature_2m field (only apparent_temperature).
    open_meteo_temp = _current_hour_value(open_meteo_data, "temperature_2m")

    sample = {
        "recorded_at": time.time(),
        "open_meteo": {
            "temperature_2m": open_meteo_temp,
            "relative_humidity_2m": current.get("relative_humidity_2m"),
            "wind_speed_10m": current.get("wind_speed_10m"),
            "surface_pressure": current.get("surface_pressure"),
            "precipitation": current.get("precipitation"),
        },
        "pagasa": {
            "temperature_2m": pagasa["temperature_c"],
            "relative_humidity_2m": pagasa["humidity_pct"],
            "wind_speed_10m": pagasa["wind_speed_kph"],
            "surface_pressure": pagasa["pressure_hpa"],
            "precipitation": pagasa["precipitation_mm_hr"],
        },
        "pagasa_station_id": pagasa["station_id"],
        "pagasa_observed_at": pagasa["observed_at"],
        "pagasa_age_minutes": pagasa["age_minutes"],
    }

    _calibration_samples.append(sample)

    del _calibration_samples[:-CALIBRATION_MAX_SAMPLES]

    _persist_samples()

    print(
        f"🟢 Recorded PAGASA calibration sample "
        f"({len(_calibration_samples)} total)."
    )


def _current_hour_value(data, hourly_field):
    """
    Looks up the hourly array value whose timestamp matches
    data['current']['time'] (to the hour), or None.
    """

    current_time = data.get("current", {}).get("time", "")
    if not current_time:
        return None

    prefix = current_time[:13]

    hourly_time = data.get("hourly", {}).get("time", [])
    hourly_vals = data.get("hourly", {}).get(hourly_field, [])

    for t, v in zip(hourly_time, hourly_vals):
        if t.startswith(prefix):
            return v

    return None


def _compute_biases():
    """
    Returns {field: median(pagasa - open_meteo)} for every field in
    _FIELD_MAP plus temperature_2m and precipitation, using whatever
    samples have both sides present.

    Each field has its own minimum-sample threshold before its bias is
    considered trustworthy enough to include: CALIBRATION_MIN_SAMPLES for
    everything except precipitation, which uses the stricter
    CALIBRATION_MIN_SAMPLES_PRECIPITATION (see module docstring for why
    precipitation needs more evidence before being trusted). Fields below
    their threshold are omitted here entirely -- "no correction yet".

    Precipitation's bias is computed/reported for diagnostics regardless
    of whether PAGASA_CALIBRATE_PRECIPITATION is on -- get_calibration_status()
    and apply_calibration() are what actually decide whether it's applied.
    """

    fields = list(_FIELD_MAP.keys()) + ["temperature_2m", "precipitation"]

    biases = {}
    sample_counts = {}

    for field in fields:
        diffs = []
        for sample in _calibration_samples:
            om = sample["open_meteo"].get(field)
            pg = sample["pagasa"].get(field)
            if om is None or pg is None:
                continue
            diffs.append(pg - om)

        sample_counts[field] = len(diffs)

        min_required = (
            CALIBRATION_MIN_SAMPLES_PRECIPITATION
            if field == "precipitation"
            else CALIBRATION_MIN_SAMPLES
        )

        if len(diffs) >= min_required:
            biases[field] = statistics.median(diffs)

    return biases, sample_counts


def _capped_precipitation_bias(biases):
    """
    Returns the precipitation bias clamped to +/-PRECIPITATION_BIAS_CAP_MM,
    or None if no precipitation bias has met its sample threshold yet.

    This caps the CORRECTION itself, separately from _clamp()'s floor on
    the resulting value -- so a noisy median from rate-vs-accumulation
    sample pairs can't swing rainfall input by an unbounded amount even
    once it technically has "enough" samples.
    """

    raw = biases.get("precipitation")
    if raw is None:
        return None
    return max(-PRECIPITATION_BIAS_CAP_MM, min(PRECIPITATION_BIAS_CAP_MM, raw))


def get_calibration_status():
    """
    Diagnostic snapshot: how many samples we have, what bias (if any) is
    currently being applied per field, and whether correction is active
    yet. Used by /api/calibration and safe to call at any time.
    """

    _load_samples_from_disk()

    biases, sample_counts = _compute_biases()

    applied_fields = list(_FIELD_MAP.keys()) + ["temperature_2m"]
    if PAGASA_CALIBRATE_PRECIPITATION:
        applied_fields.append("precipitation")

    capped_precip_bias = _capped_precipitation_bias(biases)

    def _bias_for_display(field):
        if field == "precipitation":
            return capped_precip_bias
        return biases.get(field)

    return {
        "enabled": PAGASA_CALIBRATION_ENABLED,
        "precipitation_calibration_enabled": PAGASA_CALIBRATE_PRECIPITATION,
        "reference_station": {
            "id": PAGASA_STATION_ID,
            "name": PAGASA_STATION_NAME,
        },
        "total_samples": len(_calibration_samples),
        "min_samples_required": CALIBRATION_MIN_SAMPLES,
        "min_samples_required_precipitation": CALIBRATION_MIN_SAMPLES_PRECIPITATION,
        "max_samples_kept": CALIBRATION_MAX_SAMPLES,
        "per_field": {
            field: {
                "samples": sample_counts.get(field, 0),
                "bias": _bias_for_display(field),
                "applied": field in applied_fields and field in biases,
                "unit": (
                    "hPa" if "pressure" in field
                    else "°C" if field == "temperature_2m"
                    else "%" if field == "relative_humidity_2m"
                    else "km/h" if field == "wind_speed_10m"
                    else (
                        "mm (applied)" if field == "precipitation" and PAGASA_CALIBRATE_PRECIPITATION
                        else "mm (rate, not applied -- see notes)"
                    )
                ),
            }
            for field in sample_counts
        },
        "notes": (
            (
                "Precipitation bias is applied (capped at "
                f"±{PRECIPITATION_BIAS_CAP_MM}mm, floored at 0, current/hourly "
                "only -- daily precipitation_sum is never corrected). "
                if PAGASA_CALIBRATE_PRECIPITATION
                else "Precipitation bias is measured but not applied "
                "(PAGASA_CALIBRATE_PRECIPITATION is off). "
            )
            + "See app.weather.calibration module docstring. Corrections "
            f"activate per-field once that field has at least "
            f"{CALIBRATION_MIN_SAMPLES} paired samples "
            f"({CALIBRATION_MIN_SAMPLES_PRECIPITATION} for precipitation)."
        ),
        "last_sample": _calibration_samples[-1] if _calibration_samples else None,
    }


def apply_calibration(open_meteo_data):
    """
    Returns a deep copy of open_meteo_data with PAGASA-derived bias
    corrections applied to current/hourly/daily fields, wherever a
    field's bias has enough samples behind it (see CALIBRATION_MIN_SAMPLES
    / CALIBRATION_MIN_SAMPLES_PRECIPITATION).

    Safe to call unconditionally: with zero samples (or the feature
    disabled), this returns the input unchanged aside from the copy.
    """

    if not PAGASA_CALIBRATION_ENABLED:
        return open_meteo_data

    _load_samples_from_disk()

    biases, _ = _compute_biases()

    precip_bias = (
        _capped_precipitation_bias(biases)
        if PAGASA_CALIBRATE_PRECIPITATION
        else None
    )

    active_fields = list(_FIELD_MAP.keys()) + ["temperature_2m"]

    # Nothing meets the sample threshold yet -- pass through untouched.
    if not any(field in biases for field in active_fields) and precip_bias is None:
        return open_meteo_data

    data = copy.deepcopy(open_meteo_data)

    current = data.get("current", {})
    hourly = data.get("hourly", {})
    daily = data.get("daily", {})

    # --- current --------------------------------------------------------
    for om_field in _FIELD_MAP:
        if om_field in current and om_field in biases:
            current[om_field] = _clamp(
                om_field, current[om_field] + biases[om_field]
            )

    if "pressure_msl" in current and "surface_pressure" in biases:
        # PAGASA reports one station-level pressure reading; apply the
        # same offset to Open-Meteo's sea-level-reduced field since we
        # don't have an independent MSL ground truth to bias against.
        current["pressure_msl"] = _clamp(
            "pressure_msl", current["pressure_msl"] + biases["surface_pressure"]
        )

    if precip_bias is not None and "precipitation" in current and current["precipitation"] is not None:
        current["precipitation"] = _clamp(
            "precipitation", current["precipitation"] + precip_bias
        )

    # --- hourly -----------------------------------------------------------
    for om_field in _FIELD_MAP:
        if om_field in hourly and om_field in biases:
            hourly[om_field] = [
                _clamp(om_field, v + biases[om_field]) if v is not None else None
                for v in hourly[om_field]
            ]

    if "pressure_msl" in hourly and "surface_pressure" in biases:
        hourly["pressure_msl"] = [
            _clamp("pressure_msl", v + biases["surface_pressure"]) if v is not None else None
            for v in hourly["pressure_msl"]
        ]

    if "temperature_2m" in hourly and "temperature_2m" in biases:
        hourly["temperature_2m"] = [
            _clamp("temperature_2m", v + biases["temperature_2m"]) if v is not None else None
            for v in hourly["temperature_2m"]
        ]

    if precip_bias is not None and "precipitation" in hourly:
        # Daily precipitation_sum is intentionally NOT corrected here --
        # see module docstring: it's a 24-hour SUM, and additively
        # applying an hourly-rate-scale bias to it would misapply the
        # unit rather than correct it.
        hourly["precipitation"] = [
            _clamp("precipitation", v + precip_bias) if v is not None else None
            for v in hourly["precipitation"]
        ]

    # --- daily --------------------------------------------------------
    if "wind_speed_10m_max" in daily and "wind_speed_10m" in biases:
        daily["wind_speed_10m_max"] = [
            _clamp("wind_speed_10m", v + biases["wind_speed_10m"]) if v is not None else None
            for v in daily["wind_speed_10m_max"]
        ]

    if "pressure_msl_mean" in daily and "surface_pressure" in biases:
        daily["pressure_msl_mean"] = [
            _clamp("pressure_msl", v + biases["surface_pressure"]) if v is not None else None
            for v in daily["pressure_msl_mean"]
        ]

    if "surface_pressure_mean" in daily and "surface_pressure" in biases:
        daily["surface_pressure_mean"] = [
            _clamp("surface_pressure", v + biases["surface_pressure"]) if v is not None else None
            for v in daily["surface_pressure_mean"]
        ]

    if "temperature_2m_max" in daily and "temperature_2m" in biases:
        daily["temperature_2m_max"] = [
            _clamp("temperature_2m", v + biases["temperature_2m"]) if v is not None else None
            for v in daily["temperature_2m_max"]
        ]

    applied_biases = dict(biases)
    if precip_bias is not None:
        applied_biases["precipitation"] = precip_bias
    elif "precipitation" in applied_biases:
        # Keep the diagnostic-only precipitation bias out of the
        # "what was actually applied" block when it wasn't applied.
        del applied_biases["precipitation"]

    data["_pagasa_calibration"] = {
        "applied": True,
        "reference_station": PAGASA_STATION_NAME,
        "biases_applied": applied_biases,
        "sample_count": len(_calibration_samples),
    }

    return data
