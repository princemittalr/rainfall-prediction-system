"""Module IV: multiple linear regression with full statistical inference.

Model      y = b0 + b1 x1 + ... + bp xp + e,      b_hat = (X'X)^-1 X'y   (fitted with scikit-learn)
Inference  s^2 = SSE / (n - p - 1),  SE(b_j) = sqrt(s^2 [(X'X)^-1]_jj),  t_j = b_j / SE(b_j)
           F = (SSR / p) / (SSE / (n - p - 1))
Nested     F = ((SSE_r - SSE_f) / q) / (SSE_f / (n - p_f - 1))     (does adding q predictors help?)
Intervals  mean response  y0 +- t s sqrt(x0'(X'X)^-1 x0)
           new day        y0 +- t s sqrt(1 + x0'(X'X)^-1 x0)
Checks     Durbin-Watson, Breusch-Pagan (heteroscedasticity), HC3 robust standard errors,
           variance inflation factors, Cook's distance.

Models (all fitted on the training years, judged on the test years)
  simple    rainfall ~ humidity                       (the original plan)
  multiple  rainfall ~ 5 weather factors              (humidity, cloud, pressure, temperature, wind)
  extended  rainfall ~ 5 factors + day-to-day changes + yesterday's rain + season,
            reduced by backward elimination (alpha = 0.05)
  nextday   tomorrow's rainfall ~ today's factors      (a genuine one-day-ahead forecast)
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import LinearRegression

from .features import CORE, EXTENDED, LABELS, NEXTDAY, SYMBOLS

ALPHA = 0.05


@dataclass
class OLSModel:
    key: str
    name: str
    features: list[str]
    target: str = "rain_mm"
    log_target: bool = False
    coef: np.ndarray = field(default=None)
    xtx_inv: np.ndarray = field(default=None)
    s: float = 0.0
    df_resid: int = 0
    sse: float = 0.0
    n: int = 0
    means: np.ndarray = field(default=None)
    summary: dict = field(default_factory=dict)

    # ------------------------------------------------------------------
    def rows(self, df: pd.DataFrame) -> pd.DataFrame:
        return df.dropna(subset=[*self.features, self.target])

    def _design(self, df: pd.DataFrame) -> np.ndarray:
        X = df[self.features].to_numpy(dtype=float)
        return np.column_stack([np.ones(len(X)), X])

    def _y(self, df: pd.DataFrame) -> np.ndarray:
        y = df[self.target].to_numpy(dtype=float)
        return np.log1p(y) if self.log_target else y

    def fit(self, df: pd.DataFrame) -> "OLSModel":
        d = self.rows(df)
        X, y = self._design(d), self._y(d)
        sk = LinearRegression().fit(X[:, 1:], y)
        self.coef = np.concatenate([[sk.intercept_], sk.coef_])
        n, k = X.shape
        p = k - 1
        fitted = X @ self.coef
        e = y - fitted
        sse = float(e @ e)
        sst = float(((y - y.mean()) ** 2).sum())
        self.n, self.sse, self.df_resid = n, sse, n - k
        s2 = sse / self.df_resid
        self.s = float(np.sqrt(s2))
        self.xtx_inv = np.linalg.pinv(X.T @ X)
        self.means = X[:, 1:].mean(axis=0)

        se = np.sqrt(np.diag(s2 * self.xtx_inv))
        h = np.einsum("ij,jk,ik->i", X, self.xtx_inv, X)  # leverages
        # HC3 heteroscedasticity-robust covariance (MacKinnon & White, 1985)
        w = (e / (1 - h)) ** 2
        hc3 = self.xtx_inv @ (X.T * w) @ X @ self.xtx_inv
        se_hc3 = np.sqrt(np.diag(hc3))
        tvals = self.coef / se
        pvals = 2 * stats.t.sf(np.abs(tvals), self.df_resid)
        p_hc3 = 2 * stats.t.sf(np.abs(self.coef / se_hc3), self.df_resid)
        tcrit = stats.t.ppf(0.975, self.df_resid)
        r2 = 1 - sse / sst
        F = ((sst - sse) / p) / s2
        sd_y = y.std(ddof=1)
        loglik = -n / 2 * (np.log(2 * np.pi) + np.log(sse / n) + 1)

        # Breusch-Pagan: regress e^2 on the predictors, LM = n R^2 ~ chi2(p)
        e2 = e**2
        aux = LinearRegression().fit(X[:, 1:], e2)
        r2_aux = aux.score(X[:, 1:], e2)
        bp = n * r2_aux

        # Cook's distance
        cook = e**2 / (k * s2) * h / (1 - h) ** 2
        cut = 4 / n
        top = np.argsort(cook)[::-1][:5]
        dates = d["date"].dt.strftime("%Y-%m-%d").to_numpy() if "date" in d else np.arange(n).astype(str)

        names = ["Intercept", *self.features]
        coefs = []
        for j, nm in enumerate(names):
            coefs.append(
                {
                    "term": nm,
                    "label": "Intercept" if j == 0 else LABELS[nm],
                    "symbol": "" if j == 0 else SYMBOLS[nm],
                    "estimate": float(self.coef[j]),
                    "se": float(se[j]),
                    "t": float(tvals[j]),
                    "p": float(pvals[j]),
                    "ci95": [float(self.coef[j] - tcrit * se[j]), float(self.coef[j] + tcrit * se[j])],
                    "se_hc3": float(se_hc3[j]),
                    "p_hc3": float(p_hc3[j]),
                    "standardized": None if j == 0 else float(self.coef[j] * X[:, j].std(ddof=1) / sd_y),
                    "mean": None if j == 0 else float(self.means[j - 1]),
                }
            )
        self.summary = {
            "n": int(n),
            "p": int(p),
            "r2": float(r2),
            "adj_r2": float(1 - (1 - r2) * (n - 1) / self.df_resid),
            "F": float(F),
            "F_p": float(stats.f.sf(F, p, self.df_resid)),
            "residual_se": self.s,
            "df_resid": int(self.df_resid),
            "loglik": float(loglik),
            "aic": float(2 * (k + 1) - 2 * loglik),
            "bic": float((k + 1) * np.log(n) - 2 * loglik),
            "durbin_watson": float(np.sum(np.diff(e) ** 2) / sse),
            "breusch_pagan": {"lm": float(bp), "df": int(p), "p": float(stats.chi2.sf(bp, p))},
            "cooks": {
                "cutoff": float(cut),
                "n_above": int((cook > cut).sum()),
                "share_above": float((cook > cut).mean()),
                "max": float(cook.max()),
                "top": [{"date": str(dates[i]), "d": float(cook[i]), "y": float(y[i]), "fitted": float(fitted[i])} for i in top],
            },
            "coefficients": coefs,
            "anova": {"ssr": sst - sse, "sse": sse, "sst": sst},
        }
        self._resid, self._fitted = e, fitted
        return self

    # ------------------------------------------------------------------
    def predict(self, X_rows: np.ndarray, level: float = 0.95) -> dict:
        """Point prediction + confidence and prediction intervals, back-transformed and
        clipped at 0 mm (rainfall cannot be negative)."""
        X = np.column_stack([np.ones(len(X_rows)), X_rows])
        yhat = X @ self.coef
        h = np.einsum("ij,jk,ik->i", X, self.xtx_inv, X)
        t = stats.t.ppf(0.5 + level / 2, self.df_resid)
        ci = t * self.s * np.sqrt(h)
        pi = t * self.s * np.sqrt(1 + h)
        lo_pi, hi_pi, lo_ci, hi_ci = yhat - pi, yhat + pi, yhat - ci, yhat + ci
        if self.log_target:
            f = np.expm1
            yhat, lo_pi, hi_pi, lo_ci, hi_ci = f(yhat), f(lo_pi), f(hi_pi), f(lo_ci), f(hi_ci)
        clip = lambda a: np.clip(a, 0, None)  # noqa: E731
        return {"yhat": clip(yhat), "ci": (clip(lo_ci), clip(hi_ci)), "pi": (clip(lo_pi), clip(hi_pi)), "raw_yhat": yhat}

    def contributions(self, x: np.ndarray) -> dict:
        """How far each factor pushes today's estimate above or below an average day:
        b_j (x_j - mean_j). The baseline is the prediction at the training means."""
        base = float(self.coef[0] + self.coef[1:] @ self.means)
        parts = [
            {"term": f, "label": LABELS[f], "symbol": SYMBOLS[f], "value": float(v), "mean": float(m), "effect": float(b * (v - m))}
            for f, v, m, b in zip(self.features, x, self.means, self.coef[1:])
        ]
        parts.sort(key=lambda r: -abs(r["effect"]))
        return {"baseline": base, "parts": parts}

    def export(self) -> dict:
        """Everything the browser needs to reproduce predictions offline."""
        return {
            "key": self.key, "name": self.name, "features": self.features, "target": self.target,
            "log_target": self.log_target, "coef": self.coef.tolist(), "xtx_inv": self.xtx_inv.tolist(),
            "s": self.s, "df_resid": self.df_resid, "means": self.means.tolist(),
        }


# ---------------------------------------------------------------------- model building
def vif(df: pd.DataFrame, features: list[str]) -> list[dict]:
    """Variance inflation factor VIF_j = 1 / (1 - R_j^2): multicollinearity check."""
    d = df.dropna(subset=features)
    out = []
    for f in features:
        others = [o for o in features if o != f]
        r2 = LinearRegression().fit(d[others], d[f]).score(d[others], d[f]) if others else 0.0
        out.append({"term": f, "label": LABELS[f], "symbol": SYMBOLS[f], "vif": float(1 / (1 - r2)) if r2 < 1 else None})
    return out


def nested_f_test(reduced: OLSModel, full: OLSModel) -> dict:
    """Partial F-test: H0 = the extra predictors in `full` all have coefficient 0."""
    q = full.summary["p"] - reduced.summary["p"]
    F = ((reduced.sse - full.sse) / q) / (full.sse / full.df_resid)
    return {
        "reduced": reduced.key, "full": full.key, "added": [f for f in full.features if f not in reduced.features],
        "q": int(q), "df2": int(full.df_resid), "F": float(F), "p": float(stats.f.sf(F, q, full.df_resid)),
        "delta_r2": full.summary["r2"] - reduced.summary["r2"],
        "delta_adj_r2": full.summary["adj_r2"] - reduced.summary["adj_r2"],
        "delta_aic": full.summary["aic"] - reduced.summary["aic"],
    }


def backward_elimination(train: pd.DataFrame, features: list[str], alpha: float = ALPHA) -> tuple[list[str], list[dict]]:
    """Repeatedly drop the least significant predictor while its p-value exceeds alpha.
    Rows are fixed to those complete for the full set so every step is comparable."""
    d = train.dropna(subset=[*features, "rain_mm"])
    current, steps = list(features), []
    while len(current) > 1:
        m = OLSModel("tmp", "tmp", current).fit(d)
        worst = max(m.summary["coefficients"][1:], key=lambda c: c["p"])
        steps.append({"n_predictors": len(current), "adj_r2": m.summary["adj_r2"], "aic": m.summary["aic"],
                      "worst": worst["term"], "worst_label": worst["label"], "worst_p": worst["p"],
                      "removed": worst["p"] > alpha})
        if worst["p"] <= alpha:
            break
        current.remove(worst["term"])
    return current, steps


# ---------------------------------------------------------------------- evaluation
def _clim(train: pd.DataFrame, test: pd.DataFrame, target: str) -> np.ndarray:
    month_of_target = test["month"] if target == "rain_mm" else (test["date"] + pd.Timedelta(days=1)).dt.month
    clim = train.groupby("month")["rain_mm"].mean()
    return month_of_target.map(clim).to_numpy()


def evaluate(model: OLSModel, train: pd.DataFrame, test: pd.DataFrame) -> dict:
    t = model.rows(test)
    pred = model.predict(t[model.features].to_numpy(dtype=float))
    y = t[model.target].to_numpy(dtype=float)
    yhat = pred["yhat"]
    lo, hi = pred["pi"]
    base = _clim(train, t, model.target)
    mse, mse_b = np.mean((y - yhat) ** 2), np.mean((y - base) ** 2)
    per_year = []
    for yr in sorted(t["year"].unique()):
        sel = (t["year"] == yr).to_numpy()
        m1, m0 = np.mean((y[sel] - yhat[sel]) ** 2), np.mean((y[sel] - base[sel]) ** 2)
        per_year.append({"year": int(yr), "rmse": float(np.sqrt(m1)), "baseline_rmse": float(np.sqrt(m0)), "skill": float(1 - m1 / m0)})
    wet = y >= 1
    return {
        "n": int(len(y)),
        "mae": float(np.mean(np.abs(y - yhat))),
        "rmse": float(np.sqrt(mse)),
        "bias": float(np.mean(yhat - y)),
        "r2": float(1 - np.sum((y - yhat) ** 2) / np.sum((y - y.mean()) ** 2)),
        "corr": float(np.corrcoef(y, yhat)[0, 1]),
        "pi_coverage": float(np.mean((y >= lo) & (y <= hi))),
        "pi_mean_width": float(np.mean(hi - lo)),
        "baseline_mae": float(np.mean(np.abs(y - base))),
        "baseline_rmse": float(np.sqrt(mse_b)),
        "skill_vs_climatology": float(1 - mse / mse_b),
        "wet_day_mae": float(np.mean(np.abs(y[wet] - yhat[wet]))) if wet.any() else None,
        "per_year": per_year,
    }


def _bands(model: OLSModel, df: pd.DataFrame) -> dict:
    col = model.features[0]
    xs = np.linspace(df[col].quantile(0.005), df[col].max(), 60)
    pred = model.predict(xs.reshape(-1, 1))
    return {"x": xs.tolist(), "yhat": pred["raw_yhat"].tolist(), "ci_lo": pred["ci"][0].tolist(),
            "ci_hi": pred["ci"][1].tolist(), "pi_lo": pred["pi"][0].tolist(), "pi_hi": pred["pi"][1].tolist()}


def _diagnostics(model: OLSModel, seed: int = 1) -> dict:
    rng = np.random.default_rng(seed)
    e, fitted = model._resid, model._fitted
    idx = rng.choice(len(e), size=min(900, len(e)), replace=False)
    z = np.sort(e / model.s)
    probs = (np.arange(1, 81) - 0.5) / 80
    return {
        "fitted": fitted[idx].tolist(), "resid": e[idx].tolist(),
        "qq_theoretical": stats.norm.ppf(probs).tolist(), "qq_sample": np.quantile(z, probs).tolist(),
        "resid_skew": float(stats.skew(e)), "resid_kurtosis": float(stats.kurtosis(e)),
        "shapiro_note": "With thousands of observations, formal normality tests reject almost always; judge the Q-Q plot instead.",
    }


def _test_series(models: list[OLSModel], test: pd.DataFrame) -> dict:
    """Daily actual vs predicted for the monsoon (Jun-Sep) of the last test year.
    The next-day model's forecast made on day d-1 is placed on day d."""
    last = test["year"].max()
    d = test[(test["year"] == last) & test["month"].between(6, 9)]
    dates = d["date"].dt.strftime("%Y-%m-%d").tolist()
    out = {"dates": dates, "actual": d["rain_mm"].tolist(), "year": int(last)}
    for m in models:
        if m.target == "rain_mm":
            src = d.copy()
            ok = src[m.features].notna().all(axis=1).to_numpy()
        else:  # forecasts issued the day before
            src = test.set_index("date").reindex(d["date"] - pd.Timedelta(days=1)).reset_index()
            ok = src[m.features].notna().all(axis=1).to_numpy()
        X = src[m.features].fillna(0).to_numpy(dtype=float)
        p = m.predict(X)
        nan = lambda a: np.where(ok, a, np.nan).tolist()  # noqa: E731
        out[m.key] = nan(p["yhat"])
        out[m.key + "_pi"] = [nan(p["pi"][0]), nan(p["pi"][1])]
    return out


def _monthly_scatter(models: list[OLSModel], test: pd.DataFrame) -> list[dict]:
    t = test.copy()
    keys = []
    for m in models:
        if m.target != "rain_mm":
            continue
        ok = t[m.features].notna().all(axis=1)
        pred = np.zeros(len(t))
        pred[ok.to_numpy()] = m.predict(t.loc[ok, m.features].to_numpy(dtype=float))["yhat"]
        t[f"pred_{m.key}"] = pred
        keys.append(m.key)
    g = t.groupby(["year", "month"]).sum(numeric_only=True)
    return [{"year": int(y), "month": int(mo), "actual": float(r["rain_mm"]), **{k: float(r[f"pred_{k}"]) for k in keys}}
            for (y, mo), r in g.iterrows()]


# ---------------------------------------------------------------------- main entry
def build_models(train: pd.DataFrame) -> tuple[list[OLSModel], dict]:
    selected, steps = backward_elimination(train, EXTENDED)
    full = OLSModel("full", "Extended, all 11 predictors", list(EXTENDED)).fit(train)
    models = [
        OLSModel("simple", "Simple: Rainfall ~ Humidity", ["humidity_pct"]).fit(train),
        OLSModel("multiple", "Multiple: Rainfall ~ 5 weather factors", list(CORE)).fit(train),
        OLSModel("extended", f"Extended multiple regression ({len(selected)} predictors)", selected).fit(train),
        OLSModel("nextday", "Next-day forecast: tomorrow's rainfall ~ today's factors", list(NEXTDAY), target="rain_next").fit(train),
    ]
    return models, {"full": full, "selected": selected, "steps": steps}


def analyse(train: pd.DataFrame, test: pd.DataFrame) -> tuple[dict, list[OLSModel]]:
    models, sel = build_models(train)
    by = {m.key: m for m in models}
    nested = [nested_f_test(by["simple"], by["multiple"]), nested_f_test(by["multiple"], sel["full"])]
    if len(sel["selected"]) < len(EXTENDED):
        nested.append(nested_f_test(by["extended"], sel["full"]))
    result = {
        "split": {
            "train_years": [int(train["year"].min()), int(train["year"].max())],
            "test_years": [int(test["year"].min()), int(test["year"].max())],
            "n_train": int(len(train)), "n_test": int(len(test)),
        },
        "primary": "extended",
        "candidates": [{"term": f, "label": LABELS[f], "symbol": SYMBOLS[f]} for f in EXTENDED],
        "selection": {"alpha": ALPHA, "steps": sel["steps"], "selected": sel["selected"],
                      "removed": [f for f in EXTENDED if f not in sel["selected"]]},
        "nested_tests": nested,
        "full_model": {"summary": sel["full"].summary},
        "models": [],
        "vif": vif(train, by["extended"].features),
        "vif_core": vif(train, list(CORE)),
        "simple_bands": _bands(by["simple"], train),
        "test_series": _test_series(models, test),
        "monthly_test": _monthly_scatter(models, test),
        "labels": LABELS,
        "symbols": SYMBOLS,
    }
    for m in models:
        result["models"].append({
            "key": m.key, "name": m.name, "features": m.features, "target": m.target, "log_target": m.log_target,
            "summary": m.summary, "test": evaluate(m, train, test), "diagnostics": _diagnostics(m), "export": m.export(),
        })
    return result, models
