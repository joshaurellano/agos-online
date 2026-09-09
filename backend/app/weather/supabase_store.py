"""
Tiny key/value helper backed by a Supabase Postgres table, via
Supabase's auto-generated REST (PostgREST) API.

WHY THIS EXISTS:
This replaces Upstash Redis as the durable store for (a) the last
successful Open-Meteo weather snapshot and (b) the rolling PAGASA
calibration sample list. Functionally it's a drop-in swap -- same
"get one JSON blob by key / set one JSON blob by key" shape -- just
backed by Supabase (which this project already uses elsewhere) instead
of a second external service.

MORE IMPORTANTLY, this table is written to by exactly ONE place in the
whole system: scripts/refresh_weather.py, run on a fixed schedule by an
external scheduler (see .github/workflows/refresh-weather.yml) that is
NOT this FastAPI app. The running API only ever READS this table (see
app.weather.client.fetch_weather). That split is what actually caps
Open-Meteo request volume at "however many times the schedule fires per
day" -- completely independent of how much or little the app itself is
used, and independent of Render free-tier spin-downs/cold-starts.

SETUP:
Create the table once (see supabase/schema.sql for the exact DDL), then
set these two env vars (Render dashboard AND GitHub Actions secrets):

    SUPABASE_URL                 e.g. https://xxxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY    Project Settings -> API -> service_role key

The service_role key is required (not the anon key) because writes come
from a trusted server-side script, and it bypasses row-level security --
never ship it to a frontend.
"""

import os

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_KV_TABLE = os.environ.get("SUPABASE_KV_TABLE", "app_kv")

SUPABASE_CONFIGURED = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)

_REQUEST_TIMEOUT = 10


def _headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def kv_set(key, value):
    """
    Upserts one row: {key, value, updated_at=now()}.

    `value` must be JSON-serializable (dict/list/etc) -- it's stored in
    a jsonb column as-is, no manual json.dumps needed.

    Returns True on success, False otherwise (never raises -- callers
    treat persistence as best-effort, same as the old Upstash writes).
    """

    if not SUPABASE_CONFIGURED:
        print("⚠️ Supabase env vars not set — skipping persisted write.")
        return False

    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/{SUPABASE_KV_TABLE}",
            headers={
                **_headers(),
                # Upsert on the `key` primary key instead of erroring on
                # conflict.
                "Prefer": "resolution=merge-duplicates",
            },
            params={"on_conflict": "key"},
            json={"key": key, "value": value},
            timeout=_REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return True

    except Exception as err:
        print(f"⚠️ Could not write '{key}' to Supabase: {err}")
        return False


def kv_get(key):
    """
    Returns the stored value for `key` (already parsed from jsonb, so a
    dict/list/etc, not a JSON string), or None if it doesn't exist or
    Supabase couldn't be reached.
    """

    if not SUPABASE_CONFIGURED:
        print("⚠️ Supabase env vars not set — no persisted value to load.")
        return None

    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/{SUPABASE_KV_TABLE}",
            headers=_headers(),
            params={"key": f"eq.{key}", "select": "value", "limit": 1},
            timeout=_REQUEST_TIMEOUT,
        )
        resp.raise_for_status()

        rows = resp.json()
        if not rows:
            return None

        return rows[0].get("value")

    except Exception as err:
        print(f"⚠️ Could not read '{key}' from Supabase: {err}")
        return None
