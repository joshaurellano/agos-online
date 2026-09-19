"""
SHAP explainability endpoint.

    GET /api/explain/gru
    GET /api/explain/lstm
    GET /api/explain/cnn

On-demand only -- not designed to be polled every 30s like
/api/predict-flood. Fetch it once per analytics-page view.
"""

from fastapi import APIRouter, HTTPException

from app.config.settings import MODEL_REGISTRY
from app.models.explain import explain_model, ModelUnavailableError
from app.weather.client import WeatherUnavailableError
from app.weather.cache import get_cache_status

router = APIRouter()


@router.get("/api/explain/{model_key}")
def explain_flood_prediction(model_key: str):
    if model_key not in MODEL_REGISTRY:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown model '{model_key}'. Valid options: {list(MODEL_REGISTRY)}",
        )

    try:
        return explain_model(model_key)

    except ModelUnavailableError as err:
        return {
            "status": "error",
            "message": str(err),
            "features": [],
        }

    except WeatherUnavailableError as err:
        return {
            "status": "error",
            "error_type": "weather_unavailable",
            "message": f"Hindi ma-access ang weather forecast: {err}",
            "weather_cache": get_cache_status(),
            "features": [],
        }

    except Exception as err:
        return {
            "status": "error",
            "message": f"Hindi na-compute ang SHAP explanation: {err}",
            "features": [],
        }
