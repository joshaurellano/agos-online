"""
Small stateless helpers: WMO weather-code labels, wind->signal mapping,
and probability->alert-level mapping. No side effects, no I/O.
"""

WMO_LABELS = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Icy fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight showers",
    81: "Moderate showers",
    82: "Violent showers",
    95: "Thunderstorm",
    96: "Thunderstorm w/ hail",
    99: "Heavy thunderstorm w/ hail",
}


def wmo_label(code):
    if code is None:
        return "Unknown"

    try:
        return WMO_LABELS.get(int(code), f"Code {int(code)}")
    except Exception:
        return "Unknown"


def wind_to_signal(kph):
    if kph is None:
        return 0

    if kph >= 118:
        return 4
    if kph >= 89:
        return 3
    if kph >= 62:
        return 2
    if kph >= 39:
        return 1

    return 0


def probability_to_alert_level(p):
    if p >= 0.75:
        return "CRITICAL"

    if p >= 0.50:
        return "WARNING"

    if p >= 0.25:
        return "ADVISORY"

    return "NORMAL"
