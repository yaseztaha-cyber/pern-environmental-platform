"""Phase-2 live NWP snapshot accumulator.

Writes today's Open-Meteo 16-day forecast for the agriculture grid points to
data/nwp_live/YYYY-MM-DD.csv (one snapshot per init day).  The Phase-2 exit
gate (7d >=80%, 30d >=65%, CRPS(blend) < CRPS(anomaly)) is measured by
`eval_nwp.py --live` once ~3+ weeks of snapshots have accumulated, so each
issued forecast has had time to verify against realized POWER observations.

Run daily (cron / scheduled container); idempotent per init day.
"""
import argparse
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
AGR_CSV = DATA / "real_history_3y.csv"
NWP_LIVE = DATA / "nwp_live"


def grid_points(df):
    df2 = df.copy()
    df2["ts"] = pd.to_datetime(df2["ts"])
    return [(float(g.latitude.iloc[0]), float(g.longitude.iloc[0]))
            for _, g in df2.sort_values("ts").groupby(["latitude", "longitude"], sort=False)]


def write_snapshot(init_date, days=16):
    # The live forecast comes from the backend adapter (open-meteo-source.js).
    # Mirror its request here so the Python harness and the served feature
    # group read the same NWP values.
    import urllib.request
    import json as _json

    df = pd.read_csv(AGR_CSV)
    points = grid_points(df)
    start = init_date.isoformat()
    url = ("https://api.open-meteo.com/v1/forecast?"
           "latitude={lat}&longitude={lng}&daily="
           "temperature_2m_mean,temperature_2m_max,temperature_2m_min&"
           "timezone=UTC&forecast_days={n}")
    rows = []
    for lat, lng in points:
        with urllib.request.urlopen(url.format(lat=lat, lng=lng, n=days), timeout=90) as r:
            body = _json.loads(r.read())
        daily = body["daily"]
        for i, day in enumerate(daily["time"]):
            rows.append({
                "init_date": start,
                "valid_date": day,
                "latitude": lat,
                "longitude": lng,
                "nwp_mean": daily["temperature_2m_mean"][i],
                "nwp_max": daily["temperature_2m_max"][i],
                "nwp_min": daily["temperature_2m_min"][i],
            })
    out = pd.DataFrame(rows)
    out.to_csv(NWP_LIVE / f"{start}.csv", index=False)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", type=date.fromisoformat, default=date.today())
    ap.add_argument("--days", type=int, default=16)
    args = ap.parse_args()

    NWP_LIVE.mkdir(parents=True, exist_ok=True)
    out = write_snapshot(args.date, args.days)
    print(f"wrote -> {NWP_LIVE / (args.date.isoformat() + '.csv')} "
          f"({len(out)} rows, {out.valid_date.min()} .. {out.valid_date.max()})")


if __name__ == "__main__":
    main()
