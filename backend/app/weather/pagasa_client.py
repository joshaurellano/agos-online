"""
PAGASA Automated Weather Station (AWS) client.

PAGASA does not publish a documented public API for AWS observations.
The closest thing available is the live HTML table at
bagong.pagasa.dost.gov.ph/automated-weather-station, which lists every
AWS station PAGASA operates nationwide and is refreshed periodically.

This module fetches that page and pulls out the single row for our
reference station (PAGASA_STATION_ID, "Pili, Camarines Sur AWS" -- the
closest official PAGASA station to the Naga City forecast point, ~15 km
away), returning its readings as a plain dict.

IMPORTANT:
This is inherently more fragile than a real API -- PAGASA can change the
page's markup at any time without notice, and individual stations in the
table are known to occasionally report stale or broken values (see
_looks_stale() below). Every failure mode here raises the single
PagasaUnavailableError rather than letting a parse error escape, so a
broken scrape degrades to "keep using uncorrected Open-Meteo data"
instead of taking the whole API down. This module never raises anything
else and never modifies Open-Meteo data itself.
"""

import datetime
import re

import requests
from bs4 import BeautifulSoup

from app.config.settings import (
    PAGASA_AWS_URL,
    PAGASA_STATION_ID,
    PAGASA_MAX_READING_AGE_MINUTES,
    WEATHER_REQUEST_TIMEOUT,
)


class PagasaUnavailableError(Exception):
    """
    Raised whenever a trustworthy PAGASA reading for our reference
    station could not be obtained -- unreachable page, changed markup,
    missing row, or a reading too stale/broken to use.
    """
    pass


def _parse_number(text):
    """
    Pulls the first numeric token out of a table cell, or None for
    placeholder values like '--'.
    """

    if text is None:
        return None

    text = text.strip()

    if text in ("", "--", "\u2014"):
        return None

    match = re.search(r"-?\d+(\.\d+)?", text)

    if not match:
        return None

    return float(match.group())


def _parse_last_updated(text):
    """
    Parses the table's "Month D, YYYY, H:MM am/pm" timestamp (published
    in Asia/Manila local time) into a timezone-aware UTC datetime.

    Returns None if the text doesn't match the expected format at all
    (e.g. the page's markup changed) -- a value the caller treats the
    same as "too stale to use".
    """

    if not text:
        return None

    try:
        naive = datetime.datetime.strptime(
            text.strip(),
            "%B %d, %Y, %I:%M %p",
        )
    except ValueError:
        return None

    manila = naive.replace(
        tzinfo=datetime.timezone(datetime.timedelta(hours=8))
    )

    return manila.astimezone(datetime.timezone.utc)


def fetch_pagasa_station(station_id=None):
    """
    Fetches the live AWS table and returns the parsed reading for
    `station_id` (defaults to PAGASA_STATION_ID), or raises
    PagasaUnavailableError.

    Returned dict:
        {
            "station_id": "5037",
            "station_name": "Pili Camarines Sur AWS",
            "temperature_c": 31.0,
            "humidity_pct": 73.0,
            "wind_speed_kph": 0.0,
            "wind_direction": "N",
            "precipitation_mm_hr": 0.0,
            "pressure_hpa": 1003.6,
            "solar_radiation": 521.8,
            "observed_at": "2026-09-09T05:30:00+00:00",
            "age_minutes": 4.2,
        }
    """

    station_id = station_id or PAGASA_STATION_ID

    try:
        response = requests.get(
            PAGASA_AWS_URL,
            timeout=WEATHER_REQUEST_TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 (compatible; flood-forecast-api/1.0)"},
        )
        response.raise_for_status()

    except requests.RequestException as err:
        raise PagasaUnavailableError(
            f"Could not reach the PAGASA AWS page: {err}"
        )

    try:
        soup = BeautifulSoup(response.text, "html.parser")
        table = soup.find("table")

        if table is None:
            raise ValueError("No table found on the PAGASA AWS page.")

        body = table.find("tbody") or table

        target_cells = None

        for row in body.find_all("tr"):

            cells = [
                cell.get_text(strip=True)
                for cell in row.find_all(["td", "th"])
            ]

            if not cells:
                continue

            if cells[0].strip() == str(station_id):
                target_cells = cells
                break

        if target_cells is None:
            raise ValueError(
                f"Station {station_id} not found in the PAGASA AWS table "
                "(page layout may have changed)."
            )

        # Expected column order as of the current page layout:
        # Site ID | Site Name | Temperature | Humidity | Wind Speed |
        # Wind Direction | Precipitation | Pressure | Solar Radiation |
        # Last Updated
        if len(target_cells) < 10:
            raise ValueError(
                f"PAGASA AWS row for station {station_id} has fewer "
                f"columns than expected ({len(target_cells)}); page "
                "layout may have changed."
            )

        (
            site_id, site_name, temp_txt, humidity_txt, wind_speed_txt,
            wind_dir_txt, precip_txt, pressure_txt, solar_txt,
            last_updated_txt,
        ) = target_cells[:10]

    except PagasaUnavailableError:
        raise

    except Exception as err:
        raise PagasaUnavailableError(
            f"Could not parse the PAGASA AWS table: {err}"
        )

    observed_at = _parse_last_updated(last_updated_txt)
    now = datetime.datetime.now(datetime.timezone.utc)

    age_minutes = (
        (now - observed_at).total_seconds() / 60.0
        if observed_at is not None
        else None
    )

    # Reject unparseable timestamps, anything stale beyond our threshold,
    # and anything claiming to be from the future (a clock issue on the
    # station, or one of the known stuck-sensor rows on this page that
    # reports a nonsensical far-future date).
    if (
        age_minutes is None
        or age_minutes > PAGASA_MAX_READING_AGE_MINUTES
        or age_minutes < -5
    ):
        raise PagasaUnavailableError(
            f"PAGASA reading for station {station_id} is stale, "
            f"unparseable, or clock-skewed (age_minutes={age_minutes})."
        )

    return {
        "station_id": site_id,
        "station_name": site_name,
        "temperature_c": _parse_number(temp_txt),
        "humidity_pct": _parse_number(humidity_txt),
        "wind_speed_kph": _parse_number(wind_speed_txt),
        "wind_direction": wind_dir_txt.strip() or None,
        "precipitation_mm_hr": _parse_number(precip_txt),
        "pressure_hpa": _parse_number(pressure_txt),
        "solar_radiation": _parse_number(solar_txt),
        "observed_at": observed_at.isoformat(),
        "age_minutes": round(age_minutes, 1),
    }
