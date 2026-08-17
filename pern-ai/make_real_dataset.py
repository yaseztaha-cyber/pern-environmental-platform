"""Build a REAL labeled dataset from NASA POWER (keyless, agriculture track).

For each grid point in the Nile Delta bbox, fetches the last ~120 days of
daily meteorology (T2M/T2M_MAX/T2M_MIN/PRECTOTCORR/RH2M/WS2M) and labels each
day with the NEXT day's observed T2M — a genuine 1-day-ahead forecasting task
with the same feature names the model/API expect.

Usage:
    python make_real_dataset.py [--days 120] [--out data/real_labeled.csv]
"""
import argparse
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from datetime import date, timedelta

import numpy as np
import pandas as pd

BASE = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMS = ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "WS2M"]
LATS = [30.0, 30.5, 31.0, 31.5]
LNGS = [30.5, 31.0, 31.5, 32.0]


def fetch_daily(lat, lng, start, end):
    qs = urllib.parse.urlencode({
        "parameters": ",".join(PARAMS),
        "community": "AG",
        "format": "JSON",
        "latitude": f"{lat:.4f}",
        "longitude": f"{lng:.4f}",
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
    })
    url = f"{BASE}?{qs}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        body = json.load(resp)
    return body.get("properties", {}).get("parameter", {})


def _num(mapping, day):
    v = mapping.get(day)
    if v is None:
        return float("nan")
    try:
        f = float(v)
    except (TypeError, ValueError):
        return float("nan")
    # NASA POWER uses -999 as its "missing data" sentinel.
    if not math.isfinite(f) or f <= -100:
        return float("nan")
    return f


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build real labeled dataset from NASA POWER")
    ap.add_argument("--days", type=int, default=120)
    ap.add_argument("--out", default="data/real_labeled.csv")
    args = ap.parse_args(argv)

    end = date.today() - timedelta(days=2)
    start = end - timedelta(days=args.days)

    rows = []
    fetched = 0
    failed = []
    for lat in LATS:
        for lng in LNGS:
            try:
                p = fetch_daily(lat, lng, start, end)
                fetched += 1
            except Exception as err:
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
    print(f"NaN per column:\n{df.isna().sum()}")
    print(f"target mean {df['target'].mean():.2f} std {df['target'].std():.2f}")
    print(f"wrote -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
