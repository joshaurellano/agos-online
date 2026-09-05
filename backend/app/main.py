"""
FastAPI application assembly.

This module only wires things together -- config, weather client,
model registry, and API routers -- it doesn't contain business logic
itself. Run the server via the root-level `main.py` (or directly with
`uvicorn app.main:app`).
"""

import os
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from dotenv import load_dotenv
load_dotenv()

from app.weather.persistence import load_cache_from_disk
from app.api import routes_diagnostics, routes_weather, routes_flood

app = FastAPI(
    title="Naga City Brgy. Triangulo 14-Day Flood & Rain Forecast API (v3)",
    description=(
        "FastAPI backend hosting a 14-day encoder-decoder flood forecast "
        "engine (GRU / LSTM / CNN, selectable or compared side by side) "
        "that uses Open-Meteo forecast data as known future inputs. "
        "Weather data is cached and protected against API rate limiting."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_diagnostics.router)
app.include_router(routes_weather.router)
app.include_router(routes_flood.router)

# Prime the weather cache from Upstash immediately at import time, before
# any request comes in and before the first fetch_weather() call -- same
# timing the original main.py used.
load_cache_from_disk()
