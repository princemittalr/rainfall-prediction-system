"""Predictor construction for the multiple linear regression models.

Raw daily variables (humidity, cloud, pressure, temperature, wind) are joined by
derived predictors with a clear physical meaning:

  * day-to-day changes ("tendencies"): a falling barometer, a sudden rise in
    humidity or a drop in temperature are classic signs of approaching rain;
  * yesterday's rainfall: rain persists from one day to the next (the same memory
    the Markov chain captures);
  * season terms sin(2*pi*d/365.25) and cos(2*pi*d/365.25): a smooth yearly cycle
    that lets the model separate "it is July" from "it is humid".

Every derived value is computed only when the previous calendar day exists.
The same formulas are repeated in frontend/src/lib/api.js for static mode.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

CORE = ["humidity_pct", "cloud_pct", "pressure_hpa", "temp_c", "wind_kmh"]
TENDENCIES = ["dp_hpa", "dtemp_c", "dhum_pct"]
EXTENDED = [*CORE, *TENDENCIES, "rain_lag1", "season_sin", "season_cos"]
NEXTDAY = [*CORE, "rain_today", "dp_hpa", "season_sin", "season_cos"]

LABELS = {
    "humidity_pct": "Humidity (%)",
    "cloud_pct": "Cloud cover (%)",
    "pressure_hpa": "Pressure (hPa)",
    "temp_c": "Temperature (°C)",
    "wind_kmh": "Wind speed (km/h)",
    "dp_hpa": "Pressure change since yesterday (hPa)",
    "dtemp_c": "Temperature change since yesterday (°C)",
    "dhum_pct": "Humidity change since yesterday (%)",
    "rain_lag1": "Yesterday's rainfall (mm)",
    "rain_today": "Today's rainfall (mm)",
    "season_sin": "Season, sine term",
    "season_cos": "Season, cosine term",
}
SYMBOLS = {
    "humidity_pct": "H", "cloud_pct": "C", "pressure_hpa": "P", "temp_c": "T", "wind_kmh": "W",
    "dp_hpa": "ΔP", "dtemp_c": "ΔT", "dhum_pct": "ΔH", "rain_lag1": "R₋₁", "rain_today": "R₀",
    "season_sin": "S₁", "season_cos": "S₂",
}


def season_terms(day_of_year):
    angle = 2 * np.pi * np.asarray(day_of_year, dtype=float) / 365.25
    return np.sin(angle), np.cos(angle)


def mid_month_doy(month: int) -> float:
    """Day of year used for the season terms when only the month is known."""
    return (month - 1) * 30.44 + 15


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy with derived predictors and the next-day target `rain_next`."""
    out = df.copy()
    prev_ok = out["date"].diff() == pd.Timedelta(days=1)
    next_ok = (out["date"].shift(-1) - out["date"]) == pd.Timedelta(days=1)
    out["dp_hpa"] = out["pressure_hpa"].diff().where(prev_ok)
    out["dtemp_c"] = out["temp_c"].diff().where(prev_ok)
    out["dhum_pct"] = out["humidity_pct"].diff().where(prev_ok)
    out["rain_lag1"] = out["rain_mm"].shift(1).where(prev_ok)
    out["rain_today"] = out["rain_mm"]
    out["rain_next"] = out["rain_mm"].shift(-1).where(next_ok)
    s, c = season_terms(out["date"].dt.dayofyear)
    out["season_sin"], out["season_cos"] = s, c
    return out


def features_from_inputs(inp: dict) -> dict:
    """Build every predictor from the values a user types on the Predict page."""
    month = int(inp["month"])
    s, c = season_terms(mid_month_doy(month))
    pressure, temp, hum = float(inp["pressure_hpa"]), float(inp["temp_c"]), float(inp["humidity_pct"])
    today_rain = inp.get("rain_today")
    if today_rain is None:
        today_rain = 1.0 if inp.get("today_wet") else 0.0
    return {
        "humidity_pct": hum,
        "cloud_pct": float(inp["cloud_pct"]),
        "pressure_hpa": pressure,
        "temp_c": temp,
        "wind_kmh": float(inp["wind_kmh"]),
        "dp_hpa": pressure - float(inp.get("pressure_prev") if inp.get("pressure_prev") is not None else pressure),
        "dtemp_c": temp - float(inp.get("temp_prev") if inp.get("temp_prev") is not None else temp),
        "dhum_pct": hum - float(inp.get("humidity_prev") if inp.get("humidity_prev") is not None else hum),
        "rain_lag1": float(inp.get("rain_prev") or 0.0),
        "rain_today": float(today_rain),
        "season_sin": float(s),
        "season_cos": float(c),
    }

