import { useMemo, useState } from "react";
import { useApp } from "../App.jsx";
import { Band, C, Dots, Legend, Line, Plot } from "../components/charts.jsx";
import { Callout, Card, Formula, PageHeader, Segmented, Stat, Table, Tex, fmt, pct, pfmt, stars } from "../components/ui.jsx";

const SYMBOL = { humidity_pct: "H", cloud_pct: "C", pressure_hpa: "P", temp_c: "T", wind_kmh: "W" };

export default function Regression() {
  const { analysis: a } = useApp();
  const r = a.regression;
  const [key, setKey] = useState("multiple");
  const m = r.models.find((q) => q.key === key);
  const s = m.summary;
  const simple = r.models.find((q) => q.key === "simple");
  const b = r.simple_bands;
  const scatter = useMemo(() => a.descriptive.scatter.map((p) => [p.humidity_pct, p.rain_mm]), [a]);
  const yMaxSc = Math.max(...scatter.map((p) => p[1]));
  const lhs = m.log_target ? String.raw`\widehat{\log(1+R)}` : String.raw`\hat{R}`;
  const eq = s.coefficients.map((c, i) => {
    const v = c.estimate;
    const num = Math.abs(v) < 0.01 ? v.toExponential(2) : v.toFixed(Math.abs(v) >= 100 ? 1 : 3);
    if (i === 0) return num;
    return `${v < 0 ? "-" : "+"} ${num.replace("-", "")}\\,${SYMBOL[c.term]}`;
  }).join(" ");
  const d = m.diagnostics;
  const ts = r.test_series;
  const tsIdx = ts.dates.map((_, i) => i);
  const piKey = `${key}_pi`;
  const tsMax = Math.max(...ts.actual, ...ts[piKey][1]) * 1.05;
  const mt = r.monthly_test;
  const mtMax = Math.max(...mt.map((q) => Math.max(q.actual, q[key])));

  return (
    <div className="grid">
      <PageHeader eyebrow="Module IV · Correlation & regression" title="Regression analysis">
        Ordinary least squares fitted with scikit-learn on {r.split.train_years[0]}–{r.split.train_years[1]} ({r.split.n_train.toLocaleString()} days),
        then tested on the unseen years {r.split.test_years[0]}–{r.split.test_years[1]} ({r.split.n_test.toLocaleString()} days). Every coefficient
        comes with a standard error, t-test and confidence interval.
      </PageHeader>

      <div className="span-12 scope-bar">
        <Segmented value={key} onChange={setKey} options={[
          { value: "simple", label: "Simple: R ~ Humidity" }, { value: "multiple", label: "Multiple: 5 predictors" }, { value: "log", label: "Log-linear" }]} />
      </div>

      <Card className="span-12 equation-card">
        <div className="eq-label">Fitted equation</div>
        <Tex block>{`${lhs} = ${eq}`}</Tex>
        <div className="eq-legend">{m.features.map((f) => <span key={f}><b>{SYMBOL[f]}</b> = {s.coefficients.find((c) => c.term === f).label}</span>)}</div>
      </Card>

      <div className="span-12 stat-strip">
        <Stat label={m.log_target ? "R² (log scale)" : "R²"} value={fmt(s.r2, 3)} note={`adjusted ${fmt(s.adj_r2, 3)}`} tone="orange" />
        <Stat label="F statistic" value={fmt(s.F, 0)} note={`df = (${s.p}, ${s.df_resid.toLocaleString()}), p ${pfmt(s.F_p)}`} />
        <Stat label="Residual SE  s" value={fmt(s.residual_se, 2)} note={m.log_target ? "log units" : "mm"} />
        <Stat label="Durbin–Watson" value={fmt(s.durbin_watson, 2)} note={s.durbin_watson < 1.5 ? "positive autocorrelation" : "≈ 2: little autocorrelation"} />
        <Stat label="Test RMSE" value={`${fmt(m.test.rmse, 2)} mm`} note={`climatology ${fmt(m.test.baseline_rmse, 2)} mm`} tone="sky" />
      </div>

      <Card className="span-7" title="Coefficients" subtitle="H₀: βⱼ = 0 tested with t = β̂ⱼ / SE(β̂ⱼ)  ·  * p<0.05  ** p<0.01  *** p<0.001">
        <Table compact
          columns={[
            { key: "label", label: "Term", render: (c) => c.label.replace(/ \(.*\)/, "") },
            { key: "estimate", label: "β̂", num: true, render: (c) => <b>{fmt(c.estimate, 4)}</b> },
            { key: "se", label: "SE", num: true, render: (c) => fmt(c.se, 4) },
            { key: "t", label: "t", num: true, render: (c) => fmt(c.t, 2) },
            { key: "p", label: "p", num: true, render: (c) => <>{pfmt(c.p)} <span className="stars">{stars(c.p)}</span></> },
            { key: "ci", label: "95% CI", num: true, render: (c) => `[${fmt(c.ci95[0], 3)}, ${fmt(c.ci95[1], 3)}]` },
            { key: "std", label: "Std. β", num: true, render: (c) => (c.standardized == null ? "" : fmt(c.standardized, 3)) },
          ]}
          rows={s.coefficients} />
        {key !== "simple" && (
          <div className="vif">
            <span>Multicollinearity (VIF):</span>
            {r.vif.map((v) => <span key={v.term} className={v.vif > 5 ? "bad" : ""}>{SYMBOL[v.term]} {fmt(v.vif, 2)}</span>)}
            <small>VIF &gt; 5 signals strongly overlapping predictors.</small>
          </div>
        )}
      </Card>

      <Card className="span-5" title="The mathematics">
        <Formula title="Least-squares estimator" tex={String.raw`\hat{\boldsymbol\beta}=(X^{\top}X)^{-1}X^{\top}\mathbf y`} />
        <Formula title="Coefficient of determination" tex={String.raw`R^2=1-\frac{SSE}{SST}=${fmt(s.r2, 3)}`} />
        <Formula title="95% prediction interval for a new day" tex={String.raw`\hat y_0\pm t_{0.975,\,n-p-1}\; s\sqrt{1+\mathbf x_0^{\top}(X^{\top}X)^{-1}\mathbf x_0}`} />
        <p className="note">Confidence interval = uncertainty about the <i>average</i> rainfall for these conditions (narrow).
          Prediction interval = uncertainty about <i>one actual day</i> (wide). Intervals are clipped at 0 mm.</p>
      </Card>

      {key === "simple" && (
        <Card className="span-12" title="Rainfall vs humidity with fitted line" subtitle="Shaded: 95% confidence band (dark) and 95% prediction band (light)">
          <Plot height={320} xDomain={[Math.min(...b.x), Math.max(...b.x)]} yDomain={[Math.min(0, ...b.yhat), Math.min(yMaxSc, 140)]} xLabel="Humidity (%)" yLabel="Rainfall (mm)"
            tooltip={({ px, x }) => { const i = b.x.findIndex((v) => x(v) >= px); if (i < 0) return null; return { left: x(b.x[i]), top: 0, crosshair: x(b.x[i]), content: <>H = {fmt(b.x[i], 1)}%<br />ŷ = {fmt(b.yhat[i], 2)} mm<br />PI [{fmt(b.pi_lo[i], 1)}, {fmt(b.pi_hi[i], 1)}]</> }; }}>
            {({ x, y }) => (<>
              <Dots data={scatter.filter((p) => p[1] <= 140)} x={x} y={y} r={2.4} color={C.sky} opacity={0.35} />
              <Band data={b.x.map((v, i) => [v, b.pi_lo[i], b.pi_hi[i]])} x={x} y={y} color={C.orange} opacity={0.12} />
              <Band data={b.x.map((v, i) => [v, b.ci_lo[i], b.ci_hi[i]])} x={x} y={y} color={C.orange} opacity={0.35} />
              <Line data={b.x.map((v, i) => [v, b.yhat[i]])} x={x} y={y} color={C.orange} width={3} curve={false} />
            </>)}
          </Plot>
          <Callout tone="warn" title="What this chart teaches">
            A straight line through zero-inflated, skewed data under-predicts storms and predicts small positive rain on dry days. R² = {fmt(simple.summary.r2, 3)}
            means humidity alone explains {pct(simple.summary.r2, 0)} of the day-to-day variance — real, but far from the whole story.
          </Callout>
        </Card>
      )}

      <Card className="span-6" title="Residuals vs fitted" subtitle="Should be a structureless cloud around 0">
        <Plot height={260} xDomain={[Math.min(...d.fitted), Math.max(...d.fitted)]} yDomain={[Math.min(...d.resid), Math.max(...d.resid)]}
          xLabel={`Fitted value${m.log_target ? " (log scale)" : " (mm)"}`} yLabel="Residual">
          {({ x, y, iw }) => (<>
            <line x1={0} x2={iw} y1={y(0)} y2={y(0)} className="ref" />
            <Dots data={d.fitted.map((f, i) => [f, d.resid[i]])} x={x} y={y} r={2.4} color={C.purple} opacity={0.4} />
          </>)}
        </Plot>
        <p className="note">The fan shape (spread grows with the fitted value) is <b>heteroscedasticity</b>, and the hard floor comes from rainfall ≥ 0.
          Residual skewness = {fmt(d.resid_skew, 2)}.</p>
      </Card>

      <Card className="span-6" title="Normal Q-Q plot of residuals" subtitle="OLS inference assumes roughly normal errors">
        <Plot height={260} xDomain={[-3, 3]} yDomain={[Math.min(-3, ...d.qq_sample), Math.max(3, ...d.qq_sample)]} xLabel="Theoretical N(0,1) quantile" yLabel="Standardised residual">
          {({ x, y }) => (<>
            <Line data={[[-3, -3], [3, 3]]} x={x} y={y} color={C.grey} dash="5 4" width={1.5} curve={false} />
            <Dots data={d.qq_theoretical.map((v, i) => [v, d.qq_sample[i]])} x={x} y={y} r={3.4} color={C.purple} opacity={0.85} />
          </>)}
        </Plot>
        <p className="note">{d.shapiro_note} Heavy right tail → prediction intervals are approximate; their real coverage is checked below.</p>
      </Card>

      <Card className="span-12" title="Out-of-sample evaluation" subtitle={`All three models vs a climatology baseline (training-period mean for the calendar month), test years ${r.split.test_years.join("–")}`}>
        <Table
          columns={[
            { key: "name", label: "Model" },
            { key: "r2", label: "Test R²", num: true, render: (q) => fmt(q.test.r2, 3) },
            { key: "corr", label: "Corr(ŷ, y)", num: true, render: (q) => fmt(q.test.corr, 3) },
            { key: "mae", label: "MAE (mm)", num: true, render: (q) => fmt(q.test.mae, 2) },
            { key: "rmse", label: "RMSE (mm)", num: true, render: (q) => fmt(q.test.rmse, 2) },
            { key: "bias", label: "Bias (mm)", num: true, render: (q) => fmt(q.test.bias, 2) },
            { key: "skill", label: "MSE skill vs clim.", num: true, render: (q) => <b className={q.test.skill_vs_climatology > 0 ? "good" : "bad"}>{pct(q.test.skill_vs_climatology, 1)}</b> },
            { key: "cov", label: "95% PI coverage", num: true, render: (q) => pct(q.test.pi_coverage, 1) },
            { key: "w", label: "Mean PI width", num: true, render: (q) => `${fmt(q.test.pi_mean_width, 1)} mm` },
          ]}
          rows={r.models} highlight={(q) => q.key === key} />
        <p className="note">Climatology baseline: MAE {fmt(m.test.baseline_mae, 2)} mm, RMSE {fmt(m.test.baseline_rmse, 2)} mm. A model is only useful if it beats this.
          Coverage close to 95% means the uncertainty statement is honest; the log-linear model trades a narrower interval for some under-coverage.</p>
      </Card>

      <Card className="span-8" title={`Actual vs predicted — monsoon ${ts.year} (test year)`} subtitle={`${m.name}; shaded = 95% prediction interval`}>
        <Plot height={290} xDomain={[0, tsIdx.length - 1]} yDomain={[0, tsMax]} yLabel="Rainfall (mm)"
          xTickValues={[0, 30, 61, 92].filter((v) => v < tsIdx.length)} xFormat={(i) => ts.dates[Math.round(i)]?.slice(5) ?? ""}
          tooltip={({ px, x }) => { const i = Math.round(x.invert(px)); if (i < 0 || i >= tsIdx.length) return null; return { left: x(i), top: 0, crosshair: x(i), content: <>{ts.dates[i]}<br />Actual <b>{fmt(ts.actual[i], 1)}</b> mm<br />Predicted {fmt(ts[key][i], 1)} mm<br />PI [{fmt(ts[piKey][0][i], 1)}, {fmt(ts[piKey][1][i], 1)}]</> }; }}>
          {({ x, y }) => (<>
            <Band data={tsIdx.map((i) => [i, ts[piKey][0][i], ts[piKey][1][i]])} x={x} y={y} color={C.orange} opacity={0.15} curve={false} />
            <Line data={tsIdx.map((i) => [i, ts.actual[i]])} x={x} y={y} color={C.sky} width={2} curve={false} />
            <Line data={tsIdx.map((i) => [i, ts[key][i]])} x={x} y={y} color={C.orange} width={2.5} />
          </>)}
        </Plot>
        <Legend items={[{ label: "Actual", color: "var(--c-sky)", type: "line" }, { label: "Predicted", color: "var(--c-orange)", type: "line" }, { label: "95% PI", color: "var(--c-orange)" }]} />
      </Card>

      <Card className="span-4" title="Monthly totals (test years)" subtitle="Daily errors partly cancel when aggregated">
        <Plot height={290} xDomain={[0, mtMax]} yDomain={[0, mtMax]} xLabel="Actual (mm/month)" yLabel="Predicted"
          tooltip={({ px, py, x, y }) => { const q = mt.reduce((best, cur) => { const dd = (x(cur.actual) - px) ** 2 + (y(cur[key]) - py) ** 2; return dd < best[0] ? [dd, cur] : best; }, [Infinity, null])[1]; return q && { left: x(q.actual), top: y(q[key]) - 20, content: <>{q.year}-{String(q.month).padStart(2, "0")}<br />Actual {fmt(q.actual, 0)} · Pred {fmt(q[key], 0)}</> }; }}>
          {({ x, y }) => (<>
            <Line data={[[0, 0], [mtMax, mtMax]]} x={x} y={y} color={C.grey} dash="5 4" width={1.5} curve={false} />
            <Dots data={mt.map((q) => [q.actual, q[key], q.month >= 6 && q.month <= 9 ? "var(--c-orange)" : "var(--c-sky)"])} x={x} y={y} r={4.5} opacity={0.8} />
          </>)}
        </Plot>
      </Card>
    </div>
  );
}

