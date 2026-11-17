import { Fragment, useEffect, useRef, useState } from "react";
import { scaleBand, scaleLinear, scaleLog } from "d3-scale";
import { area as d3area, curveMonotoneX, line as d3line } from "d3-shape";

export const C = {
  sky: "var(--c-sky)", orange: "var(--c-orange)", navy: "var(--c-navy)", teal: "var(--c-teal)",
  purple: "var(--c-purple)", pink: "var(--c-pink)", lime: "var(--c-lime)", grey: "var(--c-grey)",
  red: "var(--c-red)", green: "var(--c-green)",
};

export function useSize() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const fmtDefault = (v) => {
  if (typeof v !== "number") return v;
  const a = Math.abs(v);
  if (a >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (a >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (a >= 10 || v === 0) return `${Math.round(v * 10) / 10}`;
  if (a >= 1) return v.toFixed(1).replace(/\.0$/, "");
  return v.toPrecision(2);
};

function makeScale(type, domain, range, padding) {
  if (type === "band") return scaleBand().domain(domain).range(range).padding(padding ?? 0.25);
  if (type === "log") return scaleLog().domain(domain).range(range).clamp(true);
  return scaleLinear().domain(domain).range(range).nice();
}

/**
 * Generic responsive chart frame. Children is a render function receiving scales.
 * tooltip({px, py, x, y}) -> { left, top, content } | null
 */
export function Plot({
  height = 260, xDomain, yDomain, xType = "linear", yType = "linear", xTicks = 6, yTicks = 5,
  xFormat = fmtDefault, yFormat = fmtDefault, xLabel, yLabel, margin, children, tooltip, bandPadding,
  xTickValues, yTickValues, hideXAxis, ariaLabel, noNice,
}) {
  const [ref, width] = useSize();
  const [hover, setHover] = useState(null);
  const m = { top: 12, right: 14, bottom: xLabel ? 44 : 30, left: yLabel ? 58 : 44, ...margin };
  const iw = Math.max(10, width - m.left - m.right);
  const ih = Math.max(10, height - m.top - m.bottom);
  const x = makeScale(xType, xDomain, [0, iw], bandPadding);
  const y = makeScale(yType, yDomain, [ih, 0]);
  if (noNice && xType === "linear") x.domain(xDomain);
  const xt = xTickValues || (xType === "band" ? x.domain() : x.ticks(Math.max(2, Math.min(xTicks, Math.floor(iw / 60)))));
  const yt = yTickValues || (yType === "log" ? y.ticks(4) : y.ticks(yTicks));
  const xPos = (v) => (xType === "band" ? x(v) + x.bandwidth() / 2 : x(v));

  const onMove = (e) => {
    if (!tooltip) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - m.left, py = e.clientY - r.top - m.top;
    if (px < 0 || px > iw || py < 0 || py > ih) return setHover(null);
    setHover(tooltip({ px, py, x, y }));
  };

  return (
    <div className="plot" ref={ref} style={{ height }} role="img" aria-label={ariaLabel}>
      {width > 0 && (
        <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <g transform={`translate(${m.left},${m.top})`}>
            {yt.map((t) => (
              <g key={`y${t}`} transform={`translate(0,${y(t)})`}>
                <line x2={iw} className="gridline" />
                <text x={-8} dy="0.32em" textAnchor="end" className="tick">{yFormat(t)}</text>
              </g>
            ))}
            {!hideXAxis && xt.map((t, i) => (
              <text key={`x${i}`} x={xPos(t)} y={ih + 18} textAnchor="middle" className="tick">{xFormat(t)}</text>
            ))}
            <line y1={ih} y2={ih} x2={iw} className="axis" />
            {children({ x, y, iw, ih, xPos })}
            {hover?.crosshair != null && <line x1={hover.crosshair} x2={hover.crosshair} y2={ih} className="crosshair" />}
            {hover?.marks}
          </g>
          {xLabel && <text x={m.left + iw / 2} y={height - 6} textAnchor="middle" className="axis-label">{xLabel}</text>}
          {yLabel && (
            <text transform={`translate(14,${m.top + ih / 2}) rotate(-90)`} textAnchor="middle" className="axis-label">{yLabel}</text>
          )}
        </svg>
      )}
      {hover?.content && (
        <div className="tooltip" style={{
          left: Math.min(Math.max(hover.left + m.left, 70), width - 70),
          top: Math.max(hover.top + m.top - 12, 0),
        }}>{hover.content}</div>
      )}
    </div>
  );
}

export function Line({ data, x, y, color = C.sky, width = 2.5, dash, curve = true, opacity = 1 }) {
  const gen = d3line().defined((d) => d[1] != null && isFinite(d[1])).x((d) => x(d[0])).y((d) => y(d[1]));
  if (curve) gen.curve(curveMonotoneX);
  return <path d={gen(data)} fill="none" style={{ stroke: color }} strokeWidth={width} strokeDasharray={dash}
    strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />;
}

export function Band({ data, x, y, color = C.sky, opacity = 0.18, curve = true }) {
  const gen = d3area().defined((d) => d[1] != null && d[2] != null).x((d) => x(d[0])).y0((d) => y(d[1])).y1((d) => y(d[2]));
  if (curve) gen.curve(curveMonotoneX);
  return <path d={gen(data)} style={{ fill: color }} opacity={opacity} />;
}

export function Dots({ data, x, y, r = 3, color = C.sky, opacity = 0.55, stroke }) {
  return (
    <g>
      {data.map((d, i) => (
        <circle key={i} cx={x(d[0])} cy={y(d[1])} r={r} style={{ fill: d[2] || color, stroke }} opacity={opacity} />
      ))}
    </g>
  );
}

/** Histogram style rectangles on a linear x scale: data = [[x0, x1, value, color?]] */
export function Rects({ data, x, y, color = C.sky, opacity = 0.9, radius = 3, gap = 1.5 }) {
  const y0 = y.range()[0];
  return (
    <g>
      {data.map(([a, b, v, c], i) => {
        const w = Math.max(0.5, x(b) - x(a) - gap);
        const h = Math.max(0, y0 - y(v));
        return <rect key={i} x={x(a) + gap / 2} y={y0 - h} width={w} height={h} rx={Math.min(radius, w / 2)}
          style={{ fill: c || color }} opacity={opacity} />;
      })}
    </g>
  );
}

/** Bars on a band scale. data = [{key, value, color}], optional group offset for grouped bars */
export function Bars({ data, x, y, color = C.sky, groups = 1, group = 0, radius = 6, opacity = 1 }) {
  const y0 = y(Math.max(y.domain()[0], 0));
  const bw = x.bandwidth() / groups;
  return (
    <g>
      {data.map((d, i) => {
        const v = d.value ?? 0;
        const top = y(Math.max(v, 0)), h = Math.abs(y(v) - y0);
        return <rect key={i} x={x(d.key) + group * bw + (groups > 1 ? 1 : 0)} y={v >= 0 ? top : y0}
          width={Math.max(1, bw - (groups > 1 ? 2 : 0))} height={h} rx={Math.min(radius, bw / 2.5)}
          style={{ fill: d.color || color }} opacity={opacity} />;
      })}
    </g>
  );
}

export function HLine({ y, value, iw, label, color = C.grey, dash = "5 4" }) {
  return (
    <g>
      <line x1={0} x2={iw} y1={y(value)} y2={y(value)} style={{ stroke: color }} strokeDasharray={dash} strokeWidth={1.5} />
      {label && <text x={iw - 4} y={y(value) - 6} textAnchor="end" className="ref-label">{label}</text>}
    </g>
  );
}

export function VLine({ x, value, ih, label, color = C.grey, dash = "5 4" }) {
  return (
    <g>
      <line x1={x(value)} x2={x(value)} y1={0} y2={ih} style={{ stroke: color }} strokeDasharray={dash} strokeWidth={1.5} />
      {label && <text x={x(value) + 6} y={12} className="ref-label">{label}</text>}
    </g>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label} className="legend-item">
          <span className={`swatch ${it.type || "box"}`} style={{ background: it.type === "line" || it.type === "dash" ? "transparent" : it.color, borderColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Nearest point helper for tooltips on numeric x. */
export function nearest(arr, px, x, accessor = (d) => d[0]) {
  let best = null, bd = Infinity;
  for (const d of arr) {
    const dist = Math.abs(x(accessor(d)) - px);
    if (dist < bd) { bd = dist; best = d; }
  }
  return best;
}

export function bandIndex(x, px) {
  const dom = x.domain();
  const step = x.step();
  const i = Math.floor((px - x(dom[0]) + (step - x.bandwidth()) / 2) / step);
  return i >= 0 && i < dom.length ? dom[i] : null;
}

/** Correlation heat map */
export function Heatmap({ labels, matrix, short }) {
  const color = (v) => {
    const a = Math.min(1, Math.abs(v));
    return v >= 0 ? `rgba(247,129,46,${0.08 + a * 0.85})` : `rgba(59,154,225,${0.08 + a * 0.85})`;
  };
  return (
    <div className="heatmap" style={{ gridTemplateColumns: `minmax(90px,auto) repeat(${labels.length}, minmax(44px,1fr))` }}>
      <div />
      {labels.map((l, j) => <div key={`h${j}`} className="hm-head">{short?.[j] || l}</div>)}
      {matrix.map((row, i) => (
        <Fragment key={`r${i}`}>
          <div className="hm-row">{labels[i]}</div>
          {row.map((v, j) => (
            <div key={`c${i}-${j}`} className="hm-cell" title={`${labels[i]} × ${labels[j]}: r = ${v.toFixed(3)}`}
              style={{ background: color(v), color: Math.abs(v) > 0.55 ? "#fff" : "var(--text)" }}>
              {v.toFixed(2)}
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
