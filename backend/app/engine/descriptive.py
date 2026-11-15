"""Module I (part 1): descriptive statistics, climatology and correlation."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from ..config import HEAVY_RAIN_MM, LABELS, MONTH_NAMES, PREDICTORS, VARIABLES, WET_THRESHOLD_MM


def summary(df: pd.DataFrame) -> list[dict]:
    """Mean, variance, SD, shape and a 95% t-interval for the mean of every variable.

    Variance uses the unbiased sample estimator s^2 = sum (x - xbar)^2 / (n - 1).
    """
    rows = []
    for col in VARIABLES:
        x = df[col].to_numpy(dtype=float)
        n = len(x)
        mean = x.mean()
        var = x.var(ddof=1)
        sd = np.sqrt(var)
        se = sd / np.sqrt(n)
        t = stats.t.ppf(0.975, n - 1)
        q1, med, q3 = np.percentile(x, [25, 50, 75])
        rows.append(
            {
                "key": col,
                "label": LABELS[col],
                "n": n,
                "mean": mean,
                "variance": var,
                "sd": sd,
                "cv": sd / mean if mean else None,
                "min": x.min(),
                "q1": q1,
                "median": med,
                "q3": q3,
                "max": x.max(),
                "skewness": stats.skew(x),
                "kurtosis": stats.kurtosis(x),  # excess kurtosis (normal = 0)
                "ci95": [mean - t * se, mean + t * se],
            }
        )
    return rows


def climatology(df: pd.DataFrame) -> list[dict]:
    """Long-run monthly averages (the 'normal' year)."""
    years = df["year"].nunique()
    out = []
    for m in range(1, 13):
        d = df[df["month"] == m]
        wet = d["rain_mm"] >= WET_THRESHOLD_MM
        out.append(
            {
                "month": m,
                "name": MONTH_NAMES[m - 1],
                "rain_total_mean": d["rain_mm"].sum() / years,
                "rain_total_sd": d.groupby("year")["rain_mm"].sum().std(ddof=1),
                "wet_days_mean": wet.sum() / years,
                "p_wet": wet.mean(),
                "temp_c": d["temp_c"].mean(),
                "humidity_pct": d["humidity_pct"].mean(),
                "pressure_hpa": d["pressure_hpa"].mean(),
                "cloud_pct": d["cloud_pct"].mean(),
                "wind_kmh": d["wind_kmh"].mean(),
            }
        )
    return out


def yearly(df: pd.DataFrame) -> list[dict]:
    g = df.groupby("year")
    out = []
    for year, d in g:
        out.append(
            {
                "year": int(year),
                "total": d["rain_mm"].sum(),
                "monsoon_total": d.loc[d["month"].between(6, 9), "rain_mm"].sum(),
                "wet_days": int((d["rain_mm"] >= WET_THRESHOLD_MM).sum()),
                "heavy_days": int((d["rain_mm"] >= HEAVY_RAIN_MM).sum()),
                "max_day": d["rain_mm"].max(),
                "days": int(len(d)),
            }
        )
    return out


def correlations(df: pd.DataFrame) -> dict:
    """Pearson (linear) and Spearman (rank) matrices, plus a significance test of
    each predictor's correlation with rainfall: t = r sqrt(n-2) / sqrt(1-r^2)."""
    pearson = df[VARIABLES].corr(method="pearson")
    spearman = df[VARIABLES].corr(method="spearman")
    n = len(df)
    tests = []
    for col in PREDICTORS:
        r, p = stats.pearsonr(df[col], df["rain_mm"])
        rs, ps = stats.spearmanr(df[col], df["rain_mm"])
        t = r * np.sqrt(n - 2) / np.sqrt(1 - r**2)
        # 95% CI for r via Fisher z-transform
        z = np.arctanh(r)
        se = 1 / np.sqrt(n - 3)
        tests.append(
            {
                "key": col,
                "label": LABELS[col],
                "r": r,
                "t": t,
                "p": p,
                "ci95": [np.tanh(z - 1.96 * se), np.tanh(z + 1.96 * se)],
                "spearman": rs,
                "spearman_p": ps,
                "r2": r**2,
            }
        )
    tests.sort(key=lambda d: -abs(d["r"]))
    return {
        "variables": VARIABLES,
        "labels": [LABELS[v] for v in VARIABLES],
        "pearson": pearson.to_numpy().tolist(),
        "spearman": spearman.to_numpy().tolist(),
        "tests": tests,
        "n": n,
    }


def histograms(df: pd.DataFrame, bins: int = 30) -> dict:
    out = {}
    for col in VARIABLES:
        x = df[col].to_numpy(dtype=float)
        if col == "rain_mm":
            x = x[x >= WET_THRESHOLD_MM]
            edges = np.linspace(WET_THRESHOLD_MM, np.percentile(x, 99), bins + 1)
        else:
            edges = np.histogram_bin_edges(x, bins=bins)
        counts, edges = np.histogram(x, bins=edges)
        out[col] = {"edges": edges.tolist(), "counts": counts.tolist()}
    return out


def recent_series(df: pd.DataFrame, days: int = 365) -> list[dict]:
    d = df.tail(days)
    return [
        {
            "date": r.date.strftime("%Y-%m-%d"),
            "rain_mm": r.rain_mm,
            "temp_c": r.temp_c,
            "humidity_pct": r.humidity_pct,
            "pressure_hpa": r.pressure_hpa,
            "cloud_pct": r.cloud_pct,
            "wind_kmh": r.wind_kmh,
        }
        for r in d.itertuples()
    ]


def scatter_sample(df: pd.DataFrame, n: int = 1200, seed: int = 0) -> list[dict]:
    d = df.sample(min(n, len(df)), random_state=seed)
    return d[["rain_mm", *PREDICTORS, "month"]].to_dict(orient="records")
