import { useMemo, useState } from "react";
import { LuCircleCheck, LuDatabase } from "react-icons/lu";
import { useApp } from "../App.jsx";
import { Band, C, Dots, Heatmap, Line, Plot, Rects, nearest } from "../components/charts.jsx";
import { Card, Formula, PageHeader, Segmented, Table, fmt, pfmt, stars } from "../components/ui.jsx";

const VAR_SHORT = { rain_mm: "Rain", humidity_pct: "Hum.", cloud_pct: "Cloud", pressure_hpa: "Press.", temp_c: "Temp.", wind_kmh: "Wind" };
const SEASON_COLOR = (m) => (m >= 6 && m <= 9 ? "var(--c-orange)" : m >= 10 && m <= 11 ? "var(--c-purple)" : m >= 3 && m <= 5 ? "var(--c-teal)" : "var(--c-sky)");

export default function DataPage() {
  const { analysis: a } = useApp();
  const d = a.descriptive;
  const [variable, setVariable] = useState("rain_mm");
  const [method, setMethod] = useState("pearson");
  const [xVar, setXVar] = useState("humidity_pct");
  const s = d.summary.find((r) => r.key === variable);
  const hist = d.histograms[variable];
  const recent = d.recent;
  const c = a.cleaning;

  const histData = hist.edges.slice(0, -1).map((e, i) => [e, hist.edges[i + 1], hist.counts[i]]);
  const series = recent.map((r, i) => [i, r[variable]]);
  const scatter = useMemo(() => d.scatter.map((p) => [p[xVar], p.rain_mm, SEASON_COLOR(p.month)]), [d.scatter, xVar]);
  const xs = d.scatter.map((p) => p[xVar]);
  const yMax = Math.max(...d.scatter.map((p) => p.rain_mm));

  const steps = [
    ["Raw records", c.raw_rows.toLocaleString()],
    ["Duplicate dates removed", c.duplicates_removed],
    ["Out-of-range values set to missing", Object.values(c.out_of_bounds).reduce((x, y) => x + y, 0)],
    ["Covariate gaps interpolated (≤ 3 days)", Object.values(c.interpolated).reduce((x, y) => x + y, 0)],
    ["Rows dropped (rain missing)", c.rain_rows_dropped],
    ["Extreme rain days flagged (kept)", c.extreme_rain_days_flagged],
    ["Clean daily records", c.clean_rows.toLocaleString()],
  ];

  return (
    <div className="grid">
      <PageHeader eyebrow="Module I · Descriptive statistics" title="Data & Statistics" className="span-12">
        {a.meta.n_days.toLocaleString()} days of {a.meta.location} weather, {a.meta.start} to {a.meta.end}. Daily rainfall X is the random
        variable of interest; five weather variables are candidate predictors.
      </PageHeader>

      <Card className="span-4" title="Data cleaning" subtitle="Every step is logged and reproducible" icon={<LuDatabase />}>
        <ol className="steps">
          {steps.map(([label, v], i) => (
            <li key={label} className={i === steps.length - 1 ? "done" : ""}>
              <span>{label}</span><strong>{v}</strong>
            </li>
          ))}
        </ol>
        <p className="note"><LuCircleCheck /> Heavy rain days are flagged with a 3×IQR rule but <b>kept</b>: extremes are real and are exactly
          what the model must explain. Rain itself is never imputed, because interpolation would invent rain events.</p>
      </Card>

      <Card className="span-8" title="Summary statistics" subtitle="Sample variance uses n − 1 (unbiased estimator)">
        <Table compact
          columns={[
            { key: "label", label: "Variable" },
            { key: "mean", label: "Mean", num: true, render: (r) => fmt(r.mean, 2) },
            { key: "sd", label: "SD", num: true, render: (r) => fmt(r.sd, 2) },
            { key: "variance", label: "Variance", num: true, render: (r) => fmt(r.variance, 1) },
            { key: "median", label: "Median", num: true, render: (r) => fmt(r.median, 1) },
            { key: "skewness", label: "Skew", num: true, render: (r) => fmt(r.skewness, 2) },
            { key: "kurtosis", label: "Ex. kurt.", num: true, render: (r) => fmt(r.kurtosis, 1) },
            { key: "ci", label: "95% CI of mean", num: true, render: (r) => `${fmt(r.ci95[0], 2)} – ${fmt(r.ci95[1], 2)}` },
          ]}
          rows={d.summary} highlight={(r) => r.key === "rain_mm"} />
        <div className="formula-row">
          <Formula title="Mean" tex={String.raw`\bar{x}=\frac{1}{n}\sum_{i=1}^{n}x_i`} />
          <Formula title="Sample variance" tex={String.raw`s^2=\frac{1}{n-1}\sum_{i=1}^{n}(x_i-\bar{x})^2`} />
          <Formula title="95% CI for μ" tex={String.raw`\bar{x}\pm t_{0.975,\,n-1}\,\frac{s}{\sqrt{n}}`} />
        </div>
      </Card>

      <Card className="span-12" title="Explore a variable"
        actions={<Segmented size="sm" value={variable} onChange={setVariable}
          options={d.summary.map((r) => ({ value: r.key, label: VAR_SHORT[r.key] }))} />}>
        <div className="two-col">
          <div>
            <h4 className="chart-title">{variable === "rain_mm" ? "Histogram of wet-day rainfall (≥ 1 mm)" : `Histogram · ${s.label}`}</h4>
            <Plot height={240} xDomain={[hist.edges[0], hist.edges[hist.edges.length - 1]]} yDomain={[0, Math.max(...hist.counts) * 1.08]}
              xLabel={s.label} yLabel="Days" noNice
              tooltip={({ px, x }) => { const b = nearest(histData, px, x, (q) => (q[0] + q[1]) / 2); return b && { left: x((b[0] + b[1]) / 2), top: 0, content: <>{fmt(b[0], 1)}–{fmt(b[1], 1)}: <b>{b[2]}</b> days</> }; }}>
              {({ x, y }) => <Rects data={histData} x={x} y={y} color={variable === "rain_mm" ? C.sky : C.teal} />}
            </Plot>
            {variable === "rain_mm" && <p className="note">Right-skewed (skewness {fmt(s.skewness, 1)}): most wet days bring little rain, a few bring a lot.
              A Normal model would be a poor fit — see the Probability page.</p>}
          </div>
          <div>
            <h4 className="chart-title">Last 365 days · {s.label}</h4>
            <Plot height={240} xDomain={[0, series.length - 1]} yDomain={[Math.min(0, s.min), Math.max(...series.map((p) => p[1])) * 1.05]}
              xTickValues={[0, 91, 182, 273, 364].filter((v) => v < series.length)} xFormat={(i) => recent[Math.round(i)]?.date.slice(0, 7) ?? ""}
              yLabel={s.label}
              tooltip={({ px, x }) => { const p = nearest(series, px, x); return p && { left: x(p[0]), top: 0, crosshair: x(p[0]), content: <>{recent[p[0]].date}<br /><b>{fmt(p[1], 1)}</b></> }; }}>
              {({ x, y }) => variable === "rain_mm"
                ? <Rects data={series.map(([i, v]) => [i - 0.5, i + 0.5, v])} x={x} y={y} color={C.sky} gap={0} radius={0} />
                : <><Band data={series.map(([i, v]) => [i, s.mean - s.sd, s.mean + s.sd])} x={x} y={y} color={C.teal} opacity={0.1} /><Line data={series} x={x} y={y} color={C.teal} width={1.6} /></>}
            </Plot>
          </div>
        </div>
      </Card>

      <Card className="span-7" title="Correlation matrix" subtitle="Orange = positive, blue = negative"
        actions={<Segmented size="sm" value={method} onChange={setMethod} options={[{ value: "pearson", label: "Pearson r" }, { value: "spearman", label: "Spearman ρ" }]} />}>
        <Heatmap labels={d.correlation.labels} short={d.correlation.variables.map((v) => VAR_SHORT[v])} matrix={d.correlation[method]} />
        <div className="formula-row">
          <Formula title="Pearson correlation" tex={String.raw`r=\frac{\sum(x_i-\bar x)(y_i-\bar y)}{\sqrt{\sum(x_i-\bar x)^2\sum(y_i-\bar y)^2}}`} />
          <Formula title="Significance test (H₀: ρ = 0)" tex={String.raw`t=\frac{r\sqrt{n-2}}{\sqrt{1-r^2}}\sim t_{n-2}`} />
        </div>
      </Card>

      <Card className="span-5" title="Which variables move with rainfall?" subtitle="Correlation with daily rainfall, sorted by |r|">
        <Table compact
          columns={[
            { key: "label", label: "Predictor", render: (r) => r.label.replace(/ \(.*\)/, "") },
            { key: "r", label: "r", num: true, render: (r) => <b>{fmt(r.r, 3)}</b> },
            { key: "ci", label: "95% CI", num: true, render: (r) => `[${fmt(r.ci95[0], 2)}, ${fmt(r.ci95[1], 2)}]` },
            { key: "t", label: "t", num: true, render: (r) => fmt(r.t, 1) },
            { key: "p", label: "p", num: true, render: (r) => `${pfmt(r.p)} ${stars(r.p)}` },
            { key: "spearman", label: "ρ", num: true, render: (r) => fmt(r.spearman, 3) },
          ]}
          rows={d.correlation.tests} />
        <p className="note">CI via Fisher's z-transform. With n = {d.correlation.n.toLocaleString()} even weak correlations are "significant" —
          so we judge <b>effect size</b> (r²), not only p-values.</p>
      </Card>

      <Card className="span-12" title="Scatter explorer" subtitle={`${d.scatter.length.toLocaleString()} randomly sampled days, coloured by season`}
        actions={<Segmented size="sm" value={xVar} onChange={setXVar}
          options={["humidity_pct", "cloud_pct", "pressure_hpa", "temp_c", "wind_kmh"].map((v) => ({ value: v, label: VAR_SHORT[v] }))} />}>
        <Plot height={300} xDomain={[Math.min(...xs), Math.max(...xs)]} yDomain={[0, yMax * 1.02]}
          xLabel={d.summary.find((r) => r.key === xVar).label} yLabel="Rainfall (mm)">
          {({ x, y }) => <Dots data={scatter} x={x} y={y} r={2.6} opacity={0.5} />}
        </Plot>
        <div className="legend">
          {[["Winter", "var(--c-sky)"], ["Pre-monsoon", "var(--c-teal)"], ["Monsoon", "var(--c-orange)"], ["Post-monsoon", "var(--c-purple)"]].map(([l, col]) => (
            <span key={l} className="legend-item"><span className="swatch dot" style={{ background: col }} />{l}</span>
          ))}
        </div>
      </Card>
    </div>
  );
}
