"""Benchmark gate: fail when the latest benchmark regresses vs the baseline lock.

Compares the current models/benchmark.json against models/benchmark_baseline.json
(created by `benchmark_competitors.py --lock`) per (track, horizon, center):

  - tolerance accuracy at the ±3 °F yardstick: must not drop > tol_acc_pts
  - coverage: must not drop > tol_cov_pts
  - RMSE: must not rise > tol_rmse_pct (relative)
  - interval width: must not rise > tol_width_pct (relative)
  - confidence: must not drop > tol_conf_pts
  - skill vs climatology: must not drop > tol_ss

Exit code 0 = gate passed, 1 = regression(s), 2 = usage/structural error.
Used by CI/nightly so a PR or retrain that moves any metric the wrong way fails.

Usage:
    python check_benchmark.py [--latest models/benchmark.json]
                              [--baseline models/benchmark_baseline.json]
                              [--json]
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
YARDSTICK_C = 1.667  # must match benchmark_competitors.YARDSTICK_C
TOL3 = str(YARDSTICK_C)

# Default failure thresholds (tunable per call).
DEFAULTS = {
    "tol_acc_pts": 0.02,   # absolute (e.g. 0.9588 -> 0.94 fails)
    "tol_cov_pts": 0.02,   # absolute coverage
    "tol_rmse_pct": 0.02,  # relative rise allowed
    "tol_width_pct": 0.02, # relative rise allowed
    "tol_conf_pts": 3.0,   # absolute confidence points
    "tol_ss": 0.05,        # absolute skill-score drop
}


def flatten(bench):
    """{(track, horizon, center): {metric: value}}."""
    out = {}
    for name, tr in bench["pern"].items():
        for hk, row in tr.items():
            h = int(hk.replace("d", ""))
            for center, r in row.items():
                acc = r.get("accuracy_within", {})
                out[(name, h, center)] = {
                    "rmse": r.get("rmse"),
                    "coverage": r.get("coverage"),
                    "interval_width": r.get("interval_width"),
                    "confidence": r.get("confidence"),
                    "tol3_accuracy": acc.get(TOL3),
                    "skill_vs_climatology": r.get("skill_vs_climatology"),
                }
    return out


def check(base, latest, cfg):
    failures = []
    for key, b in base.items():
        if key not in latest:
            failures.append((key, "missing-in-latest", b.get("rmse"), None))
            continue
        l = latest[key]
        if b.get("rmse") and l.get("rmse") is not None and l["rmse"] > b["rmse"] * (1 + cfg["tol_rmse_pct"]):
            failures.append((key, "rmse-up", b["rmse"], l["rmse"]))
        if b.get("coverage") and l.get("coverage") is not None and l["coverage"] < b["coverage"] - cfg["tol_cov_pts"]:
            failures.append((key, "coverage-down", b["coverage"], l["coverage"]))
        if b.get("interval_width") and l.get("interval_width") is not None and l["interval_width"] > b["interval_width"] * (1 + cfg["tol_width_pct"]):
            failures.append((key, "width-up", b["interval_width"], l["interval_width"]))
        if b.get("confidence") and l.get("confidence") is not None and l["confidence"] < b["confidence"] - cfg["tol_conf_pts"]:
            failures.append((key, "confidence-down", b["confidence"], l["confidence"]))
        if b.get("tol3_accuracy") and l.get("tol3_accuracy") is not None and l["tol3_accuracy"] < b["tol3_accuracy"] - cfg["tol_acc_pts"]:
            failures.append((key, "tol3-accuracy-down", b["tol3_accuracy"], l["tol3_accuracy"]))
        if b.get("skill_vs_climatology") is not None and l.get("skill_vs_climatology") is not None and l["skill_vs_climatology"] < b["skill_vs_climatology"] - cfg["tol_ss"]:
            failures.append((key, "skill-down", b["skill_vs_climatology"], l["skill_vs_climatology"]))
    return failures


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--latest", default=ROOT / "models" / "benchmark.json")
    ap.add_argument("--baseline", default=ROOT / "models" / "benchmark_baseline.json")
    ap.add_argument("--json", action="store_true")
    for name, default in DEFAULTS.items():
        ap.add_argument(f"--{name}", type=float, default=default)
    args = ap.parse_args()

    def load(p):
        if not Path(p).exists():
            print(f"error: {p} not found (run benchmark_competitors.py [--lock] first)", file=sys.stderr)
            sys.exit(2)
        return json.loads(Path(p).read_text(encoding="utf-8"))

    base = flatten(load(args.baseline))
    latest = flatten(load(args.latest))
    cfg = {name: getattr(args, name) for name in DEFAULTS}
    failures = check(base, latest, cfg)

    if args.json:
        print(json.dumps({
            "gate": "fail" if failures else "pass",
            "checked": len(base),
            "regressions": [{"track": k[0], "horizon": k[1], "center": k[2],
                             "metric": m, "baseline": b, "latest": l}
                            for k, m, b, l in failures],
        }))
    else:
        print(f"benchmark gate: checked {len(base)} (track, horizon, center) rows")
        if not failures:
            print("PASS — no regressions vs baseline")
        else:
            print(f"FAIL — {len(failures)} regression(s):")
            for (track, h, center), metric, b, l in failures:
                print(f"  {track:>12} {h:>2}d {center:>12} {metric:>18}: {b} -> {l}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
