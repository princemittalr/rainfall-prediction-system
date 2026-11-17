"""Runs the complete pipeline and exposes predictions.

Weather data -> cleaning -> descriptive statistics -> probability distributions
-> Markov chain -> correlation & regression -> Monte Carlo -> evaluation
"""
from __future__ import annotations

import json
import math
import threading
from datetime import datetime, timezone

import numpy as np
from scipy import stats

from .config import (
    HEAVY_RAIN_MM,
    MONTH_NAMES,
    MONTH_TO_SEASON,
    PREDICTORS,
    SYNTHETIC_TRUTH_FILE,
    TEST_YEARS,
    WET_THRESHOLD_MM,
)
from .data import active_data_file, clean, load_raw
from .engine import descriptive, distributions, markov, regression, simulate
from .engine.features import add_features, features_from_inputs

IMD_CATEGORIES = [  # India Meteorological Department daily rainfall categories
    (0.0, 0.1, "No rain"),
    (0.1, 2.5, "Very light rain"),
    (2.5, 15.6, "Light rain"),
    (15.6, 64.5, "Moderate rain"),
    (64.5, 115.6, "Heavy rain"),
    (115.6, 204.5, "Very heavy rain"),
    (204.5, math.inf, "Extremely heavy rain"),
]


def imd_category(mm: float) -> str:
    for lo, hi, name in IMD_CATEGORIES:
        if lo <= mm < hi:
            return name
    return "No rain"


def to_json_safe(obj, digits: int = 6):
    """Convert NumPy types to Python, NaN/inf to None and trim float noise."""
    if isinstance(obj, dict):
        return {str(k): to_json_safe(v, digits) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_json_safe(v, digits) for v in obj]
    if isinstance(obj, np.ndarray):
        return to_json_safe(obj.tolist(), digits)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        f = float(obj)
        if not math.isfinite(f):
            return None
        if f == 0:
            return 0.0
        return float(f"{f:.{digits}g}")
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


class Engine:
    """Holds the fitted models in memory; rebuilds automatically if the data file changes."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._mtime: float | None = None
        self._path = None
        self.analysis: dict = {}
        self.models: dict[str, regression.OLSModel] = {}

    def ensure(self) -> "Engine":
        path = active_data_file()
        mtime = path.stat().st_mtime
        if self._mtime != mtime or self._path != path:
            with self._lock:
                if self._mtime != mtime or self._path != path:
                    self._build()
                    self._mtime, self._path = mtime, path
        return self

    # ------------------------------------------------------------------
    def _build(self) -> None:
        raw, meta = load_raw()
        df, cleaning = clean(raw)
        df = add_features(df)
        years = sorted(df["year"].unique())
        full_years = [y for y in years if (df["year"] == y).sum() >= 360]
        test_years = full_years[-TEST_YEARS:]
        train = df[df["year"] < test_years[0]].reset_index(drop=True)
        test = df[df["year"].isin(test_years)].reset_index(drop=True)

        desc_summary = descriptive.summary(df)
        clim = descriptive.climatology(df)
        yearly = descriptive.yearly(df)
        dist = distributions.analyse(df)
        mk = markov.analyse(df, train, test)
        reg, models = regression.analyse(train, test)
        mc = simulate.run(mk["monthly"], dist["season_fits"], yearly)

        latest = df.iloc[-1]
        self.models = {m.key: m for m in models}
        self.monthly = mk["monthly"]
        self.season_fits = dist["season_fits"]
        self.analysis = to_json_safe(
            {
                "meta": {
                    **meta,
                    "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "wet_threshold_mm": WET_THRESHOLD_MM,
                    "heavy_rain_mm": HEAVY_RAIN_MM,
                    "start": cleaning["start"],
                    "end": cleaning["end"],
                    "n_days": int(len(df)),
                    "n_years": int(len(years)),
                },
                "cleaning": cleaning,
                "descriptive": {
                    "summary": desc_summary,
                    "climatology": clim,
                    "yearly": yearly,
                    "correlation": descriptive.correlations(df),
                    "histograms": descriptive.histograms(df),
                    "recent": descriptive.recent_series(df),
                    "scatter": descriptive.scatter_sample(df),
                },
                "distribution": dist,
                "markov": mk,
                "regression": reg,
                "simulation": mc,
                "latest": {
                    "date": latest["date"].strftime("%Y-%m-%d"),
                    **{c: float(latest[c]) for c in ["rain_mm", *PREDICTORS]},
                    "month": int(latest["month"]),
                },
                "validation": self._validation(meta, mk, dist),
                "key_findings": self._findings(dist, mk, reg, mc, desc_summary),
            }
        )

    # ------------------------------------------------------------------
    @staticmethod
    def _validation(meta: dict, mk: dict, dist: dict) -> dict | None:
        """Parameter-recovery check: only meaningful for the synthetic dataset, where the
        true generating parameters are known."""
        if not meta.get("synthetic") or not SYNTHETIC_TRUTH_FILE.exists():
            return None
        truth = json.loads(SYNTHETIC_TRUTH_FILE.read_text())
        rows = []
        for m in [6, 7, 8, 9]:
            est = mk["monthly"][m - 1]
            rows.append({"parameter": f"p01 ({MONTH_NAMES[m-1]})", "true": truth["p01"][m - 1], "estimated": est["p01"]})
            rows.append({"parameter": f"p11 ({MONTH_NAMES[m-1]})", "true": truth["p11"][m - 1], "estimated": est["p11"]})
        mon = next(s for s in dist["seasons"] if s["season"] == "Monsoon")
        rows.append({"parameter": "Gamma shape k (Monsoon)", "true": truth["season_gamma"]["Monsoon"]["shape"], "estimated": mon["shape"]})
        rows.append({"parameter": "Gamma scale θ (Monsoon)", "true": truth["season_gamma"]["Monsoon"]["scale"], "estimated": mon["scale"]})
        return {"rows": rows, "note": truth["note"]}

    @staticmethod
    def _findings(dist, mk, reg, mc, summary) -> list[dict]:
        rain = next(s for s in summary if s["key"] == "rain_mm")
        mult = next(m for m in reg["models"] if m["key"] == "multiple")
        ext = next(m for m in reg["models"] if m["key"] == "extended")
        simple = next(m for m in reg["models"] if m["key"] == "simple")
        ov = mk["overall"]
        return [
            {"title": "Rainfall is not normal", "value": f"skew {rain['skewness']:.1f}",
             "text": f"{dist['p_dry']*100:.0f}% of days are dry; wet-day amounts are best described by the {dist['best']} distribution (lowest AIC)."},
            {"title": "Rain has memory", "value": f"χ² = {ov['test']['chi2']:.0f}",
             "text": f"P(wet | wet yesterday) = {ov['P'][1][1]:.2f} vs P(wet | dry yesterday) = {ov['P'][0][1]:.2f}; "
                     f"independence rejected (p {'< 0.001' if ov['test']['p'] < 0.001 else '= ' + format(ov['test']['p'], '.3f')})."},
            {"title": "Multiple factors beat one", "value": f"R² {simple['summary']['r2']:.2f} → {ext['summary']['r2']:.2f}",
             "text": f"Humidity alone: skill {simple['test']['skill_vs_climatology']*100:+.0f}% vs climatology. 5 factors: "
                     f"{mult['test']['skill_vs_climatology']*100:+.0f}%. Extended multiple regression: {ext['test']['skill_vs_climatology']*100:+.0f}% on unseen years."},
            {"title": "Uncertainty is quantified", "value": f"{ext['test']['pi_coverage']*100:.0f}% coverage",
             "text": "Share of test days whose rainfall fell inside the nominal 95% prediction interval."},
            {"title": "Simulation reproduces the climate", "value": f"{mc['annual']['mean']:.0f} mm/yr",
             "text": f"Monte Carlo mean annual total; observed mean {mc['annual']['observed_mean']:.0f} mm. "
                     f"Simulated SD {mc['annual']['sd']:.0f} mm vs observed {mc['annual']['observed_sd']:.0f} mm."},
        ]

    # ------------------------------------------------------------------
    def predict(self, inputs: dict, level: float = 0.95, threshold: float = 50.0) -> dict:
        self.ensure()
        month = int(inputs["month"])
        feats = features_from_inputs(inputs)
        today_wet = feats["rain_today"] >= WET_THRESHOLD_MM if inputs.get("rain_today") is not None else bool(inputs.get("today_wet", False))
        reg_out = []
        for key, m in self.models.items():
            x = np.array([feats[f] for f in m.features])
            p = m.predict(x.reshape(1, -1), level)
            item = {
                "key": key,
                "name": m.name,
                "target": m.target,
                "yhat": float(p["yhat"][0]),
                "ci": [float(p["ci"][0][0]), float(p["ci"][1][0])],
                "pi": [float(p["pi"][0][0]), float(p["pi"][1][0])],
                "category": imd_category(float(p["yhat"][0])),
            }
            if not m.log_target:
                item["contributions"] = m.contributions(x)
            reg_out.append(item)

        mm = self.monthly[month - 1]
        P = np.array(mm["P"])
        p_wet_tomorrow = float(P[1, 1] if today_wet else P[0, 1])
        season = MONTH_TO_SEASON[month]
        g = self.season_fits[season]
        gamma = stats.gamma(g["shape"], scale=g["scale"])
        sf_t = float(gamma.sf(max(threshold - WET_THRESHOLD_MM, 0))) if threshold >= WET_THRESHOLD_MM else 1.0
        horizon, M = [], np.eye(2)
        start = np.array([0.0, 1.0]) if today_wet else np.array([1.0, 0.0])
        for d in range(1, 8):
            M = M @ P
            horizon.append({"day": d, "p_wet": float((start @ M)[1])})
        mean_if_wet = WET_THRESHOLD_MM + g["shape"] * g["scale"]
        return to_json_safe(
            {
                "inputs": {**inputs, "level": level, "threshold": threshold},
                "features": feats,
                "regression": reg_out,
                "markov": {
                    "month": MONTH_NAMES[month - 1],
                    "today": "Wet" if today_wet else "Dry",
                    "p_wet_tomorrow": p_wet_tomorrow,
                    "horizon": horizon,
                    "stationary_wet": mm["stationary_wet"],
                },
                "distribution": {
                    "season": season,
                    "shape": g["shape"],
                    "scale": g["scale"],
                    "mean_if_wet": mean_if_wet,
                    "interval_if_wet": [
                        float(WET_THRESHOLD_MM + gamma.ppf((1 - level) / 2)),
                        float(WET_THRESHOLD_MM + gamma.ppf(0.5 + level / 2)),
                    ],
                    "p_exceed_if_wet": sf_t,
                    "p_exceed_tomorrow": p_wet_tomorrow * sf_t,
                    "expected_tomorrow": p_wet_tomorrow * mean_if_wet,
                },
            }
        )

    def exceedance(self, threshold: float, season: str | None = None) -> dict:
        """P(X > t) via the law of total probability, for one season or the whole year."""
        self.ensure()
        d = self.analysis["distribution"]
        seasons = [season] if season else list(self.season_fits)
        out = {}
        for s in seasons:
            g = self.season_fits[s]
            sf = float(stats.gamma.sf(max(threshold - WET_THRESHOLD_MM, 0), g["shape"], scale=g["scale"]))
            p = d["p_wet_season"][s]
            out[s] = {"p_wet": p, "p_exceed_if_wet": sf, "p_exceed": p * sf if threshold >= WET_THRESHOLD_MM else p}
        return to_json_safe({"threshold": threshold, "seasons": out})

    def simulate(self, n_years: int, seed: int) -> dict:
        self.ensure()
        return to_json_safe(simulate.run(self.monthly, self.season_fits, self.analysis["descriptive"]["yearly"], n_years, seed))


engine = Engine()
