"""Print the key numbers of the analysis as Markdown - paste them into the slides or paper.

    python backend/scripts/report.py > results.md
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.analysis import engine  # noqa: E402


def f(x, d=3):
    return "-" if x is None else f"{x:.{d}f}"


def main() -> None:
    a = engine.ensure().analysis
    m = a["meta"]
    print(f"# Results - {m['location']}\n")
    print(f"Data: {m['source']}, {m['start']} to {m['end']} ({m['n_days']:,} days)"
          + ("  **SYNTHETIC - not real observations**" if m.get("synthetic") else "") + "\n")

    print("## Descriptive statistics\n\n| Variable | Mean | SD | Skew | Min | Max |\n|---|---|---|---|---|---|")
    for s in a["descriptive"]["summary"]:
        print(f"| {s['label']} | {f(s['mean'],2)} | {f(s['sd'],2)} | {f(s['skewness'],2)} | {f(s['min'],1)} | {f(s['max'],1)} |")

    d = a["distribution"]
    print(f"\n## Distribution of wet-day rainfall (excess over {d['wet_threshold_mm']} mm)\n")
    print(f"P(wet day) = {f(d['p_wet'])}; best fit by AIC: **{d['best']}**\n")
    print("| Distribution | AIC | KS D | KS p | Chi-square p |\n|---|---|---|---|---|")
    for c in d["candidates"]:
        print(f"| {c['name']} | {c['aic']:.0f} | {f(c['ks_stat'])} | {c['ks_p']:.3g} | {c['chi_square']['p']:.3g} |")
    pz = d["poisson"]
    print(f"\nHeavy-rain days (>= {pz['threshold_mm']} mm) per year: lambda = {f(pz['lambda'],2)}, "
          f"dispersion = {f(pz['dispersion'],2)} (p = {f(pz['dispersion_p'])})")

    mk = a["markov"]
    o = mk["overall"]
    print("\n## Markov chain (Dry/Wet)\n")
    print(f"P = [[{f(o['P'][0][0])}, {f(o['P'][0][1])}], [{f(o['P'][1][0])}, {f(o['P'][1][1])}]]; "
          f"stationary P(wet) = {f(o['stationary'][1])} (observed {f(o['observed_wet_fraction'])})")
    print(f"Independence test: chi2 = {o['test']['chi2']:.1f}, p = {o['test']['p']:.3g}")
    ev = mk["evaluation"]
    print(f"Next-day forecast (test years): Brier = {f(ev['brier'])}, climatology = {f(ev['brier_climatology'])}, "
          f"skill = {f(ev['brier_skill'])}, accuracy = {f(ev['accuracy'])}")

    r = a["regression"]
    print(f"\n## Multiple linear regression (train {r['split']['train_years']}, test {r['split']['test_years']})\n")
    print("| Model | Predictors | R² | Adj. R² | AIC | Test RMSE | Skill vs climatology | 95% PI coverage |\n|---|---|---|---|---|---|---|---|")
    for mo in r["models"]:
        t, sm = mo["test"], mo["summary"]
        print(f"| {mo['name']} | {sm['p']} | {f(sm['r2'])} | {f(sm['adj_r2'])} | {sm['aic']:.0f} | {f(t['rmse'],2)} | "
              f"{t['skill_vs_climatology']*100:+.1f}% | {t['pi_coverage']*100:.1f}% |")
    print("\nNested F-tests (do the added predictors help?):\n\n| Reduced → full | q | F | p | ΔR² |\n|---|---|---|---|---|")
    for nt in r["nested_tests"]:
        print(f"| {nt['reduced']} → {nt['full']} | {nt['q']} | {nt['F']:.1f} | {nt['p']:.3g} | {nt['delta_r2']:+.3f} |")
    sel = r["selection"]
    print(f"\nBackward elimination (alpha = {sel['alpha']}): removed {sel['removed'] or 'nothing'}")
    ext = next(mo for mo in r["models"] if mo["key"] == "extended")
    sm = ext["summary"]
    print(f"\nExtended model coefficients (Durbin-Watson {sm['durbin_watson']:.2f}, Breusch-Pagan LM {sm['breusch_pagan']['lm']:.0f}, "
          f"p {sm['breusch_pagan']['p']:.3g}):\n\n| Term | Estimate | SE | Robust SE (HC3) | t | p | Std. beta |\n|---|---|---|---|---|---|---|")
    for c in sm["coefficients"]:
        print(f"| {c['label']} | {f(c['estimate'],4)} | {f(c['se'],4)} | {f(c['se_hc3'],4)} | {f(c['t'],2)} | {c['p']:.3g} | "
              f"{'' if c['standardized'] is None else f(c['standardized'],3)} |")
    print("\nVIF: " + ", ".join(f"{v['symbol']} {v['vif']:.2f}" for v in r["vif"]))
    print("Skill by test year: " + ", ".join(f"{y['year']}: {y['skill']*100:+.0f}%" for y in ext["test"]["per_year"]))

    s = a["simulation"]
    print(f"\n## Monte Carlo ({s['n_years']} simulated years)\n")
    for k in ["annual", "monsoon"]:
        x = s[k]
        print(f"- {k}: simulated mean {x['mean']:.0f} mm (SD {x['sd']:.0f}), observed mean {f(x['observed_mean'],0)} "
              f"(SD {f(x['observed_sd'],0)}); {x['observed_within_90']*100:.0f}% of observed years inside the 90% band")

    if a.get("validation"):
        print("\n## Parameter recovery (synthetic data)\n\n| Parameter | True | Estimated |\n|---|---|---|")
        for row in a["validation"]["rows"]:
            print(f"| {row['parameter']} | {f(row['true'])} | {f(row['estimated'])} |")


if __name__ == "__main__":
    main()
