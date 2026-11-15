import { useMemo, useState } from "react";
import { useApp } from "../App.jsx";
import { exceedanceLocal } from "../lib/api.js";
import { Bars, C, Dots, Legend, Line, Plot, Rects, bandIndex, nearest } from "../components/charts.jsx";
import { Callout, Card, Formula, PageHeader, Segmented, SliderField, Stat, Table, Tex, fmt, pct, pfmt } from "../components/ui.jsx";

const DIST_COLORS = { Gamma: C.orange, Weibull: C.purple, Exponential: C.teal, Lognormal: C.pink, Normal: C.grey };

export default function Probability() {
  const { analysis: a } = useApp();
  const d = a.distribution;
  const thr = d.wet_threshold_mm;
  const [shown, setShown] = useState(["Gamma", "Normal", "Exponential"]);
  const [qq, setQq] = useState("Gamma");
  const [t, setT] = useState(50);
  const [season, setSeason] = useState("Monsoon");
  const ex = useMemo(() => exceedanceLocal(a, t), [a, t]);
  const best = d.candidates[0];
  const gammaRow = d.candidates.find((c) => c.name === "Gamma");

  const hist = d.curves.hist;
  const histData = hist.edges.slice(0, -1).map((e, i) => [e, hist.edges[i + 1], hist.density[i]]);
  const yMaxPdf = Math.max(...hist.density) * 1.15;
  const toggle = (n) => setShown((s) => (s.includes(n) ? s.filter((q) => q !== n) : [...s, n]));

  // empirical vs model exceedance on a log scale
  const exc = d.exceedance;
  const pz = d.poisson;
  const pmfRows = pz.pmf.k.map((k, i) => ({ k: String(k), poisson: pz.pmf.poisson[i], observed: pz.pmf.observed[i] }));
  const qqData = d.qq[qq];
  const qqMax = Math.max(...qqData.sample, ...qqData.theoretical);
  const qqMin = Math.min(0, ...qqData.theoretical);

  return (
    <div className="grid">
      <PageHeader eyebrow="Module I · Probability distributions" title="Probability">
        Daily rainfall is a <b>mixed random variable</b>: a probability mass at "dry" plus a continuous, right-skewed distribution
        for how much falls on wet days. We fit five candidate distributions by maximum likelihood and let the data choose.
      </PageHeader>

      <div className="span-12 stat-strip">
        <Stat label="P(dry day)" value={pct(d.p_dry)} note={`rain < ${thr} mm`} />
        <Stat label="P(wet day)" value={pct(d.p_wet)} note={`${d.n_wet.toLocaleString()} of ${d.n_days.toLocaleString()} days`} tone="sky" />
        <Stat label="Mean on wet days" value={`${fmt(d.wet_mean, 1)} mm`} note={`SD ${fmt(Math.sqrt(d.wet_var), 1)} mm`} />
        <Stat label="Best fit (AIC)" value={best.name} note={`KS D = ${fmt(best.ks_stat, 3)}`} tone="orange" />
        <Stat label="Gamma shape k̂" value={fmt(d.gamma.shape, 3)} note={`scale θ̂ = ${fmt(d.gamma.scale, 2)} mm`} />
      </div>

      <Card className="span-5" title="The model">
        <Formula title="Mixed distribution of daily rainfall X" tex={String.raw`X=\begin{cases}0\ \text{(dry)} & \text{w.p. } 1-p\\[2pt] ${thr}+Y & \text{w.p. } p,\quad Y\sim\text{Gamma}(k,\theta)\end{cases}`} />
        <Formula title="Gamma density" tex={String.raw`f(y)=\frac{y^{k-1}e^{-y/\theta}}{\Gamma(k)\,\theta^{k}},\quad E[Y]=k\theta,\ \operatorname{Var}(Y)=k\theta^{2}`} />
        <Formula title="Law of total probability" tex={String.raw`P(X>t)=p\cdot P(Y>t-${thr})=p\,\bigl[1-F_Y(t-${thr})\bigr]`} />
        <p className="note">Method of moments gives k = x̄²/s² = {fmt(d.gamma.mom.shape, 3)}, θ = s²/x̄ = {fmt(d.gamma.mom.scale, 2)};
          maximum likelihood gives k̂ = {fmt(d.gamma.shape, 3)}, θ̂ = {fmt(d.gamma.scale, 2)}. k &lt; 1 means the density is highest near zero:
          light rain is common, heavy rain rare.</p>
      </Card>

      <Card className="span-7" title="Histogram vs fitted densities" subtitle={`Excess rainfall Y = X − ${thr} mm on wet days (toggle curves)`}
        actions={<div className="chips-toggle">{Object.keys(DIST_COLORS).map((n) => (
          <button key={n} className={shown.includes(n) ? "on" : ""} style={{ "--chip": DIST_COLORS[n] }} onClick={() => toggle(n)}>{n}</button>
        ))}</div>}>
        <Plot height={300} xDomain={[0, hist.edges[hist.edges.length - 1]]} yDomain={[0, yMaxPdf]} xLabel="Excess rainfall y (mm)" yLabel="Density" noNice
          yFormat={(v) => v.toFixed(3)}
          tooltip={({ px, x }) => {
            const xv = x.invert(px); const i = d.curves.x.findIndex((q) => q >= xv); if (i < 0) return null;
            return { left: px, top: 0, crosshair: px, content: <>y = {fmt(d.curves.x[i], 1)} mm{shown.map((n) => <div key={n}>{n}: {d.curves.pdf[n][i].toFixed(4)}</div>)}</> };
          }}>
          {({ x, y }) => (<>
            <Rects data={histData} x={x} y={y} color={C.sky} opacity={0.35} />
            {shown.map((n) => <Line key={n} data={d.curves.x.map((xv, i) => [xv, Math.min(d.curves.pdf[n][i], yMaxPdf * 1.5)])} x={x} y={y}
              color={DIST_COLORS[n]} width={n === "Gamma" ? 3 : 2} dash={n === "Normal" ? "6 4" : undefined} />)}
          </>)}
        </Plot>
      </Card>

      <Card className="span-12" title="Goodness of fit: which distribution wins?" subtitle="Lower AIC/BIC is better; small KS D and large p-values mean the data are consistent with the model">
        <Table
          columns={[
            { key: "name", label: "Distribution", render: (r) => <span className="dist-name"><i style={{ background: DIST_COLORS[r.name] }} />{r.name}{r.name === best.name && <em>best</em>}</span> },
            { key: "params", label: "MLE parameters", render: (r) => paramText(r) },
            { key: "loglik", label: "Log-lik.", num: true, render: (r) => fmt(r.loglik, 0) },
            { key: "aic", label: "AIC", num: true, render: (r) => fmt(r.aic, 0) },
            { key: "daic", label: "ΔAIC", num: true, render: (r) => fmt(r.aic - best.aic, 1) },
            { key: "ks", label: "KS D", num: true, render: (r) => fmt(r.ks_stat, 3) },
            { key: "ksp", label: "KS p", num: true, render: (r) => pfmt(r.ks_p) },
            { key: "chi", label: "χ² (df)", num: true, render: (r) => `${fmt(r.chi_square.chi2, 1)} (${r.chi_square.df})` },
            { key: "chip", label: "χ² p", num: true, render: (r) => pfmt(r.chi_square.p) },
          ]}
          rows={d.candidates} highlight={(r) => r.name === best.name} />
        <Callout tone="info" title="Reading the table">
          The Normal distribution is decisively rejected (it puts probability on negative rainfall and cannot produce the long right tail).
          {Math.abs(gammaRow.aic - best.aic) < 10 && best.name !== "Gamma"
            ? ` ${best.name} and Gamma are practically tied (ΔAIC = ${fmt(gammaRow.aic - best.aic, 1)} < 10); we use Gamma because its parameters have a clean interpretation (E[Y] = kθ) and it is the standard choice in stochastic weather generators.`
            : " Gamma is the standard choice in stochastic weather generators and is used for the rest of the analysis."}
          {" "}KS p-values are approximate because parameters are estimated from the same data (Lilliefors effect).
        </Callout>
      </Card>

      <Card className="span-6" title="Q-Q plot" subtitle="Points on the diagonal = perfect fit"
        actions={<Segmented size="sm" value={qq} onChange={setQq} options={["Gamma", "Exponential", "Normal"]} />}>
        <Plot height={290} xDomain={[qqMin, qqMax]} yDomain={[qqMin, qqMax]} xLabel={`${qq} quantiles (mm)`} yLabel="Sample quantiles (mm)">
          {({ x, y }) => (<>
            <Line data={[[qqMin, qqMin], [qqMax, qqMax]]} x={x} y={y} color={C.grey} dash="5 4" width={1.5} curve={false} />
            <Dots data={qqData.theoretical.map((v, i) => [v, qqData.sample[i]])} x={x} y={y} r={3.6} color={DIST_COLORS[qq]} opacity={0.85} />
          </>)}
        </Plot>
      </Card>

      <Card className="span-6" title="Cumulative distribution" subtitle="Empirical CDF vs fitted Gamma and Normal">
        <Plot height={290} xDomain={[0, d.curves.x[d.curves.x.length - 1]]} yDomain={[0, 1]} xLabel="Excess rainfall y (mm)" yLabel="F(y)" noNice
          tooltip={({ px, x }) => { const p = nearest(d.curves.ecdf.x.map((v, i) => [v, d.curves.ecdf.y[i]]), px, x); return p && { left: x(p[0]), top: 0, crosshair: x(p[0]), content: <>y = {fmt(p[0], 1)} mm<br />Empirical F = {fmt(p[1], 3)}</> }; }}>
          {({ x, y }) => (<>
            <Line data={d.curves.ecdf.x.map((v, i) => [v, d.curves.ecdf.y[i]]).filter((p) => p[0] <= d.curves.x[d.curves.x.length - 1])} x={x} y={y} color={C.navy} width={3} curve={false} />
            <Line data={d.curves.x.map((v, i) => [v, d.curves.cdf.Gamma[i]])} x={x} y={y} color={C.orange} width={2} dash="2 3" />
            <Line data={d.curves.x.map((v, i) => [v, d.curves.cdf.Normal[i]])} x={x} y={y} color={C.grey} width={2} dash="6 4" />
          </>)}
        </Plot>
        <Legend items={[{ label: "Empirical", color: "var(--c-navy)", type: "line" }, { label: "Gamma", color: "var(--c-orange)", type: "dash" }, { label: "Normal", color: "var(--c-grey)", type: "dash" }]} />
      </Card>

      <Card className="span-5" title="Exceedance calculator" subtitle="P(X > t) for one day, by season">
        <SliderField label="Threshold t" value={t} min={1} max={250} step={0.5} unit="mm" onChange={setT}
          hint="IMD: heavy ≥ 64.5 mm, very heavy ≥ 115.6 mm, extremely heavy ≥ 204.5 mm" />
        <Segmented size="sm" value={season} onChange={setSeason} options={Object.keys(ex.seasons)} />
        <div className="exceed-result">
          <div><span>P(wet)</span><strong>{pct(ex.seasons[season].p_wet, 1)}</strong></div>
          <span className="op">×</span>
          <div><span>P(Y &gt; t − {thr} | wet)</span><strong>{pct(ex.seasons[season].p_exceed_if_wet, 2)}</strong></div>
          <span className="op">=</span>
          <div className="res"><span>P(X &gt; {t} mm)</span><strong>{pct(ex.seasons[season].p_exceed, 2)}</strong></div>
        </div>
        <p className="note">Return period ≈ 1 / P = <b>{ex.seasons[season].p_exceed > 0 ? fmt(1 / ex.seasons[season].p_exceed, 0) : "∞"}</b> {season.toLowerCase()} days.
          Season-specific Gamma: k = {fmt(a.distribution.season_fits[season].shape, 3)}, θ = {fmt(a.distribution.season_fits[season].scale, 2)}.</p>
      </Card>

      <Card className="span-7" title="Does the model get the tails right?" subtitle="Empirical vs model P(X > t), all days (log scale)">
        <Plot height={280} xDomain={[0, 210]} yType="log" yDomain={[Math.max(1e-4, Math.min(...exc.map((r) => Math.min(r.empirical || 1, r.model)))), 0.5]}
          xLabel="Threshold t (mm)" yLabel="P(X > t)" yTickValues={[0.0001, 0.001, 0.01, 0.1, 0.5].filter((v) => v >= Math.min(...exc.map((r) => r.model)) / 2)} yFormat={(v) => (v >= 0.01 ? `${v * 100}%` : `${(v * 100).toPrecision(1)}%`)}
          tooltip={({ px, x }) => { const r = nearest(exc, px, x, (q) => q.t); return r && { left: x(r.t), top: 0, crosshair: x(r.t), content: <>t = {r.t} mm<br />Empirical {pct(r.empirical, 2)}<br />Model {pct(r.model, 2)}</> }; }}>
          {({ x, y }) => (<>
            <Line data={exc.map((r) => [r.t, r.model])} x={x} y={y} color={C.orange} width={2.5} />
            <Dots data={exc.filter((r) => r.empirical > 0).map((r) => [r.t, r.empirical])} x={x} y={y} r={5} color={C.navy} opacity={0.9} />
          </>)}
        </Plot>
        <Legend items={[{ label: "Observed frequency", color: "var(--c-navy)", type: "dot" }, { label: "Seasonal Markov-Gamma model", color: "var(--c-orange)", type: "line" }]} />
      </Card>

      <Card className="span-12" title="Seasonal Gamma parameters" subtitle="Rainfall behaves differently by IMD season, so each season gets its own fit">
        <Table compact
          columns={[
            { key: "season", label: "Season" },
            { key: "n_wet", label: "Wet days", num: true, render: (r) => r.n_wet.toLocaleString() },
            { key: "p_wet", label: "P(wet)", num: true, render: (r) => pct(r.p_wet) },
            { key: "shape", label: "k̂ (MLE)", num: true, render: (r) => fmt(r.shape, 3) },
            { key: "scale", label: "θ̂ (MLE)", num: true, render: (r) => fmt(r.scale, 2) },
            { key: "mom", label: "k, θ (moments)", num: true, render: (r) => r.mom.shape == null ? "–" : `${fmt(r.mom.shape, 2)}, ${fmt(r.mom.scale, 1)}` },
            { key: "mean", label: "E[X | wet]", num: true, render: (r) => `${fmt(r.mean_wet_mm, 1)} mm` },
            { key: "fb", label: "Note", render: (r) => (r.pooled_fallback ? "few wet days → pooled fit" : "") },
          ]}
          rows={d.seasons} />
      </Card>

      <Card className="span-7" title={`Poisson model for heavy-rain days (≥ ${pz.threshold_mm} mm)`} subtitle={`Number of heavy-rain days per year, ${pz.years} years`}>
        <Plot height={250} xType="band" xDomain={pmfRows.map((r) => r.k)} yDomain={[0, Math.max(...pmfRows.map((r) => Math.max(r.poisson, r.observed))) * 1.15]}
          xLabel="k (heavy-rain days in a year)" yLabel="Probability" yFormat={(v) => v.toFixed(2)}
          xTickValues={pmfRows.filter((_, i) => i % Math.ceil(pmfRows.length / 14) === 0).map((r) => r.k)}
          tooltip={({ px, x }) => { const k = bandIndex(x, px); const r = pmfRows.find((q) => q.k === k); return r && { left: x(k) + x.bandwidth() / 2, top: 0, content: <>k = {k}<br />Observed {fmt(r.observed, 3)}<br />Poisson {fmt(r.poisson, 3)}</> }; }}>
          {({ x, y }) => (<>
            <Bars data={pmfRows.map((r) => ({ key: r.k, value: r.observed }))} x={x} y={y} color={C.sky} groups={2} radius={3} />
            <Bars data={pmfRows.map((r) => ({ key: r.k, value: r.poisson }))} x={x} y={y} color={C.orange} groups={2} group={1} radius={3} />
          </>)}
        </Plot>
        <Legend items={[{ label: "Observed relative frequency", color: "var(--c-sky)" }, { label: `Poisson(λ̂ = ${fmt(pz.lambda, 2)})`, color: "var(--c-orange)" }]} />
      </Card>

      <Card className="span-5" title="Poisson checks">
        <Formula tex={String.raw`P(N=k)=\frac{e^{-\lambda}\lambda^{k}}{k!},\qquad \hat\lambda=\bar{N}=${fmt(pz.lambda, 2)}`} />
        <div className="kv">
          <div><span>Sample variance</span><b>{fmt(pz.variance, 2)}</b></div>
          <div><span>Dispersion index D = s²/x̄</span><b>{fmt(pz.dispersion, 2)}</b></div>
          <div><span>Test statistic (n−1)D ~ χ²<sub>{pz.years - 1}</sub></span><b>{fmt(pz.dispersion_chi2, 1)}, p = {pfmt(pz.dispersion_p)}</b></div>
          {Object.entries(pz.p_at_least).map(([k, v]) => (
            <div key={k}><span>P(at least {k} heavy day{k === "1" ? "" : "s"} in a year)</span><b>{pct(v, 1)}</b></div>
          ))}
        </div>
        <p className="note">{pz.dispersion_p > 0.05
          ? "D is close enough to 1: the Poisson model (equal mean and variance) is not rejected."
          : `D ${pz.dispersion > 1 ? "> 1 (over-dispersion)" : "< 1 (under-dispersion)"}: counts vary ${pz.dispersion > 1 ? "more" : "less"} than Poisson allows — year-to-year climate variability. A negative binomial model is the natural extension.`}</p>
      </Card>
    </div>
  );
}

function paramText(r) {
  const p = r.params;
  switch (r.name) {
    case "Gamma": return <Tex>{`k=${fmt(p[0], 3)},\\ \\theta=${fmt(p[2], 2)}`}</Tex>;
    case "Exponential": return <Tex>{`\\beta=${fmt(p[1], 2)}`}</Tex>;
    case "Weibull": return <Tex>{`c=${fmt(p[0], 3)},\\ \\lambda=${fmt(p[2], 2)}`}</Tex>;
    case "Lognormal": return <Tex>{`\\sigma=${fmt(p[0], 3)},\\ e^{\\mu}=${fmt(p[2], 2)}`}</Tex>;
    case "Normal": return <Tex>{`\\mu=${fmt(p[0], 2)},\\ \\sigma=${fmt(p[1], 2)}`}</Tex>;
    default: return p.map((v) => fmt(v, 3)).join(", ");
  }
}

