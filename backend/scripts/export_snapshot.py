"""Export the full analysis to frontend/public/snapshot.json (and frontend/dist if built).

The website reads this file when no Python backend is reachable - e.g. when the
frontend is hosted on GitHub Pages - so every page still works in "static mode".
Run it again whenever the dataset changes:
    python backend/scripts/export_snapshot.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.analysis import engine  # noqa: E402
from app.config import FRONTEND_DIST, PROJECT_DIR  # noqa: E402
from app.data import active_data_file  # noqa: E402


def main() -> None:
    analysis = engine.ensure().analysis
    payload = json.dumps(analysis, ensure_ascii=False, separators=(",", ":"))
    targets = [PROJECT_DIR / "frontend" / "public" / "snapshot.json"]
    if FRONTEND_DIST.exists():
        targets.append(FRONTEND_DIST / "snapshot.json")
    for t in targets:
        t.parent.mkdir(parents=True, exist_ok=True)
        t.write_text(payload, encoding="utf-8")
        print(f"Wrote {t} ({len(payload) / 1024:.0f} KB)")
        # the dataset itself, so "Download CSV" also works in static mode
        (t.parent / "dataset.csv").write_bytes(active_data_file().read_bytes())
    m = analysis["meta"]
    print(f"Dataset: {m['source']} | {m['location']} | {m['start']} to {m['end']}")


if __name__ == "__main__":
    main()
