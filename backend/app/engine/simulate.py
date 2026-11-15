"""Monte Carlo simulation with the chain-dependent (Markov-Gamma) model.

Each simulated year:
  day-by-day wet/dry state from the monthly Markov chain,
  wet-day amount = 1 mm + Gamma(k_season, theta_season).
Repeating this thousands of times gives the *distribution* of annual and monsoon
totals, which is the uncertainty statement a single regression line cannot give.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import MONTH_TO_SEASON, WET_THRESHOLD_MM

DAYS = pd.date_range("2001-01-01", "2001-12-31", freq="D")  # a non-leap template year
MONTH_OF_DAY = DAYS.month.to_numpy()


def simulate_years(monthly: list[dict], season_fits: dict, n_years: int = 2000, seed: int = 7) -> dict:
    rng = np.random.default_rng(seed)
    p01 = np.array([monthly[m - 1]["p01"] for m in MONTH_OF_DAY])
    p11 = np.array([monthly[m - 1]["p11"] for m in MONTH_OF_DAY])
    shape = np.array([season_fits[MONTH_TO_SEASON[m]]["shape"] for m in MONTH_OF_DAY])
    scale = np.array([season_fits[MONTH_TO_SEASON[m]]["scale"] for m in MONTH_OF_DAY])

    state = rng.random(n_years) < monthly[0]["stationary_wet"]
    rain = np.zeros((n_years, len(DAYS)))
    for d in range(len(DAYS)):
        p = np.where(state, p11[d], p01[d])
        state = rng.random(n_years) < p
        amt = WET_THRESHOLD_MM + rng.gamma(shape[d], scale[d], n_years)
        rain[:, d] = np.where(state, amt, 0.0)

    monsoon = (MONTH_OF_DAY >= 6) & (MONTH_OF_DAY <= 9)
    return {
        "annual": rain.sum(axis=1),
        "monsoon": rain[:, monsoon].sum(axis=1),
        "wet_days": (rain >= WET_THRESHOLD_MM).sum(axis=1),
        "max_day": rain.max(axis=1),
        "example": rain[0],
    }


def _hist(x: np.ndarray, bins: int = 30, lo: float | None = None, hi: float | None = None) -> dict:
    lo = np.min(x) if lo is None else lo
    hi = np.max(x) if hi is None else hi
    counts, edges = np.histogram(x, bins=np.linspace(lo, hi, bins + 1))
    return {"edges": edges.tolist(), "density": (counts / len(x)).tolist()}


def summarise(sim: dict, observed_years: list[dict]) -> dict:
    obs_annual = np.array([y["total"] for y in observed_years if y["days"] >= 360])
    obs_monsoon = np.array([y["monsoon_total"] for y in observed_years if y["days"] >= 360])
    out = {"n_years": int(len(sim["annual"]))}
    for key, obs in [("annual", obs_annual), ("monsoon", obs_monsoon)]:
        s = sim[key]
        lo = min(s.min(), obs.min()) if len(obs) else s.min()
        hi = max(s.max(), obs.max()) if len(obs) else s.max()
        out[key] = {
            "mean": float(s.mean()),
            "sd": float(s.std(ddof=1)),
            "p05": float(np.percentile(s, 5)),
            "p50": float(np.percentile(s, 50)),
            "p95": float(np.percentile(s, 95)),
            "hist": _hist(s, 32, lo, hi),
            "observed": obs.tolist(),
            "observed_mean": float(obs.mean()) if len(obs) else None,
            "observed_sd": float(obs.std(ddof=1)) if len(obs) > 1 else None,
            "observed_within_90": float(np.mean((obs >= np.percentile(s, 5)) & (obs <= np.percentile(s, 95))))
            if len(obs)
            else None,
        }
    out["wet_days"] = {"mean": float(sim["wet_days"].mean()), "sd": float(sim["wet_days"].std(ddof=1))}
    out["max_day"] = {
        "p50": float(np.percentile(sim["max_day"], 50)),
        "p95": float(np.percentile(sim["max_day"], 95)),
    }
    out["example_year"] = [round(float(v), 1) for v in sim["example"]]
    return out


def run(monthly: list[dict], season_fits: dict, observed_years: list[dict], n_years: int = 2000, seed: int = 7) -> dict:
    return summarise(simulate_years(monthly, season_fits, n_years, seed), observed_years)
