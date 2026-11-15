import { useState } from "react";
import { useApp } from "../App.jsx";
import { Bars, C, Dots, Legend, Line, Plot, bandIndex, nearest } from "../components/charts.jsx";
import { Callout, Card, Formula, PageHeader, Segmented, Stat, Table, fmt, pct, pfmt } from "../components/ui.jsx";

function StateDiagram({ P }) {
  const w = (p) => 1.5 + p * 9;
  return (
    <svg viewBox="0 0 420 220" className="state-diagram" role="img" aria-label="Two-state Markov chain diagram">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="13" markerHeight="13" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10z" fill="var(--text-muted)" />
        </marker>
      </defs>
      {/* self loops */}
      <path d="M95 82 C 40 10, 150 10, 125 80" fill="none" stroke="var(--c-sky)" strokeWidth={w(P[0][0])} markerEnd="url(#arr)" opacity="0.85" />
      <path d="M295 82 C 270 10, 380 10, 325 80" fill="none" stroke="var(--c-orange)" strokeWidth={w(P[1][1])} markerEnd="url(#arr)" opacity="0.85" />
      {/* transitions */}
      <path d="M150 105 Q 210 70 262 105" fill="none" stroke="var(--c-sky)" strokeWidth={w(P[0][1])} markerEnd="url(#arr)" opacity="0.85" />
      <path d="M270 150 Q 210 185 158 150" fill="none" stroke="var(--c-orange)" strokeWidth={w(P[1][0])} markerEnd="url(#arr)" opacity="0.85" />
      <circle cx="110" cy="128" r="46" className="state state-dry" />
      <circle cx="310" cy="128" r="46" className="state state-wet" />
      <text x="110" y="124" textAnchor="middle" className="state-label">Dry</text>
      <text x="110" y="144" textAnchor="middle" className="state-sub">state 0</text>
      <text x="310" y="124" textAnchor="middle" className="state-label light">Wet</text>
      <text x="310" y="144" textAnchor="middle" className="state-sub light">state 1</text>
      <text x="96" y="22" textAnchor="middle" className="edge-label">p₀₀ = {P[0][0].toFixed(3)}</text>
      <text x="322" y="22" textAnchor="middle" className="edge-label">p₁₁ = {P[1][1].toFixed(3)}</text>
      <text x="210" y="68" textAnchor="middle" className="edge-label">p₀₁ = {P[0][1].toFixed(3)}</text>
      <text x="210" y="205" textAnchor="middle" className="edge-label">p₁₀ = {P[1][0].toFixed(3)}</text>
    </svg>
  );
}

export default function Markov() {
  const { analysis: a } = useApp();
  const mk = a.markov;
  const [scope, setScope] = useState("monsoon");
  const [spell, setSpell] = useState("wet");
  const [n, setN] = useState(3);
  const sel = scope === "overall" ? { ...mk.overall } : scope === "monsoon" ? mk.monsoon : null;
  const monthObj = scope.startsWith("m") && scope !== "monsoon" ? mk.monthly[Number(scope.slice(1)) - 1] : null;
  const P = monthObj ? monthObj.P : sel.P;
  const counts = monthObj ? monthObj.counts : sel.counts;
  const pi1 = P[0][1] / (P[0][1] + P[1][0]);
  const test = sel?.test;
  // n-step matrix
  let M = [[1, 0], [0, 1]];
  for (let i = 0; i < n; i++) M = [[M[0][0] * P[0][0] + M[0][1] * P[1][0], M[0][0] * P[0][1] + M[0][1] * P[1][1]], [M[1][0] * P[0][0] + M[1][1] * P[1][0], M[1][0] * P[0][1] + M[1][1] * P[1][1]]];
  const nstep = [];
  { let A = [[1, 0], [0, 1]]; for (let k = 1; k <= 14; k++) { A = [[A[0][0] * P[0][0] + A[0][1] * P[1][0], A[0][0] * P[0][1] + A[0][1] * P[1][1]], [A[1][0] * P[0][0] + A[1][1] * P[1][0], A[1][0] * P[0][1] + A[1][1] * P[1][1]]]; nstep.push([k, A[1][1], A[0][1]]); } }

  const sp = mk.monsoon[spell === "wet" ? "wet_spells" : "dry_spells"];
  const spRows = sp.k.map((k, i) => ({ key: String(k), obs: sp.observed[i], geo: sp.geometric[i] }));
  const ev = mk.evaluation;
  const monthly = mk.monthly;
  const scopeLabel = monthObj ? monthObj.name : scope === "overall" ? "all days" : "monsoon (Jun–Sep)";

  return (
    <div className="grid">
      <PageHeader eyebrow="Stochastic processes · Discrete-time Markov chain" title="Does rain have memory?">
        Each day is in one of two states, Dry (0) or Wet (1, rain ≥ {a.meta.wet_threshold_mm} mm). If tomorrow depends only on today, the sequence
        is a first-order Markov chain, fully described by a 2×2 transition matrix.
      </PageHeader>

      <div className="span-12 scope-bar">
        <Segmented value={scope.startsWith("m") && scope !== "monsoon" ? "month" : scope}
          onChange={(v) => setScope(v === "month" ? "m7" : v)}
          options={[{ value: "overall", label: "All year" }, { value: "monsoon", label: "Monsoon" }, { value: "month", label: "Single month" }]} />
        {monthObj && (
          <select className="select" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Month">
            {monthly.map((m) => <option key={m.month} value={`m${m.month}`}>{m.name}</option>)}
          </select>
        )}
        {monthObj?.borrowed_wet_row && <span className="hint">Few wet days in {monthObj.name}: the wet row is borrowed from its season.</span>}
      </div>

      <div className="span-12 stat-strip">
        <Stat label="P(wet | wet yesterday)" value={fmt(P[1][1], 3)} note="persistence p₁₁" tone="orange" />
        <Stat label="P(wet | dry yesterday)" value={fmt(P[0][1], 3)} note="onset p₀₁" tone="sky" />
        <Stat label="Stationary π(wet)" value={pct(pi1)} note={monthObj ? `observed ${pct(monthObj.observed_wet)}` : scope === "overall" ? `observed ${pct(mk.overall.observed_wet_fraction)}` : "long-run share of wet days"} />
        <Stat label="Mean wet spell" value={`${fmt(1 / P[1][0], 1)} days`} note="1 / p₁₀" />
        <Stat label="Mean dry spell" value={`${fmt(1 / P[0][1], 1)} days`} note="1 / p₀₁" />
      </div>

      <Card className="span-6" title="State diagram" subtitle={`Estimated from ${scopeLabel}; arrow width ∝ probability`}>
        <StateDiagram P={P} />
      </Card>

      <Card className="span-6" title="Transition matrix">
        <div className="matrices">
          <div>
            <div className="matrix-title">Counts n<sub>ij</sub></div>
            <table className="matrix"><thead><tr><th /><th>→ Dry</th><th>→ Wet</th></tr></thead>
              <tbody>{counts.map((r, i) => <tr key={i}><th>{i ? "Wet" : "Dry"}</th>{r.map((v, j) => <td key={j}>{v.toLocaleString()}</td>)}</tr>)}</tbody></table>
          </div>
          <div>
            <div className="matrix-title">Probabilities p̂<sub>ij</sub> = n<sub>ij</sub> / n<sub>i</sub></div>
            <table className="matrix prob"><thead><tr><th /><th>→ Dry</th><th>→ Wet</th></tr></thead>
              <tbody>{P.map((r, i) => <tr key={i}><th>{i ? "Wet" : "Dry"}</th>{r.map((v, j) => <td key={j} style={{ "--p": v }}>{v.toFixed(3)}</td>)}</tr>)}</tbody></table>
          </div>
        </div>
        <Formula title="Stationary distribution (πP = π)" tex={String.raw`\pi_{\text{wet}}=\frac{p_{01}}{p_{01}+p_{10}}=\frac{${P[0][1].toFixed(3)}}{${P[0][1].toFixed(3)}+${P[1][0].toFixed(3)}}=${pi1.toFixed(3)}`} />
      </Card>

      {test && (
        <Card className="span-5" title="Hypothesis test: is there memory at all?" subtitle="χ² test of independence on the 2×2 transition table">
          <Formula tex={String.raw`H_0:\ p_{01}=p_{11}\quad(\text{no memory})`} />
          <Formula tex={String.raw`\chi^2=\sum_{i,j}\frac{(n_{ij}-E_{ij})^2}{E_{ij}}\sim\chi^2_{1}`} />
          <div className="kv">
            <div><span>Expected counts under H₀</span><b>{test.expected.map((r) => r.map((v) => fmt(v, 0)).join(" / ")).join("  ·  ")}</b></div>
            <div><span>χ² statistic (df = {test.df})</span><b>{fmt(test.chi2, 1)}</b></div>
            <div><span>p-value</span><b>{pfmt(test.p)}</b></div>
          </div>
          <Callout tone={test.p < 0.05 ? "ok" : "warn"} title={test.p < 0.05 ? "Reject H₀" : "Cannot reject H₀"}>
            {test.p < 0.05
              ? `Tomorrow's state clearly depends on today's: a wet day is followed by rain ${fmt(P[1][1] / P[0][1], 1)}× as often as a dry day. An independent (Bernoulli) model would be wrong.`
              : "The data are consistent with independent days."}
          </Callout>
        </Card>
      )}

      <Card className={test ? "span-7" : "span-12"} title="n-step probabilities (Chapman–Kolmogorov)" subtitle="P(wet in n days | today), converging to π"
        actions={<label className="inline-num">n = <input type="number" min={1} max={30} value={n} onChange={(e) => setN(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} /></label>}>
        <div className="two-col narrow-right">
          <Plot height={240} xDomain={[1, 14]} yDomain={[0, 1]} xLabel="n (days ahead)" yLabel="Probability" yFormat={(v) => `${v * 100}%`}
            tooltip={({ px, x }) => { const p = nearest(nstep, px, x); return p && { left: x(p[0]), top: 0, crosshair: x(p[0]), content: <>n = {p[0]}<br />from wet: {pct(p[1])}<br />from dry: {pct(p[2])}</> }; }}>
            {({ x, y, iw }) => (<>
              <line x1={0} x2={iw} y1={y(pi1)} y2={y(pi1)} className="ref" />
              <text x={iw - 4} y={y(pi1) - 6} textAnchor="end" className="ref-label">π = {pct(pi1, 0)}</text>
              <Line data={nstep.map((q) => [q[0], q[1]])} x={x} y={y} color={C.orange} />
              <Line data={nstep.map((q) => [q[0], q[2]])} x={x} y={y} color={C.sky} />
              <Dots data={nstep.map((q) => [q[0], q[1]])} x={x} y={y} r={3.5} color={C.orange} opacity={1} />
              <Dots data={nstep.map((q) => [q[0], q[2]])} x={x} y={y} r={3.5} color={C.sky} opacity={1} />
            </>)}
          </Plot>
          <div>
            <div className="matrix-title">P<sup>{n}</sup></div>
            <table className="matrix prob"><thead><tr><th /><th>Dry</th><th>Wet</th></tr></thead>
              <tbody>{M.map((r, i) => <tr key={i}><th>{i ? "Wet" : "Dry"}</th>{r.map((v, j) => <td key={j} style={{ "--p": v }}>{v.toFixed(3)}</td>)}</tr>)}</tbody></table>
            <p className="note">Rows of Pⁿ become identical as n grows: the chain forgets its starting state.</p>
          </div>
        </div>
        <Legend items={[{ label: "Wet today", color: "var(--c-orange)", type: "line" }, { label: "Dry today", color: "var(--c-sky)", type: "line" }]} />
      </Card>

      <Card className="span-7" title="Spell lengths in the monsoon" subtitle="A Markov chain implies geometric spell lengths: P(L = k) = (1 − q)^(k−1) q"
        actions={<Segmented size="sm" value={spell} onChange={setSpell} options={[{ value: "wet", label: "Wet spells" }, { value: "dry", label: "Dry spells" }]} />}>
        <Plot height={250} xType="band" xDomain={spRows.map((r) => r.key)} yDomain={[0, Math.max(...spRows.map((r) => Math.max(r.obs, r.geo))) * 1.12]}
          xLabel="Spell length k (days)" yLabel="Probability" yFormat={(v) => v.toFixed(2)}
          tooltip={({ px, x }) => { const k = bandIndex(x, px); const r = spRows.find((q) => q.key === k); return r && { left: x(k) + x.bandwidth() / 2, top: 0, content: <>{k} day{k === "1" ? "" : "s"}<br />Observed {fmt(r.obs, 3)}<br />Geometric {fmt(r.geo, 3)}</> }; }}>
          {({ x, y }) => (<>
            <Bars data={spRows.map((r) => ({ key: r.key, value: r.obs }))} x={x} y={y} color={spell === "wet" ? C.orange : C.sky} opacity={0.85} radius={4} />
            <Line data={spRows.map((r) => [r.key, r.geo])} x={(k) => x(k) + x.bandwidth() / 2} y={y} color={C.navy} width={2.5} />
            <Dots data={spRows.map((r) => [r.key, r.geo])} x={(k) => x(k) + x.bandwidth() / 2} y={y} r={3.5} color={C.navy} opacity={1} />
          </>)}
        </Plot>
        <p className="note">{sp.n_spells.toLocaleString()} spells · observed mean {fmt(sp.mean_observed, 2)} days vs geometric {fmt(sp.mean_geometric, 2)} days ·
          longest {sp.longest} days. Where observed long spells exceed the geometric line, rain persistence is stronger than first-order — a
          second-order chain is a natural extension.</p>
      </Card>

      <Card className="span-5" title="Next-day forecast skill" subtitle={`Monthly chains fitted on training years, scored on ${ev.n_test_pairs.toLocaleString()} test days`}>
        <Formula tex={String.raw`\text{BS}=\frac1N\sum(f_t-o_t)^2,\qquad \text{BSS}=1-\frac{\text{BS}}{\text{BS}_{\text{clim}}}`} />
        <div className="kv">
          <div><span>Brier score — Markov chain</span><b>{fmt(ev.brier, 4)}</b></div>
          <div><span>Brier score — climatology</span><b>{fmt(ev.brier_climatology, 4)}</b></div>
          <div><span>Brier skill score</span><b className={ev.brier_skill > 0 ? "good" : "bad"}>{fmt(ev.brier_skill, 3)}</b></div>
          <div><span>Accuracy (forecast ≥ 50% → wet)</span><b>{pct(ev.accuracy)}</b></div>
          <div><span>Persistence ("same as today")</span><b>{pct(ev.persistence_accuracy)}</b></div>
        </div>
        <h4 className="chart-title">Reliability diagram</h4>
        <Plot height={200} xDomain={[0, 1]} yDomain={[0, 1]} xLabel="Forecast probability" yLabel="Observed freq." xFormat={(v) => `${v * 100}%`} yFormat={(v) => `${v * 100}%`}>
          {({ x, y }) => (<>
            <Line data={[[0, 0], [1, 1]]} x={x} y={y} color={C.grey} dash="5 4" width={1.5} curve={false} />
            <Line data={ev.reliability.map((r) => [r.forecast, r.observed])} x={x} y={y} color={C.orange} curve={false} />
            <Dots data={ev.reliability.map((r) => [r.forecast, r.observed])} x={x} y={y} r={5} color={C.orange} opacity={1} />
          </>)}
        </Plot>
      </Card>

      <Card className="span-12" title="The seasonal cycle of the chain" subtitle="Separate transition matrix per calendar month (non-homogeneous Markov chain)">
        <Plot height={260} xType="band" xDomain={monthly.map((m) => m.name)} yDomain={[0, 1]} yFormat={(v) => `${v * 100}%`} yLabel="Probability"
          tooltip={({ px, x }) => { const k = bandIndex(x, px); const m = monthly.find((q) => q.name === k); return m && { left: x(k) + x.bandwidth() / 2, top: 0, content: <><b>{k}</b><br />p₁₁ {fmt(m.p11, 3)} · p₀₁ {fmt(m.p01, 3)}<br />π {pct(m.stationary_wet)} · observed {pct(m.observed_wet)}</> }; }}>
          {({ x, y }) => {
            const cx = (k) => x(k) + x.bandwidth() / 2;
            return (<>
              <Bars data={monthly.map((m) => ({ key: m.name, value: m.observed_wet }))} x={x} y={y} color="var(--c-sky-soft)" radius={6} />
              <Line data={monthly.map((m) => [m.name, m.p11])} x={cx} y={y} color={C.orange} />
              <Line data={monthly.map((m) => [m.name, m.p01])} x={cx} y={y} color={C.sky} />
              <Line data={monthly.map((m) => [m.name, m.stationary_wet])} x={cx} y={y} color={C.navy} dash="5 4" width={2} />
            </>);
          }}
        </Plot>
        <Legend items={[{ label: "Observed share of wet days", color: "var(--c-sky-soft)" }, { label: "p₁₁ (wet → wet)", color: "var(--c-orange)", type: "line" },
          { label: "p₀₁ (dry → wet)", color: "var(--c-sky)", type: "line" }, { label: "Stationary π(wet)", color: "var(--c-navy)", type: "dash" }]} />
      </Card>
    </div>
  );
}
