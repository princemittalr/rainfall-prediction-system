"""Module I (part 2): probability distributions for rainfall.

Daily rainfall X is a *mixed* random variable:
    P(X = "dry") = 1 - p          (a point mass)
    X | wet  ~  1 mm + Y,   Y ~ continuous, right-skewed distribution
By the law of total probability, for t >= 1 mm:
    P(X > t) = p * P(Y > t - 1)
We fit several candidate distributions to Y by maximum likelihood and compare
them with AIC, the Kolmogorov-Smirnov statistic and a chi-square test.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from ..config import HEAVY_RAIN_MM, MONTH_TO_SEASON, SEASONS, WET_THRESHOLD_MM

CANDIDATES = {
    "Gamma": stats.gamma,
    "Exponential": stats.expon,
    "Weibull": stats.weibull_min,
    "Lognormal": stats.lognorm,
    "Normal": stats.norm,
}


def _fit(name: str, y: np.ndarray):
    dist = CANDIDATES[name]
    if name == "Normal":
        params = dist.fit(y)
    else:
        params = dist.fit(y, floc=0)
    k = len(params) - (0 if name == "Normal" else 1)  # free parameters
    return dist(*params), params, k


def _chi_square_gof(y: np.ndarray, frozen, k_params: int, bins: int = 10) -> dict:
    """Pearson chi-square goodness-of-fit with equiprobable bins under the fitted model."""
    qs = frozen.ppf(np.linspace(0, 1, bins + 1))
    qs[0], qs[-1] = -np.inf, np.inf
    observed, _ = np.histogram(y, bins=qs)
    expected = np.full(bins, len(y) / bins)
    chi2 = float(((observed - expected) ** 2 / expected).sum())
    df = bins - 1 - k_params
    return {"chi2": chi2, "df": df, "p": float(stats.chi2.sf(chi2, df)), "bins": bins}


def fit_candidates(y: np.ndarray) -> list[dict]:
    out = []
    n = len(y)
    for name in CANDIDATES:
        frozen, params, k = _fit(name, y)
        ll = float(np.sum(frozen.logpdf(np.clip(y, 1e-6, None))))
        ks = stats.kstest(y, frozen.cdf)
        out.append(
            {
                "name": name,
                "params": [float(p) for p in params],
                "k": k,
                "loglik": ll,
                "aic": 2 * k - 2 * ll,
                "bic": k * np.log(n) - 2 * ll,
                "ks_stat": float(ks.statistic),
                "ks_p": float(ks.pvalue),
                "chi_square": _chi_square_gof(y, frozen, k),
                "mean": float(frozen.mean()),
                "var": float(frozen.var()),
            }
        )
    out.sort(key=lambda d: d["aic"])
    return out


def gamma_mom(y: np.ndarray) -> dict:
    """Method-of-moments Gamma estimates: k = mean^2 / var, theta = var / mean."""
    m, v = y.mean(), y.var(ddof=1)
    return {"shape": m * m / v, "scale": v / m}


def _curves(y: np.ndarray, fits: list[dict], bins: int = 40) -> dict:
    hi = float(np.percentile(y, 99))
    edges = np.linspace(0, hi, bins + 1)
    counts, _ = np.histogram(y, bins=edges)
    width = edges[1] - edges[0]
    density = counts / (len(y) * width)
    xs = np.linspace(0.25, hi, 160)
    pdfs, cdfs = {}, {}
    for f in fits:
        frozen = CANDIDATES[f["name"]](*f["params"])
        pdfs[f["name"]] = frozen.pdf(xs).tolist()
        cdfs[f["name"]] = frozen.cdf(xs).tolist()
    ys = np.sort(y)
    ecdf_x = np.quantile(ys, np.linspace(0, 1, 160))
    ecdf_y = np.searchsorted(ys, ecdf_x, side="right") / len(ys)
    return {
        "hist": {"edges": edges.tolist(), "density": density.tolist()},
        "x": xs.tolist(),
        "pdf": pdfs,
        "cdf": cdfs,
        "ecdf": {"x": ecdf_x.tolist(), "y": ecdf_y.tolist()},
    }


def _qq(y: np.ndarray, frozen, points: int = 80) -> dict:
    probs = (np.arange(1, points + 1) - 0.5) / points
    return {"theoretical": frozen.ppf(probs).tolist(), "sample": np.quantile(y, probs).tolist()}


def exceedance_table(df: pd.DataFrame, season_fits: dict, p_wet_season: dict) -> list[dict]:
    """Empirical vs model P(X > t) for a grid of thresholds, all seasons combined."""
    rain = df["rain_mm"].to_numpy()
    seasons = df["month"].map(MONTH_TO_SEASON).to_numpy()
    weights = {s: (seasons == s).mean() for s in SEASONS}
    rows = []
    for t in [1, 2.5, 5, 10, 15, 25, 35, 50, 64.5, 80, 100, 115.6, 150, 204.5]:
        model = 0.0
        for s in SEASONS:
            g = season_fits[s]
            model += weights[s] * p_wet_season[s] * stats.gamma.sf(t - WET_THRESHOLD_MM, g["shape"], scale=g["scale"])
        rows.append({"t": t, "empirical": float((rain > t).mean()), "model": float(model)})
    return rows


def poisson_heavy(df: pd.DataFrame) -> dict:
    """Counts of heavy-rain days (>= 64.5 mm) per year modelled as Poisson(lambda).
    Dispersion index D = s^2 / mean; (n-1) D ~ chi2(n-1) under the Poisson hypothesis."""
    counts = df.groupby("year")["rain_mm"].apply(lambda x: int((x >= HEAVY_RAIN_MM).sum()))
    # only full years
    days = df.groupby("year").size()
    counts = counts[days >= 360]
    n = len(counts)
    lam = counts.mean()
    var = counts.var(ddof=1)
    disp = var / lam if lam else None
    stat = (n - 1) * disp if disp is not None else None
    p_two = None
    if stat is not None:
        cdf = stats.chi2.cdf(stat, n - 1)
        p_two = float(2 * min(cdf, 1 - cdf))
    kmax = int(max(counts.max(), lam + 4 * np.sqrt(lam)) + 1)
    ks = np.arange(0, kmax + 1)
    observed = np.array([(counts == k).sum() for k in ks]) / n
    return {
        "threshold_mm": HEAVY_RAIN_MM,
        "years": n,
        "counts": [{"year": int(y), "count": int(c)} for y, c in counts.items()],
        "lambda": lam,
        "variance": var,
        "dispersion": disp,
        "dispersion_chi2": stat,
        "dispersion_p": p_two,
        "pmf": {"k": ks.tolist(), "poisson": stats.poisson.pmf(ks, lam).tolist(), "observed": observed.tolist()},
        "p_at_least": {str(k): float(stats.poisson.sf(k - 1, lam)) for k in [1, 3, 5, 10, 15]},
    }


def analyse(df: pd.DataFrame) -> dict:
    rain = df["rain_mm"].to_numpy()
    wet_mask = rain >= WET_THRESHOLD_MM
    # Excess over the threshold. Data are recorded to 0.1 mm, so an excess of exactly 0
    # is replaced by half the recording resolution (0.05 mm) - a continuity correction.
    y_all = np.clip(rain[wet_mask] - WET_THRESHOLD_MM, 0.05, None)
    fits = fit_candidates(y_all)
    best = fits[0]
    gamma_fit = next(f for f in fits if f["name"] == "Gamma")
    curves = _curves(y_all, fits)

    seasons = df["month"].map(MONTH_TO_SEASON)
    season_fits, p_wet_season, season_detail = {}, {}, []
    for s in SEASONS:
        mask = (seasons == s).to_numpy()
        ys = np.clip(rain[mask & wet_mask] - WET_THRESHOLD_MM, 0.05, None)
        p_wet_season[s] = float(wet_mask[mask].mean())
        if len(ys) >= 15:
            a, _, sc = stats.gamma.fit(ys, floc=0)
        else:  # too few wet days: fall back to the pooled fit
            a, _, sc = gamma_fit["params"]
        season_fits[s] = {"shape": float(a), "scale": float(sc)}
        mom = gamma_mom(ys) if len(ys) > 2 else {"shape": None, "scale": None}
        season_detail.append(
            {
                "season": s,
                "months": SEASONS[s],
                "n_days": int(mask.sum()),
                "n_wet": int(len(ys)),
                "p_wet": p_wet_season[s],
                "shape": float(a),
                "scale": float(sc),
                "mean_wet_mm": float(WET_THRESHOLD_MM + a * sc),
                "mom": mom,
                "pooled_fallback": bool(len(ys) < 15),
            }
        )

    gamma_frozen = stats.gamma(*gamma_fit["params"])
    return {
        "wet_threshold_mm": WET_THRESHOLD_MM,
        "n_days": int(len(rain)),
        "n_wet": int(wet_mask.sum()),
        "p_wet": float(wet_mask.mean()),
        "p_dry": float(1 - wet_mask.mean()),
        "wet_mean": float(rain[wet_mask].mean()),
        "wet_var": float(rain[wet_mask].var(ddof=1)),
        "candidates": fits,
        "best": best["name"],
        "gamma": {
            "shape": gamma_fit["params"][0],
            "scale": gamma_fit["params"][2],
            "mom": gamma_mom(y_all),
        },
        "curves": curves,
        "qq": {name: _qq(y_all, CANDIDATES[name](*next(f for f in fits if f["name"] == name)["params"]))
               for name in ["Gamma", "Normal", "Exponential"]},
        "seasons": season_detail,
        "season_fits": season_fits,
        "p_wet_season": p_wet_season,
        "exceedance": exceedance_table(df, season_fits, p_wet_season),
        "poisson": poisson_heavy(df),
        "gamma_mean_check": float(gamma_frozen.mean() + WET_THRESHOLD_MM),
    }
