import { LuArrowRight, LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import { useApp } from "../App.jsx";
import { Card, Formula, PageHeader, Table, fmt } from "../components/ui.jsx";

const PIPELINE = [
  ["Weather data", "ERA5 daily via Open-Meteo"],
  ["Cleaning", "duplicates, bounds, gaps"],
  ["Descriptive stats", "mean, variance, skew"],
  ["Distributions", "Gamma vs 4 rivals, GOF"],
  ["Markov chain", "wet/dry transitions"],
  ["Regression", "OLS + inference"],
  ["Monte Carlo", "simulate seasons"],
  ["Evaluation", "train/test, skill scores"],
];

const SYLLABUS = [
  { unit: "Random variables & probability", where: "Rainfall as a mixed (discrete + continuous) random variable; law of total probability and expectation", page: "probability" },
  { unit: "Descriptive statistics", where: "Mean, unbiased variance, SD, skewness, kurtosis, t-interval for μ", page: "data" },
  { unit: "Probability distributions", where: "Gamma, Exponential, Weibull, Lognormal, Normal; PDF/CDF; MLE vs method of moments", page: "probability" },
  { unit: "Goodness of fit", where: "Kolmogorov–Smirnov, Pearson χ² with equiprobable bins, AIC/BIC, Q-Q plots", page: "probability" },
  { unit: "Poisson distribution / process", where: "Annual count of heavy-rain days, dispersion index test", page: "probability" },
  { unit: "Correlation", where: "Pearson & Spearman, t-test for ρ = 0, Fisher-z confidence interval", page: "data" },
  { unit: "Regression", where: "Simple & multiple OLS, t and F tests, R², CI vs PI, residual diagnostics, VIF, Durbin–Watson", page: "regression" },
  { unit: "Markov chains", where: "Transition matrix MLE, stationary distribution, n-step (Chapman–Kolmogorov), geometric spell lengths, χ² test of the Markov property", page: "markov" },
  { unit: "Stochastic simulation", where: "Monte Carlo chain-dependent weather generator; random sums", page: "simulation" },
  { unit: "Hypothesis testing", where: "Every claim above is backed by a stated H₀, test statistic and p-value", page: "method" },
];

const ENDPOINTS = [
  ["GET", "/api/health", "Status, data source"],
  ["GET", "/api/analysis", "Complete analysis (all pages)"],
  ["POST", "/api/predict", "Regression + Markov + Gamma prediction"],
  ["GET", "/api/probability?threshold=50&season=Monsoon", "P(X > t) by season"],
  ["GET", "/api/simulate?n_years=2000&seed=7", "Monte Carlo run"],
  ["GET", "/api/dataset", "Download the dataset (CSV)"],
];

export default function Methodology() {
  const { analysis: a, mode } = useApp();
  return (
    <div className="grid">
      <PageHeader eyebrow="How it works" title="Methodology">
        Research question: <b>can probability distributions, a Markov chain and regression analysis be combined to predict daily rainfall — and to
        quantify the uncertainty of that prediction?</b>
      </PageHeader>

      <Card className="span-12" title="Pipeline">
        <div className="pipeline">
          {PIPELINE.map(([t, d], i) => (
            <div key={t} className="pipe-step">
              <span className="pipe-num">{i + 1}</span>
              <strong>{t}</strong>
              <small>{d}</small>
              {i < PIPELINE.length - 1 && <LuArrowRight className="pipe-arrow" />}
            </div>
          ))}
        </div>
      </Card>

      <Card className="span-7" title="Syllabus coverage" subtitle="Everything uses methods from Applied Statistics & Stochastic Processes">
        <Table compact columns={[
          { key: "unit", label: "Course topic", render: (r) => <b>{r.unit}</b> },
          { key: "where", label: "Where it is used" },
          { key: "page", label: "", render: (r) => <a href={`#/${r.page}`} className="mini-link">open</a> },
        ]} rows={SYLLABUS} />
      </Card>

      <Card className="span-5" title="Hypotheses tested">
        <ol className="hyp">
          <li><b>H1.</b> Wet-day rainfall is better described by a Gamma-type distribution than by the Normal. <span className="tag">KS, χ², AIC</span></li>
          <li><b>H2.</b> Daily wet/dry occurrence has memory (first-order Markov), not independent Bernoulli trials. <span className="tag">χ² independence</span></li>
          <li><b>H3.</b> Humidity, cloud, pressure, temperature and wind have significant linear association with rainfall. <span className="tag">t, F tests</span></li>
          <li><b>H4.</b> The models beat a climatology baseline on unseen years, and their nominal 95% intervals achieve close to 95% coverage. <span className="tag">RMSE, Brier, coverage</span></li>
        </ol>
      </Card>

      <Card className="span-6" title="Key definitions">
        <Formula title="Wet day" tex={String.raw`\text{wet} \iff X\ge ${a.meta.wet_threshold_mm}\text{ mm (WMO/ETCCDI convention)}`} />
        <Formula title="Chain-dependent model" tex={String.raw`X_t = S_t\,(1+Y_t),\quad S_t\ \text{Markov},\quad Y_t\overset{iid}{\sim}\text{Gamma}(k_s,\theta_s)`} />
        <Formula title="Chronological split" tex={String.raw`\text{train: } ${a.regression.split.train_years.join("–")},\qquad \text{test: } ${a.regression.split.test_years.join("–")}`} />
      </Card>

      <Card className="span-6" title="Limitations — stated honestly">
        <ul className="limits">
          <li><LuTriangleAlert /> {a.meta.synthetic ? "This deployment runs on synthetic data; numbers illustrate the method only." : `Data are ERA5 reanalysis for one grid cell near ${a.meta.location}, not a rain gauge.`}</li>
          <li><LuTriangleAlert /> Same-day regression shows association, not causation, and is not a forecast of the future.</li>
          <li><LuTriangleAlert /> Rainfall residuals are skewed and heteroscedastic, so OLS intervals are approximate (coverage is reported).</li>
          <li><LuTriangleAlert /> First-order chain with fixed monthly parameters underestimates long spells and year-to-year variability.</li>
          <li><LuCircleCheck /> Extensions: second-order chain, logistic regression for occurrence, Gamma GLM for amounts, ENSO covariate.</li>
        </ul>
      </Card>

      <Card className="span-7" title="REST API" subtitle={mode === "live" ? "Backend running — interactive docs at /docs" : "Start the backend to use these endpoints"}>
        <Table compact columns={[
          { key: 0, label: "Method", render: (r) => <span className={`method m-${r[0].toLowerCase()}`}>{r[0]}</span> },
          { key: 1, label: "Endpoint", render: (r) => <code>{r[1]}</code> },
          { key: 2, label: "Returns" },
        ]} rows={ENDPOINTS} />
        {mode === "live" && <p className="note"><a href="/docs" target="_blank" rel="noreferrer">Open the Swagger UI →</a></p>}
      </Card>

      <Card className="span-5" title="Data & references">
        <ul className="refs">
          <li><b>Data:</b> {a.meta.source}. {a.meta.citation}</li>
          <li>Katz, R. W. (1977). Precipitation as a chain-dependent process. <i>J. Applied Meteorology</i>, 16, 671–676.</li>
          <li>Richardson, C. W. (1981). Stochastic simulation of daily precipitation, temperature and solar radiation. <i>Water Resources Research</i>, 17, 182–190.</li>
          <li>Wilks, D. S. (2019). <i>Statistical Methods in the Atmospheric Sciences</i>, 4th ed. Elsevier.</li>
          <li>Gabriel, K. R. &amp; Neumann, J. (1962). A Markov chain model for daily rainfall occurrence at Tel Aviv. <i>QJRMS</i>, 88, 90–95.</li>
          <li>Hersbach, H. et al. (2020). The ERA5 global reanalysis. <i>QJRMS</i>, 146, 1999–2049.</li>
        </ul>
        <p className="note">Stack: Python · FastAPI · NumPy · SciPy · pandas · scikit-learn | React · D3 scales · KaTeX. Snapshot rows: {fmt(a.meta.n_days, 0)} days.</p>
      </Card>
    </div>
  );
}
