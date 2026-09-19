"""
Restart-proof fallback cache via Upstash Redis.

Render's filesystem is ephemeral -- and on the Free tier, that
ephemerality applies to EVERY restart and spin-down, not just full
redeploys -- local disk gets wiped every time too, so it can't help
here. Instead, the last successful Open-Meteo response is written to
Upstash Redis and reloaded at startup, so the flood forecast keeps
working off the last-known-good weather data as long as the server has
EVER fetched successfully at least once before.

This does NOT change what data feeds the model. It's still the exact
same Open-Meteo response, just given a longer, restart-proof lifetime
as a fallback.

Set these two env vars in Render's dashboard (Settings -> Environment):
    UPSTASH_REDIS_REST_URL
    UPSTASH_REDIS_REST_TOKEN
(Upstash gives you both directly on your database's page.)
"""

import json
import os

import requests

from app.weather.cache import weather_cache, cache_age_minutes

UPSTASH_URL = os.environ.get("UPSTASH_REDIS_REST_URL")
UPSTASH_TOKEN = os.environ.get("UPSTASH_REDIS_REST_TOKEN")
UPSTASH_CACHE_KEY = "weather_cache_fallback"


def persist_cache_to_disk():
    """
    Writes the last successful Open-Meteo response to Upstash Redis.

    Called every time a fetch succeeds. This is what lets the flood
    forecast keep working immediately after a Render restart/spin-down,
    instead of only after the next successful Open-Meteo call.
    """

    if not (UPSTASH_URL and UPSTASH_TOKEN):
        print("⚠️ Upstash env vars not set — skipping persisted cache write.")
        return

    try:
        payload = {
            "data": weather_cache["data"],
            "fetched_at": weather_cache["fetched_at"],
            "last_successful_fetch": weather_cache["last_successful_fetch"],
        }

        resp = requests.post(
            f"{UPSTASH_URL}/set/{UPSTASH_CACHE_KEY}",
            headers={"Authorization": f"Bearer {UPSTASH_TOKEN}"},
            data=json.dumps(payload),
            timeout=10,
        )
        resp.raise_for_status()

    except Exception as err:
        # Persistence failing should never take down the API -- it's a
        # best-effort safety net, not a hard requirement.
        print(f"⚠️ Could not persist weather cache to Upstash: {err}")


def load_cache_from_disk():
    """
    Loads the last persisted Open-Meteo response from Upstash at process
    startup.

    Without this, a restart that happens to land during an Open-Meteo
    rate-limit window leaves the server with zero fallback data until
    Open-Meteo becomes reachable again -- which is exactly the failure
    mode this whole mechanism exists to avoid.
    """

    if not (UPSTASH_URL and UPSTASH_TOKEN):
        print("⚠️ Upstash env vars not set — no persisted cache to load.")
        return

    try:
        resp = requests.get(
            f"{UPSTASH_URL}/get/{UPSTASH_CACHE_KEY}",
            headers={"Authorization": f"Bearer {UPSTASH_TOKEN}"},
            timeout=10,
        )
        resp.raise_for_status()

        result = resp.json().get("result")
        if not result:
            return

        payload = json.loads(result)
        if not payload.get("data"):
            return

        weather_cache["data"] = payload["data"]
        weather_cache["fetched_at"] = payload.get("fetched_at", 0.0)
        weather_cache["last_successful_fetch"] = payload.get("last_successful_fetch")
        weather_cache["using_stale_data"] = True
        weather_cache["loaded_from_disk"] = True
        weather_cache["fallback_source"] = "upstash"

        age_min = cache_age_minutes()
        print(
            f"🟡 Loaded persisted weather cache from Upstash "
            f"(age: {age_min} min). This will back /api/forecast-flood "
            f"as a fallback until a fresh Open-Meteo fetch succeeds."
        )

    except Exception as err:
        print(f"⚠️ Could not load persisted weather cache from Upstash: {err}")

