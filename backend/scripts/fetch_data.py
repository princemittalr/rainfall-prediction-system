"""Download REAL historical daily weather for a city from the Open-Meteo
Historical Weather API (ERA5 reanalysis; free, no API key).

Usage examples (PowerShell or any terminal, from the project folder):
    python backend/scripts/fetch_data.py                      # Mumbai, 2000 to last year
    python backend/scripts/fetch_data.py --city delhi --start 2005 --end 2024
    python backend/scripts/fetch_data.py --lat 26.91 --lon 75.79 --name "Jaipur, India"
    python backend/scripts/fetch_data.py --reset              # delete real data, go back to synthetic

Once backend/data/rainfall_real.csv exists, the app uses it automatically
(restart is not needed; the engine notices the new file).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import CITIES, REAL_DATA_FILE  # noqa: E402

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
DAILY = {
    "precipitation_sum": "rain_mm",
    "temperature_2m_mean": "temp_c",
    "relative_humidity_2m_mean": "humidity_pct",
    "pressure_msl_mean": "pressure_hpa",
    "cloud_cover_mean": "cloud_pct",
    "wind_speed_10m_max": "wind_kmh",
}
HOURLY = ["precipitation", "temperature_2m", "relative_humidity_2m", "pressure_msl", "cloud_cover", "wind_speed_10m"]


def _get(params: dict, retries: int = 3) -> dict:
    url = ARCHIVE + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="ignore")
            if e.code == 400:
                raise ValueError(body) from e
            if attempt == retries - 1:
                raise
        except urllib.error.URLError:
            if attempt == retries - 1:
                raise
        time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def fetch_daily(lat: float, lon: float, start: str, end: str) -> pd.DataFrame:
    data = _get({"latitude": lat, "longitude": lon, "start_date": start, "end_date": end,
                 "daily": ",".join(DAILY), "timezone": "auto"})
    d = data["daily"]
    df = pd.DataFrame({"date": d["time"], **{new: d[old] for old, new in DAILY.items()}})
    return df


def fetch_hourly_aggregated(lat: float, lon: float, start_year: int, end_year: int) -> pd.DataFrame:
    """Fallback: download hourly data in 5-year chunks and aggregate to daily values."""
    frames = []
    for y0 in range(start_year, end_year + 1, 5):
        y1 = min(y0 + 4, end_year)
        print(f"  hourly {y0}-{y1} ...")
        data = _get({"latitude": lat, "longitude": lon, "start_date": f"{y0}-01-01", "end_date": f"{y1}-12-31",
                     "hourly": ",".join(HOURLY), "timezone": "auto"})
        h = pd.DataFrame(data["hourly"])
        h["date"] = pd.to_datetime(h["time"]).dt.strftime("%Y-%m-%d")
        frames.append(
            h.groupby("date").agg(
                rain_mm=("precipitation", "sum"),
                temp_c=("temperature_2m", "mean"),
                humidity_pct=("relative_humidity_2m", "mean"),
                pressure_hpa=("pressure_msl", "mean"),
                cloud_pct=("cloud_cover", "mean"),
                wind_kmh=("wind_speed_10m", "max"),
            ).reset_index()
        )
    return pd.concat(frames, ignore_index=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--city", default="mumbai", choices=sorted(CITIES))
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    ap.add_argument("--name", help="display name when using --lat/--lon")
    ap.add_argument("--start", type=int, default=2000)
    ap.add_argument("--end", type=int, default=date.today().year - 1)
    ap.add_argument("--reset", action="store_true", help="delete the real dataset and fall back to synthetic")
    args = ap.parse_args()

    if args.reset:
        for p in [REAL_DATA_FILE, REAL_DATA_FILE.with_suffix(".meta.json")]:
            p.unlink(missing_ok=True)
        print("Real dataset removed - the app will use the synthetic dataset.")
        return

    if args.lat is not None and args.lon is not None:
        name, lat, lon = args.name or f"{args.lat:.2f}, {args.lon:.2f}", args.lat, args.lon
    else:
        name, lat, lon = CITIES[args.city]

    start, end = f"{args.start}-01-01", f"{args.end}-12-31"
    print(f"Downloading daily weather for {name} ({lat}, {lon}), {start} to {end} ...")
    try:
        df = fetch_daily(lat, lon, start, end)
        method = "daily aggregates"
    except ValueError as e:
        print(f"  daily request rejected ({str(e)[:120]}); falling back to hourly data")
        df = fetch_hourly_aggregated(lat, lon, args.start, args.end)
        method = "hourly data aggregated to daily"
    except Exception as e:  # network problems
        print(f"\nDownload failed: {e}\nCheck your internet connection. The app will keep using synthetic data.")
        sys.exit(1)

    for c in df.columns[1:]:
        df[c] = pd.to_numeric(df[c], errors="coerce").round(1)
    df = df.dropna(subset=["rain_mm"])
    REAL_DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(REAL_DATA_FILE, index=False)
    meta = {
        "source": "Open-Meteo Historical Weather API (ERA5 reanalysis)",
        "location": name,
        "latitude": lat,
        "longitude": lon,
        "synthetic": False,
        "method": method,
        "downloaded": date.today().isoformat(),
        "citation": "Hersbach et al. (2020) ERA5 hourly data, Copernicus Climate Change Service; "
        "accessed via Open-Meteo.com (Zippenfenig, 2023). Licence CC BY 4.0.",
    }
    REAL_DATA_FILE.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2))
    print(f"Saved {len(df):,} days to {REAL_DATA_FILE}")
    print("Rainfall summary (mm/day):", df["rain_mm"].describe().round(2).to_dict())


if __name__ == "__main__":
    main()
