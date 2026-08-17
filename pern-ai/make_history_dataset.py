"""Backfill a multi-year NASA POWER history dataset for Phase 1.

Fetches N years of daily meteorology for every Nile Delta grid point (same
16-point grid and column schema as make_real_dataset.py) and labels each day
with the NEXT day's observed T2M, so the same eval pipeline can run over a
multi-year record. Multi-year coverage is what makes the ClimateNormals fit
meaningful (per-day-of-year means across years) instead of a single-season
window.

Usage:
    python make_history_dataset.py [--years 2] [--out data/real_history.csv]
"""
import argparse
import os
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd

from make_real_dataset import PARAMS, fetch_daily

LATS = [30.0, 30.5, 31.0, 31.5]
LNGS = [30.5, 31.0, 31.5, 32.0]


def main(argv=None):
    ap = argparse.ArgumentParser(description="Multi-year NASA POWER backfill")
    ap.add_argument("--years", type=int, default=2)
    ap.add_argument("--out", default="data/real_history.csv")
    args = ap.parse_args(argv)

    end = date.today() - timedelta(days=2)
    start = end - timedelta(days=args.years * 365)

    rows = []
    fetched = 0
    failed = []
    for lat in LATS:
        for lng in LNGS:
            try:
                p = fetch_daily(lat, lng, start, end)
                fetched += 1
            except Exception as err:  # noqa: BLE001
                failed.append(f"{lat},{lng}: {err}")
                continue
            days = sorted(p.get("T2M", {}).keys())
            for i, day in enumerate(days):
                if i + 1 >= len(days):
                    continue
                next_day = days[i + 1]
                ts = date(int(day[:4]), int(day[4:6]), int(day[6:8]))
                rows.append({
                    "ts": pd.Timestamp(ts),
                    "latitude": lat,
                    "longitude": lng,
                    "feature_group": "agriculture",
                    "temperature": _num(p.get("T2M"), day),
                    "temperature_max": _num(p.get("T2M_MAX"), day),
                    "temperature_min": _num(p.get("T2M_MIN"), day),
                    "precipitation": _num(p.get("PRECTOTCORR"), day),
                    "humidity": _num(p.get("RH2M"), day),
                    "wind_speed": _num(p.get("WS2M"), day),
                    "month": ts.month,
                    "day_of_year": ts.timetuple().tm_yday,
                    "day_of_week": ts.weekday(),
                    "target": _num(p.get("T2M"), next_day),
                })

    df = pd.DataFrame(rows)
    df = df.dropna(subset=["target", "temperature", "humidity", "wind_speed"]).reset_index(drop=True)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    df.to_csv(args.out, index=False)

    print(f"sites fetched: {fetched} | failed: {len(failed)}")
    for f in failed[:5]:
        print(f"  FAIL {f}", file=sys.stderr)
    print(f"rows: {len(df)} | date range: {df['ts'].min().date()} .. {df['ts'].max().date()}")
    print(f"sites in record: {df.groupby(['latitude', 'longitude']).size().to_dict()}")
    print(f"target mean {df['target'].mean():.2f} std {df['target'].std():.2f}")
    print(f"wrote -> {args.out}")
    return 0


def _num(mapping, day):
    v = mapping.get(day)
    if v is None:
        return float("nan")
    try:
        f = float(v)
    except (TypeError, ValueError):
        return float("nan")
    if not np.isfinite(f) or f <= -100:
        return float("nan")
    return f


if __name__ == "__main__":
    sys.exit(main())
