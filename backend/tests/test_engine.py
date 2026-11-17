"""Sanity tests for the statistics engine.  Run:  python -m pytest backend/tests -q"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.engine import markov  # noqa: E402
from app.engine.features import add_features, features_from_inputs  # noqa: E402
from app.engine.regression import OLSModel, nested_f_test  # noqa: E402


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


def test_multiple_regression_recovers_coefficients_and_nested_f():
    rng = np.random.default_rng(2)
    n = 4000
    df = pd.DataFrame({"humidity_pct": rng.normal(75, 10, n), "cloud_pct": rng.uniform(0, 100, n),
                       "pressure_hpa": rng.normal(1008, 4, n), "temp_c": rng.normal(27, 2, n), "wind_kmh": rng.normal(18, 5, n)})
    df["rain_mm"] = (500 + 0.1 * df.humidity_pct + 0.05 * df.cloud_pct - 0.5 * df.pressure_hpa
                     - 0.4 * df.temp_c + 0.3 * df.wind_kmh + rng.normal(0, 3, n))
    full = OLSModel("f", "f", ["humidity_pct", "cloud_pct", "pressure_hpa", "temp_c", "wind_kmh"]).fit(df)
    assert np.allclose(full.coef[1:], [0.1, 0.05, -0.5, -0.4, 0.3], atol=0.03)
    # agrees with the normal equations
    X = np.column_stack([np.ones(n), df[full.features]])
    assert np.allclose(np.linalg.solve(X.T @ X, X.T @ df.rain_mm), full.coef)
    reduced = OLSModel("r", "r", ["humidity_pct"]).fit(df)
    test = nested_f_test(reduced, full)
    assert test["q"] == 4 and test["p"] < 1e-10
    # Breusch-Pagan should not reject for homoscedastic errors
    assert full.summary["breusch_pagan"]["p"] > 0.01


def test_feature_builder_consistent_with_training_features():
    dates = pd.date_range("2020-07-14", periods=3, freq="D")
    df = pd.DataFrame({"date": dates, "rain_mm": [5.0, 12.0, 0.0], "humidity_pct": [80, 85, 70], "cloud_pct": [70, 90, 30],
                       "pressure_hpa": [1005.0, 1003.0, 1006.0], "temp_c": [28.0, 27.0, 29.0], "wind_kmh": [20, 25, 15]})
    f = add_features(df).iloc[1]
    g = features_from_inputs({"humidity_pct": 85, "cloud_pct": 90, "pressure_hpa": 1003, "temp_c": 27, "wind_kmh": 25, "month": 7,
                              "pressure_prev": 1005, "temp_prev": 28, "humidity_prev": 80, "rain_prev": 5, "rain_today": 12})
    for k in ["dp_hpa", "dtemp_c", "dhum_pct", "rain_lag1", "rain_today"]:
        assert np.isclose(f[k], g[k])
    assert abs(f["season_sin"] - g["season_sin"]) < 0.05 and abs(f["season_cos"] - g["season_cos"]) < 0.05


def test_full_pipeline_runs():
    from app.analysis import engine

    a = engine.ensure().analysis
    assert a["meta"]["n_days"] > 3000
    assert 0 < a["distribution"]["p_wet"] < 1
    assert a["markov"]["overall"]["test"]["p"] < 0.05
    keys = {m["key"] for m in a["regression"]["models"]}
    assert {"simple", "multiple", "extended", "nextday"} <= keys
    pred = engine.predict({"humidity_pct": 85, "cloud_pct": 80, "pressure_hpa": 1004, "temp_c": 27,
                           "wind_kmh": 25, "month": 7, "today_wet": True})
    for r in pred["regression"]:
        assert r["pi"][0] <= r["yhat"] <= r["pi"][1]
    assert 0 <= pred["markov"]["p_wet_tomorrow"] <= 1
