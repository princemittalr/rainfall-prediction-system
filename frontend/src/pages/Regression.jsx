import { useMemo, useState } from "react";
import { LuCircleCheck, LuCircleX } from "react-icons/lu";
import { useApp } from "../App.jsx";
import { isUpgraded } from "../lib/api.js";
import { Band, Bars, C, Dots, Legend, Line, Plot, bandIndex } from "../components/charts.jsx";
import { Callout, Card, Formula, PageHeader, Segmented, Stat, Table, Tex, fmt, pct, pfmt, stars } from "../components/ui.jsx";

const MODEL_TABS = [
  { value: "simple", label: "1 · Humidity only" },
  { value: "multiple", label: "2 · Five weather factors" },
  { value: "extended", label: "3 · Extended (final)" },
  { value: "nextday", label: "4 · Next-day forecast" },
];
const MODEL_COLOR = { simple: "var(--c-grey)", multiple: "var(--c-sky)", extended: "var(--c-orange)", nextday: "var(--c-purple)" };

export default function Regression() {
  const { analysis: a } = useApp();
  const r = a.regression;
  const [key, setKey] = useState("extended");
  const scatter = useMemo(() => a.descriptive.scatter.map((p) => [p.humidity_pct, p.rain_mm]), [a]);
  if (!isUpgraded(a)) {
    return (
      <div className="grid">
        <PageHeader eyebrow="Module IV · Multiple linear regression" title="Regression analysis" />
        <div className="span-12"><Callout tone="warn" title="Analysis snapshot is out of date">
          Run <code>python backend/scripts/export_snapshot.py</code> (or <code>.\run.ps1</code>) to regenerate it with the multiple-regression upgrade.
        </Callout></div>
      </div>
    );
  }
  const m = r.models.find((q) => q.key === key) || r.models[0];
  const s = m.summary;
  const sym = r.symbols;
  const simple = r.models.find((q) => q.key === "simple");
  const ext = r.models.find((q) => q.key === "extended");
  const b = r.simple_bands;
  const yMaxSc = Math.max(...scatter.map((p) => p[1]));
  const lhs = m.target === "rain_next" ? String.raw`\hat{R}_{t+1}` : String.raw`\hat{R}`;
  const symTex = (t) => (sym[t] || t).replace("₋₁", "_{t-1}").replace("₀", "_{t}").replace("₁", "_1").replace("₂", "_2").replace("Δ", "\\Delta ");
  const eq = s.coefficients.map((c, i) => {
    const v = c.estimate;
    const num = Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3);
    if (i === 0) return num;
    return `${v < 0 ? "-" : "+"} ${num.replace("-", "")}\\,${symTex(c.term)}`;
  }).join(" ");
  const d = m.diagnostics;
  const ts = r.test_series;
  const tsIdx = ts.dates.map((_, i) => i);
  const piKey = `${key}_pi`;
  const tsVals = [...ts.actual, ...(ts[piKey]?.[1] || []).filter((v) => v != null)];
  const tsMax = Math.max(...tsVals) * 1.05;
  const std = s.coefficients.filter((c) => c.standardized != null).sort((p, q) => Math.abs(q.standardized) - Math.abs(p.standardized));
  const stdMax = Math.max(...std.map((c) => Math.abs(c.standardized)));
  const years = ext.test.per_year.map((y) => String(y.year));
  const sel = r.selection;

  return (
    <div className="grid">
      <PageHeader eyebrow="Module IV · Correlation & multiple linear regression" title="Rainfall depends on many factors, not one">
        Rainfall is driven by pressure, temperature, humidity, cloud and wind together. We start from the one-variable model in our original
        plan and add factors step by step, testing each addition with a partial F-test. Models are fitted on {r.split.train_years.join("–")}
        ({r.split.n_train.toLocaleString()} days) and judged only on the unseen years {r.split.test_years.join("–")}.
      </PageHeader>

      <Card className="span-12" title="Model building: from one factor to many" subtitle="Each row adds predictors to the one above; skill = 1 − MSE(model) / MSE(climatology) on the test years">
        <Table
          columns={[
            { key: "name", label: "Model", render: (q) => <span className="dist-name"><i style={{ background: MODEL_COLOR[q.key] }} />{q.name}</span> },
            { key: "p", label: "Predictors", num: true, render: (q) => q.summary.p },
            { key: "r2", label: "R²", num: true, render: (q) => fmt(q.summary.r2, 3) },
            { key: "adj", label: "Adj. R²", num: true, render: (q) => fmt(q.summary.adj_r2, 3) },
            { key: "aic", label: "AIC", num: true, render: (q) => fmt(q.summary.aic, 0) },
            { key: "bic", label: "BIC", num: true, render: (q) => fmt(q.summary.bic, 0) },
            { key: "rmse", label: "Test RMSE (mm)", num: true, render: (q) => fmt(q.test.rmse, 2) },
            { key: "skill", label: "Skill vs climatology", num: true, render: (q) => <b className={q.test.skill_vs_climatology > 0 ? "good" : "bad"}>{q.test.skill_vs_climatology > 0 ? "+" : ""}{pct(q.test.skill_vs_climatology, 1)}</b> },
            { key: "cov", label: "95% PI coverage", num: true, render: (q) => pct(q.test.pi_coverage, 1) },
          ]}
          rows={r.models} highlight={(q) => q.key === key} />
        <p className="note">Climatology RMSE on the same days: {fmt(ext.test.baseline_rmse, 2)} mm. The humidity-only model does not beat it; every multi-factor
          model does. The next-day model forecasts <i>tomorrow's</i> rain from today's weather, so it is a genuine forecast rather than a same-day estimate.</p>
      </Card>

      <Card className="span-7" title="Partial F-tests: do the added factors help?" subtitle="H₀: all added coefficients are zero">
        <Formula tex={String.raw`F=\frac{(SSE_{\text{reduced}}-SSE_{\text{full}})/q}{SSE_{\text{full}}/(n-p-1)}\sim F_{q,\;n-p-1}`} />
        <Table compact
          columns={[
            { key: "cmp", label: "Comparison", render: (t) => <b>{t.reduced} → {t.full}</b> },
            { key: "added", label: "Added", render: (t) => t.added.map((f) => sym[f]).join(", ") },
            { key: "q", label: "q", num: true },
            { key: "F", label: "F", num: true, render: (t) => fmt(t.F, 1) },
            { key: "p", label: "p", num: true, render: (t) => `${pfmt(t.p)} ${stars(t.p)}` },
            { key: "dr2", label: "ΔR²", num: true, render: (t) => `${t.delta_r2 >= 0 ? "+" : ""}${fmt(t.delta_r2, 3)}` },
            { key: "res", label: "", render: (t) => (t.p < 0.05 ? <span className="good"><LuCircleCheck /> keep</span> : <span className="bad"><LuCircleX /> not needed</span>) },
          ]}
          rows={r.nested_tests} />
      </Card>

      <Card className="span-5" title="Backward elimination" subtitle={`Start from all ${r.candidates.length} candidates; drop the least significant while p > ${sel.alpha}`}>
        <ol className="steps">
          {sel.steps.map((st, i) => (
            <li key={i} className={!st.removed ? "done" : ""}>
              <span>{st.n_predictors} predictors · weakest {st.worst_label}</span>
              <strong>p = {pfmt(st.worst_p)} {st.removed ? "→ removed" : "→ stop"}</strong>
            </li>
          ))}
        </ol>
        <p className="note">Kept: {sel.selected.map((f) => sym[f]).join(", ")}.{sel.removed.length ? ` Removed: ${sel.removed.map((f) => r.labels[f]).join(", ")}.` : ""}</p>
      </Card>

      <div className="span-12 scope-bar">
        <Segmented value={key} onChange={setKey} options={MODEL_TABS} />
      </div>

      <Card className="span-12 equation-card">
        <div className="eq-label">Fitted equation · {m.name}</div>
        <Tex block>{`${lhs} = ${eq}`}</Tex>
        <div className="eq-legend">{m.features.map((f) => <span key={f}><b>{sym[f]}</b> = {r.labels[f]}</span>)}</div>
      </Card>

      <div className="span-12 stat-strip">
        <Stat label="R²" value={fmt(s.r2, 3)} note={`adjusted ${fmt(s.adj_r2, 3)}`} tone="orange" />
        <Stat label="F statistic" value={fmt(s.F, 0)} note={`df = (${s.p}, ${s.df_resid.toLocaleString()}), p ${pfmt(s.F_p)}`} />
        <Stat label="Residual SE  s" value={`${fmt(s.residual_se, 2)} mm`} note={`AIC ${fmt(s.aic, 0)}`} />
        <Stat label="Durbin–Watson" value={fmt(s.durbin_watson, 2)} note={s.durbin_watson < 1.5 ? "residuals autocorrelated" : "≈ 2: no autocorrelation"} />
        <Stat label="Test skill" value={`${m.test.skill_vs_climatology > 0 ? "+" : ""}${pct(m.test.skill_vs_climatology, 1)}`} note={`RMSE ${fmt(m.test.rmse, 2)} vs ${fmt(m.test.baseline_rmse, 2)} mm`} tone="sky" />
      </div>

      <Card className="span-8" title="Coefficients" subtitle="t = β̂ / SE(β̂). Robust SE (HC3) guards against unequal error variance  ·  * p<0.05  ** p<0.01  *** p<0.001">
        <Table compact
          columns={[
            { key: "label", label: "Term", render: (c) => (c.symbol ? <><b>{c.symbol}</b> {c.label}</> : c.label) },
            { key: "estimate", label: "β̂", num: true, render: (c) => <b>{fmt(c.estimate, 4)}</b> },
            { key: "se", label: "SE", num: true, render: (c) => fmt(c.se, 4) },
            { key: "hc3", label: "Robust SE", num: true, render: (c) => fmt(c.se_hc3, 4) },
            { key: "t", label: "t", num: true, render: (c) => fmt(c.t, 2) },
            { key: "p", label: "p", num: true, render: (c) => <>{pfmt(c.p)} <span className="stars">{stars(c.p)}</span></> },
            { key: "ci", label: "95% CI", num: true, render: (c) => `[${fmt(c.ci95[0], 3)}, ${fmt(c.ci95[1], 3)}]` },
          ]}
          rows={s.coefficients} />
      </Card>

      <Card className="span-4" title="Which factor matters most?" subtitle="Standardised coefficients: change in rainfall (in SDs) per 1 SD change in the factor, others held fixed">
        <div className="hbars">
          {std.map((c) => (
            <div key={c.term} className="hbar-row">
              <span className="hbar-label" title={c.label}>{c.symbol} <small>{c.label.replace(/ \(.*\)/, "")}</small></span>
              <span className="hbar-track">
                <span className={`hbar ${c.standardized < 0 ? "neg" : "pos"}`} style={{ width: `${(Math.abs(c.standardized) / stdMax) * 100}%` }} />
              </span>
              <span className="hbar-val">{c.standardized > 0 ? "+" : ""}{fmt(c.standardized, 2)}</span>
            </div>
          ))}
        </div>
        <p className="note">Orange raises rainfall, blue lowers it. Low pressure, falling pressure and cooling all point to rain.</p>
      </Card>

      {key === "simple" && (
        <Card className="span-12" title="Rainfall vs humidity with fitted line" subtitle="Shaded: 95% confidence band (dark) and 95% prediction band (light)">
          <Plot height={300} xDomain={[Math.min(...b.x), Math.max(...b.x)]} yDomain={[Math.min(0, ...b.yhat), Math.min(yMaxSc, 140)]} xLabel="Humidity (%)" yLabel="Rainfall (mm)">
            {({ x, y }) => (<>
              <Dots data={scatter.filter((p) => p[1] <= 140)} x={x} y={y} r={2.4} color={C.sky} opacity={0.35} />
              <Band data={b.x.map((v, i) => [v, b.pi_lo[i], b.pi_hi[i]])} x={x} y={y} color={C.orange} opacity={0.12} />
              <Band data={b.x.map((v, i) => [v, b.ci_lo[i], b.ci_hi[i]])} x={x} y={y} color={C.orange} opacity={0.35} />
              <Line data={b.x.map((v, i) => [v, b.yhat[i]])} x={x} y={y} color={C.orange} width={3} curve={false} />
            </>)}
          </Plot>
          <Callout tone="warn" title="Why one factor is not enough">
            Humidity alone explains {pct(simple.summary.r2, 0)} of the variance and does worse than the monthly average on unseen years
            ({pct(simple.test.skill_vs_climatology, 1)}). High humidity is common on dry monsoon days too; pressure, wind and cloud tell those days apart.
          </Callout>
        </Card>
      )}

      <Card className="span-6" title="The mathematics">
        <Formula title="Multiple linear regression" tex={String.raw`R=\beta_0+\beta_1H+\beta_2C+\beta_3P+\beta_4T+\beta_5W+\dots+\varepsilon`} />
        <Formula title="Least squares (normal equations)" tex={String.raw`\hat{\boldsymbol\beta}=(X^{\top}X)^{-1}X^{\top}\mathbf y,\qquad \operatorname{SE}(\hat\beta_j)=s\sqrt{[(X^{\top}X)^{-1}]_{jj}}`} />
        <Formula title="95% prediction interval for a new day" tex={String.raw`\hat y_0\pm t_{0.975,\,n-p-1}\, s\sqrt{1+\mathbf x_0^{\top}(X^{\top}X)^{-1}\mathbf x_0}`} />
        <Formula title="Adjusted R² and AIC" tex={String.raw`\bar R^2=1-(1-R^2)\frac{n-1}{n-p-1},\qquad \text{AIC}=2k-2\ln L`} />
      </Card>

      <Card className="span-6" title="Assumption checks" subtitle={m.name}>
        <div className="kv">
          <div><span>Multicollinearity: largest VIF</span><b>{fmt(Math.max(...(key === "extended" ? r.vif : r.vif_core).map((v) => v.vif)), 2)} {Math.max(...(key === "extended" ? r.vif : r.vif_core).map((v) => v.vif)) < 10 ? "(< 10, acceptable)" : "(high)"}</b></div>
          <div><span>Autocorrelation: Durbin–Watson</span><b>{fmt(s.durbin_watson, 2)}</b></div>
          <div><span>Heteroscedasticity: Breusch–Pagan LM (df {s.breusch_pagan.df})</span><b>{fmt(s.breusch_pagan.lm, 0)}, p {pfmt(s.breusch_pagan.p)}</b></div>
          <div><span>Influential days: Cook's D &gt; 4/n</span><b>{s.cooks.n_above} ({pct(s.cooks.share_above, 1)})</b></div>
          <div><span>Most influential day</span><b>{s.cooks.top[0].date} ({fmt(s.cooks.top[0].y, 0)} mm, fitted {fmt(s.cooks.top[0].fitted, 0)})</b></div>
        </div>
        <p className="note">{s.breusch_pagan.p < 0.05
          ? "Error variance grows on wet days (Breusch–Pagan rejects), so we also report HC3 robust standard errors. Every factor stays significant with them."
          : "No evidence of unequal error variance."} {s.durbin_watson > 1.7 && key !== "simple" ? "Adding yesterday's rain removed the residual autocorrelation the simpler models show." : ""}</p>
      </Card>

      <Card className="span-6" title="Residuals vs fitted" subtitle="Should be a structureless cloud around 0">
        <Plot height={240} xDomain={[Math.min(...d.fitted), Math.max(...d.fitted)]} yDomain={[Math.min(...d.resid), Math.max(...d.resid)]} xLabel="Fitted value (mm)" yLabel="Residual">
          {({ x, y, iw }) => (<>
            <line x1={0} x2={iw} y1={y(0)} y2={y(0)} className="ref" />
            <Dots data={d.fitted.map((f, i) => [f, d.resid[i]])} x={x} y={y} r={2.4} color={C.purple} opacity={0.4} />
          </>)}
        </Plot>
      </Card>

      <Card className="span-6" title="Normal Q-Q plot of residuals" subtitle="Heavy right tail = a few storms larger than the model expects">
        <Plot height={240} xDomain={[-3, 3]} yDomain={[Math.min(-3, ...d.qq_sample), Math.max(3, ...d.qq_sample)]} xLabel="Theoretical N(0,1) quantile" yLabel="Standardised residual">
          {({ x, y }) => (<>
            <Line data={[[-3, -3], [3, 3]]} x={x} y={y} color={C.grey} dash="5 4" width={1.5} curve={false} />
            <Dots data={d.qq_theoretical.map((v, i) => [v, d.qq_sample[i]])} x={x} y={y} r={3.4} color={C.purple} opacity={0.85} />
          </>)}
        </Plot>
      </Card>

      <Card className="span-7" title="Skill in every test year" subtitle="1 − MSE(model)/MSE(climatology), per year; above 0 = better than the monthly average">
        <Plot height={240} xType="band" xDomain={years} yDomain={[Math.min(0, ...r.models.flatMap((q) => q.test.per_year.map((y) => y.skill))), Math.max(...r.models.flatMap((q) => q.test.per_year.map((y) => y.skill))) * 1.15]}
          yFormat={(v) => `${Math.round(v * 100)}%`}
          tooltip={({ px, x }) => { const k = bandIndex(x, px); if (!k) return null; return { left: x(k) + x.bandwidth() / 2, top: 0, content: <><b>{k}</b>{r.models.map((q) => <div key={q.key}>{q.key}: {pct(q.test.per_year.find((y) => String(y.year) === k)?.skill ?? 0, 0)}</div>)}</> }; }}>
          {({ x, y, iw }) => (<>
            <line x1={0} x2={iw} y1={y(0)} y2={y(0)} className="ref" />
            {r.models.map((q, gi) => <Bars key={q.key} data={q.test.per_year.map((yy) => ({ key: String(yy.year), value: yy.skill }))} x={x} y={y} color={MODEL_COLOR[q.key]} groups={r.models.length} group={gi} radius={3} />)}
          </>)}
        </Plot>
        <Legend items={r.models.map((q) => ({ label: q.name.split(":")[0].split("(")[0].trim(), color: MODEL_COLOR[q.key] }))} />
      </Card>

      <Card className="span-5" title="Out-of-sample summary" subtitle={m.name}>
        <div className="kv">
          <div><span>Test days</span><b>{m.test.n.toLocaleString()}</b></div>
          <div><span>RMSE · MAE</span><b>{fmt(m.test.rmse, 2)} · {fmt(m.test.mae, 2)} mm</b></div>
          <div><span>Climatology RMSE · MAE</span><b>{fmt(m.test.baseline_rmse, 2)} · {fmt(m.test.baseline_mae, 2)} mm</b></div>
          <div><span>Correlation(predicted, actual)</span><b>{fmt(m.test.corr, 3)}</b></div>
          <div><span>Mean bias</span><b>{fmt(m.test.bias, 2)} mm</b></div>
          <div><span>95% prediction-interval coverage</span><b>{pct(m.test.pi_coverage, 1)}</b></div>
          <div><span>Average interval width</span><b>{fmt(m.test.pi_mean_width, 1)} mm</b></div>
        </div>
      </Card>

      {ts[key] && (
        <Card className="span-12" title={`Actual vs predicted — monsoon ${ts.year} (test year)`} subtitle={`${m.name}; shaded = 95% prediction interval${key === "nextday" ? "; each value was forecast the day before" : ""}`}>
          <Plot height={280} xDomain={[0, tsIdx.length - 1]} yDomain={[0, tsMax]} yLabel="Rainfall (mm)"
            xTickValues={[0, 30, 61, 92].filter((v) => v < tsIdx.length)} xFormat={(i) => ts.dates[Math.round(i)]?.slice(5) ?? ""}
            tooltip={({ px, x }) => { const i = Math.round(x.invert(px)); if (i < 0 || i >= tsIdx.length || ts[key][i] == null) return null; return { left: x(i), top: 0, crosshair: x(i), content: <>{ts.dates[i]}<br />Actual <b>{fmt(ts.actual[i], 1)}</b> mm<br />Predicted {fmt(ts[key][i], 1)} mm<br />PI [{fmt(ts[piKey][0][i], 1)}, {fmt(ts[piKey][1][i], 1)}]</> }; }}>
            {({ x, y }) => (<>
              <Band data={tsIdx.map((i) => [i, ts[piKey][0][i], ts[piKey][1][i]])} x={x} y={y} color={C.orange} opacity={0.15} curve={false} />
              <Line data={tsIdx.map((i) => [i, ts.actual[i]])} x={x} y={y} color={C.sky} width={2} curve={false} />
              <Line data={tsIdx.map((i) => [i, ts[key][i]])} x={x} y={y} color={C.orange} width={2.5} />
            </>)}
          </Plot>
          <Legend items={[{ label: "Actual", color: "var(--c-sky)", type: "line" }, { label: "Predicted", color: "var(--c-orange)", type: "line" }, { label: "95% PI", color: "var(--c-orange)" }]} />
        </Card>
      )}
    </div>
  );
}
