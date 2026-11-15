"""Sanity tests for the statistics engine.  Run:  python -m pytest backend/tests -q"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.engine import markov  # noqa: E402
from app.engine.regression import OLSModel  # noqa: E402


def test_markov_mle_and_stationary():
    rng = np.random.default_rng(0)
    p01, p11 = 0.2, 0.7
    s = [0]
    for _ in range(50_000):
        s.append(int(rng.random() < (p11 if s[-1] else p01)))
    dates = pd.date_range("2000-01-01", periods=len(s), freq="D")
    df = pd.DataFrame({"date": dates, "rain_mm": np.array(s) * 5.0, "month": dates.month})
    fit = markov.fit_matrix(markov.transition_counts(df))
    assert abs(fit["P"][0, 1] - p01) < 0.01
    assert abs(fit["P"][1, 1] - p11) < 0.01
    pi = markov.stationary(fit["P"])
    assert abs(pi[1] - p01 / (p01 + 1 - p11)) < 0.01


def test_ols_matches_closed_form_and_scipy():
    rng = np.random.default_rng(1)
    x = rng.normal(70, 10, 500)
    y = 3 + 0.4 * x + rng.normal(0, 2, 500)
    df = pd.DataFrame({"humidity_pct": x, "rain_mm": y})
    m = OLSModel("t", "t", ["humidity_pct"]).fit(df)
    ref = stats.linregress(x, y)
    assert np.isclose(m.coef[1], ref.slope)
    assert np.isclose(m.coef[0], ref.intercept)
    assert np.isclose(m.summary["coefficients"][1]["se"], ref.stderr)
    assert np.isclose(m.summary["r2"], ref.rvalue ** 2)


def test_full_pipeline_runs():
    from app.analysis import engine

    a = engine.ensure().analysis
    assert a["meta"]["n_days"] > 3000
    assert 0 < a["distribution"]["p_wet"] < 1
    assert a["markov"]["overall"]["test"]["p"] < 0.05
    pred = engine.predict({"humidity_pct": 85, "cloud_pct": 80, "pressure_hpa": 1004, "temp_c": 27,
                           "wind_kmh": 25, "month": 7, "today_wet": True})
    for r in pred["regression"]:
        assert r["pi"][0] <= r["yhat"] <= r["pi"][1]
    assert 0 <= pred["markov"]["p_wet_tomorrow"] <= 1
