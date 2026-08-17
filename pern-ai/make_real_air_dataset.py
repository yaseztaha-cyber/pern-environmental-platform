"""Build a labeled dataset for the AIR track (pipeline-ready, synthetic labels).

Without an OPENAQ_API_KEY there is no ground truth for pollution, so this
generates physically-plausible PM2.5 series: an urban traffic baseline,
weekday/weekend modulation, wind-driven dilution, humidity effects and site
emission factors — the same columns and shape the real OpenAQ ETL emits. Each
day is labeled with the NEXT day's PM2.5 (1-day-ahead forecasting task).

When a real OPENAQ_API_KEY + daily labels exist, this generator is replaced by
a fetch+label pass with the identical output schema.

Usage:
    python make_real_air_dataset.py [--days 120] [--out data/air_labeled.csv]
"""
import argparse
import os
import sys

import numpy as np
import pandas as pd

LATS = [30.0, 30.5, 31.0, 31.5]
LNGS = [30.5, 31.0, 31.5, 32.0]


def make_air_days(days=120, seed=19):
    rng = np.random.default_rng(seed)
    end = pd.Timestamp.now().normalize() - pd.Timedelta(days=2)
    ts_range = pd.date_range(end=end, periods=days, freq="D")

    rows = []
    for lat in LATS:
        for lng in LNGS:
            site_emission = rng.uniform(0.7, 1.6)
            baseline = rng.uniform(55, 90)  # µg/m³ regional summer background
            for i, ts in enumerate(ts_range):
                doy = ts.dayofyear
                seasonal = baseline + 8 * np.sin(2 * np.pi * (doy - 200) / 365)
                weekday = 1.0 if ts.weekday() < 5 else 0.55  # weekend traffic drop
                wind = max(0.5, rng.normal(3.2, 1.4) + 1.5 * np.sin(2 * np.pi * doy / 40))
                humidity = 55 + 15 * np.sin(2 * np.pi * doy / 40 - 0.3) + rng.normal(0, 4)
                temperature = 27 + 5 * np.sin(2 * np.pi * doy / 40) + rng.normal(0, 1)
                pm25 = (
                    seasonal * site_emission * weekday / (1 + 0.35 * wind)
                    + 0.02 * (humidity - 55)
                    + rng.normal(0, 6)
                )
                pm25 = max(3.0, pm25)
                pm10 = pm25 * rng.uniform(1.5, 1.8)
                no2 = pm25 * rng.uniform(0.35, 0.5)
                so2 = max(1.0, pm25 * rng.uniform(0.05, 0.10))
                o3 = 40 + 30 * np.sin(2 * np.pi * doy / 365) + rng.normal(0, 8)
                rows.append({
                    "ts": ts,
                    "latitude": lat,
                    "longitude": lng,
                    "feature_group": "air",
                    "temperature": round(temperature, 2),
                    "humidity": round(humidity, 2),
                    "wind_speed": round(wind, 2),
                    "pm25": round(pm25, 2),
                    "pm10": round(pm10, 2),
                    "no2": round(no2, 2),
                    "so2": round(so2, 2),
                    "o3": round(o3, 2),
                    "month": ts.month,
                    "day_of_year": ts.dayofyear,
                    "day_of_week": ts.weekday(),
                })
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build labeled air dataset (synthetic labels)")
    ap.add_argument("--days", type=int, default=120)
    ap.add_argument("--out", default="data/air_labeled.csv")
    args = ap.parse_args(argv)

    df = pd.DataFrame(make_air_days(days=args.days))
    df["target"] = df.groupby(["latitude", "longitude"])["pm25"].shift(-1)
    df = df.dropna(subset=["target"]).reset_index(drop=True)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    df.to_csv(args.out, index=False)

    print(f"rows: {len(df)} | sites: {df.groupby(['latitude', 'longitude']).ngroups}")
    print(f"pm25 mean {df['pm25'].mean():.2f} std {df['pm25'].std():.2f} "
          f"| target std {df['target'].std():.2f}")
    print(f"wrote -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
