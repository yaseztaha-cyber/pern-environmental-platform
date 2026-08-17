"""CI/nightly entrypoint: regenerate the benchmark, then gate it.

Runs benchmark_competitors.py (no --lock) followed by check_benchmark.py.
Exits non-zero if the benchmark regressed vs models/benchmark_baseline.json —
the "living contract" gate from Phase 0 of the accuracy plan.

Usage (CI, nightly cron, or pre-deploy):
    python run_benchmark_gate.py
    python run_benchmark_gate.py --skip-benchmark   # gate only, reuse latest json
    python run_benchmark_gate.py --lock             # regenerate AND re-lock baseline
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-benchmark", action="store_true",
                    help="skip benchmark_competitors.py; gate the existing benchmark.json")
    ap.add_argument("--lock", action="store_true",
                    help="re-lock the baseline after regenerating (only when the new "
                         "numbers are intentional)")
    args = ap.parse_args(argv)

    if not args.skip_benchmark:
        cmd = [sys.executable, "benchmark_competitors.py"]
        if args.lock:
            cmd.append("--lock")
        r = subprocess.run(cmd, cwd=ROOT)
        if r.returncode != 0:
            print("benchmark_competitors.py failed; gate aborted", file=sys.stderr)
            return r.returncode

    r = subprocess.run([sys.executable, "check_benchmark.py", "--json"], cwd=ROOT)
    if r.returncode != 0:
        print("BENCHMARK GATE FAILED — see regression list above.", file=sys.stderr)
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
