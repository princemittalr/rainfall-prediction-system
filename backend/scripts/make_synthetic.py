"""Generate a SYNTHETIC daily weather dataset with known statistical structure.

Why this exists
---------------
1. The app must run out of the box, even without internet.
2. Because we choose the "true" parameters ourselves, we can check that the
   statistics engine recovers them (a parameter-recovery test). That is a
   standard way to validate a statistical pipeline before trusting it on
   real data.

The generator is a chain-dependent stochastic weather generator:
  * wet/dry occurrence  -> first-order two-state Markov chain (monthly p01, p11)
  * wet-day amount      -> 1 mm + Gamma(k, theta) (seasonal shape/scale)
  * covariates          -> monthly climatology + wet-day effect + AR(1) noise
The monthly climatology is loosely modelled on Mumbai's monsoon climate.

THIS DATA IS NOT REAL OBSERVATION. The app labels it "Synthetic" everywhere.
Run `python backend/scripts/fetch_data.py` to download real historical data.

Usage:  python backend/scripts/make_synthetic.py [--start 2000] [--end 2024] [--seed 42]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import (  # noqa: E402
    MONTH_TO_SEASON,
    SYNTHETIC_DATA_FILE,
    SYNTHETIC_TRUTH_FILE,
    WET_THRESHOLD_MM,
)

# ---- "true" parameters (index 0 = January) -------------------------------
WET_DAYS = [0.3, 0.2, 0.2, 0.4, 1.6, 17.0, 26.0, 24.0, 17.0, 5.0, 1.3, 0.4]
P11 = [0.20, 0.20, 0.20, 0.25, 0.35, 0.75, 0.88, 0.85, 0.72, 0.50, 0.30, 0.20]
DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
SEASON_GAMMA = {  # shape k, scale theta for the excess over 1 mm
    "Winter": (0.70, 8.0),
    "Pre-monsoon": (0.65, 14.0),
    "Monsoon": (0.80, 32.0),
    "Post-monsoon": (0.70, 20.0),
}
TEMP = [24.5, 25.5, 27.5, 29.0, 30.0, 29.0, 27.5, 27.2, 27.5, 28.5, 27.5, 25.5]
HUM = [60, 61, 63, 68, 72, 80, 85, 84, 81, 74, 66, 62]
PRES = [1013.0, 1012.0, 1010.5, 1009.0, 1007.0, 1004.5, 1004.0, 1005.0, 1007.0, 1009.0, 1011.0, 1012.5]
CLOUD = [15, 15, 18, 22, 35, 72, 82, 80, 68, 42, 25, 18]
WIND = [15, 16, 17, 18, 20, 24, 26, 23, 18, 14, 13, 14]


def true_transition_probs() -> tuple[list[float], list[float]]:
    """Derive p01 from the target stationary wet fraction: pi = p01 / (p01 + p10)."""
    p01 = []
    for m in range(12):
        pi = min(WET_DAYS[m] / DAYS_IN_MONTH[m], 0.95)
        p10 = 1 - P11[m]
        p01.append(round(pi * p10 / (1 - pi), 4))
    return p01, P11


def generate(start: int, end: int, seed: int) -> tuple[pd.DataFrame, dict]:
    rng = np.random.default_rng(seed)
    dates = pd.date_range(f"{start}-01-01", f"{end}-12-31", freq="D")
    p01, p11 = true_transition_probs()
    n = len(dates)
    months = dates.month.to_numpy() - 1

    wet = np.zeros(n, dtype=bool)
    z = np.zeros(n)  # AR(1) latent "moisture" anomaly
    for t in range(n):
        m = months[t]
        prev = wet[t - 1] if t else False
        p = p11[m] if prev else p01[m]
        wet[t] = rng.random() < p
        z[t] = (0.7 * z[t - 1] if t else 0) + rng.normal(0, 0.7)

    hum = np.array([HUM[m] for m in months]) + 5 * wet + 3 * z + rng.normal(0, 2.5, n)
    hum = np.clip(hum, 25, 99)

    rain = np.zeros(n)
    for t in np.where(wet)[0]:
        m = months[t]
        k, theta = SEASON_GAMMA[MONTH_TO_SEASON[m + 1]]
        # heavier rain on more humid days -> genuine humidity/rainfall correlation
        factor = np.exp(0.05 * (hum[t] - HUM[m] - 5))
        rain[t] = WET_THRESHOLD_MM + rng.gamma(k, theta) * factor
    # trace amounts (< 1 mm) on some dry days
    trace = (~wet) & (rng.random(n) < 0.12)
    rain[trace] = rng.uniform(0.1, 0.9, trace.sum())

    temp = np.array([TEMP[m] for m in months]) - 1.2 * wet - 0.01 * rain + rng.normal(0, 0.9, n)
    pres = np.array([PRES[m] for m in months]) - 1.5 * wet - 1.2 * z - 0.01 * rain + rng.normal(0, 1.2, n)
    cloud = np.clip(np.array([CLOUD[m] for m in months]) + 14 * wet + 6 * z + 0.12 * rain + rng.normal(0, 7, n), 0, 100)
    wind = np.clip(np.array([WIND[m] for m in months]) + 3 * wet + 0.06 * rain + rng.normal(0, 3.5, n), 2, None)

    df = pd.DataFrame(
        {
            "date": dates.strftime("%Y-%m-%d"),
            "rain_mm": rain.round(1),
            "temp_c": temp.round(1),
            "humidity_pct": hum.round(0),
            "pressure_hpa": pres.round(1),
            "cloud_pct": cloud.round(0),
            "wind_kmh": wind.round(1),
        }
    )
    # A few gaps and a duplicate row so the cleaning step has real work to do.
    for col in ["temp_c", "humidity_pct", "pressure_hpa", "cloud_pct", "wind_kmh"]:
        idx = rng.choice(n, size=max(1, n // 400), replace=False)
        df.loc[idx, col] = np.nan
    df = pd.concat([df, df.iloc[[100, 2000]]]).sort_values("date").reset_index(drop=True)

    truth = {
        "description": "True parameters used to generate the synthetic dataset",
        "seed": seed,
        "p01": p01,
        "p11": p11,
        "season_gamma": {s: {"shape": k, "scale": th} for s, (k, th) in SEASON_GAMMA.items()},
        "note": "Gamma parameters are for the excess over 1 mm at average humidity; "
        "the humidity factor adds extra spread, so fitted scale is expected to be slightly larger.",
    }
    return df, truth


def write_synthetic(start: int = 2000, end: int = 2024, seed: int = 42) -> None:
    df, truth = generate(start, end, seed)
    SYNTHETIC_DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(SYNTHETIC_DATA_FILE, index=False)
    SYNTHETIC_TRUTH_FILE.write_text(json.dumps(truth, indent=2))
    meta = {
        "source": "Synthetic (Markov-Gamma weather generator)",
        "location": "Mumbai-like monsoon climate (synthetic)",
        "latitude": 19.076,
        "longitude": 72.8777,
        "synthetic": True,
        "citation": "Generated by backend/scripts/make_synthetic.py",
    }
    SYNTHETIC_DATA_FILE.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2))
    print(f"Wrote {len(df):,} rows to {SYNTHETIC_DATA_FILE}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", type=int, default=2000)
    ap.add_argument("--end", type=int, default=2024)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    write_synthetic(args.start, args.end, args.seed)


if __name__ == "__main__":
    main()
