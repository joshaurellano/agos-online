"""
Open-Meteo HTTP client: URL construction + resilient fetch_weather().

fetch_weather() wraps the raw HTTP call with:
    - an in-process TTL cache (see app.weather.cache)
    - a lock so concurrent requests collapse into one upstream call
    - HTTP 429 handling with Retry-After support
    - exponential backoff on network/parse errors
    - a failure cooldown (circuit breaker) so an outage doesn't turn
      into a retry storm
    - a last-known-good fallback, backed by Upstash (see
      app.weather.persistence) so it survives process restarts

IMPORTANT: this module does NOT modify the weather data itself. It only
controls WHEN Open-Meteo is contacted, and what to serve when Open-Meteo
can't be reached at all.
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
from app.weather.persistence import persist_cache_to_disk


class WeatherUnavailableError(Exception):
    """
    Raised only when Open-Meteo could not be reached/parsed AND there is
    no fallback data anywhere (not in memory, not on Upstash).

    This is distinct from ordinary request exceptions so the API layer
    can return a clear, specific error message instead of a generic
    "something went wrong" response.
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
        # Powers the short-range "minute forecast" precipitation strip on
        # the flood map (see routes_weather.get_forecast -> "minutely").
        # Open-Meteo's finest native resolution is 15 minutes (there is no
        # true per-minute precipitation field), so this is a coarser
        # cousin of OpenWeatherMap's 60x 1-min series rather than an exact
        # match -- 8 steps covers the next 2 hours, plenty for a
        # Now/15/30/45/60-min strip with headroom.
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

        # Correct timezone for Naga City / Philippines.
        "&timezone=Asia/Manila"

        # Historical window required by the inference pipeline.
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

    # Exponential backoff:
    #
    # attempt 0 -> 30 sec
    # attempt 1 -> 60 sec
    # attempt 2 -> 120 sec
    # attempt 3 -> 240 sec
    #
    # capped at 5 minutes.
    return min(30 * (2 ** attempt), 300)



def fetch_weather():
    """
    Retrieves Open-Meteo weather data with:

        - 30-minute cache
        - thread locking
        - HTTP 429 handling
        - Retry-After support
        - exponential backoff
        - timeout handling
        - last-known-good fallback (in-memory AND Upstash-persisted)

    IMPORTANT:

    This function does NOT modify the weather data itself.

    It only controls WHEN Open-Meteo is contacted, and what to serve
    when Open-Meteo can't be reached at all.
    """

    # ----------------------------------------------------------------------
    # FAST CACHE CHECK
    # ----------------------------------------------------------------------
    # force_live_retry (set by load_cache_from_disk()) overrides this --
    # a disk-loaded snapshot doesn't get to answer requests on its own
    # freshness window until a live Open-Meteo attempt has actually been
    # made this process lifetime. That attempt happens below regardless
    # of outcome, so this only ever gates the very first call after a
    # snapshot load.

    if not weather_cache["force_live_retry"] and cache_is_fresh():
        weather_cache["using_stale_data"] = False
        return weather_cache["data"]

    # ----------------------------------------------------------------------
    # LOCK
    # ----------------------------------------------------------------------
    #
    # Prevents concurrent API requests when several frontend requests hit
    # the backend at the same time while the cache is expired.
    #
    # Example:
    #
    # 10 simultaneous frontend requests
    #          ↓
    #      expired cache
    #          ↓
    # Without lock:
    #      10 Open-Meteo requests ❌
    #
    # With lock:
    #      1 Open-Meteo request
    #      9 requests use resulting cache
    #
    # ----------------------------------------------------------------------

    with weather_cache_lock:

        # Another request may have refreshed the cache while we were waiting
        # for the lock.
        if not weather_cache["force_live_retry"] and cache_is_fresh():
            weather_cache["using_stale_data"] = False
            return weather_cache["data"]

        # This attempt (below) is what verifies Open-Meteo reachability --
        # from here on, the loaded snapshot must stand on its own normal
        # TTL like any other cache entry, not on the strength of never
        # having been checked yet.
        weather_cache["force_live_retry"] = False

        # --------------------------------------------------------------
        # FAILURE COOLDOWN (CIRCUIT BREAKER)
        # --------------------------------------------------------------
        #
        # If Open-Meteo failed very recently, don't retry it again yet --
        # go straight to whatever fallback data we have. This is what
        # actually caps Open-Meteo request volume during an outage,
        # regardless of how much traffic (real users or a keep-alive
        # cron) hits the API in the meantime.
        # --------------------------------------------------------------

        if in_failure_cooldown():

            if weather_cache["data"] is not None:

                weather_cache["using_stale_data"] = True

                print(
                    "⏸️ Skipping Open-Meteo request -- still within the "
                    f"{FAILURE_COOLDOWN_SECONDS // 60}-minute failure "
                    "cooldown. Serving fallback data "
                    f"(age: {cache_age_minutes()} min)."
                )

                return weather_cache["data"]

            raise WeatherUnavailableError(
                "Open-Meteo failed recently and is still within its "
                f"{FAILURE_COOLDOWN_SECONDS // 60}-minute cooldown, and no "
                "cached weather data is available (no in-memory cache, "
                "no Upstash fallback)."
            )

        url = build_weather_url()

        last_exception = None

        # ------------------------------------------------------------------
        # RETRY LOOP
        # ------------------------------------------------------------------

        for attempt in range(MAX_WEATHER_ATTEMPTS):

            try:

                print(
                    f"🌦️ Open-Meteo request "
                    f"(attempt {attempt + 1}/{MAX_WEATHER_ATTEMPTS})"
                )

                response = requests.get(
                    url,
                    timeout=WEATHER_REQUEST_TIMEOUT
                )

                # ----------------------------------------------------------
                # RATE LIMITED
                # ----------------------------------------------------------

                if response.status_code == 429:

                    wait_seconds = get_retry_after_seconds(
                        response,
                        attempt
                    )

                    print(
                        f"⚠️ Open-Meteo returned HTTP 429 "
                        f"(Too Many Requests). "
                        f"Waiting {wait_seconds:.0f}s before retry..."
                    )

                    last_exception = requests.HTTPError(
                        f"429 Too Many Requests for URL: {url}"
                    )

                    # Don't retry after the final attempt.
                    if attempt < MAX_WEATHER_ATTEMPTS - 1:
                        time.sleep(wait_seconds)

                    continue

                # ----------------------------------------------------------
                # OTHER HTTP ERROR
                # ----------------------------------------------------------

                response.raise_for_status()

                # ----------------------------------------------------------
                # PARSE JSON
                # ----------------------------------------------------------

                data = response.json()

                # Basic sanity check.
                if not isinstance(data, dict):
                    raise ValueError(
                        "Open-Meteo returned an unexpected response format."
                    )

                if "daily" not in data or "hourly" not in data:
                    raise ValueError(
                        "Open-Meteo response is missing daily/hourly data."
                    )

                # ----------------------------------------------------------
                # SUCCESS
                # ----------------------------------------------------------

                fetched_now = time.time()

                weather_cache["data"] = data
                weather_cache["fetched_at"] = fetched_now
                weather_cache["last_successful_fetch"] = (
                    datetime.datetime.now(
                        datetime.timezone.utc
                    ).isoformat()
                )
                weather_cache["using_stale_data"] = False
                weather_cache["loaded_from_disk"] = False
                weather_cache["fallback_source"] = None
                weather_cache["last_failure_at"] = None

                # Persist to disk so this response survives a restart and
                # can back /api/forecast-flood even if Open-Meteo is
                # unreachable right after the next boot.
                persist_cache_to_disk()

                print(
                    "🟢 Open-Meteo weather data successfully fetched "
                    "and cached."
                )

                return data

            except requests.RequestException as err:

                last_exception = err

                print(
                    f"⚠️ Open-Meteo request failed: {err}"
                )

                # Don't sleep after final attempt.
                if attempt < MAX_WEATHER_ATTEMPTS - 1:

                    # For ordinary network errors, use shorter backoff.
                    wait_seconds = min(
                        5 * (2 ** attempt),
                        60
                    )

                    print(
                        f"   Retrying in "
                        f"{wait_seconds}s..."
                    )

                    time.sleep(wait_seconds)

            except (ValueError, json.JSONDecodeError) as err:

                last_exception = err

                print(
                    f"⚠️ Invalid Open-Meteo response: {err}"
                )

                if attempt < MAX_WEATHER_ATTEMPTS - 1:

                    wait_seconds = min(
                        5 * (2 ** attempt),
                        60
                    )

                    time.sleep(wait_seconds)

            except Exception as err:

                last_exception = err

                print(
                    f"⚠️ Unexpected weather API error: {err}"
                )

                if attempt < MAX_WEATHER_ATTEMPTS - 1:

                    wait_seconds = min(
                        5 * (2 ** attempt),
                        60
                    )

                    time.sleep(wait_seconds)

        # ------------------------------------------------------------------
        # ALL RETRIES FAILED
        # ------------------------------------------------------------------
        #
        # If we have a previous successful Open-Meteo response -- either
        # still in memory, or loaded from disk at startup -- use it.
        #
        # This keeps the flood model operational instead of returning
        # an empty forecast simply because Open-Meteo temporarily rejected
        # a request.
        #
        # IMPORTANT:
        #
        # This DOES NOT invent or alter weather values.
        # It uses the exact last successful Open-Meteo response.
        # ------------------------------------------------------------------

        # Start (or refresh) the failure cooldown so subsequent requests
        # in the next FAILURE_COOLDOWN_SECONDS skip straight to fallback
        # data instead of re-running this whole retry loop.
        weather_cache["last_failure_at"] = time.time()

        if weather_cache["data"] is not None:

            weather_cache["using_stale_data"] = True

            source = "upstash-persisted" if weather_cache["loaded_from_disk"] else "in-memory"

            print(
                f"🟡 Open-Meteo unavailable after retries. "
                f"Using last successfully cached weather data "
                f"({source}, age: {cache_age_minutes()} min). "
                f"Entering a {FAILURE_COOLDOWN_SECONDS // 60}-minute "
                f"cooldown before retrying Open-Meteo again."
            )

            return weather_cache["data"]

        # ------------------------------------------------------------------
        # NO CACHE AVAILABLE ANYWHERE (memory or Upstash)
        # ------------------------------------------------------------------
        #
        # This is the only truly unrecoverable case: Open-Meteo could not
        # be reached/parsed after MAX_WEATHER_ATTEMPTS retries, AND there
        # is no last-known-good data anywhere (fresh deploy, Upstash
        # missing/empty, and Open-Meteo down on the very first request).
        #
        # Raise a clearly-labeled error instead of a generic
        # RequestException/RuntimeError so the API layer can return an
        # unambiguous, human-readable message to the caller.
        # ------------------------------------------------------------------

        detail = f" ({last_exception})" if last_exception is not None else ""

        raise WeatherUnavailableError(
            "Open-Meteo weather service is unreachable after "
            f"{MAX_WEATHER_ATTEMPTS} attempts, and no cached weather "
            f"data is available (no in-memory cache, no Upstash "
            f"fallback){detail}."
        )

