"""
Scheduled weather-refresh endpoint.

This is the ONLY endpoint in the whole app that triggers a live
Open-Meteo call (see app.weather.client.refresh_weather_from_openmeteo).
Every other endpoint (/api/forecast, /api/forecast-flood/*, etc.) only
ever reads the snapshot this endpoint produces, via fetch_weather() --
they never contact Open-Meteo themselves.

SETUP:
Point your existing external scheduler at this URL:

    GET https://<your-render-app>.onrender.com/api/cron/refresh-weather

Hitting "/" only keeps Render awake -- it does NOT refresh the weather
cache or feed PAGASA calibration, since read_root() never calls
fetch_weather(). This endpoint is what actually needs to be on a
schedule.

Recommended interval: roughly every WEATHER_CACHE_TTL_MINUTES (default
180 min / 3 hours). Hitting it more often than that doesn't get you
fresher data (Open-Meteo's own forecast doesn't change meaningfully
faster than that) -- it just spends Open-Meteo calls for no benefit.
Hitting it less often means both the app and the PAGASA calibration
sampler go longer on older data.
"""

import os

from fastapi import APIRouter, Header, HTTPException

from app.weather.client import refresh_weather_from_openmeteo, fetch_weather, WeatherUnavailableError
from app.weather.cache import get_cache_status
from app.weather.calibration import get_calibration_status, record_sample

router = APIRouter()

# Optional shared-secret guard. Leave CRON_SECRET unset in the environment
# to leave this endpoint open -- set it (and pass the same value as the
# X-Cron-Secret header from your scheduler) if you'd rather not let
# randoms nudge your Open-Meteo request volume, since this is the one
# endpoint in the app that can actually cause an Open-Meteo call.
CRON_SECRET = os.environ.get("CRON_SECRET")


@router.get("/api/cron/refresh-weather")
def cron_refresh_weather(x_cron_secret: str | None = Header(default=None)):
    """
    Meant to be hit on a schedule by an external cron service -- NOT by
    the frontend.

    Every call runs refresh_weather_from_openmeteo(), which:
      - Fetches fresh Open-Meteo data (with retries/backoff + a failure
        cooldown so a bad run doesn't turn into a retry storm),
      - Attempts a fresh PAGASA calibration sample as a side effect,
      - Persists the result to Supabase so every app instance/request
        picks it up via fetch_weather() -- without ever calling
        Open-Meteo themselves.

    Returns the resulting cache + calibration status so the scheduler's
    logs double as a lightweight health check.
    """

    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(
            status_code=401,
            detail="Missing or incorrect X-Cron-Secret header.",
        )

    status, message = refresh_weather_from_openmeteo()

    return {
        "status": status,
        "message": message,
        "weather_cache": get_cache_status(),
        "pagasa_calibration": get_calibration_status(),
    }


@router.get("/api/cron/sample-calibration")
def cron_sample_calibration(x_cron_secret: str | None = Header(default=None)):
    """
    Records ONE PAGASA calibration sample against whatever Open-Meteo
    data is already cached (in-process or Supabase) -- it NEVER performs
    a live Open-Meteo call. Safe to hit as often as you like, since the
    only network calls this makes are to Supabase (cheap Postgres reads)
    and to PAGASA's AWS table (a completely separate source from
    Open-Meteo, so this has zero effect on your Open-Meteo rate limit).

    WHY THIS EXISTS:
    record_sample() normally only runs once per LIVE Open-Meteo fetch
    (see refresh_weather_from_openmeteo()), which -- by design -- only
    happens once per CACHE_TTL_SECONDS (default 3 hours). That ties
    reaching CALIBRATION_MIN_SAMPLES (default 20) to 20 x 3h = 60+
    hours, longer still if any refresh fails. A calibration sample only
    needs a PAGASA reading paired against Open-Meteo's *current-hour*
    values, which don't meaningfully change within a 3-hour window --
    so pairing a fresh PAGASA reading against the EXISTING cached
    Open-Meteo data is just as valid a sample, and costs zero Open-Meteo
    calls.

    SETUP:
    Point a second scheduler at this URL, on a much shorter interval
    than /api/cron/refresh-weather -- e.g. every 15 minutes:

        GET https://<your-render-app>.onrender.com/api/cron/sample-calibration

    This is independent of your existing 3-hour refresh-weather cron --
    keep both running. This one only accelerates calibration sample
    collection; refresh-weather is still what keeps the actual forecast
    data itself fresh.
    """

    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(
            status_code=401,
            detail="Missing or incorrect X-Cron-Secret header.",
        )

    try:
        data = fetch_weather()
    except WeatherUnavailableError as err:
        return {
            "status": "no_data",
            "message": (
                "No cached weather data available yet to sample against "
                f"-- run /api/cron/refresh-weather at least once first. ({err})"
            ),
            "pagasa_calibration": get_calibration_status(),
        }

    before = get_calibration_status()["total_samples"]
    record_sample(data)
    after = get_calibration_status()["total_samples"]

    if after > before:
        status, message = "ok", "Recorded a new PAGASA calibration sample."
    else:
        status, message = "skipped", (
            "No new sample recorded -- PAGASA's AWS table was unreachable, "
            "stale, or PAGASA_CALIBRATION_ENABLED is off. Existing samples "
            "are unaffected."
        )

    return {
        "status": status,
        "message": message,
        "pagasa_calibration": get_calibration_status(),
    }