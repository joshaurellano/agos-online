"""
In-process weather cache state + status helpers.

IMPORTANT:
This module stores the LAST SUCCESSFUL Open-Meteo response. The model
still receives exactly the same type of weather data -- caching only
controls how frequently Open-Meteo is contacted.

A lock prevents multiple simultaneous requests from all discovering an
expired cache and hitting Open-Meteo at the same time.
"""

import threading
import time

from app.config.settings import (
    CACHE_TTL_SECONDS,
    FAILURE_COOLDOWN_SECONDS,
    SIGNIFICANT_STALENESS_MINUTES,
)

weather_cache = {
    "data": None,

    # Time when the currently cached response was successfully fetched.
    "fetched_at": 0.0,

    # ISO timestamp of the last successful fetch.
    "last_successful_fetch": None,

    # Whether the last returned data was stale fallback data.
    "using_stale_data": False,

    # True if this cache entry was loaded from Upstash at startup, rather
    # than fetched during this process's lifetime.
    "loaded_from_disk": False,

    # "upstash" if the current data came from the persisted fallback,
    # or None (live fetch / nothing loaded yet).
    "fallback_source": None,

    # Wall-clock time of the most recent exhausted-retries failure.
    # Used by the cooldown/circuit-breaker so repeated incoming requests
    # don't each re-trigger a full retry storm against Open-Meteo.
    "last_failure_at": None,
}

weather_cache_lock = threading.Lock()


def cache_age_seconds():
    """
    Returns the age of the cached weather data in seconds.
    """

    if weather_cache["data"] is None:
        return None

    if not weather_cache["fetched_at"]:
        return None

    return max(0.0, time.time() - weather_cache["fetched_at"])


def cache_age_minutes():
    """
    Returns the age of cached weather data in minutes.
    """

    age = cache_age_seconds()

    if age is None:
        return None

    return round(age / 60.0, 2)


def in_failure_cooldown():
    """
    Returns True if Open-Meteo failed recently enough (within
    FAILURE_COOLDOWN_SECONDS) that we should skip contacting it again and
    go straight to serving fallback data instead.

    This is what stops every incoming request during an outage from each
    re-running the full retry-with-backoff loop -- without it, a single
    Open-Meteo outage combined with normal traffic (or a keep-alive cron)
    can turn into a continuous stream of requests that keeps the
    rate limit tripped indefinitely.
    """

    last_failure_at = weather_cache["last_failure_at"]

    if last_failure_at is None:
        return False

    return (time.time() - last_failure_at) < FAILURE_COOLDOWN_SECONDS


def cache_is_fresh():
    """
    Determines whether the current cached response is within the normal
    cache TTL.
    """

    age = cache_age_seconds()

    if age is None:
        return False

    return age < CACHE_TTL_SECONDS


def get_cache_status():
    """
    Provides diagnostic information for the API response.

    This is useful for the frontend because it can distinguish:

        fresh
        stale_fallback
        unavailable

    and additionally flags when stale fallback data is old enough that
    it may no longer be a meaningful basis for a flood forecast.
    """

    age_minutes = cache_age_minutes()

    if weather_cache["data"] is None:
        return {
            "status": "unavailable",
            "age_minutes": None,
            "last_successful_fetch": None,
            "significantly_stale": False,
        }

    significantly_stale = (
        age_minutes is not None
        and age_minutes > SIGNIFICANT_STALENESS_MINUTES
    )

    if weather_cache["using_stale_data"]:
        return {
            "status": "stale_fallback",
            "age_minutes": age_minutes,
            "last_successful_fetch": weather_cache[
                "last_successful_fetch"
            ],
            "significantly_stale": significantly_stale,
            "loaded_from_disk": weather_cache["loaded_from_disk"],
            "fallback_source": weather_cache["fallback_source"],
            "in_failure_cooldown": in_failure_cooldown(),
        }

    return {
        "status": "fresh",
        "age_minutes": age_minutes,
        "last_successful_fetch": weather_cache[
            "last_successful_fetch"
        ],
        "significantly_stale": significantly_stale,
        "loaded_from_disk": weather_cache["loaded_from_disk"],
        "fallback_source": weather_cache["fallback_source"],
        "in_failure_cooldown": in_failure_cooldown(),
    }

