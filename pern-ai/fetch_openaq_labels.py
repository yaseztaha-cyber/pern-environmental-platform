"""Fetch real OpenAQ PM2.5 daily labels for the AIR track (Phase 4).

Replaces the synthetic generator in make_real_air_dataset.py with a real
fetch+label pass once an OPENAQ_API_KEY is available, emitting the identical
output schema so the rest of the pipeline (eval_horizons --track air) is
unchanged:

    ts,latitude,longitude,feature_group,temperature,humidity,wind_speed,
    pm25,pm10,no2,so2,o3,month,day_of_year,day_of_week,target

Weather features are joined from data/real_history_3y.csv (same grid, same
window).  target = next day's PM2.5 (1-day-ahead forecasting task).

Without an OPENAQ_API_KEY (or on fetch failure) the script falls back to the
physically-plausible synthetic generator so the offline pipeline stays green.

Usage:
    python fetch_openaq_labels.py [--start 2023-08-11] [--end 2026-08-07]
                                  [--out data/air_labeled.csv]
Env:
    OPENAQ_API_KEY   optional v3 key; without it, labels stay synthetic.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
WEATHER_CSV = DATA / "real_history_3y.csv"
DEFAULT_OUT = DATA / "air_labeled.csv"

OPENAQ_BASE = "https://api.openaq.org/v3"
PAGE_SIZE = 1000
MAX_PAGES = 24  # 24 * 1000 hourly rows per site per param is ~24 years of coverage
SLEEP_SECS = 0.2


def site_grid(csv_path):
    df = pd.read_csv(csv_path)
    return [(float(g.latitude.iloc[0]), float(g.longitude.iloc[0]))
            for _, g in df.sort_values("ts").groupby(["latitude", "longitude"], sort=False)]


def _openaq_get(url, api_key, urlopen=urllib.request.urlopen):
    """GET a JSON endpoint with the X-API-Key header; raise on HTTP error."""
    req = urllib.request.Request(url, headers={"X-API-Key": api_key})
    with urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _find_location(lat, lng, api_key, urlopen=urllib.request.urlopen):
    qs = urllib.parse.urlencode({
        "coordinates": f"{lat},{lng}",
        "radius": 50000,  # 50 km
        "limit": 1,
    })
    body = _openaq_get(f"{OPENAQ_BASE}/locations?{qs}", api_key, urlopen)
    results = body.get("results") or []
    if not results:
        return None
    loc = results[0]
    return {"id": loc.get("id"), "name": loc.get("name"),
            "lat": (loc.get("coordinates") or {}).get("latitude"),
            "lng": (loc.get("coordinates") or {}).get("longitude")}


def _fetch_measurements(loc_id, parameter, start, end, api_key, urlopen=urllib.request.urlopen):
    """Fetch hourly measurements for one parameter, paged, from a location."""
    rows = []
    offset = 0
    for _ in range(MAX_PAGES):
        qs = urllib.parse.urlencode({
            "parameter": parameter,
            "datetime_from": start,
            "datetime_to": end,
            "limit": PAGE_SIZE,
            "offset": offset,
        })
        body = _openaq_get(
            f"{OPENAQ_BASE}/locations/{loc_id}/measurements?{qs}", api_key, urlopen)
        results = body.get("results") or []
        if not results:
            break
        for r in results:
            value = r.get("value")
            period = r.get("period") or {}
            ts = period.get("from") or period.get("datetime")
            if ts is not None and value is not None:
                rows.append((ts, float(value)))
        meta = body.get("meta") or {}
        found = int(meta.get("found") or len(rows))
        offset += len(results)
        if offset >= found:
            break
        time.sleep(SLEEP_SECS)
    return rows


def fetch_site_hourly(lat, lng, start, end, api_key, urlopen=urllib.request.urlopen):
    """Nearest OpenAQ location -> {param: [(datetime, value), ...]} for the window."""
    loc = _find_location(lat, lng, api_key, urlopen)
    if not loc:
        return None
    out = {"location": loc}
    for param in ("pm25", "pm10", "no2", "so2", "o3"):
        try:
            out[param] = _fetch_measurements(loc["id"], param, start, end, api_key, urlopen)
        except Exception:
            out[param] = []
    return out


def daily_mean(raw_pairs):
    """Average a list of (iso-datetime, value) pairs to a daily Series indexed by date."""
    if not raw_pairs:
        return pd.Series(dtype=float)
    df = pd.DataFrame(raw_pairs, columns=["ts", "value"])
    df["ts"] = pd.to_datetime(df["ts"]).dt.tz_localize(None)
    return df.groupby(df["ts"].dt.normalize())["value"].mean()


def build_labeled_frame(site_data, weather_df, start, end):
    """Join daily PM2.5 labels with weather features; add date features + target."""
    idx = pd.date_range(start=pd.Timestamp(start), end=pd.Timestamp(end), freq="D")
    frames = []
    for (lat, lng), site in site_data.items():
        joined = pd.DataFrame(index=idx)
        for param in ("pm25", "pm10", "no2", "so2", "o3"):
            joined[param] = daily_mean(site.get(param) or []).reindex(idx)
        joined["latitude"] = lat
        joined["longitude"] = lng
        frames.append(joined)
    df = pd.concat(frames)
    df = df.reset_index().rename(columns={"index": "ts"})
    df["ts"] = pd.to_datetime(df["ts"])

    w = weather_df[["ts", "latitude", "longitude", "temperature", "humidity", "wind_speed"]].copy()
    w["ts"] = pd.to_datetime(w["ts"])
    df = df.merge(w, on=["ts", "latitude", "longitude"], how="left")

    df["feature_group"] = "air"
    df["month"] = df["ts"].dt.month
    df["day_of_year"] = df["ts"].dt.dayofyear
    df["day_of_week"] = df["ts"].dt.weekday
    df = df.sort_values(["latitude", "longitude", "ts"]).reset_index(drop=True)
    df["target"] = df.groupby(["latitude", "longitude"])["pm25"].shift(-1)
    df = df.dropna(subset=["target"]).reset_index(drop=True)

    for col in ("pm25", "pm10", "no2", "so2", "o3"):
        df[col] = pd.to_numeric(df[col], errors="coerce").round(2)
    for col in ("temperature", "humidity", "wind_speed"):
        df[col] = pd.to_numeric(df[col], errors="coerce").round(2)

    cols = ["ts", "latitude", "longitude", "feature_group", "temperature", "humidity",
            "wind_speed", "pm25", "pm10", "no2", "so2", "o3",
            "month", "day_of_year", "day_of_week", "target"]
    return df[cols]


def build_synthetic(start, end, out_path):
    """Fallback: physically-plausible synthetic labels (identical schema)."""
    from make_real_air_dataset import make_air_days
    days = int((pd.Timestamp(end) - pd.Timestamp(start)).days) + 1
    rows = make_air_days(days=days)
    df = pd.DataFrame(rows)
    # Align dates to the requested window so the weather join is consistent.
    df["ts"] = pd.Timestamp(start) + (df["ts"] - df["ts"].min())
    df["target"] = df.groupby(["latitude", "longitude"])["pm25"].shift(-1)
    df = df.dropna(subset=["target"]).reset_index(drop=True)
    df.to_csv(out_path, index=False)
    return df


def main(argv=None):
    ap = argparse.ArgumentParser(description="Fetch real OpenAQ labels for the AIR track")
    ap.add_argument("--start", default="2023-08-11")
    ap.add_argument("--end", default="2026-08-07")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--api-key", default=os.environ.get("OPENAQ_API_KEY", ""))
    args = ap.parse_args(argv)

    weather = pd.read_csv(WEATHER_CSV)
    points = site_grid(WEATHER_CSV)

    if not args.api_key:
        print("[OpenAQ] no OPENAQ_API_KEY -> using synthetic labels (fallback)", file=sys.stderr)
        df = build_synthetic(args.start, args.end, args.out)
    else:
        site_data = {}
        n_ok = 0
        for lat, lng in points:
            try:
                site = fetch_site_hourly(lat, lng, args.start, args.end, args.api_key)
            except Exception as exc:
                print(f"[OpenAQ] {lat},{lng} failed: {exc}", file=sys.stderr)
                site = None
            if site and (site.get("pm25")):
                site_data[(lat, lng)] = site
                n_ok += 1
            time.sleep(SLEEP_SECS)
        if not site_data:
            print("[OpenAQ] no fetchable locations -> synthetic labels (fallback)", file=sys.stderr)
            df = build_synthetic(args.start, args.end, args.out)
        else:
            df = build_labeled_frame(site_data, weather, args.start, args.end)
            df.to_csv(args.out, index=False)
            print(f"[OpenAQ] {n_ok}/{len(points)} sites with real labels")

    print(f"rows: {len(df)} | sites: {df.groupby(['latitude', 'longitude']).ngroups}")
    print(f"pm25 mean {df['pm25'].mean():.2f} std {df['pm25'].std():.2f} "
          f"| target std {df['target'].std():.2f} | NaN pm25: {int(df['pm25'].isna().sum())}")
    print(f"wrote -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
