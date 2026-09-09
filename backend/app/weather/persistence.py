"""
Durable fallback + source-of-truth for the weather cache, via Supabase.

WHY THIS EXISTS:
Render's filesystem is ephemeral -- that applies to every restart and
free-tier spin-down, not just full redeploys -- so an in-memory-only
cache (app.weather.cache) disappears constantly. This module persists
the last successful Open-Meteo response to Supabase so it survives
restarts.

IMPORTANT ARCHITECTURE NOTE (read this before touching client.py):
save_weather_snapshot() is called from exactly ONE place: the standalone
refresh script (scripts/refresh_weather.py / app.weather.client's
refresh_weather_from_openmeteo()), run on a fixed external schedule --
NOT from inside a live API request. load_weather_snapshot() is what the
running FastAPI app calls instead, every time its own short in-process
cache (see app.weather.cache) has gone stale. This is what decouples
Open-Meteo request volume from app traffic entirely: the API never
calls Open-Meteo itself, so no amount of (or absence of) usage, and no
number of Render cold starts, can ever increase Open-Meteo call volume.
Only the external schedule can.

Set these two env vars (Render AND wherever the refresh script runs,
e.g. GitHub Actions secrets):

    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY

See supabase/schema.sql for the one-time table setup.
"""

import time

from app.weather.supabase_store import kv_get, kv_set

WEATHER_SNAPSHOT_KEY = "weather_cache_fallback"


def save_weather_snapshot(data, fetched_at, last_successful_fetch):
    """
    Writes the given Open-Meteo response (already PAGASA-calibrated) to
    Supabase, along with when it was fetched.

    Called only by the external refresh script after a genuine live
    Open-Meteo fetch -- never by the request-serving app.
    """

    payload = {
        "data": data,
        "fetched_at": fetched_at,
        "last_successful_fetch": last_successful_fetch,
    }

    ok = kv_set(WEATHER_SNAPSHOT_KEY, payload)

    if ok:
        print("🟢 Persisted weather snapshot to Supabase.")

    return ok


def load_weather_snapshot():
    """
    Reads the latest persisted Open-Meteo snapshot from Supabase.

    Returns a dict with keys `data`, `fetched_at`, `last_successful_fetch`,
    or None if nothing is stored yet or Supabase couldn't be reached.

    Called by app.weather.client.fetch_weather() every time the
    in-process cache has gone stale -- this is the ONLY thing that
    refills it. The running app never talks to Open-Meteo directly.
    """

    payload = kv_get(WEATHER_SNAPSHOT_KEY)

    if not payload or not payload.get("data"):
        return None

    return {
        "data": payload["data"],
        "fetched_at": payload.get("fetched_at", time.time()),
        "last_successful_fetch": payload.get("last_successful_fetch"),
    }


def load_cache_from_disk():
    """
    Primes the in-process weather cache from Supabase at app startup, so
    the very first request doesn't have to wait on a cold read.

    Marked `using_stale_data`/`loaded_from_disk` purely for status
    reporting (see get_cache_status()) -- there is no "confirm against a
    live fetch" step anymore, because the running app is never supposed
    to perform a live Open-Meteo fetch at all. The data is only as fresh
    as the last scheduled refresh run, which is exactly by design.
    """

    # Imported here (not at module load) to avoid a circular import --
    # app.weather.cache imports settings only, so this is safe.
    from app.weather.cache import weather_cache, cache_age_minutes, cache_is_fresh

    snapshot = load_weather_snapshot()

    if snapshot is None:
        print("⚠️ No persisted weather snapshot found in Supabase yet.")
        return

    weather_cache["data"] = snapshot["data"]
    weather_cache["fetched_at"] = snapshot["fetched_at"]
    weather_cache["last_successful_fetch"] = snapshot["last_successful_fetch"]
    weather_cache["loaded_from_disk"] = True
    weather_cache["fallback_source"] = "supabase"
    # Reflect the snapshot's real age -- it may already be older than
    # CACHE_TTL_SECONDS if the scheduled refresh hasn't run recently.
    weather_cache["using_stale_data"] = not cache_is_fresh()

    age_min = cache_age_minutes()
    print(
        f"🟡 Loaded weather snapshot from Supabase "
        f"(age: {age_min} min)."
    )
