import { createContext, useContext, useEffect, useState } from "react";
import {
  LuBookOpen, LuCloudRain, LuDatabase, LuDices, LuDownload, LuLayoutDashboard, LuMoon, LuServer, LuShuffle,
  LuSigma, LuSun, LuTrendingUp, LuTriangleAlert, LuWifiOff,
} from "react-icons/lu";
import { datasetUrl, loadAnalysis, loadLiveWeather } from "./lib/api.js";
import { Logo } from "./components/Illustrations.jsx";
import Overview from "./pages/Overview.jsx";
import DataPage from "./pages/Data.jsx";
import Probability from "./pages/Probability.jsx";
import Markov from "./pages/Markov.jsx";
import Regression from "./pages/Regression.jsx";
import Simulation from "./pages/Simulation.jsx";
import Predict from "./pages/Predict.jsx";
import Methodology from "./pages/Methodology.jsx";

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const PAGES = [
  { id: "overview", label: "Overview", icon: LuLayoutDashboard, el: Overview },
  { id: "data", label: "Data & Statistics", icon: LuDatabase, el: DataPage },
  { id: "probability", label: "Probability", icon: LuSigma, el: Probability },
  { id: "markov", label: "Markov Chain", icon: LuShuffle, el: Markov },
  { id: "regression", label: "Regression", icon: LuTrendingUp, el: Regression },
  { id: "simulation", label: "Monte Carlo", icon: LuDices, el: Simulation },
  { id: "predict", label: "Predict", icon: LuCloudRain, el: Predict },
  { id: "method", label: "Methodology", icon: LuBookOpen, el: Methodology },
];

const currentPage = () => {
  const id = window.location.hash.replace(/^#\/?/, "");
  return PAGES.some((p) => p.id === id) ? id : "overview";
};

export default function App() {
  const [state, setState] = useState({ status: "loading" });
  const [page, setPage] = useState(currentPage);
  const [live, setLive] = useState(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");

  useEffect(() => {
    loadAnalysis()
      .then(({ analysis, mode }) => setState({ status: "ready", analysis, mode }))
      .catch((e) => setState({ status: "error", error: String(e) }));
    const onHash = () => { setPage(currentPage()); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (state.status !== "ready") return;
    const { latitude, longitude } = state.analysis.meta;
    if (latitude == null) return;
    loadLiveWeather(latitude, longitude).then(setLive).catch(() => setLive(false));
  }, [state.status]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("rps-theme", theme); } catch { /* storage unavailable */ }
  }, [theme]);

  if (state.status === "loading") {
    return (
      <div className="splash">
        <Logo />
        <div className="spinner" />
        <p>Loading the statistics engine…</p>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="splash">
        <Logo />
        <h2>Could not load the analysis</h2>
        <p>Start the backend (<code>.\run.ps1</code>) or make sure <code>snapshot.json</code> sits next to index.html.</p>
        <pre>{state.error}</pre>
      </div>
    );
  }

  const { analysis, mode } = state;
  const meta = analysis.meta;
  const Page = PAGES.find((p) => p.id === page).el;

  return (
    <Ctx.Provider value={{ analysis, mode, live, theme }}>
      <div className="shell">
        <aside className="sidebar">
          <a className="brand" href="#/overview" aria-label="Home">
            <Logo />
            <span className="brand-text">
              <strong>RainStat</strong>
              <small>Prediction System</small>
            </span>
          </a>
          <nav className="nav">
            {PAGES.map((p) => (
              <a key={p.id} href={`#/${p.id}`} className={`nav-item ${page === p.id ? "active" : ""}`} title={p.label}>
                <p.icon />
                <span>{p.label}</span>
              </a>
            ))}
          </nav>
          <div className="sidebar-foot">
            <span>Applied Statistics &amp; Stochastic Processes</span>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="topbar-title">
              <span className="hello">Rainfall Prediction System</span>
              <strong>{meta.location}</strong>
            </div>
            <div className="topbar-actions">
              <span className={`pill ${meta.synthetic ? "pill-warn" : "pill-ok"}`}
                title={meta.synthetic ? "Generated data for demonstration - run fetch_data.py for real data" : meta.citation}>
                {meta.synthetic ? <LuTriangleAlert /> : <LuDatabase />}
                {meta.synthetic ? "Synthetic data" : "Real data · ERA5"}
              </span>
              <span className={`pill ${mode === "live" ? "pill-ok" : "pill-muted"}`}
                title={mode === "live" ? "Calculations run in the Python (FastAPI) engine" : "No backend found - using exported snapshot; calculations run in your browser"}>
                {mode === "live" ? <LuServer /> : <LuWifiOff />}
                {mode === "live" ? "Python API" : "Static mode"}
              </span>
              <a className="icon-btn" href={datasetUrl(mode)} download title="Download the dataset (CSV)" aria-label="Download dataset">
                <LuDownload />
              </a>
              <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                title="Toggle dark mode" aria-label="Toggle dark mode">
                {theme === "dark" ? <LuSun /> : <LuMoon />}
              </button>
            </div>
          </header>

          {meta.synthetic && (
            <div className="banner">
              <LuTriangleAlert />
              <span>
                <strong>Demo dataset.</strong> Numbers below come from a synthetic Markov-Gamma weather generator with known parameters.
                Run <code>python backend/scripts/fetch_data.py</code> to switch to real ERA5 observations.
              </span>
            </div>
          )}

          <main className="content" key={page}>
            <Page />
          </main>
          <footer className="footer">
            Data: {meta.source} · {meta.start} → {meta.end} · {meta.n_days.toLocaleString()} days · Analysis generated {meta.generated_at.replace("T", " ").replace("Z", " UTC")}
          </footer>
        </div>
      </div>
    </Ctx.Provider>
  );
}
