"""Dataset loading and the data-cleaning stage of the pipeline."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from .config import BACKEND_DIR, REAL_DATA_FILE, SYNTHETIC_DATA_FILE, VARIABLES

# Physically plausible ranges used for validity checks.
BOUNDS = {
    "rain_mm": (0, 1000),
    "temp_c": (-50, 60),
    "humidity_pct": (0, 100),
    "pressure_hpa": (850, 1090),
    "cloud_pct": (0, 100),
    "wind_kmh": (0, 300),
}


def active_data_file() -> Path:
    """Real data wins if it has been downloaded; otherwise use the synthetic set."""
    if REAL_DATA_FILE.exists():
        return REAL_DATA_FILE
    if not SYNTHETIC_DATA_FILE.exists():
        # Create the synthetic dataset on first run.
        import importlib.util

        spec = importlib.util.spec_from_file_location("make_synthetic", BACKEND_DIR / "scripts" / "make_synthetic.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)  # type: ignore[union-attr]
        module.write_synthetic()
    return SYNTHETIC_DATA_FILE


def load_meta(path: Path) -> dict:
    meta_path = path.with_suffix(".meta.json")
    if meta_path.exists():
        return json.loads(meta_path.read_text())
    return {"source": path.name, "location": "Unknown", "synthetic": path == SYNTHETIC_DATA_FILE}


def load_raw(path: Path | None = None) -> tuple[pd.DataFrame, dict]:
    path = path or active_data_file()
    df = pd.read_csv(path)
    meta = load_meta(path)
    meta["file"] = path.name
    return df, meta


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Clean the raw table and return (clean_df, report).

    Steps
    1. Parse dates, drop duplicate dates, sort chronologically.
    2. Re-index onto a complete daily calendar so gaps become visible.
    3. Values outside physical bounds become missing.
    4. Rainfall: missing days are dropped (imputing rain would invent events).
       Other variables: short gaps (<= 3 days) are linearly interpolated.
    5. Extreme rainfall is *flagged* with the IQR rule but kept, because heavy
       rain days are genuine and are exactly what the model must explain.
    """
    report: dict = {"raw_rows": int(len(df))}
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    before = len(df)
    df = df.drop_duplicates(subset="date", keep="first").sort_values("date")
    report["duplicates_removed"] = int(before - len(df))

    full = pd.date_range(df["date"].min(), df["date"].max(), freq="D")
    report["calendar_gaps"] = int(len(full) - len(df))
    df = df.set_index("date").reindex(full)
    df.index.name = "date"

    missing_before = {c: int(df[c].isna().sum()) for c in VARIABLES}
    out_of_bounds = {}
    for col, (lo, hi) in BOUNDS.items():
        bad = (df[col] < lo) | (df[col] > hi)
        out_of_bounds[col] = int(bad.sum())
        df.loc[bad, col] = np.nan
    report["missing_before"] = missing_before
    report["out_of_bounds"] = out_of_bounds

    rain_missing = df["rain_mm"].isna()
    report["rain_rows_dropped"] = int(rain_missing.sum())
    interpolated = {}
    for col in VARIABLES[1:]:
        gaps = int(df[col].isna().sum())
        df[col] = df[col].interpolate(method="linear", limit=3, limit_area="inside")
        interpolated[col] = gaps - int(df[col].isna().sum())
    report["interpolated"] = interpolated
    df = df[~rain_missing].dropna()

    wet = df.loc[df["rain_mm"] >= 1, "rain_mm"]
    wq1, wq3 = np.percentile(wet, [25, 75]) if len(wet) else (0, 0)
    report["extreme_rain_days_flagged"] = int((df["rain_mm"] > wq3 + 3 * (wq3 - wq1)).sum())
    report["clean_rows"] = int(len(df))
    report["start"] = df.index.min().strftime("%Y-%m-%d")
    report["end"] = df.index.max().strftime("%Y-%m-%d")

    df = df.reset_index()
    df["year"] = df["date"].dt.year
    df["month"] = df["date"].dt.month
    return df, report
