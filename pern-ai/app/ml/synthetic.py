"""Synthetic spatiotemporal dataset for pipeline smoke tests and offline dev.

Produces a labeled DataFrame with the same columns the real feature ETL will
emit (ts, latitude, longitude, feature_group, features..., target), with a
learnable seasonal + spatial structure.
"""
import numpy as np
import pandas as pd

BBOX = {"minLat": 29.5, "maxLat": 31.8, "minLng": 29.7, "maxLng": 32.5}


def make_synthetic(n_sites=12, days=180, seed=7, feature_group="agriculture"):
    rng = np.random.default_rng(seed)
    start = np.datetime64("2024-01-01")

    rows = []
    for s in range(n_sites):
        lat = BBOX["minLat"] + rng.random() * (BBOX["maxLat"] - BBOX["minLat"])
        lng = BBOX["minLng"] + rng.random() * (BBOX["maxLng"] - BBOX["minLng"])
        site_effect = rng.normal(0, 1.2)
        for d in range(days):
            ts = start + np.timedelta64(d, "D")
            doy = d % 365
            period = 40
            phase = 2 * np.pi * doy / period
            seasonal = 18 + 8 * np.sin(phase - 0.8)
            precipitation = max(0, rng.gamma(1.2, 2.0) + 0.5 + 2 * (1 + np.sin(phase)))
            humidity = 55 + 15 * np.sin(phase - 0.3) + rng.normal(0, 4)
            wind_speed = 3.5 + 1.2 * np.sin(phase) + rng.normal(0, 0.5)
            temperature = seasonal + site_effect + 0.3 * (humidity - 55) + rng.normal(0, 1.0)
            target = (
                0.55 * temperature
                + 0.18 * (humidity - 55)
                + 0.25 * wind_speed
                + 0.06 * precipitation
                - 0.4 * lat
                + 0.3 * np.sin(lng)
                + site_effect
                + rng.normal(0, 0.6)
            )
            rows.append({
                "ts": ts,
                "latitude": round(lat, 4),
                "longitude": round(lng, 4),
                "feature_group": feature_group,
                "temperature": round(temperature, 2),
                "precipitation": round(precipitation, 2),
                "humidity": round(humidity, 2),
                "wind_speed": round(wind_speed, 2),
                "month": int((doy % 365) // 30.4) + 1,
                "day_of_year": doy + 1,
                "target": round(target, 2),
            })
    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = make_synthetic()
    out = "data/synthetic_labeled.csv"
    import os

    os.makedirs("data", exist_ok=True)
    df.to_csv(out, index=False)
    print(f"wrote {len(df)} rows -> {out}")
