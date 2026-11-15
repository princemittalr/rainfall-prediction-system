// Data layer. "live" mode talks to the FastAPI backend; "static" mode (GitHub Pages,
// or backend not running) loads snapshot.json and reproduces calculations in the browser.
import { gammaPpf, gammaSf, mean, mulberry32, quadForm, quantile, randGamma, sd, tPpf } from "./stats.js";

const API_BASE = (typeof window !== "undefined" && window.RPS_API_BASE) || "";
const MONTH_TO_SEASON = { 12: "Winter", 1: "Winter", 2: "Winter", 3: "Pre-monsoon", 4: "Pre-monsoon", 5: "Pre-monsoon",
  6: "Monsoon", 7: "Monsoon", 8: "Monsoon", 9: "Monsoon", 10: "Post-monsoon", 11: "Post-monsoon" };
export const SEASON_OF = MONTH_TO_SEASON;
const IMD = [[0, 0.1, "No rain"], [0.1, 2.5, "Very light rain"], [2.5, 15.6, "Light rain"], [15.6, 64.5, "Moderate rain"],
  [64.5, 115.6, "Heavy rain"], [115.6, 204.5, "Very heavy rain"], [204.5, Infinity, "Extremely heavy rain"]];
export const imdCategory = (mm) => (IMD.find(([lo, hi]) => mm >= lo && mm < hi) || IMD[0])[2];

async function fetchJson(url, opts = {}, timeout = 8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  } finally { clearTimeout(id); }
}

export async function loadAnalysis() {
  try {
    await fetchJson(`${API_BASE}/api/health`, {}, 2500);
    const analysis = await fetchJson(`${API_BASE}/api/analysis`, {}, 30000);
    return { analysis, mode: "live" };
  } catch {
    const analysis = await fetchJson("./snapshot.json", {}, 30000);
    return { analysis, mode: "static" };
  }
}

// ---------------------------------------------------------------- prediction
function localPredict(a, inputs, level, threshold) {
  const reg = a.regression.models.map((m) => {
    const e = m.export;
    const x = [1, ...e.features.map((f) => Number(inputs[f]))];
    let yhat = x.reduce((s, v, i) => s + v * e.coef[i], 0);
    const h = quadForm(x, e.xtx_inv);
    const t = tPpf(0.5 + level / 2, e.df_resid);
    let ci = [yhat - t * e.s * Math.sqrt(h), yhat + t * e.s * Math.sqrt(h)];
    let pi = [yhat - t * e.s * Math.sqrt(1 + h), yhat + t * e.s * Math.sqrt(1 + h)];
    if (e.log_target) { const f = Math.expm1; yhat = f(yhat); ci = ci.map(f); pi = pi.map(f); }
    const clip = (v) => Math.max(0, v);
    return { key: m.key, name: m.name, yhat: clip(yhat), ci: ci.map(clip), pi: pi.map(clip), category: imdCategory(clip(yhat)) };
  });
  const month = Number(inputs.month);
  const mm = a.markov.monthly[month - 1];
  const P = mm.P;
  const pWet = inputs.today_wet ? P[1][1] : P[0][1];
  const season = MONTH_TO_SEASON[month];
  const g = a.distribution.season_fits[season];
  const thr = a.meta.wet_threshold_mm;
  const sfT = threshold >= thr ? gammaSf(Math.max(threshold - thr, 0), g.shape, g.scale) : 1;
  const horizon = [];
  let v = inputs.today_wet ? [0, 1] : [1, 0];
  for (let d = 1; d <= 7; d++) { v = [v[0] * P[0][0] + v[1] * P[1][0], v[0] * P[0][1] + v[1] * P[1][1]]; horizon.push({ day: d, p_wet: v[1] }); }
  const meanIfWet = thr + g.shape * g.scale;
  return {
    inputs: { ...inputs, level, threshold },
    regression: reg,
    markov: { month: mm.name, today: inputs.today_wet ? "Wet" : "Dry", p_wet_tomorrow: pWet, horizon, stationary_wet: mm.stationary_wet },
    distribution: {
      season, shape: g.shape, scale: g.scale, mean_if_wet: meanIfWet,
      interval_if_wet: [thr + gammaPpf((1 - level) / 2, g.shape, g.scale), thr + gammaPpf(0.5 + level / 2, g.shape, g.scale)],
      p_exceed_if_wet: sfT, p_exceed_tomorrow: pWet * sfT, expected_tomorrow: pWet * meanIfWet,
    },
  };
}

export async function predict(mode, analysis, inputs, level = 0.95, threshold = 50) {
  if (mode === "live") {
    try {
      return await fetchJson(`${API_BASE}/api/predict`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...inputs, level, threshold }),
      });
    } catch (e) { console.warn("API predict failed, computing locally", e); }
  }
  return localPredict(analysis, inputs, level, threshold);
}

// ---------------------------------------------------------------- exceedance
export function exceedanceLocal(a, threshold) {
  const thr = a.meta.wet_threshold_mm;
  const out = {};
  for (const [s, g] of Object.entries(a.distribution.season_fits)) {
    const p = a.distribution.p_wet_season[s];
    const sf = threshold >= thr ? gammaSf(Math.max(threshold - thr, 0), g.shape, g.scale) : 1;
    out[s] = { p_wet: p, p_exceed_if_wet: sf, p_exceed: p * sf };
  }
  return { threshold, seasons: out };
}

// ---------------------------------------------------------------- Monte Carlo
function localSimulate(a, nYears, seed) {
  const rng = mulberry32(seed);
  const monthly = a.markov.monthly, fits = a.distribution.season_fits, thr = a.meta.wet_threshold_mm;
  const days = [];
  const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  dim.forEach((n, i) => { for (let d = 0; d < n; d++) days.push(i + 1); });
  const annual = [], monsoon = [], wetDays = [], maxDay = [];
  let example = null;
  for (let y = 0; y < nYears; y++) {
    let wet = rng() < monthly[0].stationary_wet, tot = 0, mon = 0, wd = 0, mx = 0;
    const ex = y === 0 ? [] : null;
    for (const m of days) {
      const p = wet ? monthly[m - 1].p11 : monthly[m - 1].p01;
      wet = rng() < p;
      let r = 0;
      if (wet) { const g = fits[MONTH_TO_SEASON[m]]; r = thr + randGamma(rng, g.shape, g.scale); wd++; }
      tot += r; if (m >= 6 && m <= 9) mon += r; if (r > mx) mx = r;
      if (ex) ex.push(Math.round(r * 10) / 10);
    }
    annual.push(tot); monsoon.push(mon); wetDays.push(wd); maxDay.push(mx);
    if (ex) example = ex;
  }
  const years = a.descriptive.yearly.filter((y) => y.days >= 360);
  const block = (s, obs) => {
    const sorted = [...s].sort((x, y) => x - y);
    const lo = Math.min(sorted[0], ...obs), hi = Math.max(sorted[sorted.length - 1], ...obs);
    const bins = 32, w = (hi - lo) / bins, counts = new Array(bins).fill(0);
    s.forEach((v) => { counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++; });
    const p05 = quantile(sorted, 0.05), p95 = quantile(sorted, 0.95);
    return {
      mean: mean(s), sd: sd(s), p05, p50: quantile(sorted, 0.5), p95,
      hist: { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * w), density: counts.map((c) => c / s.length) },
      observed: obs, observed_mean: mean(obs), observed_sd: sd(obs),
      observed_within_90: obs.filter((v) => v >= p05 && v <= p95).length / obs.length,
    };
  };
  const sortedMax = [...maxDay].sort((x, y) => x - y);
  return {
    n_years: nYears,
    annual: block(annual, years.map((y) => y.total)),
    monsoon: block(monsoon, years.map((y) => y.monsoon_total)),
    wet_days: { mean: mean(wetDays), sd: sd(wetDays) },
    max_day: { p50: quantile(sortedMax, 0.5), p95: quantile(sortedMax, 0.95) },
    example_year: example,
  };
}

export async function simulate(mode, analysis, nYears, seed) {
  if (mode === "live") {
    try { return await fetchJson(`${API_BASE}/api/simulate?n_years=${nYears}&seed=${seed}`, {}, 60000); }
    catch (e) { console.warn("API simulate failed, computing locally", e); }
  }
  return localSimulate(analysis, nYears, seed);
}

// ---------------------------------------------------------------- live weather
// Open-Meteo forecast API (free, CORS-enabled). Used only for the "live conditions" card.
export async function loadLiveWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,cloud_cover,pressure_msl,wind_speed_10m,weather_code" +
    "&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,weather_code" +
    "&timezone=auto&forecast_days=7";
  return fetchJson(url, {}, 6000);
}

export const datasetUrl = (mode) => (mode === "live" ? `${API_BASE}/api/dataset` : "./dataset.csv");
