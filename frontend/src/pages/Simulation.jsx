import { useEffect, useState } from "react";
import { LuPlay } from "react-icons/lu";
import { useApp } from "../App.jsx";
import { simulate } from "../lib/api.js";
import { C, Legend, Plot, Rects, VLine } from "../components/charts.jsx";
import { Callout, Card, Formula, PageHeader, Segmented, Stat, fmt, pct } from "../components/ui.jsx";

export default function Simulation() {
  const { analysis: a, mode } = useApp();
  const [nYears, setNYears] = useState(2000);
  const [seed, setSeed] = useState(7);
  const [sim, setSim] = useState(a.simulation);
  const [busy, setBusy] = useState(false);
  const [which, setWhich] = useState("annual");
  const [ms, setMs] = useState(null);

  const run = async (n = nYears, s = seed) => {
    setBusy(true);
    const t0 = performance.now();
    const out = await simulate(mode, a, n, s);
    setMs(Math.round(performance.now() - t0));
    setSim(out);
    setBusy(false);
  };
  useEffect(() => { setSim(a.simulation); }, [a]);

  const blk = sim[which];
  const h = blk.hist;
  const histData = h.edges.slice(0, -1).map((e, i) => [e, h.edges[i + 1], h.density[i]]);
  const yMax = Math.max(...h.density) * 1.15;
  const ex = sim.example_year;
  const dayIdx = ex.map((_, i) => i);
  const monthStarts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sdRatio = blk.observed_sd / blk.sd;

  return (
    <div className="grid">
      <PageHeader eyebrow="Stochastic simulation" title="Monte Carlo weather generator"
        right={
          <div className="sim-controls">
            <label>Years <input type="number" min={100} max={20000} step={100} value={nYears} onChange={(e) => setNYears(Number(e.target.value))} /></label>
            <label>Seed <input type="number" min={0} value={seed} onChange={(e) => setSeed(Number(e.target.value))} /></label>
            <button className="btn btn-primary" onClick={() => run()} disabled={busy}><LuPlay /> {busy ? "Simulating…" : "Run simulation"}</button>
          </div>
        }>
        The Markov chain decides <i>whether</i> it rains, the seasonal Gamma distribution decides <i>how much</i>. Chaining the two
        (a <b>chain-dependent process</b>, Katz 1977) and repeating the year thousands of times gives a full probability distribution for seasonal totals.
      </PageHeader>

      <Card className="span-4" title="Algorithm">
        <ol className="algo">
          <li>Start in the stationary state for January.</li>
          <li>For each day t of the year, draw <Formula tex={String.raw`S_t\sim\text{Bernoulli}(p_{S_{t-1},1}^{(\text{month})})`} /></li>
          <li>If S<sub>t</sub> = wet, draw <Formula tex={String.raw`X_t=1+Y_t,\ Y_t\sim\text{Gamma}(k_{\text{season}},\theta_{\text{season}})`} /></li>
          <li>Sum to annual and monsoon totals; repeat N times.</li>
        </ol>
        <p className="note">{mode === "live" ? "Runs in the Python engine (NumPy, vectorised across years)." : "Runs in your browser (static mode)."}
          {ms != null && ` Last run: ${ms} ms.`}</p>
      </Card>

      <div className="span-8 stack">
        <div className="stat-strip">
          <Stat label="Simulated mean" value={`${fmt(blk.mean, 0)} mm`} note={`observed ${fmt(blk.observed_mean, 0)} mm`} tone="orange" />
          <Stat label="Simulated SD" value={`${fmt(blk.sd, 0)} mm`} note={`observed ${fmt(blk.observed_sd, 0)} mm`} />
          <Stat label="90% range" value={`${fmt(blk.p05, 0)}–${fmt(blk.p95, 0)}`} note="5th–95th percentile, mm" tone="sky" />
          <Stat label="Observed years inside" value={pct(blk.observed_within_90, 0)} note="nominal 90%" />
        </div>
        <Card title={`Distribution of ${which === "annual" ? "annual" : "monsoon (Jun–Sep)"} rainfall`} subtitle={`${sim.n_years.toLocaleString()} simulated years (bars) vs ${blk.observed.length} real years (ticks)`}
          actions={<Segmented size="sm" value={which} onChange={setWhich} options={[{ value: "annual", label: "Annual" }, { value: "monsoon", label: "Monsoon" }]} />}>
          <Plot height={270} xDomain={[h.edges[0], h.edges[h.edges.length - 1]]} yDomain={[0, yMax]} xLabel="Total rainfall (mm)" yLabel="Share of simulated years"
            yFormat={(v) => `${(v * 100).toFixed(0)}%`} noNice>
            {({ x, y, ih }) => (<>
              <Rects data={histData} x={x} y={y} color={C.sky} opacity={0.75} />
              <VLine x={x} value={blk.p05} ih={ih} label="5%" color="var(--c-navy)" />
              <VLine x={x} value={blk.p95} ih={ih} label="95%" color="var(--c-navy)" />
              {blk.observed.map((v, i) => <line key={i} x1={x(v)} x2={x(v)} y1={ih} y2={ih - 22} style={{ stroke: "var(--c-orange)" }} strokeWidth={3} strokeLinecap="round" />)}
            </>)}
          </Plot>
          <Legend items={[{ label: "Simulated years", color: "var(--c-sky)" }, { label: "Observed years", color: "var(--c-orange)" }]} />
        </Card>
      </div>

      <Card className="span-8" title="One simulated year" subtitle="A single random realisation — note the clustered wet spells produced by the Markov chain">
        <Plot height={220} xDomain={[0, 364]} yDomain={[0, Math.max(...ex) * 1.05 || 1]} xTickValues={monthStarts} xFormat={(v) => MONTHS[monthStarts.indexOf(v)] ?? ""} yLabel="mm/day" noNice>
          {({ x, y }) => <Rects data={dayIdx.map((i) => [i, i + 1, ex[i]])} x={x} y={y} color={C.orange} gap={0} radius={0} />}
        </Plot>
        <p className="note">Simulated: {fmt(sim.wet_days.mean, 0)} ± {fmt(sim.wet_days.sd, 0)} wet days per year; the wettest day of a year has median {fmt(sim.max_day.p50, 0)} mm
          and a 5% chance of exceeding {fmt(sim.max_day.p95, 0)} mm.</p>
      </Card>

      <Card className="span-4" title="Research insight" tone="navy">
        <p>The model reproduces the <b>mean</b> almost exactly ({fmt(blk.mean, 0)} vs {fmt(blk.observed_mean, 0)} mm) but the real year-to-year spread is
          {sdRatio > 1.1 ? ` ${fmt(sdRatio, 2)}× larger` : sdRatio < 0.9 ? ` ${fmt(1 / sdRatio, 2)}× smaller` : " about the same"} than simulated.</p>
        <p>{sdRatio > 1.1
          ? "This is the well-known overdispersion problem of chain-dependent generators: fixed parameters cannot represent good and bad monsoon years (e.g. ENSO influence). Letting parameters vary by year is a natural research extension."
          : "Here the simulated spread matches the observed spread, so fixed monthly parameters capture interannual variability well."}</p>
        <Formula tex={String.raw`\operatorname{Var}(S)=E[N]\operatorname{Var}(X)+\operatorname{Var}(N)\,E[X]^2`} >Variance of a random sum S = X₁ + … + X<sub>N</sub></Formula>
      </Card>

      <div className="span-12">
        <Callout tone="info" title="Why simulate at all?">
          A regression line answers "how much rain on this day?". Simulation answers questions like "what is the chance this monsoon totals less than
          {" "}{fmt(blk.p05, 0)} mm?" — probabilities of seasonal outcomes that have no closed-form formula. That is the stochastic-processes payoff.
        </Callout>
      </div>
    </div>
  );
}
