"""
Diagnostic endpoints: root health check, raw Open-Meteo connectivity
test, and a model-registry status endpoint (new -- useful now that
there are three algorithms instead of one).
"""

import time

import requests
from fastapi import APIRouter

from app.models.registry import registry

router = APIRouter()


@router.get("/")
def read_root():
    return {"Hello": "World"}


@router.get("/api/test-openmeteo")
def test_openmeteo():
    try:
        url = (
            "https://api.open-meteo.com/v1/forecast?"
            "latitude=13.6192&longitude=123.1814"
            "&current=precipitation"
            "&forecast_days=1"
            "&timezone=Asia/Singapore"
        )

        print("Testing Open-Meteo...")
        start = time.time()

        response = requests.get(url, timeout=(5, 10))

        elapsed = time.time() - start

        print(f"Open-Meteo status: {response.status_code}")
        print(f"Open-Meteo response time: {elapsed:.2f}s")

        return {
            "status": "success",
            "http_status": response.status_code,
            "response_time_seconds": round(elapsed, 2),
            "openmeteo": response.json()
        }

    except requests.exceptions.Timeout:
        return {
            "status": "error",
            "message": "Open-Meteo request timed out"
        }

    except requests.exceptions.RequestException as e:
        return {
            "status": "error",
            "message": f"Open-Meteo request failed: {str(e)}"
        }


@router.get("/api/models")
def list_models():
    """
    Reports which algorithms (GRU / LSTM / CNN) are actually loaded and
    ready to serve, so a frontend can e.g. hide a tab for a model whose
    .h5 file didn't ship, instead of hitting a 404/error at request time.
    """
    return {
        "status": "success",
        "registry_ready": registry.ready,
        "models": registry.status(),
    }
