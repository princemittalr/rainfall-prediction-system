"""Central configuration for the Rainfall Prediction System."""
from __future__ import annotations

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data"
FRONTEND_DIST = PROJECT_DIR / "frontend" / "dist"

REAL_DATA_FILE = DATA_DIR / "rainfall_real.csv"
SYNTHETIC_DATA_FILE = DATA_DIR / "rainfall_synthetic.csv"
SYNTHETIC_TRUTH_FILE = DATA_DIR / "synthetic_truth.json"

# A day is "wet" when rainfall >= 1.0 mm (WMO / ETCCDI wet-day convention).
WET_THRESHOLD_MM = 1.0
# IMD "heavy rainfall" category starts at 64.5 mm/day.
HEAVY_RAIN_MM = 64.5
# Number of most recent full years held out for testing (chronological split).
TEST_YEARS = 5

PREDICTORS = ["humidity_pct", "cloud_pct", "pressure_hpa", "temp_c", "wind_kmh"]
VARIABLES = ["rain_mm", *PREDICTORS]

LABELS = {
    "rain_mm": "Rainfall (mm)",
    "temp_c": "Temperature (°C)",
    "humidity_pct": "Humidity (%)",
    "pressure_hpa": "Pressure (hPa)",
    "cloud_pct": "Cloud cover (%)",
    "wind_kmh": "Wind speed (km/h)",
}

# India Meteorological Department seasons.
SEASONS = {
    "Winter": [12, 1, 2],
    "Pre-monsoon": [3, 4, 5],
    "Monsoon": [6, 7, 8, 9],
    "Post-monsoon": [10, 11],
}
MONTH_TO_SEASON = {m: s for s, months in SEASONS.items() for m in months}
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Preset locations for the real-data downloader.
CITIES = {
    "mumbai": ("Mumbai, India", 19.0760, 72.8777),
    "delhi": ("New Delhi, India", 28.6139, 77.2090),
    "kolkata": ("Kolkata, India", 22.5726, 88.3639),
    "chennai": ("Chennai, India", 13.0827, 80.2707),
    "bengaluru": ("Bengaluru, India", 12.9716, 77.5946),
    "hyderabad": ("Hyderabad, India", 17.3850, 78.4867),
    "pune": ("Pune, India", 18.5204, 73.8567),
    "guwahati": ("Guwahati, India", 26.1445, 91.7362),
    "dhaka": ("Dhaka, Bangladesh", 23.8103, 90.4125),
}
