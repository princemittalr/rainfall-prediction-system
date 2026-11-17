import { useEffect, useMemo, useState } from "react";
import {
  LuArrowRight, LuCloud, LuDroplets, LuGauge, LuLightbulb, LuMapPin, LuShuffle, LuSigma, LuSparkles, LuTarget, LuTrendingUp,
} from "react-icons/lu";
import { useApp } from "../App.jsx";
import { isUpgraded, predict } from "../lib/api.js";
import { Bars, C, Legend, Plot, bandIndex } from "../components/charts.jsx";
import { Card, Gauge, fmt, pct, pfmt } from "../components/ui.jsx";
import { MonsoonScene, WeatherArt, kindFromWeather } from "../components/Illustrations.jsx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FINDING_ICONS = [LuSigma, LuShuffle, LuTrendingUp, LuTarget, LuSparkles];

function useConditions() {
  const { analysis, live } = useApp();
  return useMemo(() => {
    if (live && live.current) {
      const c = live.current;
      const month = Number(c.time.slice(5, 7));
      return {
        source: "live", time: c.time, month,
        temp_c: c.temperature_2m, feels: c.apparent_temperature, humidity_pct: c.relative_humidity_2m,
        wind_kmh: c.wind_speed_10m, pressure_hpa: c.pressure_msl, cloud_pct: c.cloud_cover,
        rain_mm: live.daily?.precipitation_sum?.[0] ?? c.precipitation, code: c.weather_code,
      };
    }
    const l = analysis.latest;
    return { source: "dataset", time: l.date, month: l.month, ...l, feels: null, code: null };
  }, [analysis, live]);
}

export default function Overview() {
  const { analysis: a, mode, live } = useApp();
  const cond = useConditions();
  const [fc, setFc] = useState(null);

  useEffect(() => {
    predict(mode, a, {
      humidity_pct: cond.humidity_pct, cloud_pct: cond.cloud_pct, pressure_hpa: cond.pressure_hpa,
      temp_c: cond.temp_c, wind_kmh: cond.wind_kmh, month: cond.month, today_wet: (cond.rain_mm ?? 0) >= a.meta.wet_threshold_mm,
      rain_today: cond.rain_mm ?? 0,
    }).then(setFc);
  }, [cond, mode, a]);

  const clim = a.descriptive.climatology;
  const annual = clim.reduce((s, m) => s + m.rain_total_mean, 0);
  const monsoonShare = clim.filter((m) => m.month >= 6 && m.month <= 9).reduce((s, m) => s + m.rain_total_mean, 0) / annual;
  const humTest = a.descriptive.correlation.tests.find((t) => t.key === "humidity_pct");
  const mult = fc?.regression.find((r) => r.key === (isUpgraded(a) ? "extended" : "multiple"));

  const horizon = fc?.markov.horizon || [];
  const nwp = live?.daily?.precipitation_probability_max;
  const days = horizon.map((h, i) => {
    const date = live?.daily?.time?.[i + 1];
    return { key: date ? new Date(date + "T00:00").toLocaleDateString("en-IN", { weekday: "short" }) : `Day ${h.day}`, markov: h.p_wet, nwp: nwp?.[i + 1] != null ? nwp[i + 1] / 100 : null };
  });

  return (
    <div className="grid overview">
      {/* ---------- hero weather card ---------- */}
      <section className="card hero span-7">
        <div className="hero-left">
          <span className="chip"><LuMapPin /> {a.meta.location}</span>
          <h2>Weather</h2>
          <span className="hero-when">
            {cond.source === "live" ? `Live · Open-Meteo · ${cond.time.replace("T", " ")}` : `Latest record in dataset · ${cond.time}`}
          </span>
          <div className="hero-temp">{fmt(cond.temp_c, 0)}<span>°C</span></div>
          {cond.feels != null && <span className="hero-feels">Feels like {fmt(cond.feels, 0)}°C</span>}
        </div>
        <div className="hero-right">
          <WeatherArt kind={kindFromWeather(cond)} size={200} />
          <div className="hero-chips">
            <div className="mini mini-lime"><span>Humidity</span><strong>{fmt(cond.humidity_pct, 0)}%</strong></div>
            <div className="mini"><span>Wind</span><strong>{fmt(cond.wind_kmh, 0)} km/h</strong></div>
            <div className="mini"><span>Pressure</span><strong>{fmt(cond.pressure_hpa, 0)} hPa</strong></div>
            <div className="mini"><span>Cloud</span><strong>{fmt(cond.cloud_pct, 0)}%</strong></div>
          </div>
        </div>
      </section>

      {/* ---------- model forecast for tomorrow ---------- */}
      <Card className="span-5 tomorrow" title="What the model says about tomorrow" subtitle="Markov chain + Gamma distribution + regression">
        {fc ? (
          <div className="tomorrow-body">
            <Gauge value={fc.markov.p_wet_tomorrow} label="Chance of a wet day (≥ 1 mm)" size={170} />
            <div className="tomorrow-stats">
              <div><span>Today is</span><strong>{fc.markov.today}</strong><small>{fc.markov.month} transition matrix</small></div>
              <div><span>Expected rainfall</span><strong>{fmt(fc.distribution.expected_tomorrow, 1)} mm</strong><small>P(wet) × E[amount | wet]</small></div>
              <div><span>If it rains, 95% range</span><strong>{fmt(fc.distribution.interval_if_wet[0], 1)}–{fmt(fc.distribution.interval_if_wet[1], 0)} mm</strong><small>{fc.distribution.season} Gamma fit</small></div>
              <div><span>Multiple regression (today)</span><strong>{fmt(mult.yhat, 1)} mm</strong><small>95% PI {fmt(mult.pi[0], 1)}–{fmt(mult.pi[1], 1)} mm</small></div>
            </div>
          </div>
        ) : <div className="skeleton" style={{ height: 180 }} />}
        <a className="link-row" href="#/predict">Try your own conditions <LuArrowRight /></a>
      </Card>

      {/* ---------- seasons ---------- */}
      <div className="span-3 stack">
        {a.distribution.seasons.map((s) => (
          <div key={s.season} className="season-row">
            <WeatherArt kind={s.p_wet > 0.5 ? "rain" : s.p_wet > 0.1 ? "partly" : "sun"} size={46} />
            <div>
              <strong>{s.season}</strong>
              <small>{s.months.map((m) => MONTHS[m - 1]).join(" · ")}</small>
            </div>
            <span className="season-stat">{pct(s.p_wet, 0)}<small>wet days</small></span>
          </div>
        ))}
      </div>

      {/* ---------- 7 day chance of rain ---------- */}
      <Card className="span-6" title="Chance of rain, next 7 days" icon={<LuDroplets />}
        subtitle={nwp ? "Our 2-state Markov chain vs the Open-Meteo numerical forecast" : "Markov chain n-step probabilities P(wet in n days | today)"}>
        <Plot height={210} xType="band" xDomain={days.map((d) => d.key)} yDomain={[0, 1]} yFormat={(v) => `${v * 100}%`}
          tooltip={({ px, x }) => {
            const k = bandIndex(x, px); const d = days.find((q) => q.key === k);
            return d && { left: x(k) + x.bandwidth() / 2, top: 0, content: <><b>{k}</b><br />Markov: {pct(d.markov, 0)}{d.nwp != null && <><br />Forecast: {pct(d.nwp, 0)}</>}</> };
          }}>
          {({ x, y }) => (<>
            <Bars data={days.map((d) => ({ key: d.key, value: d.markov }))} x={x} y={y} color={C.sky} groups={nwp ? 2 : 1} />
            {nwp && <Bars data={days.map((d) => ({ key: d.key, value: d.nwp }))} x={x} y={y} color={C.orange} groups={2} group={1} />}
          </>)}
        </Plot>
        <Legend items={[{ label: "Markov chain (statistical)", color: "var(--c-sky)" }, ...(nwp ? [{ label: "Open-Meteo forecast (physics model)", color: "var(--c-orange)" }] : [])]} />
        <p className="note">The chain "forgets" today within about three days and settles at the month's long-run probability
          {fc && ` (${pct(fc.markov.stationary_wet, 0)})`} — a direct view of convergence to the stationary distribution.</p>
      </Card>

      {/* ---------- monsoon illustration ---------- */}
      <section className="card card-green span-3 monsoon-card">
        <span className="eyebrow">Monsoon · Jun–Sep</span>
        <strong className="monsoon-title">{pct(monsoonShare, 0)} of the year's rain</strong>
        <MonsoonScene />
        <div className="monsoon-foot"><span>{fmt(annual, 0)} mm</span><small>mean annual total</small></div>
      </section>

      {/* ---------- key findings ---------- */}
      <div className="span-12 findings">
        {a.key_findings.map((f, i) => {
          const Icon = FINDING_ICONS[i % FINDING_ICONS.length];
          return (
            <div className="finding" key={f.title}>
              <span className="finding-icon"><Icon /></span>
              <span className="finding-title">{f.title}</span>
              <strong className="finding-value">{f.value}</strong>
              <p>{f.text}</p>
            </div>
          );
        })}
      </div>

      {/* ---------- climatology ---------- */}
      <Card className="span-8" title="The rainfall year" subtitle="Mean monthly rainfall; hover a bar for wet-day statistics" icon={<LuCloud />}>
        <Plot height={250} xType="band" xDomain={MONTHS} yDomain={[0, Math.max(...clim.map((m) => m.rain_total_mean)) * 1.1]} yLabel="mm / month"
          tooltip={({ px, x }) => {
            const k = bandIndex(x, px); const m = clim.find((q) => q.name === k);
            return m && { left: x(k) + x.bandwidth() / 2, top: 0, content: <><b>{k}</b><br />{fmt(m.rain_total_mean, 0)} mm (SD {fmt(m.rain_total_sd, 0)})<br />{fmt(m.wet_days_mean, 1)} wet days · P(wet) {pct(m.p_wet, 0)}</> };
          }}>
          {({ x, y }) => <Bars data={clim.map((m) => ({ key: m.name, value: m.rain_total_mean, color: m.month >= 6 && m.month <= 9 ? "var(--c-orange)" : "var(--c-sky)" }))} x={x} y={y} />}
        </Plot>
      </Card>

      <section className="card card-navy span-4 corr-card">
        <span className="eyebrow">Correlation spotlight</span>
        <h3>{humTest ? "Humidity ↔ Rainfall" : "Correlation"}</h3>
        {(() => {
          const top = a.descriptive.correlation.tests[0];
          const t = humTest || top;
          return (<>
            <div className="corr-big">r = {fmt(t.r, 2)}</div>
            <p>Pearson correlation over {a.descriptive.correlation.n.toLocaleString()} days, 95% CI [{fmt(t.ci95[0], 2)}, {fmt(t.ci95[1], 2)}],
              p {pfmt(t.p)}. Spearman ρ = {fmt(t.spearman, 2)}.</p>
            <p className="muted-light">Highest |r| overall: {top.label} ({fmt(top.r, 2)}). Correlation measures linear association, not causation.</p>
          </>);
        })()}
        <div className="corr-art"><WeatherArt kind="rain" size={120} /></div>
      </section>

      <div className="span-12 explore">
        {[
          ["#/probability", "Probability", "Which distribution fits rainfall? Gamma vs Normal, P(X > t)", LuSigma],
          ["#/markov", "Markov chain", "Does rain have memory? Transition matrix & spells", LuShuffle],
          ["#/regression", "Multiple regression", "Pressure, temperature, humidity, cloud, wind and more, with F-tests", LuTrendingUp],
          ["#/predict", "Predict", "Enter conditions → estimate with uncertainty", LuGauge],
        ].map(([href, t, d, Icon]) => (
          <a key={href} href={href} className="explore-card">
            <Icon /><div><strong>{t}</strong><span>{d}</span></div><LuArrowRight className="arrow" />
          </a>
        ))}
      </div>

      <div className="span-12 small-print">
        <LuLightbulb /> {cond.source === "live"
          ? "Live conditions come from the Open-Meteo forecast API. Model outputs are statistical estimates for teaching and research, not an official forecast."
          : "Live weather could not be loaded, so the latest record in the dataset is shown."}
      </div>
    </div>
  );
}
