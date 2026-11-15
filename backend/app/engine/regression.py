"""Module IV: correlation & regression with full statistical inference.

Ordinary least squares  y = X b + e,   b_hat = (X'X)^-1 X'y   (fitted with scikit-learn)
Inference (computed here with NumPy / SciPy):
  s^2 = SSE / (n - p - 1)
  SE(b_j) = sqrt(s^2 [(X'X)^-1]_jj),   t_j = b_j / SE(b_j)
  F = (SSR / p) / (SSE / (n - p - 1))
  95% confidence interval for the mean response: y0 +- t * s * sqrt(x0'(X'X)^-1 x0)
  95% prediction interval for a new day:          y0 +- t * s * sqrt(1 + x0'(X'X)^-1 x0)
Durbin-Watson d = sum (e_t - e_{t-1})^2 / sum e_t^2   (d ~ 2 means no autocorrelation)
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import LinearRegression

from ..config import LABELS, PREDICTORS


@dataclass
class OLSModel:
    key: str
    name: str
    features: list[str]
    log_target: bool = False
    coef: np.ndarray = field(default=None)  # includes intercept at index 0
    xtx_inv: np.ndarray = field(default=None)
    s: float = 0.0
    df_resid: int = 0
    summary: dict = field(default_factory=dict)

    # ------------------------------------------------------------------
    def _design(self, df: pd.DataFrame) -> np.ndarray:
        X = df[self.features].to_numpy(dtype=float)
        return np.column_stack([np.ones(len(X)), X])

    def _target(self, df: pd.DataFrame) -> np.ndarray:
        y = df["rain_mm"].to_numpy(dtype=float)
        return np.log1p(y) if self.log_target else y

    def fit(self, df: pd.DataFrame) -> "OLSModel":
        X = self._design(df)
        y = self._target(df)
        sk = LinearRegression().fit(X[:, 1:], y)
        self.coef = np.concatenate([[sk.intercept_], sk.coef_])
        n, k = X.shape
        p = k - 1
        fitted = X @ self.coef
        resid = y - fitted
        sse = float(resid @ resid)
        sst = float(((y - y.mean()) ** 2).sum())
        ssr = sst - sse
        self.df_resid = n - k
        s2 = sse / self.df_resid
        self.s = float(np.sqrt(s2))
        self.xtx_inv = np.linalg.pinv(X.T @ X)
        se = np.sqrt(np.diag(s2 * self.xtx_inv))
        tvals = self.coef / se
        pvals = 2 * stats.t.sf(np.abs(tvals), self.df_resid)
        tcrit = stats.t.ppf(0.975, self.df_resid)
        r2 = 1 - sse / sst
        F = (ssr / p) / s2
        sd_y = y.std(ddof=1)
        names = ["Intercept", *self.features]
        coefs = []
        for j, nm in enumerate(names):
            coefs.append(
                {
                    "term": nm,
                    "label": "Intercept" if j == 0 else LABELS[nm],
                    "estimate": float(self.coef[j]),
                    "se": float(se[j]),
                    "t": float(tvals[j]),
                    "p": float(pvals[j]),
                    "ci95": [float(self.coef[j] - tcrit * se[j]), float(self.coef[j] + tcrit * se[j])],
                    "standardized": None if j == 0 else float(self.coef[j] * X[:, j].std(ddof=1) / sd_y),
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
            "durbin_watson": float(np.sum(np.diff(resid) ** 2) / sse),
            "coefficients": coefs,
            "anova": {"ssr": ssr, "sse": sse, "sst": sst},
        }
        self._resid, self._fitted = resid, fitted
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
        return {
            "yhat": clip(yhat),
            "ci": (clip(lo_ci), clip(hi_ci)),
            "pi": (clip(lo_pi), clip(hi_pi)),
            "raw_yhat": yhat,
        }

    def export(self) -> dict:
        """Everything the browser needs to reproduce predictions offline."""
        return {
            "key": self.key,
            "name": self.name,
            "features": self.features,
            "log_target": self.log_target,
            "coef": self.coef.tolist(),
            "xtx_inv": self.xtx_inv.tolist(),
            "s": self.s,
            "df_resid": self.df_resid,
        }


def vif(df: pd.DataFrame, features: list[str]) -> list[dict]:
    """Variance inflation factor VIF_j = 1 / (1 - R_j^2): multicollinearity check."""
    out = []
    for f in features:
        others = [o for o in features if o != f]
        lr = LinearRegression().fit(df[others], df[f])
        r2 = lr.score(df[others], df[f])
        out.append({"term": f, "label": LABELS[f], "vif": float(1 / (1 - r2)) if r2 < 1 else None})
    return out


def evaluate(model: OLSModel, train: pd.DataFrame, test: pd.DataFrame) -> dict:
    pred = model.predict(test[model.features].to_numpy(dtype=float))
    y = test["rain_mm"].to_numpy(dtype=float)
    yhat = pred["yhat"]
    lo, hi = pred["pi"]
    clim = train.groupby("month")["rain_mm"].mean()
    base = test["month"].map(clim).to_numpy()
    mse, mse_b = np.mean((y - yhat) ** 2), np.mean((y - base) ** 2)
    return {
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
    }


def _bands(model: OLSModel, df: pd.DataFrame) -> dict:
    col = model.features[0]
    xs = np.linspace(df[col].quantile(0.005), df[col].max(), 60)
    pred = model.predict(xs.reshape(-1, 1))
    return {
        "x": xs.tolist(),
        "yhat": pred["raw_yhat"].tolist(),
        "ci_lo": pred["ci"][0].tolist(),
        "ci_hi": pred["ci"][1].tolist(),
        "pi_lo": pred["pi"][0].tolist(),
        "pi_hi": pred["pi"][1].tolist(),
    }


def _diagnostics(model: OLSModel, seed: int = 1) -> dict:
    rng = np.random.default_rng(seed)
    resid, fitted = model._resid, model._fitted
    idx = rng.choice(len(resid), size=min(900, len(resid)), replace=False)
    z = np.sort(resid / model.s)
    probs = (np.arange(1, 81) - 0.5) / 80
    return {
        "fitted": fitted[idx].tolist(),
        "resid": resid[idx].tolist(),
        "qq_theoretical": stats.norm.ppf(probs).tolist(),
        "qq_sample": np.quantile(z, probs).tolist(),
        "resid_skew": float(stats.skew(resid)),
        "resid_kurtosis": float(stats.kurtosis(resid)),
        "shapiro_note": "With thousands of observations, formal normality tests reject almost always; "
        "judge the Q-Q plot instead.",
    }


def _test_series(models: list[OLSModel], test: pd.DataFrame) -> dict:
    """Daily actual vs predicted for the monsoon (Jun-Sep) of the last test year."""
    last = test["year"].max()
    d = test[(test["year"] == last) & test["month"].between(6, 9)]
    out = {"dates": d["date"].dt.strftime("%Y-%m-%d").tolist(), "actual": d["rain_mm"].tolist(), "year": int(last)}
    for m in models:
        p = m.predict(d[m.features].to_numpy(dtype=float))
        out[m.key] = p["yhat"].tolist()
        out[m.key + "_pi"] = [p["pi"][0].tolist(), p["pi"][1].tolist()]
    return out


def _monthly_scatter(models: list[OLSModel], test: pd.DataFrame) -> list[dict]:
    """Actual vs predicted monthly totals in the test period (errors partly cancel)."""
    rows = []
    preds = {m.key: m.predict(test[m.features].to_numpy(dtype=float))["yhat"] for m in models}
    t = test.assign(**{f"pred_{k}": v for k, v in preds.items()})
    g = t.groupby(["year", "month"]).sum(numeric_only=True)
    for (y, mo), r in g.iterrows():
        rows.append({"year": int(y), "month": int(mo), "actual": float(r["rain_mm"]),
                     **{k: float(r[f"pred_{k}"]) for k in preds}})
    return rows


def build_models(train: pd.DataFrame) -> list[OLSModel]:
    return [
        OLSModel("simple", "Simple linear: Rainfall ~ Humidity", ["humidity_pct"]).fit(train),
        OLSModel("multiple", "Multiple linear: Rainfall ~ 5 predictors", list(PREDICTORS)).fit(train),
        OLSModel("log", "Log-linear: log(1 + Rainfall) ~ 5 predictors", list(PREDICTORS), log_target=True).fit(train),
    ]


def analyse(train: pd.DataFrame, test: pd.DataFrame) -> tuple[dict, list[OLSModel]]:
    models = build_models(train)
    result = {
        "split": {
            "train_years": [int(train["year"].min()), int(train["year"].max())],
            "test_years": [int(test["year"].min()), int(test["year"].max())],
            "n_train": int(len(train)),
            "n_test": int(len(test)),
        },
        "models": [],
        "vif": vif(train, list(PREDICTORS)),
        "simple_bands": _bands(models[0], train),
        "test_series": _test_series(models, test),
        "monthly_test": _monthly_scatter(models, test),
    }
    for m in models:
        result["models"].append(
            {
                "key": m.key,
                "name": m.name,
                "features": m.features,
                "log_target": m.log_target,
                "summary": m.summary,
                "test": evaluate(m, train, test),
                "diagnostics": _diagnostics(m),
                "export": m.export(),
            }
        )
    return result, models
