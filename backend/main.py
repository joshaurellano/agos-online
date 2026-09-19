"""
Root entrypoint. All the actual application code lives under app/ --
see app/main.py for how the FastAPI app is assembled.

Run locally with:
    python main.py

Or in production (e.g. Render's start command):
    uvicorn main:app --host 0.0.0.0 --port $PORT
"""

import sys

# Windows' console defaults to the cp1252 codepage, which can't encode the
# emoji used in this app's startup/status logging (🟢/⚠️/🌦️ etc.). Linux
# servers (Render included) default to UTF-8 and never hit this, but
# `python main.py` on Windows would otherwise crash on the very first log
# line, before uvicorn even starts. Force UTF-8 on stdout/stderr so the
# same code runs the same way on both.
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from app.main import app  # noqa: E402, F401  (re-exported for `uvicorn main:app`)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
