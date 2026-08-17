"""Scheduled retrainer with a promotion gate.

Rebuilds the labeled dataset (make_real_dataset) and trains a candidate
model. The candidate only replaces `models/artifact.joblib` if it is at
least as calibrated and accurate as the incumbent (see --promote in
train.py). Every decision is appended to models/promotions.jsonl.

With `--benchmark-gate` the benchmark is regenerated and checked against
`models/benchmark_baseline.json` first; a regression aborts the retrain so a
bad candidate can never be trained on top of a regressed benchmark.

Usage:
    python retrain.py                     # real POWER data, persistence model
    python retrain.py --force             # bypass the promotion gate
    python retrain.py --benchmark-gate    # + abort if benchmark regressed
"""
import argparse
import subprocess
import sys

DEFAULTS = {
    "dataset": "data/real_labeled.csv",
    "model": "persistence",
    "folds": 4,
    "out": "models/artifact.joblib",
}


def main(argv=None):
    ap = argparse.ArgumentParser(description="PERN AI scheduled retrainer (gated)")
    ap.add_argument("--force", action="store_true", help="bypass the promotion gate")
    ap.add_argument("--skip-etl", action="store_true", help="reuse existing dataset")
    ap.add_argument("--benchmark-gate", action="store_true",
                    help="run the benchmark gate before retraining; abort on regression")
    args, rest = ap.parse_known_args(argv)

    if args.benchmark_gate and not args.force:
        r = subprocess.run([sys.executable, "run_benchmark_gate.py"], cwd=".")
        if r.returncode != 0:
            print("benchmark gate failed; retrain aborted", file=sys.stderr)
            return r.returncode

    if not args.skip_etl:
        r = subprocess.run([sys.executable, "make_real_dataset.py"], check=False)
        if r.returncode != 0:
            print("make_real_dataset.py failed; aborting retrain", file=sys.stderr)
            return r.returncode

    cmd = [
        sys.executable,
        "train.py",
        "--dataset", DEFAULTS["dataset"],
        "--model", DEFAULTS["model"],
        "--folds", str(DEFAULTS["folds"]),
        "--out", DEFAULTS["out"],
    ]
    if not args.force:
        cmd.append("--promote")
    cmd.extend(rest)
    return subprocess.call(cmd)


if __name__ == "__main__":
    sys.exit(main())
