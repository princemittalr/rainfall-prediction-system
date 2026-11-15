#!/usr/bin/env bash
# macOS / Linux launcher.  ./run.sh [city]    SYNTHETIC=1 ./run.sh
set -e
cd "$(dirname "$0")"
CITY="${1:-mumbai}"; PORT="${PORT:-8000}"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/python -m pip install -q --upgrade pip
.venv/bin/python -m pip install -q -r requirements.txt
if [ -n "$SYNTHETIC" ]; then .venv/bin/python backend/scripts/fetch_data.py --reset
elif [ ! -f backend/data/rainfall_real.csv ]; then .venv/bin/python backend/scripts/fetch_data.py --city "$CITY" || echo "Download failed - using synthetic data"; fi
.venv/bin/python backend/scripts/export_snapshot.py
echo "Open http://127.0.0.1:$PORT"
exec .venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port "$PORT"
