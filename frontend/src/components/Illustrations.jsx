import { useId } from "react";

/** Soft 3D-style weather illustration. kind: sun | partly | cloud | rain | storm */
export function WeatherArt({ kind = "partly", size = 160 }) {
  const id = useId().replace(/:/g, "");
  const showSun = kind === "sun" || kind === "partly";
  const showCloud = kind !== "sun";
  const showRain = kind === "rain" || kind === "storm";
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 200 160" aria-hidden="true" className="weather-art">
      <defs>
        <radialGradient id={`sun${id}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#FFE58A" />
          <stop offset="60%" stopColor="#FFC23D" />
          <stop offset="100%" stopColor="#F79A1E" />
        </radialGradient>
        <linearGradient id={`cloud${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor={kind === "storm" ? "#AEB9CC" : "#D7E6F7"} />
        </linearGradient>
        <linearGradient id={`drop${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7CC3FF" />
          <stop offset="100%" stopColor="#2F80ED" />
        </linearGradient>
        <filter id={`sh${id}`} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#2B4C7E" floodOpacity="0.18" />
        </filter>
      </defs>
      {showSun && (
        <g filter={`url(#sh${id})`}>
          {[...Array(10)].map((_, i) => {
            const a = (i / 10) * Math.PI * 2;
            const cx = kind === "sun" ? 100 : 128, cy = kind === "sun" ? 78 : 56;
            return <line key={i} x1={cx + Math.cos(a) * 44} y1={cy + Math.sin(a) * 44} x2={cx + Math.cos(a) * 54} y2={cy + Math.sin(a) * 54}
              stroke="#FFC23D" strokeWidth="5" strokeLinecap="round" opacity="0.85" />;
          })}
          <circle cx={kind === "sun" ? 100 : 128} cy={kind === "sun" ? 78 : 56} r="36" fill={`url(#sun${id})`} />
        </g>
      )}
      {showCloud && (
        <g filter={`url(#sh${id})`}>
          <path d="M52 118 a26 26 0 0 1 4-51.6 a34 34 0 0 1 64.5-6.4 a24 24 0 0 1 30 22 a19 19 0 0 1-4.5 36z" fill={`url(#cloud${id})`} />
        </g>
      )}
      {showRain &&
        [56, 82, 108, 134].map((x, i) => (
          <path key={x} d={`M${x} ${128 + (i % 2) * 6} q-5 10 0 14 q5-4 0-14z`} fill={`url(#drop${id})`} transform={`rotate(14 ${x} 135)`} />
        ))}
      {kind === "storm" && <path d="M104 116 l-12 20 h10 l-6 18 l18-24 h-10 l8-14z" fill="#FFC23D" />}
    </svg>
  );
}

export function kindFromWeather({ rain_mm, cloud_pct, code }) {
  if (code != null) {
    if (code >= 95) return "storm";
    if (code >= 51) return "rain";
    if (code >= 3) return "cloud";
    if (code >= 1) return "partly";
    return "sun";
  }
  if (rain_mm >= 30) return "storm";
  if (rain_mm >= 1) return "rain";
  if (cloud_pct > 70) return "cloud";
  if (cloud_pct > 25) return "partly";
  return "sun";
}

/** Illustrated monsoon scene for the season card. */
export function MonsoonScene() {
  return (
    <svg viewBox="0 0 240 170" className="scene" aria-hidden="true">
      <defs>
        <linearGradient id="umb" x1="0" x2="1">
          <stop offset="0" stopColor="#F7812E" />
          <stop offset="1" stopColor="#E0601A" />
        </linearGradient>
      </defs>
      {[...Array(26)].map((_, i) => (
        <line key={i} x1={(i * 37) % 240} y1={(i * 53) % 120} x2={(i * 37) % 240 - 5} y2={((i * 53) % 120) + 14}
          stroke="#5A8F3C" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      ))}
      <path d="M0 150 q60 -24 120 -6 t120 -4 V170 H0z" fill="#9CCB6A" />
      <path d="M0 158 q70 -16 140 0 t100 0 V170 H0z" fill="#86BB52" />
      <g transform="translate(118 40)">
        <path d="M-52 34 a52 40 0 0 1 104 0 q-13-8-26 0 q-13-8-26 0 q-13-8-26 0 q-13-8-26 0z" fill="url(#umb)" />
        <line x1="0" y1="-6" x2="0" y2="-12" stroke="#1D2744" strokeWidth="3" strokeLinecap="round" />
        <path d="M0 30 v58 q0 10 -10 8" fill="none" stroke="#1D2744" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="0" cy="58" r="12" fill="#1D2744" opacity="0.9" />
        <rect x="-15" y="70" width="30" height="34" rx="12" fill="#1D2744" opacity="0.9" />
      </g>
      <g transform="translate(176 104)">
        <rect width="30" height="40" rx="6" fill="#B9C6D8" />
        <rect x="9" y="-8" width="12" height="10" rx="3" fill="none" stroke="#8C9AB0" strokeWidth="3" />
        <line x1="10" y1="8" x2="10" y2="34" stroke="#97A6BC" strokeWidth="2" />
        <line x1="20" y1="8" x2="20" y2="34" stroke="#97A6BC" strokeWidth="2" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="var(--c-orange)" />
      <path d="M15 30a6.5 6.5 0 0 1 1-12.9 9 9 0 0 1 17.3 2.3A5.5 5.5 0 0 1 33 30z" fill="#fff" />
      <path d="M18 34l-1.6 4M24.5 34l-1.6 4M31 34l-1.6 4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
