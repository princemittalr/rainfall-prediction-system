"""Stochastic process: a two-state (Dry = 0, Wet = 1) first-order Markov chain.

Transition matrix  P = [[p00, p01], [p10, p11]],  p_ij = P(X_{t+1} = j | X_t = i)
MLE:               p_ij = n_ij / n_i.
Stationary dist.:  pi_1 = p01 / (p01 + p10)
n-step:            P^(n) = P^n   (Chapman-Kolmogorov)
Spell lengths:     wet-spell length ~ Geometric(p10), mean 1 / p10
Markov test:       chi-square test of independence on the 2x2 transition table
                   H0: tomorrow's state does not depend on today's (Bernoulli process)
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from ..config import MONTH_NAMES, MONTH_TO_SEASON, WET_THRESHOLD_MM


def states(df: pd.DataFrame) -> np.ndarray:
    return (df["rain_mm"].to_numpy() >= WET_THRESHOLD_MM).astype(int)


def transition_counts(df: pd.DataFrame) -> pd.DataFrame:
    """Return a table of consecutive-day pairs (state today, state tomorrow, month of today)."""
    s = states(df)
    dates = df["date"].to_numpy()
    consecutive = (dates[1:] - dates[:-1]) == np.timedelta64(1, "D")
    return pd.DataFrame(
        {"from": s[:-1][consecutive], "to": s[1:][consecutive], "month": df["month"].to_numpy()[:-1][consecutive]}
    )


def fit_matrix(pairs: pd.DataFrame) -> dict:
    n = np.zeros((2, 2))
    for i in (0, 1):
        for j in (0, 1):
            n[i, j] = int(((pairs["from"] == i) & (pairs["to"] == j)).sum())
    row = n.sum(axis=1, keepdims=True)
    with np.errstate(invalid="ignore", divide="ignore"):
        P = np.where(row > 0, n / row, np.nan)
    return {"counts": n, "P": P}


def stationary(P: np.ndarray) -> list[float]:
    p01, p10 = P[0, 1], P[1, 0]
    pi1 = p01 / (p01 + p10)
    return [1 - pi1, pi1]


def independence_test(n: np.ndarray) -> dict:
    chi2, p, dof, expected = stats.chi2_contingency(n, correction=False)
    return {"chi2": float(chi2), "p": float(p), "df": int(dof), "expected": expected.tolist()}


def spell_lengths(s: np.ndarray, state: int) -> np.ndarray:
    lengths, run = [], 0
    for v in s:
        if v == state:
            run += 1
        elif run:
            lengths.append(run)
            run = 0
    if run:
        lengths.append(run)
    return np.array(lengths)


def monthly_matrices(pairs: pd.DataFrame, overall: dict) -> list[dict]:
    """One transition matrix per calendar month. When a month has too few wet days
    (dry season), the wet row is borrowed from its season to keep estimates stable."""
    out = []
    season_cache: dict[str, dict] = {}
    for m in range(1, 13):
        sub = pairs[pairs["month"] == m]
        fit = fit_matrix(sub)
        n = fit["counts"]
        P = fit["P"].copy()
        borrowed = False
        if n[1].sum() < 10:
            season = MONTH_TO_SEASON[m]
            if season not in season_cache:
                months = [k for k, v in MONTH_TO_SEASON.items() if v == season]
                season_cache[season] = fit_matrix(pairs[pairs["month"].isin(months)])
            sP = season_cache[season]["P"]
            P[1] = sP[1] if season_cache[season]["counts"][1].sum() >= 10 else overall["P"][1]
            borrowed = True
        if n[0].sum() == 0:
            P[0] = overall["P"][0]
        pi = stationary(P)
        out.append(
            {
                "month": m,
                "name": MONTH_NAMES[m - 1],
                "counts": n.astype(int).tolist(),
                "P": P.tolist(),
                "p01": float(P[0, 1]),
                "p11": float(P[1, 1]),
                "stationary_wet": float(pi[1]),
                "observed_wet": float(((sub["from"] == 1).mean()) if len(sub) else 0),
                "mean_wet_spell": float(1 / P[1, 0]) if P[1, 0] > 0 else None,
                "mean_dry_spell": float(1 / P[0, 1]) if P[0, 1] > 0 else None,
                "borrowed_wet_row": borrowed,
            }
        )
    return out


def spell_distribution(df: pd.DataFrame, months: list[int], state: int, P: np.ndarray, kmax: int = 20) -> dict:
    sub = df[df["month"].isin(months)]
    s = states(sub)
    lengths = spell_lengths(s, state)
    leave = P[1, 0] if state == 1 else P[0, 1]
    ks = np.arange(1, kmax + 1)
    observed = np.array([(lengths == k).sum() for k in ks]) / max(len(lengths), 1)
    geometric = leave * (1 - leave) ** (ks - 1)
    return {
        "k": ks.tolist(),
        "observed": observed.tolist(),
        "geometric": geometric.tolist(),
        "mean_observed": float(lengths.mean()) if len(lengths) else None,
        "mean_geometric": float(1 / leave) if leave else None,
        "n_spells": int(len(lengths)),
        "longest": int(lengths.max()) if len(lengths) else 0,
    }


def n_step(P: np.ndarray, steps: int = 14) -> list[dict]:
    out, M = [], np.eye(2)
    for k in range(1, steps + 1):
        M = M @ P
        out.append({"n": k, "wet_given_wet": float(M[1, 1]), "wet_given_dry": float(M[0, 1])})
    return out


def brier_evaluation(train: pd.DataFrame, test: pd.DataFrame) -> dict:
    """Probabilistic next-day forecast P(wet tomorrow | today, month) fitted on the
    training years and scored on the test years with the Brier score."""
    tr_pairs = transition_counts(train)
    overall = fit_matrix(tr_pairs)
    monthly = monthly_matrices(tr_pairs, overall)
    te = transition_counts(test)
    p_forecast = np.array([monthly[m - 1]["P"][f][1] for f, m in zip(te["from"], te["month"])])
    clim = train.assign(w=states(train)).groupby("month")["w"].mean()
    p_clim = te["month"].map(clim).to_numpy()
    o = te["to"].to_numpy()
    bs = float(np.mean((p_forecast - o) ** 2))
    bs_c = float(np.mean((p_clim - o) ** 2))
    persistence_acc = float((te["from"] == te["to"]).mean())
    markov_acc = float(((p_forecast >= 0.5).astype(int) == o).mean())
    # reliability: bin forecasts and compare with observed frequency
    bins = np.linspace(0, 1, 11)
    idx = np.clip(np.digitize(p_forecast, bins) - 1, 0, 9)
    reliability = []
    for b in range(10):
        sel = idx == b
        if sel.sum() >= 10:
            reliability.append({"forecast": float(p_forecast[sel].mean()), "observed": float(o[sel].mean()), "n": int(sel.sum())})
    return {
        "n_test_pairs": int(len(te)),
        "brier": bs,
        "brier_climatology": bs_c,
        "brier_skill": 1 - bs / bs_c if bs_c else None,
        "accuracy": markov_acc,
        "persistence_accuracy": persistence_acc,
        "reliability": reliability,
    }


def analyse(df: pd.DataFrame, train: pd.DataFrame, test: pd.DataFrame) -> dict:
    pairs = transition_counts(df)
    overall = fit_matrix(pairs)
    P = overall["P"]
    monsoon_months = [6, 7, 8, 9]
    monsoon = fit_matrix(pairs[pairs["month"].isin(monsoon_months)])
    return {
        "states": ["Dry", "Wet"],
        "overall": {
            "counts": overall["counts"].astype(int).tolist(),
            "P": P.tolist(),
            "stationary": stationary(P),
            "observed_wet_fraction": float(states(df).mean()),
            "test": independence_test(overall["counts"]),
            "n_step": n_step(P),
        },
        "monsoon": {
            "counts": monsoon["counts"].astype(int).tolist(),
            "P": monsoon["P"].tolist(),
            "stationary": stationary(monsoon["P"]),
            "test": independence_test(monsoon["counts"]),
            "n_step": n_step(monsoon["P"]),
            "wet_spells": spell_distribution(df, monsoon_months, 1, monsoon["P"]),
            "dry_spells": spell_distribution(df, monsoon_months, 0, monsoon["P"]),
        },
        "monthly": monthly_matrices(pairs, overall),
        "evaluation": brier_evaluation(train, test),
    }
