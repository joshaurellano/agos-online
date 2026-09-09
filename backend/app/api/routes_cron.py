"""
Cron / keep-alive endpoint.

WHY THIS EXISTS:
PAGASA calibration sampling is intentionally tied to the weather cache's
normal fetch cadence rather than its own scheduler (see
app.config.settings PAGASA_CALIBRATION comments and
app.weather.calibration's module docstring) -- a sample is only recorded
when app.weather.client.fetch_weather() performs a genuine (non-cached)
Open-Meteo call.

That design assumes *something* calls a weather-backed endpoint often
enough for the cache to actually expire and refresh on its own. In
practice that "something" is real frontend traffic, which is exactly the
thing this project can't guarantee on a schedule -- especially on
Render's free tier, where the whole service spins down after ~15 minutes
of inactivity and only wakes back up on the next inbound request.

Left alone, that means:
  - PAGASA calibration samples stop accumulating entirely during any
    quiet period longer than CACHE_TTL_SECONDS.
  - The first user of the day eats a slow cold start.

This endpoint gives an external scheduler (GitHub Actions, Render Cron
Jobs, cron-job.org, etc.) something cheap to hit on a fixed interval so
both problems go away, WITHOUT changing how or when PAGASA is actually
sampled -- it just makes sure fetch_weather() gets called regularly, the
same way a real user's request would.
"""

import os

from fastapi import APIRouter, Header, HTTPException

from app.weather.client import fetch_weather, WeatherUnavailableError
from app.weather.cache import get_cache_status
from app.weather.calibration import get_calibration_status

router = APIRouter()

# Optional shared-secret guard. Leave CRON_SECRET unset in the environment
# to leave this endpoint open (it only ever triggers a read-through cache
# refresh, never anything destructive) -- set it if you'd rather not let
# randoms nudge your Open-Meteo request volume.
CRON_SECRET = os.environ.get("CRON_SECRET")


@router.get("/api/cron/refresh-weather")
def cron_refresh_weather(x_cron_secret: str | None = Header(default=None)):
    """
    Meant to be hit on a schedule by an external cron service -- NOT by
    the frontend.

    Every call runs the exact same fetch_weather() every other endpoint
    already uses:
      - If the cache is still fresh, this is a no-op cache hit (cheap).
      - If the cache has expired, this performs a real Open-Meteo fetch,
        which also attempts a fresh PAGASA calibration sample as a side
        effect (see app.weather.calibration.record_sample) and persists
        the new snapshot to Upstash.

    Returns the resulting cache + calibration status so the scheduler's
    logs double as a lightweight health check.
    """

    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(
            status_code=401,
            detail="Missing or incorrect X-Cron-Secret header.",
        )

    try:
        fetch_weather()
        status = "ok"
        message = "Weather cache checked (refreshed if it had expired)."

    except WeatherUnavailableError as err:
        status = "weather_unavailable"
        message = str(err)

    return {
        "status": status,
        "message": message,
        "weather_cache": get_cache_status(),
        "pagasa_calibration": get_calibration_status(),
    }
