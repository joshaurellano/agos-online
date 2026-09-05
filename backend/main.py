"""
Root entrypoint. All the actual application code lives under app/ --
see app/main.py for how the FastAPI app is assembled.

Run locally with:
    python main.py

Or in production (e.g. Render's start command):
    uvicorn main:app --host 0.0.0.0 --port $PORT
"""

from app.main import app  # noqa: F401  (re-exported for `uvicorn main:app`)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
