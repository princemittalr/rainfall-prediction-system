import { useEffect, useMemo, useState } from "react";
import { LuCloudRain, LuDatabase, LuRefreshCw, LuSun, LuTriangleAlert, LuWifiOff } from "react-icons/lu";
import { useApp } from "../App.jsx";
import { isUpgraded, predict } from "../lib/api.js";
import { Bars, C, Plot, bandIndex } from "../components/charts.jsx";
import { Callout, Card, Gauge, PageHeader, Segmented, SliderField, fmt, pct } from "../components/ui.jsx";
import { WeatherArt } from "../components/Illustrations.jsx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT = { simple: "Humidity only", multiple: "5 factors", extended: "Extended (final)", nextday: "Tomorrow (next-day)" };

function Contributions({ c, unit = "mm", title }) {
  if (!c) return null;
  const max = Math.max(...c.parts.map((p) => Math.abs(p.effect)), 0.001);
  const total = c.baseline + c.parts.reduce((s, p) => s + p.effect, 0);
  return (
    <div>
      {title && <h4 className="chart-title">{title}</h4>}
      <div className="contrib">
        {c.parts.map((p) => (
          <div key={p.term} className="contrib-row">
            <span className="hbar-label" title={`${p.label}: ${fmt(p.value, 1)} (average ${fmt(p.mean, 1)})`}>{p.symbol} <small>{p.label.replace(/ \(.*\)/, "")}</small></span>
            <span className="contrib-track"><span className={`contrib-bar ${p.effect >= 0 ? "pos" : "neg"}`} style={{ width: `${(Math.abs(p.effect) / max) * 50}%` }} /></span>
            <span className="hbar-val">{p.effect >= 0 ? "+" : "−"}{fmt(Math.abs(p.effect), 1)}</span>
          </div>
        ))}
      </div>
      <div className="contrib-total">
        <span>Average day {fmt(c.baseline, 1)} {unit} + factor effects</span>
        <b>= {fmt(total, 1)} {unit}{total < 0 ? " → shown as 0" : ""}</b>
      </div>
    </div>
  );
}

export default function Predict() {
  const { analysis: a, mode, live } = useApp();
  const clim = a.descriptive.climatology;
  const preset = (month, wet) => {
    const c = clim[month - 1];
    const p = Math.round(c.pressure_hpa * 10) / 10, t = Math.round(c.temp_c * 10) / 10, h = Math.min(100, Math.round(c.humidity_pct + (wet ? 4 : 0)));
    return {
      humidity_pct: h, cloud_pct: Math.min(100, Math.round(c.cloud_pct + (wet ? 10 : 0))), pressure_hpa: p, temp_c: t, wind_kmh: Math.round(c.wind_kmh), month,
      pressure_prev: wet ? Math.round((p + 1.5) * 10) / 10 : p, temp_prev: wet ? Math.round((t + 0.5) * 10) / 10 : t, humidity_prev: wet ? h - 3 : h,
      rain_prev: wet ? 15 : 0, rain_today: wet ? 20 : 0,
    };
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
    const p = Math.round(c.pressure_msl * 10) / 10;
    setInp({ humidity_pct: c.relative_humidity_2m, cloud_pct: c.cloud_cover, pressure_hpa: p, temp_c: c.temperature_2m, wind_kmh: Math.round(c.wind_speed_10m),
      month: Number(c.time.slice(5, 7)), pressure_prev: p, temp_prev: c.temperature_2m, humidity_prev: c.relative_humidity_2m, rain_prev: 0,
      rain_today: Math.round((live.daily?.precipitation_sum?.[0] ?? 0) * 10) / 10 });
  };
  const useLatest = () => {
    const rec = a.descriptive.recent;
    const l = rec[rec.length - 1], y = rec[rec.length - 2] || l;
    setInp({ humidity_pct: l.humidity_pct, cloud_pct: l.cloud_pct, pressure_hpa: l.pressure_hpa, temp_c: l.temp_c, wind_kmh: l.wind_kmh,
      month: Number(l.date.slice(5, 7)), pressure_prev: y.pressure_hpa, temp_prev: y.temp_c, humidity_prev: y.humidity_pct, rain_prev: y.rain_mm, rain_today: l.rain_mm });
  };

  const ranges = useMemo(() => Object.fromEntries(a.descriptive.summary.map((s) => [s.key, s])), [a]);
  const outOfRange = Object.entries(inp).filter(([k, v]) => ranges[k] && (v < ranges[k].min || v > ranges[k].max)).map(([k]) => ranges[k].label);
  const levelPct = Math.round(level * 100);
  const upgraded = isUpgraded(a);
  const main = res?.regression.find((r) => r.key === (upgraded ? "extended" : "multiple"));
  const next = res?.regression.find((r) => r.key === "nextday");
  const maxPi = res ? Math.max(...res.regression.map((r) => r.pi[1]), 1) * 1.05 : 100;

  return (
    <div className="grid">
      <PageHeader eyebrow="Prediction · multiple linear regression with uncertainty" title="Predict rainfall">
        Enter today's weather and yesterday's readings. The multiple regression estimates today's rainfall and forecasts tomorrow's, each with a
        prediction interval, and shows how much each factor pushed the estimate up or down.
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
        <div className="form-group-title">Today</div>
        <SliderField label="Pressure" value={inp.pressure_hpa} min={990} max={1025} step={0.1} unit="hPa" onChange={set("pressure_hpa")} />
        <SliderField label="Temperature" value={inp.temp_c} min={10} max={40} step={0.1} unit="°C" onChange={set("temp_c")} />
        <SliderField label="Humidity" value={inp.humidity_pct} min={20} max={100} unit="%" onChange={set("humidity_pct")} />
        <SliderField label="Cloud cover" value={inp.cloud_pct} min={0} max={100} unit="%" onChange={set("cloud_pct")} />
        <SliderField label="Wind (max)" value={inp.wind_kmh} min={0} max={70} unit="km/h" onChange={set("wind_kmh")} />
        <SliderField label="Rain observed today" value={inp.rain_today} min={0} max={250} step={0.5} unit="mm" onChange={set("rain_today")}
          hint="Used only by the next-day forecast and the Markov chain" />
        <div className="form-group-title">Yesterday</div>
        <SliderField label="Pressure" value={inp.pressure_prev} min={990} max={1025} step={0.1} unit="hPa" onChange={set("pressure_prev")}
          hint={`Change: ${inp.pressure_hpa - inp.pressure_prev >= 0 ? "+" : ""}${fmt(inp.pressure_hpa - inp.pressure_prev, 1)} hPa`} />
        <SliderField label="Temperature" value={inp.temp_prev} min={10} max={40} step={0.1} unit="°C" onChange={set("temp_prev")}
          hint={`Change: ${inp.temp_c - inp.temp_prev >= 0 ? "+" : ""}${fmt(inp.temp_c - inp.temp_prev, 1)} °C`} />
        <SliderField label="Humidity" value={inp.humidity_prev} min={20} max={100} unit="%" onChange={set("humidity_prev")} />
        <SliderField label="Rainfall" value={inp.rain_prev} min={0} max={250} step={0.5} unit="mm" onChange={set("rain_prev")} />
        <label className="field">
          <span className="field-top"><span className="field-label">Interval level</span></span>
          <Segmented size="sm" value={String(level)} onChange={(v) => setLevel(Number(v))} options={[{ value: "0.8", label: "80%" }, { value: "0.9", label: "90%" }, { value: "0.95", label: "95%" }, { value: "0.99", label: "99%" }]} />
        </label>
        <SliderField label="Exceedance threshold t" value={threshold} min={1} max={250} step={0.5} unit="mm" onChange={setThreshold} />
      </Card>

      <div className="span-8 stack">
        {!upgraded && <Callout tone="warn" title="Old analysis snapshot">Run <code>python backend/scripts/export_snapshot.py</code> to enable the extended model and factor breakdown.</Callout>}
        {outOfRange.length > 0 && (
          <Callout tone="warn" icon={<LuTriangleAlert />} title="Extrapolation warning">
            {outOfRange.join(", ")} {outOfRange.length > 1 ? "are" : "is"} outside the range seen in the data. Regression is unreliable outside the observed range.
          </Callout>
        )}
        {res && main ? (<>
          <div className={`result-hero ${busy ? "busy" : ""}`}>
            <div className="result-main">
              <span className="eyebrow">Today · {main.name}</span>
              <div className="big-number">{fmt(main.yhat, 1)}<small> mm</small></div>
              <div className="category">{main.category}</div>
              <div className="interval">{levelPct}% prediction interval: <b>{fmt(main.pi[0], 1)} – {fmt(main.pi[1], 1)} mm</b></div>
              <div className="interval muted">{levelPct}% confidence interval for the mean: {fmt(main.ci[0], 1)} – {fmt(main.ci[1], 1)} mm</div>
            </div>
            <WeatherArt kind={main.yhat > 30 ? "storm" : main.yhat > 2.5 ? "rain" : inp.cloud_pct > 60 ? "cloud" : "partly"} size={170} />
          </div>

          {main.contributions && (
            <Card title="Why this estimate?" subtitle="Each bar = β̂ × (today's value − average value): how far that factor moves the estimate from an average day">
              <Contributions c={main.contributions} />
            </Card>
          )}

          {next && (
            <Card title="Tomorrow · next-day multiple-regression forecast" subtitle="Tomorrow's rainfall from today's weather, today's rain and the pressure change">
              <div className="two-col">
                <div>
                  <div className="big-number" style={{ fontSize: 52 }}>{fmt(next.yhat, 1)}<small> mm</small></div>
                  <div className="category">{next.category}</div>
                  <div className="interval">{levelPct}% prediction interval: <b>{fmt(next.pi[0], 1)} – {fmt(next.pi[1], 1)} mm</b></div>
                  <p className="note">Markov chain: P(wet tomorrow) = <b>{pct(res.markov.p_wet_tomorrow, 0)}</b> ({res.markov.month}, today {res.markov.today.toLowerCase()}).</p>
                </div>
                <Contributions c={next.contributions} title="Factor effects for tomorrow" />
              </div>
            </Card>
          )}

          <Card title="All regression models side by side" subtitle={`Point estimate (dot) with ${levelPct}% prediction interval (bar) and confidence interval (dark)`}>
            <div className="interval-chart">
              {res.regression.map((r) => (
                <div key={r.key} className="ic-row">
                  <span className="ic-name">{SHORT[r.key] || r.name}</span>
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
            <Card title="Markov chain: rain in the next 7 days" subtitle={`${res.markov.month} transition matrix, today = ${res.markov.today}`}>
              <div className="center"><Gauge value={res.markov.p_wet_tomorrow} label="P(wet tomorrow)" size={170} /></div>
              <Plot height={140} xType="band" xDomain={res.markov.horizon.map((h) => `+${h.day}d`)} yDomain={[0, 1]} yFormat={(v) => `${v * 100}%`} yTicks={3}
                tooltip={({ px, x }) => { const k = bandIndex(x, px); const h = res.markov.horizon.find((q) => `+${q.day}d` === k); return h && { left: x(k) + x.bandwidth() / 2, top: 0, content: <>{k}: {pct(h.p_wet, 1)}</> }; }}>
                {({ x, y }) => <Bars data={res.markov.horizon.map((h) => ({ key: `+${h.day}d`, value: h.p_wet }))} x={x} y={y} color={C.sky} />}
              </Plot>
            </Card>
            <Card title="Gamma distribution: how much if it rains?" subtitle={`${res.distribution.season} season, k = ${fmt(res.distribution.shape, 3)}, θ = ${fmt(res.distribution.scale, 2)}`}>
              <div className="kv big">
                <div><span>If wet, mean amount</span><b>{fmt(res.distribution.mean_if_wet, 1)} mm</b></div>
                <div><span>If wet, {levelPct}% range</span><b>{fmt(res.distribution.interval_if_wet[0], 1)} – {fmt(res.distribution.interval_if_wet[1], 1)} mm</b></div>
                <div><span>P(amount &gt; {threshold} mm | wet)</span><b>{pct(res.distribution.p_exceed_if_wet, 2)}</b></div>
                <div className="hl"><span>P(tomorrow &gt; {threshold} mm)</span><b>{pct(res.distribution.p_exceed_tomorrow, 2)}</b></div>
              </div>
            </Card>
          </div>

          <Callout tone="info" title="How to read this">
            The same-day model estimates today's rainfall from today's weather (association). The next-day model and the Markov chain forecast
            tomorrow. These are statistical estimates for study and research, not an official weather forecast.
          </Callout>
        </>) : <div className="skeleton" style={{ height: 420 }} />}
      </div>
    </div>
  );
}
