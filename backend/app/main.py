"""FastAPI application: the REST contract between the React UI and the statistics engine.

Run (from the project folder):
    python -m uvicorn app.main:app --app-dir backend --reload
Then open http://127.0.0.1:8000  (interactive API docs at /docs)
"""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .analysis import engine
from .config import FRONTEND_DIST, SEASONS
from .data import active_data_file

app = FastAPI(
    title="Rainfall Prediction System API",
    description="Probability distributions, Markov chains and regression for daily rainfall - "
    "Applied Statistics & Stochastic Processes course project.",
    version="2.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # the API is read-only and public; tighten if you deploy it
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    humidity_pct: float = Field(..., ge=0, le=100, description="Mean relative humidity (%)")
    cloud_pct: float = Field(..., ge=0, le=100, description="Mean cloud cover (%)")
    pressure_hpa: float = Field(..., ge=850, le=1090, description="Mean sea-level pressure (hPa)")
    temp_c: float = Field(..., ge=-50, le=60, description="Mean temperature (°C)")
    wind_kmh: float = Field(..., ge=0, le=300, description="Maximum wind speed (km/h)")
    month: int = Field(..., ge=1, le=12)
    today_wet: bool = Field(False, description="Did it rain (>= 1 mm) today?")
    level: float = Field(0.95, gt=0.5, lt=1.0, description="Interval confidence level")
    threshold: float = Field(50.0, ge=0, le=500, description="Threshold for P(X > t), mm")


@app.get("/api/health")
def health() -> dict:
    a = engine.ensure().analysis
    return {"status": "ok", "synthetic": a["meta"].get("synthetic", False), "source": a["meta"]["source"],
            "location": a["meta"]["location"], "generated_at": a["meta"]["generated_at"]}


@app.get("/api/analysis")
def analysis() -> JSONResponse:
    """The complete analysis used by every page of the dashboard."""
    return JSONResponse(engine.ensure().analysis)


@app.get("/api/meta")
def meta() -> dict:
    a = engine.ensure().analysis
    return {"meta": a["meta"], "cleaning": a["cleaning"]}


@app.post("/api/predict")
def predict(req: PredictRequest) -> dict:
    """Regression estimate with confidence/prediction intervals, Markov-chain probability of
    rain tomorrow and Gamma-based exceedance probabilities."""
    inputs = req.model_dump(exclude={"level", "threshold"})
    return engine.predict(inputs, level=req.level, threshold=req.threshold)


@app.get("/api/probability")
def probability(
    threshold: float = Query(50.0, ge=0, le=500),
    season: Optional[Literal["Winter", "Pre-monsoon", "Monsoon", "Post-monsoon"]] = None,
) -> dict:
    """P(X > threshold) = P(wet) x P(amount > threshold | wet)  (law of total probability)."""
    if season and season not in SEASONS:
        raise HTTPException(400, f"season must be one of {list(SEASONS)}")
    return engine.exceedance(threshold, season)


@app.get("/api/simulate")
def simulate(n_years: int = Query(2000, ge=100, le=20000), seed: int = Query(7, ge=0)) -> dict:
    """Monte Carlo simulation of synthetic years with the Markov-Gamma model."""
    return engine.simulate(n_years, seed)


@app.get("/api/dataset")
def dataset() -> FileResponse:
    """Download the dataset currently in use (CSV)."""
    path = active_data_file()
    return FileResponse(path, media_type="text/csv", filename=path.name)


# --- Serve the built React app (frontend/dist) from the same server ---------------
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:

    @app.get("/")
    def root() -> dict:
        return {"message": "API is running. Build the frontend (see README) or open /docs."}
