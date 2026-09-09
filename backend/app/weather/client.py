"""
Open-Meteo client.

Two entry points, used by two different callers, on purpose:

    fetch_weather()
        Called by every user-facing endpoint (/api/forecast,
        /api/forecast-flood/*, /api/predict-flood, etc). This NEVER
        contacts Open-Meteo. It only ever reads the last snapshot --
        first from a short-lived in-process cache, falling back to the
        Supabase-persisted snapshot (app.weather.persistence) when the
        in-process cache is empty or stale. This is what makes
        Open-Meteo request volume completely independent of how much
        (or how little) the app is used, and independent of Render
        free-tier cold starts.

    refresh_weather_from_openmeteo()
        Called ONLY by GET /api/cron/refresh-weather (see
        app.api.routes_cron), which your external scheduler hits on a
        fixed interval. This is the ONLY code path in the whole app
        that ever talks to Open-Meteo. It does the real HTTP fetch with
        retries/backoff and a failure cooldown, applies PAGASA
        calibration, and persists the result to Supabase so
        fetch_weather() can pick it up -- it does not return data to a
        frontend caller directly.

Point your scheduler at /api/cron/refresh-weather, not "/" -- hitting
"/" only keeps Render awake, it doesn't refresh anything.
"""

import datetime
import json
import time

import requests

from app.config.settings import (
    LAT,
    LON,
    FORECAST_DAYS,
    PAST_DAYS_FOR_WINDOW,
    MAX_WEATHER_ATTEMPTS,
    WEATHER_REQUEST_TIMEOUT,
)
from app.weather.cache import (
    weather_cache,
    weather_cache_lock,
    cache_is_fresh,
    cache_age_minutes,
    in_failure_cooldown,
    FAILURE_COOLDOWN_SECONDS,
)
from app.weather.persistence import save_weather_snapshot, load_weather_snapshot
from app.weather.calibration import record_sample, apply_calibration


class WeatherUnavailableError(Exception):
    """
    Raised only when there is no weather data anywhere -- not in the
    in-process cache, not in Supabase. In practice this should only
    happen on a brand-new deploy before the scheduled refresh has ever
    run successfully once.
    """
    pass


def build_weather_url():
    """
    Builds the exact weather request used by the model.

    IMPORTANT:
    Do NOT remove model-required variables here.

    The model was trained with Open-Meteo-derived features including:

        soil_moisture_mean
        pressure_msl_mean
        surface_pressure_mean
        wind_gusts_10m_max

    Therefore they remain part of the request.
    """

    return (
        "https://api.open-meteo.com/v1/forecast?"
        f"latitude={LAT}&longitude={LON}"

        # ---------------------------------------------------------------
        # CURRENT
        # ---------------------------------------------------------------
        "&current="
        "precipitation,"
        "relative_humidity_2m,"
        "wind_speed_10m,"
        "wind_direction_10m,"
        "pressure_msl,"
        "surface_pressure,"
        "wind_gusts_10m,"
        "is_day,"
        "apparent_temperature"

        # ---------------------------------------------------------------
        # MINUTELY (15-MIN STEPS)
        # ---------------------------------------------------------------
        "&minutely_15=precipitation"
        "&forecast_minutely_15=8"

        # ---------------------------------------------------------------
        # HOURLY
        # ---------------------------------------------------------------
        "&hourly="
        "precipitation,"
        "precipitation_probability,"
        "relative_humidity_2m,"
        "wind_speed_10m,"
        "weathercode,"
        "temperature_2m,"
        "apparent_temperature,"
        "is_day,"
        "visibility,"
        "uv_index,"
        "dew_point_2m,"
        "soil_moisture_0_to_1cm,"
        "pressure_msl,"
        "surface_pressure,"
        "wind_gusts_10m"

        # ---------------------------------------------------------------
        # DAILY
        # ---------------------------------------------------------------
        "&daily="
        "precipitation_sum,"
        "precipitation_probability_max,"
        "weathercode,"
        "temperature_2m_max,"
        "wind_speed_10m_max,"
        "pressure_msl_mean,"
        "surface_pressure_mean,"
        "wind_gusts_10m_max"

        # ---------------------------------------------------------------
        # FORECAST WINDOW
        # ---------------------------------------------------------------
        f"&forecast_days={FORECAST_DAYS}"

        "&timezone=Asia/Manila"

        f"&past_days={PAST_DAYS_FOR_WINDOW}"
    )


def get_retry_after_seconds(response, attempt):
    """
    Determines how long to wait after HTTP 429.

    Priority:

    1. Retry-After header supplied by Open-Meteo
    2. Exponential backoff
    """

    retry_after = response.headers.get("Retry-After")

    if retry_after:
        try:
            return max(1.0, float(retry_after))
        except (TypeError, ValueError):
            pass

    return min(30 * (2 ** attempt), 300)


def fetch_weather():
    """
    Read-only path used by every user-facing endpoint. NEVER contacts
    Open-Meteo.

        1. If the in-process cache is still within CACHE_TTL_SECONDS,
           return it immediately -- no network call at all.
        2. Otherwise, pull the latest snapshot from Supabase (a cheap
           Postgres read via PostgREST, not an Open-Meteo call) and use
           it to refill the in-process cache.
        3. If Supabase has nothing either, fall back to whatever is
           still sitting in the in-process cache from earlier this
           process's life, even if stale.
        4. Only if there is truly nothing anywhere does this raise
           WeatherUnavailableError.
    """

    if cache_is_fresh():
        weather_cache["using_stale_data"] = False
        return weather_cache["data"]

    with weather_cache_lock:

        # Another request may have refilled the cache while we waited
        # for the lock.
        if cache_is_fresh():
            weather_cache["using_stale_data"] = False
            return weather_cache["data"]

        snapshot = load_weather_snapshot()

        if snapshot is not None:
            weather_cache["data"] = snapshot["data"]
            weather_cache["fetched_at"] = snapshot["fetched_at"]
            weather_cache["last_successful_fetch"] = snapshot["last_successful_fetch"]
            weather_cache["loaded_from_disk"] = True
            weather_cache["fallback_source"] = "supabase"
            weather_cache["using_stale_data"] = not cache_is_fresh()

            print(
                f"🟡 Refilled in-process cache from Supabase "
                f"(age: {cache_age_minutes()} min)."
            )

            return weather_cache["data"]

        # Supabase read failed or is empty -- fall back to whatever this
        # process already had in memory, however old.
        if weather_cache["data"] is not None:
            weather_cache["using_stale_data"] = True

            print(
                "🟡 Supabase snapshot unavailable. Serving last in-process "
                f"weather data (age: {cache_age_minutes()} min)."
            )

            return weather_cache["data"]

        raise WeatherUnavailableError(
            "No weather snapshot is available yet. Either Supabase isn't "
            "configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY), or the "
            "scheduled refresh (GET /api/cron/refresh-weather) hasn't run "
            "successfully yet."
        )


def refresh_weather_from_openmeteo():
    """
    The ONLY function in this app that ever contacts Open-Meteo.

    Called exclusively by GET /api/cron/refresh-weather (see
    app.api.routes_cron), which your external scheduler hits on a fixed
    interval -- e.g. every WEATHER_CACHE_TTL_MINUTES. Does the real
    HTTP fetch with retries/backoff and a failure cooldown, applies
    PAGASA calibration, updates the in-process cache directly (so this
    instance doesn't need a round-trip to Supabase to see its own fresh
    data), and persists the result to Supabase for every other
    instance/request to read via fetch_weather().

    SAFE TO CALL AS OFTEN AS YOU LIKE:
    This checks freshness FIRST, exactly like fetch_weather() does, and
    only proceeds to a real Open-Meteo call once the data has actually
    expired. It checks both the in-process cache and the Supabase
    snapshot (in case a different instance -- or a previous cron run
    against a different Render instance after a redeploy -- already
    refreshed it more recently than this process's own cache), so no
    matter how frequently your scheduler hits this endpoint, Open-Meteo
    itself is only ever contacted about once per CACHE_TTL_SECONDS,
    total, system-wide.

    Returns (status, message) rather than raising, so the cron endpoint
    can report a clean result either way.
    """

    if cache_is_fresh():
        weather_cache["using_stale_data"] = False
        return "skipped_fresh", (
            f"In-process cache is still fresh (age: {cache_age_minutes()} "
            "min) -- no Open-Meteo call needed."
        )

    with weather_cache_lock:

        # Another call (this instance or another) may have refreshed the
        # in-process cache while we waited for the lock.
        if cache_is_fresh():
            weather_cache["using_stale_data"] = False
            return "skipped_fresh", (
                f"In-process cache is still fresh (age: "
                f"{cache_age_minutes()} min) -- no Open-Meteo call needed."
            )

        # The in-process cache is stale, but Supabase might already have
        # something newer -- e.g. a different Render instance (or the
        # previous instance, before a redeploy) refreshed it recently.
        # Adopt that instead of hitting Open-Meteo again for no reason.
        snapshot = load_weather_snapshot()

        if snapshot is not None:
            weather_cache["data"] = snapshot["data"]
            weather_cache["fetched_at"] = snapshot["fetched_at"]
            weather_cache["last_successful_fetch"] = snapshot["last_successful_fetch"]
            weather_cache["loaded_from_disk"] = True
            weather_cache["fallback_source"] = "supabase"
            weather_cache["using_stale_data"] = not cache_is_fresh()

            if cache_is_fresh():
                return "skipped_fresh", (
                    "Supabase snapshot is still fresh (age: "
                    f"{cache_age_minutes()} min) -- adopted it, no "
                    "Open-Meteo call needed."
                )

        if in_failure_cooldown():
            message = (
                "Open-Meteo failed recently -- still within the "
                f"{FAILURE_COOLDOWN_SECONDS // 60}-minute failure cooldown, "
                "skipping this refresh attempt."
            )
            print(f"⏸️ {message}")
            return "cooldown", message

        url = build_weather_url()

        last_exception = None

        for attempt in range(MAX_WEATHER_ATTEMPTS):

            try:

                print(
                    f"🌦️ Open-Meteo request "
                    f"(attempt {attempt + 1}/{MAX_WEATHER_ATTEMPTS})"
                )

                response = requests.get(url, timeout=WEATHER_REQUEST_TIMEOUT)

                if response.status_code == 429:

                    wait_seconds = get_retry_after_seconds(response, attempt)

                    print(
                        f"⚠️ Open-Meteo returned HTTP 429 "
                        f"(Too Many Requests). "
                        f"Waiting {wait_seconds:.0f}s before retry..."
                    )

                    last_exception = requests.HTTPError(
                        f"429 Too Many Requests for URL: {url}"
                    )

                    if attempt < MAX_WEATHER_ATTEMPTS - 1:
                        time.sleep(wait_seconds)

                    continue

                response.raise_for_status()

                data = response.json()

                if not isinstance(data, dict):
                    raise ValueError(
                        "Open-Meteo returned an unexpected response format."
                    )

                if "daily" not in data or "hourly" not in data:
                    raise ValueError(
                        "Open-Meteo response is missing daily/hourly data."
                    )

                try:
                    record_sample(data)
                except Exception as err:
                    print(f"⚠️ PAGASA calibration sample recording failed: {err}")

                try:
                    data = apply_calibration(data)
                except Exception as err:
                    print(f"⚠️ PAGASA calibration application failed: {err}")

                fetched_now = time.time()
                last_successful_fetch = datetime.datetime.now(
                    datetime.timezone.utc
                ).isoformat()

                weather_cache["data"] = data
                weather_cache["fetched_at"] = fetched_now
                weather_cache["last_successful_fetch"] = last_successful_fetch
                weather_cache["using_stale_data"] = False
                weather_cache["loaded_from_disk"] = False
                weather_cache["fallback_source"] = None
                weather_cache["last_failure_at"] = None

                saved = save_weather_snapshot(
                    data, fetched_now, last_successful_fetch
                )

                if saved:
                    print(
                        "🟢 Open-Meteo weather data fetched, calibrated, "
                        "and persisted to Supabase."
                    )
                    return "ok", "Fetched fresh Open-Meteo data and persisted to Supabase."

                print(
                    "🟡 Open-Meteo weather data fetched and calibrated, but "
                    "the Supabase write failed -- this instance still has "
                    "it in memory, but other instances won't until the "
                    "next successful refresh."
                )
                return "fetched_not_persisted", (
                    "Fetched fresh Open-Meteo data but the Supabase write "
                    "failed -- check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY."
                )

            except requests.RequestException as err:

                last_exception = err
                print(f"⚠️ Open-Meteo request failed: {err}")

                if attempt < MAX_WEATHER_ATTEMPTS - 1:
                    wait_seconds = min(5 * (2 ** attempt), 60)
                    print(f"   Retrying in {wait_seconds}s...")
                    time.sleep(wait_seconds)

            except (ValueError, json.JSONDecodeError) as err:

                last_exception = err
                print(f"⚠️ Invalid Open-Meteo response: {err}")

                if attempt < MAX_WEATHER_ATTEMPTS - 1:
                    time.sleep(min(5 * (2 ** attempt), 60))

            except Exception as err:

                last_exception = err
                print(f"⚠️ Unexpected weather API error: {err}")

                if attempt < MAX_WEATHER_ATTEMPTS - 1:
                    time.sleep(min(5 * (2 ** attempt), 60))

        weather_cache["last_failure_at"] = time.time()

        detail = f" ({last_exception})" if last_exception is not None else ""
        message = (
            f"Open-Meteo unreachable after {MAX_WEATHER_ATTEMPTS} attempts"
            f"{detail}. Existing Supabase/in-process data (if any) is "
            "unaffected -- fetch_weather() will keep serving it."
        )

        print(f"🔴 {message}")

        return "error", message
