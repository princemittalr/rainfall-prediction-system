# 🌧️ Rainfall Prediction System

**Combining probability distributions, Markov chains and regression analysis to predict daily rainfall — and to quantify the uncertainty of that prediction.**

Course project · *Applied Statistics & Stochastic Processes*

| Layer | Technology |
|---|---|
| Statistics engine | Python · NumPy · SciPy · pandas · scikit-learn |
| API | FastAPI (REST, auto-generated docs at `/docs`) |
| Frontend | React 19 · custom SVG charts (D3 scales) · KaTeX formulas · dark mode · mobile layout |
| Data | Open-Meteo Historical Weather API (ERA5 reanalysis), or a built-in synthetic dataset |

## What's new in 2.1 — multiple linear regression

After review, the regression module was rebuilt around **multiple** linear regression, because rainfall depends on several factors at once, not on humidity alone. On the real Mumbai data (test years 2021–2025):

| Model | Predictors | R² | Skill vs climatology |
|---|---|---|---|
| Humidity only | 1 | 0.22 | −3.5% |
| Pressure, temperature, humidity, cloud, wind | 5 | 0.42 | +26.0% |
| Extended (adds pressure/temperature change, yesterday's rain, season) | 10 | 0.54 | +38.0% |
| Next-day forecast | 9 | 0.49 | +27.2% |

Each step is justified with a partial F-test, and the final predictor set comes from backward elimination at α = 0.05.

---

## ▶️ Run it (Windows PowerShell)

1. Install **Python 3.10 or newer** from <https://www.python.org/downloads/> and tick **"Add python.exe to PATH"** during setup.
2. Unzip the project, open **PowerShell** in the unzipped folder (Shift + right-click in the folder → *Open PowerShell window here*), and run:

```powershell
.\run.ps1
```

If PowerShell says *"running scripts is disabled on this system"*, use this instead (it changes nothing permanently):

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

The script will:

1. create a virtual environment in `.venv` and install the Python packages (first run only, about a minute);
2. **download 25 years of real daily weather for Mumbai** (2000 → last year) from Open-Meteo. No API key is needed. If you are offline, it falls back to the synthetic dataset;
3. run the full statistical analysis and export `snapshot.json`;
4. start the server and open **http://127.0.0.1:8000** in your browser.

Press **Ctrl + C** to stop the server. On later runs `.\run.ps1` starts in a few seconds.

### Options

```powershell
.\run.ps1 -City delhi       # mumbai, delhi, kolkata, chennai, bengaluru, hyderabad, pune, guwahati, dhaka
.\run.ps1 -Refresh          # download the data again (e.g. after changing city)
.\run.ps1 -Synthetic        # use the synthetic demo dataset instead of real data
.\run.ps1 -Port 8080        # different port
```

Any location works too: `.\.venv\Scripts\python.exe backend\scripts\fetch_data.py --lat 26.91 --lon 75.79 --name "Jaipur, India"`, then restart.

### Manual steps (any OS)

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python backend/scripts/fetch_data.py --city mumbai     # optional: real data
python backend/scripts/export_snapshot.py
python -m uvicorn app.main:app --app-dir backend --reload
```

macOS / Linux users can simply run `./run.sh`.

---

## 📊 What the website shows

| Page | Content | Syllabus topic |
|---|---|---|
| **Overview** | Live conditions (Open-Meteo), tomorrow's rain probability, 7-day Markov vs physical forecast, key findings | — |
| **Data & Statistics** | Cleaning log, mean / variance / SD / skewness / kurtosis, CI for μ, histograms, correlation heat map, r significance tests | Descriptive statistics, correlation |
| **Probability** | Mixed random variable, MLE fits of Gamma / Weibull / Exponential / Lognormal / Normal, KS + χ² + AIC, Q-Q plot, CDF, P(X > t) calculator, Poisson model of heavy-rain days | Distributions, goodness of fit, Poisson |
| **Markov Chain** | State diagram, transition matrix, stationary distribution, n-step (Chapman–Kolmogorov), geometric spell lengths, χ² test of the Markov property, Brier skill score | Markov chains, hypothesis testing |
| **Regression** | Multiple linear regression built step by step: humidity only → 5 weather factors (pressure, temperature, humidity, cloud, wind) → extended model with day-to-day changes, yesterday's rain and season, chosen by partial F-tests and backward elimination; HC3 robust SEs, Breusch–Pagan, VIF, Cook's distance; next-day forecast; per-year out-of-sample skill | Multiple regression, hypothesis testing |
| **Monte Carlo** | Chain-dependent (Markov–Gamma) weather generator; distribution of annual/monsoon totals vs observed | Stochastic simulation |
| **Predict** | Today's and yesterday's weather → multiple-regression estimate for today and forecast for tomorrow, with intervals and a breakdown of how much each factor moved the estimate; P(rain tomorrow), Gamma-based amounts | All of the above |
| **Methodology** | Pipeline, hypotheses H1–H4, limitations, references, API | — |

Get every key number as Markdown (paste into the report or slides):

```powershell
.\.venv\Scripts\python.exe backend\scripts\report.py > results.md
```

---

## 🚀 Upload to GitHub

```powershell
git init
git add .
git commit -m "Rainfall Prediction System"
git branch -M main
git remote add origin https://github.com/<your-username>/rainfall-prediction-system.git
git push -u origin main
```

**Free live demo with GitHub Pages:** in the repository go to **Settings → Pages → Source: GitHub Actions**. The workflow in `.github/workflows/pages.yml` runs the tests and publishes the dashboard to `https://<your-username>.github.io/rainfall-prediction-system/`.
On Pages there is no Python server, so the site runs in **static mode**: it reads `snapshot.json` and does predictions and simulations in the browser using the same formulas. Run `.\run.ps1` (or `export_snapshot.py`) before you push so that the published snapshot contains your real-data results.

---

## 🗂️ Project structure

```
rainfall-prediction-system/
├── run.ps1 / run.sh            one-command launchers
├── requirements.txt
├── backend/
│   ├── app/
│   │   ├── main.py             FastAPI routes + serves the built frontend
│   │   ├── analysis.py         runs the full pipeline, prediction logic
│   │   ├── data.py             loading + cleaning
│   │   ├── config.py
│   │   └── engine/
│   │       ├── descriptive.py  summary stats, climatology, correlation
│   │       ├── distributions.py  MLE fits, KS/χ²/AIC, exceedance, Poisson
│   │       ├── markov.py       transition matrices, tests, spells, Brier score
│   │       ├── regression.py   OLS with full inference, evaluation
│   │       └── simulate.py     Monte Carlo weather generator
│   ├── scripts/
│   │   ├── fetch_data.py       download real ERA5 data (Open-Meteo)
│   │   ├── make_synthetic.py   synthetic data with known parameters
│   │   ├── export_snapshot.py  analysis → frontend snapshot.json
│   │   └── report.py           key results as Markdown
│   ├── data/                   CSV datasets
│   └── tests/test_engine.py    pytest checks (MLE, OLS vs SciPy, pipeline)
├── frontend/
│   ├── src/                    React source (pages, charts, UI kit)
│   ├── dist/                   pre-built site (committed — no Node needed)
│   └── build.mjs               esbuild bundler
└── .github/workflows/pages.yml
```

## 🔌 REST API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | status and data source |
| GET | `/api/analysis` | the complete analysis (every page) |
| POST | `/api/predict` | `{humidity_pct, cloud_pct, pressure_hpa, temp_c, wind_kmh, month, today_wet, level, threshold}` |
| GET | `/api/probability?threshold=50&season=Monsoon` | P(X > t) by season |
| GET | `/api/simulate?n_years=2000&seed=7` | Monte Carlo run |
| GET | `/api/dataset` | download the CSV in use |

Interactive documentation: <http://127.0.0.1:8000/docs>

## 🛠️ Editing the frontend (optional)

The compiled site in `frontend/dist` is already included. Only if you change the React code, install **Node.js 18+**, then:

```powershell
cd frontend
npm install
npm run build        # or: npm run watch  (rebuilds on save; keep the Python server running)
```

## ✅ Tests

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
```

## 🧯 Troubleshooting

| Problem | Fix |
|---|---|
| `python` opens the Microsoft Store | Install Python from python.org and tick "Add to PATH", or disable the *App execution aliases* for python in Windows Settings |
| "running scripts is disabled" | `powershell -ExecutionPolicy Bypass -File .\run.ps1` |
| Script blocked after unzipping | `Get-ChildItem -Recurse | Unblock-File` in the project folder |
| Port 8000 already in use | `.\run.ps1 -Port 8080` |
| Badge says "Static mode" | The page could not reach the Python server; it still works using the snapshot |
| Download of real data fails | Check internet / firewall; the app keeps working on synthetic data |

## ⚠️ Honest limitations

* ERA5 is a reanalysis grid (~25 km), not a rain-gauge record.
* Same-day regression measures association, not causation, and is not a forecast.
* Rainfall residuals are skewed and heteroscedastic, so OLS intervals are approximate. Their actual coverage is measured and reported.
* A first-order chain with fixed monthly parameters under-represents long spells and year-to-year variability (shown on the Monte Carlo page). These are natural directions for the research paper.

## 📚 References

* Katz, R. W. (1977). Precipitation as a chain-dependent process. *Journal of Applied Meteorology*, 16, 671–676.
* Richardson, C. W. (1981). Stochastic simulation of daily precipitation, temperature, and solar radiation. *Water Resources Research*, 17, 182–190.
* Gabriel, K. R. & Neumann, J. (1962). A Markov chain model for daily rainfall occurrence at Tel Aviv. *QJRMS*, 88, 90–95.
* Wilks, D. S. (2019). *Statistical Methods in the Atmospheric Sciences*, 4th ed.
* Hersbach, H. et al. (2020). The ERA5 global reanalysis. *QJRMS*, 146, 1999–2049. Data via Open-Meteo.com (CC BY 4.0).

MIT licence.
