import { useMemo, useState } from "react";
import katex from "katex";
import { LuInfo } from "react-icons/lu";

export const fmt = (v, d = 2) => (v == null || !isFinite(v) ? "–" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const fmt0 = (v) => fmt(v, 0);
export const pct = (v, d = 1) => (v == null ? "–" : `${(v * 100).toFixed(d)}%`);
export const pfmt = (p) => (p == null ? "–" : p < 0.001 ? "< 0.001" : p.toFixed(3));
export const stars = (p) => (p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "");

export function Tex({ children, block = false, className = "" }) {
  const html = useMemo(() => {
    try { return katex.renderToString(children, { displayMode: block, throwOnError: false, strict: false }); }
    catch { return children; }
  }, [children, block]);
  return <span className={`tex ${block ? "tex-block" : ""} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Card({ title, subtitle, actions, children, className = "", tone, id, icon }) {
  return (
    <section className={`card ${tone ? `card-${tone}` : ""} ${className}`} id={id}>
      {(title || actions) && (
        <header className="card-head">
          <div className="card-titles">
            {title && <h3>{icon && <span className="card-icon">{icon}</span>}{title}</h3>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, note, tone, big }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""} ${big ? "stat-big" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export function Badge({ children, tone = "neutral", title }) {
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>;
}

export function Segmented({ options, value, onChange, size }) {
  return (
    <div className={`segmented ${size === "sm" ? "segmented-sm" : ""}`} role="tablist">
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return (
          <button key={v} role="tab" aria-selected={value === v} className={value === v ? "active" : ""} onClick={() => onChange(v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Info({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)} tabIndex={0} aria-label="More information">
      <LuInfo />
      {open && <span className="info-pop">{children}</span>}
    </span>
  );
}

export function PageHeader({ eyebrow, title, children, right }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p className="lede">{children}</p>}
      </div>
      {right && <div className="page-header-right">{right}</div>}
    </div>
  );
}

export function Callout({ tone = "info", title, children, icon }) {
  return (
    <div className={`callout callout-${tone}`}>
      {icon && <div className="callout-icon">{icon}</div>}
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function SliderField({ label, value, min, max, step = 1, unit, onChange, hint }) {
  return (
    <label className="field">
      <span className="field-top">
        <span className="field-label">{label}</span>
        <span className="field-value">
          <input type="number" value={value} min={min} max={max} step={step}
            onChange={(e) => onChange(e.target.value === "" ? min : Math.min(max, Math.max(min, Number(e.target.value))))} />
          {unit && <span className="unit">{unit}</span>}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--fill": `${((value - min) / (max - min)) * 100}%` }} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Table({ columns, rows, highlight, compact }) {
  return (
    <div className="table-wrap">
      <table className={`table ${compact ? "table-compact" : ""}`}>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.num ? "num" : ""}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={highlight?.(r) ? "hl" : ""}>
              {columns.map((c) => <td key={c.key} className={c.num ? "num" : ""}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Gauge({ value, label, size = 150 }) {
  const r = size / 2 - 12, c = Math.PI * r;
  return (
    <div className="gauge" style={{ width: size }}>
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
        <path d={`M12 ${size / 2} A ${r} ${r} 0 0 1 ${size - 12} ${size / 2}`} className="gauge-track" />
        <path d={`M12 ${size / 2} A ${r} ${r} 0 0 1 ${size - 12} ${size / 2}`} className="gauge-fill"
          strokeDasharray={`${c * Math.max(0, Math.min(1, value))} ${c}`} />
      </svg>
      <div className="gauge-value">{Math.round(value * 100)}<small>%</small></div>
      {label && <div className="gauge-label">{label}</div>}
    </div>
  );
}

export function Formula({ title, tex, children }) {
  return (
    <div className="formula">
      {title && <div className="formula-title">{title}</div>}
      <Tex block>{tex}</Tex>
      {children && <div className="formula-note">{children}</div>}
    </div>
  );
}
