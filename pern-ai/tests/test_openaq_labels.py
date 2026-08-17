import json

import numpy as np
import pandas as pd
import pytest

from fetch_openaq_labels import (
    build_labeled_frame,
    build_synthetic,
    daily_mean,
    fetch_site_hourly,
    site_grid,
)


def _loc_response():
    return {
        "results": [{
            "id": 42,
            "name": "Cairo Grid Test",
            "coordinates": {"latitude": 30.0, "longitude": 30.5},
        }]
    }


def _meas_response(days=3):
    results = []
    for d in range(days):
        for h in range(2):
            results.append({
                "parameter": "pm25",
                "value": 20.0 + d + h,
                "period": {"from": f"2026-04-13T0{h}:00:00Z",
                           "to": f"2026-04-13T0{h}:59:00Z"},
            })
    return {"results": results, "meta": {"found": len(results)}}


def _fake_urlopen(bodies):
    """urlopen factory returning queued JSON bodies for each call."""
    calls = []
    it = iter(bodies)

    def urlopen(req, timeout=60):
        calls.append(req)
        body = next(it)
        return _Resp(body)

    urlopen.calls = calls
    return urlopen


class _Resp:
    def __init__(self, body):
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return json.dumps(self._body).encode("utf-8")


@pytest.fixture
def weather():
    rows = []
    for lat in (30.0, 30.5):
        for lng in (30.5, 31.0):
            for d in range(5):
                ts = pd.Timestamp("2026-04-13") + pd.Timedelta(days=d)
                rows.append({
                    "ts": ts, "latitude": lat, "longitude": lng,
                    "temperature": 25.0 + d, "humidity": 50.0, "wind_speed": 3.0,
                })
    return pd.DataFrame(rows)


def test_site_grid_matches_weather_sites(tmp_path):
    p = tmp_path / "weather.csv"
    rows = [
        {"ts": "2026-04-13", "latitude": 30.0, "longitude": 30.5, "temperature": 25.0,
         "humidity": 50.0, "wind_speed": 3.0, "target": 26.0},
        {"ts": "2026-04-14", "latitude": 30.0, "longitude": 30.5, "temperature": 26.0,
         "humidity": 51.0, "wind_speed": 3.1, "target": 27.0},
    ]
    pd.DataFrame(rows).to_csv(p, index=False)
    pts = site_grid(p)
    assert pts == [(30.0, 30.5)]


def test_daily_mean_aggregates_hourly_pairs():
    s = daily_mean([
        ("2026-04-13T00:00:00Z", 20.0),
        ("2026-04-13T12:00:00Z", 22.0),
        ("2026-04-14T00:00:00Z", 24.0),
    ])
    assert len(s) == 2
    assert abs(s.iloc[0] - 21.0) < 1e-9
    assert s.iloc[1] == 24.0


def test_fetch_site_hourly_parses_locations_and_params(tmp_path):
    urlopen = _fake_urlopen([_loc_response(), _meas_response(3), _meas_response(0),
                             _meas_response(0), _meas_response(0), _meas_response(0)])
    site = fetch_site_hourly(30.0, 30.5, "2026-04-13", "2026-04-15", "test-key", urlopen)
    assert site["location"]["id"] == 42
    assert len(site["pm25"]) == 6
    assert site["pm10"] == []
    assert "locations" in urlopen.calls[0].full_url


def test_fetch_site_hourly_no_location_returns_none():
    urlopen = _fake_urlopen([{"results": []}])
    assert fetch_site_hourly(30.0, 30.5, "2026-04-13", "2026-04-15", "test-key", urlopen) is None


def test_build_labeled_frame_joins_weather_and_target(weather):
    def pairs(base):
        return [(f"2026-04-{13 + d:02d}T0{h}:00:00Z", base + d + h)
                for d in range(4) for h in range(2)]

    site_data = {
        (30.0, 30.5): {"location": {"id": 1}, "pm25": pairs(20.0),
                       "pm10": [], "no2": [], "so2": [], "o3": []},
        (30.5, 31.0): {"location": {"id": 2}, "pm25": pairs(40.0),
                       "pm10": [], "no2": [], "so2": [], "o3": []},
    }
    df = build_labeled_frame(site_data, weather, "2026-04-13", "2026-04-17")
    assert len(df) > 0
    assert set(["ts", "latitude", "longitude", "feature_group", "pm25", "target",
                "month", "day_of_year", "day_of_week"]).issubset(df.columns)
    # pm25 present for first day, NaN for the last day without data
    first = df[(df["latitude"] == 30.0) & (df["ts"] == "2026-04-13")].iloc[0]
    assert first["pm25"] > 0
    assert df["temperature"].notna().all()
    # target == next day pm25 for same site
    day1 = df[(df["latitude"] == 30.0) & (df["ts"] == "2026-04-13")].iloc[0]
    day2 = df[(df["latitude"] == 30.0) & (df["ts"] == "2026-04-14")].iloc[0]
    assert abs(day1["target"] - day2["pm25"]) < 1e-9
    assert df["feature_group"].eq("air").all()


def test_build_synthetic_emits_same_schema(tmp_path):
    out = tmp_path / "air.csv"
    df = build_synthetic("2026-04-13", "2026-04-30", out)
    assert out.exists()
    expected = {"ts", "latitude", "longitude", "feature_group", "temperature", "humidity",
                "wind_speed", "pm25", "pm10", "no2", "so2", "o3",
                "month", "day_of_year", "day_of_week", "target"}
    assert expected.issubset(set(df.columns))
    assert df["feature_group"].eq("air").all()
    assert df["target"].notna().all()
