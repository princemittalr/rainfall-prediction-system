import { useEffect, useMemo, useState } from "react";
import { LuCloudRain, LuDatabase, LuRefreshCw, LuSun, LuTriangleAlert, LuWifiOff } from "react-icons/lu";
import { useApp } from "../App.jsx";
import { predict } from "../lib/api.js";
import { Bars, C, Plot, bandIndex } from "../components/charts.jsx";
import { Callout, Card, Gauge, PageHeader, Segmented, SliderField, fmt, pct } from "../components/ui.jsx";
import { WeatherArt } from "../components/Illustrations.jsx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Predict() {
  const { analysis: a, mode, live } = useApp();
  const clim = a.descriptive.climatology;
  const preset = (month, wet) => {
    const c = clim[month - 1];
    return { humidity_pct: Math.min(100, Math.round(c.humidity_pct + (wet ? 4 : 0))), cloud_pct: Math.min(100, Math.round(c.cloud_pct + (wet ? 10 : 0))),
      pressure_hpa: Math.round(c.pressure_hpa * 10) / 10, temp_c: Math.round(c.temp_c * 10) / 10, wind_kmh: Math.round(c.wind_kmh), month, today_wet: wet };
  };
  const [inp, setInp] = useState(() => preset(7, true));
  const [level, setLevel] = useState(0.95);
  const [threshold, setThreshold] = useState(64.5);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setInp((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    let alive = true;
    setBusy(true);
    const id = setTimeout(() => {
      predict(mode, a, inp, level, threshold).then((r) => { if (alive) { setRes(r); setBusy(false); } });
    }, 180);
    return () => { alive = false; clearTimeout(id); };
  }, [inp, level, threshold, mode, a]);

  const useLive = () => {
    const c = live.current;
    setInp({ humidity_pct: c.relative_humidity_2m, cloud_pct: c.cloud_cover, pressure_hpa: Math.round(c.pressure_msl * 10) / 10,
      temp_c: c.temperature_2m, wind_kmh: Math.round(c.wind_speed_10m), month: Number(c.time.slice(5, 7)),
      today_wet: (live.daily?.precipitation_sum?.[0] ?? 0) >= a.meta.wet_threshold_mm });
  };
  const useLatest = () => {
    const l = a.latest;
    setInp({ humidity_pct: l.humidity_pct, cloud_pct: l.cloud_pct, pressure_hpa: l.pressure_hpa, temp_c: l.temp_c, wind_kmh: l.wind_kmh,
      month: l.month, today_wet: l.rain_mm >= a.meta.wet_threshold_mm });
  };

  const ranges = useMemo(() => Object.fromEntries(a.descriptive.summary.map((s) => [s.key, s])), [a]);
  const outOfRange = Object.entries(inp).filter(([k, v]) => ranges[k] && (v < ranges[k].min || v > ranges[k].max)).map(([k]) => ranges[k].label);
  const levelPct = Math.round(level * 100);
  const maxPi = res ? Math.max(...res.regression.map((r) => r.pi[1]), res.distribution.interval_if_wet[1]) * 1.05 : 100;

  return (
    <div className="grid">
      <PageHeader eyebrow="Prediction · with uncertainty" title="Predict rainfall">
        Enter a day's weather. You get three answers that come from three different parts of the syllabus — and each one carries an
        honest measure of uncertainty.
      </PageHeader>

      <Card className="span-4 predict-form" title="Conditions" subtitle="Daily means (wind: daily maximum)">
        <div className="preset-row">
          <button className="btn btn-soft" onClick={() => setInp(preset(7, true))}><LuCloudRain /> Wet July day</button>
          <button className="btn btn-soft" onClick={() => setInp(preset(1, false))}><LuSun /> Dry January day</button>
          <button className="btn btn-soft" onClick={useLatest}><LuDatabase /> Latest record</button>
          {live?.current && <button className="btn btn-soft" onClick={useLive}><LuRefreshCw /> Live conditions</button>}
          {live === false && <span className="hint"><LuWifiOff /> live weather unavailable</span>}
        </div>
        <label className="field">
          <span className="field-top"><span className="field-label">Month</span></span>
          <select className="select" value={inp.month} onChange={(e) => set("month")(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <div className="field">
          <span className="field-top"><span className="field-label">Did it rain today (≥ {a.meta.wet_threshold_mm} mm)?</span></span>
          <Segmented value={inp.today_wet ? "yes" : "no"} onChange={(v) => set("today_wet")(v === "yes")} options={[{ value: "no", label: "No — dry" }, { value: "yes", label: "Yes — wet" }]} />
        </div>
        <SliderField label="Humidity" value={inp.humidity_pct} min={20} max={100} unit="%" onChange={set("humidity_pct")} />
        <SliderField label="Cloud cover" value={inp.cloud_pct} min={0} max={100} unit="%" onChange={set("cloud_pct")} />
        <SliderField label="Pressure" value={inp.pressure_hpa} min={990} max={1025} step={0.1} unit="hPa" onChange={set("pressure_hpa")} />
        <SliderField label="Temperature" value={inp.temp_c} min={10} max={40} step={0.1} unit="°C" onChange={set("temp_c")} />
        <SliderField label="Wind (max)" value={inp.wind_kmh} min={0} max={70} unit="km/h" onChange={set("wind_kmh")} />
        <div className="field-pair">
          <label className="field">
            <span className="field-top"><span className="field-label">Interval level</span></span>
            <Segmented size="sm" value={String(level)} onChange={(v) => setLevel(Number(v))} options={[{ value: "0.8", label: "80%" }, { value: "0.9", label: "90%" }, { value: "0.95", label: "95%" }, { value: "0.99", label: "99%" }]} />
          </label>
        </div>
        <SliderField label="Exceedance threshold t" value={threshold} min={1} max={250} step={0.5} unit="mm" onChange={setThreshold} />
      </Card>

      <div className="span-8 stack">
        {outOfRange.length > 0 && (
          <Callout tone="warn" icon={<LuTriangleAlert />} title="Extrapolation warning">
            {outOfRange.join(", ")} {outOfRange.length > 1 ? "are" : "is"} outside the range seen in the data. Regression is unreliable outside the observed range.
          </Callout>
        )}
        {res ? (<>
          <div className={`result-hero ${busy ? "busy" : ""}`}>
            <div className="result-main">
              <span className="eyebrow">1 · Regression estimate (multiple linear)</span>
              {(() => { const m = res.regression.find((r) => r.key === "multiple"); return (<>
                <div className="big-number">{fmt(m.yhat, 1)}<small> mm</small></div>
                <div className="category">{m.category}</div>
                <div className="interval">{levelPct}% prediction interval: <b>{fmt(m.pi[0], 1)} – {fmt(m.pi[1], 1)} mm</b></div>
                <div className="interval muted">{levelPct}% confidence interval for the mean: {fmt(m.ci[0], 1)} – {fmt(m.ci[1], 1)} mm</div>
              </>); })()}
            </div>
            <WeatherArt kind={res.regression.find((r) => r.key === "multiple").yhat > 30 ? "storm" : res.regression.find((r) => r.key === "multiple").yhat > 2.5 ? "rain" : inp.cloud_pct > 60 ? "cloud" : "partly"} size={180} />
          </div>

          <Card title="All three regression models" subtitle={`Point estimate (dot) with ${levelPct}% prediction interval (bar)`}>
            <div className="interval-chart">
              {res.regression.map((r) => (
                <div key={r.key} className="ic-row">
                  <span className="ic-name">{r.name.split(":")[0]}</span>
                  <div className="ic-track">
                    <div className="ic-bar" style={{ left: `${(r.pi[0] / maxPi) * 100}%`, width: `${((r.pi[1] - r.pi[0]) / maxPi) * 100}%` }} />
                    <div className="ic-ci" style={{ left: `${(r.ci[0] / maxPi) * 100}%`, width: `${Math.max(0.6, ((r.ci[1] - r.ci[0]) / maxPi) * 100)}%` }} />
                    <div className="ic-dot" style={{ left: `${(r.yhat / maxPi) * 100}%` }} />
                  </div>
                  <span className="ic-val">{fmt(r.yhat, 1)} mm <small>[{fmt(r.pi[0], 1)}, {fmt(r.pi[1], 1)}]</small></span>
                </div>
              ))}
              <div className="ic-axis"><span>0</span><span>{fmt(maxPi / 2, 0)}</span><span>{fmt(maxPi, 0)} mm</span></div>
            </div>
          </Card>

          <div className="two-col">
            <Card title="2 · Markov chain: rain tomorrow?" subtitle={`${res.markov.month} transition matrix, today = ${res.markov.today}`}>
              <div className="center"><Gauge value={res.markov.p_wet_tomorrow} label="P(wet tomorrow)" size={180} /></div>
              <Plot height={150} xType="band" xDomain={res.markov.horizon.map((h) => `+${h.day}d`)} yDomain={[0, 1]} yFormat={(v) => `${v * 100}%`} yTicks={3}
                tooltip={({ px, x }) => { const k = bandIndex(x, px); const h = res.markov.horizon.find((q) => `+${q.day}d` === k); return h && { left: x(k) + x.bandwidth() / 2, top: 0, content: <>{k}: {pct(h.p_wet, 1)}</> }; }}>
                {({ x, y }) => <Bars data={res.markov.horizon.map((h) => ({ key: `+${h.day}d`, value: h.p_wet }))} x={x} y={y} color={C.sky} />}
              </Plot>
              <p className="note">Converges to the stationary probability {pct(res.markov.stationary_wet, 0)} for {res.markov.month}.</p>
            </Card>
            <Card title="3 · Gamma distribution: how much?" subtitle={`${res.distribution.season} season, k = ${fmt(res.distribution.shape, 3)}, θ = ${fmt(res.distribution.scale, 2)}`}>
              <div className="kv big">
                <div><span>If tomorrow is wet, mean amount</span><b>{fmt(res.distribution.mean_if_wet, 1)} mm</b></div>
                <div><span>If wet, {levelPct}% range</span><b>{fmt(res.distribution.interval_if_wet[0], 1)} – {fmt(res.distribution.interval_if_wet[1], 1)} mm</b></div>
                <div><span>Expected rainfall tomorrow</span><b>{fmt(res.distribution.expected_tomorrow, 1)} mm</b></div>
                <div><span>P(amount &gt; {threshold} mm | wet)</span><b>{pct(res.distribution.p_exceed_if_wet, 2)}</b></div>
                <div className="hl"><span>P(tomorrow &gt; {threshold} mm)</span><b>{pct(res.distribution.p_exceed_tomorrow, 2)}</b></div>
              </div>
              <p className="note">E[X] = P(wet) × E[X | wet] and P(X &gt; t) = P(wet) × P(X &gt; t | wet) — the law of total expectation and of total probability.</p>
            </Card>
          </div>

          <Callout tone="info" title="How to read this">
            The regression describes rainfall <i>given the same day's weather</i> (association). The Markov chain and Gamma model forecast
            <i> tomorrow</i> from today's state and the season. Neither is an official weather forecast; both are statistical models whose accuracy is
            measured on the Regression and Markov pages.
          </Callout>
        </>) : <div className="skeleton" style={{ height: 420 }} />}
      </div>
    </div>
  );
}
