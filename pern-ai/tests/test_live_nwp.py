import numpy as np
import pandas as pd

from app.ml.synthetic import make_synthetic


def test_live_pairs_requires_verified_obs():
    """A snapshot whose valid dates fall past the obs history yields no pairs."""
    from eval_nwp import live_pairs

    df = make_synthetic(n_sites=2, days=30, seed=5)
    df["ts"] = pd.to_datetime(df["ts"])
    obs_end = df["ts"].max()
    sites = []
    geo = []
    df2 = df.copy()
    for (lat, lng), g in df2.groupby(["latitude", "longitude"], sort=False):
        sites.append((g["ts"].dt.to_pydatetime().tolist(),
                      g["target"].astype(float).tolist()))
        geo.append((float(lat), float(lng)))

    future_dates = pd.date_range(obs_end + pd.Timedelta(days=1), periods=5, freq="D")
    live = pd.DataFrame({
        "init_date": [obs_end.normalize()] * (2 * 5),
        "valid_date": list(future_dates) * 2,
        "latitude": [geo[0][0]] * 5 + [geo[1][0]] * 5,
        "longitude": [geo[0][1]] * 5 + [geo[1][1]] * 5,
        "nwp_mean": np.linspace(15.0, 18.0, 10),
        "nwp_max": np.linspace(20.0, 24.0, 10),
        "nwp_min": np.linspace(10.0, 12.0, 10),
    })

    for h in (1, 7, 30):
        cal, ev = live_pairs(sites, geo, live, h)
        assert len(cal) == 0 and len(ev) == 0


def test_live_pairs_uses_only_lead_h():
    """A verified j->k pair counts only for the exact h it spans."""
    from eval_nwp import live_pairs

    df = make_synthetic(n_sites=1, days=10, seed=6)
    df["ts"] = pd.to_datetime(df["ts"])
    sites = [(df["ts"].dt.to_pydatetime().tolist(),
              df["target"].astype(float).tolist())]
    geo = [(float(df["latitude"].iloc[0]), float(df["longitude"].iloc[0]))]

    dates = df["ts"].dt.to_pydatetime().tolist()
    live = pd.DataFrame({
        "init_date": [dates[0]] * 3,
        "valid_date": [dates[1], dates[2], dates[3]],
        "latitude": [geo[0][0]] * 3,
        "longitude": [geo[0][1]] * 3,
        "nwp_mean": [17.0] * 3,
        "nwp_max": [22.0] * 3,
        "nwp_min": [12.0] * 3,
    })

    cal, ev = live_pairs(sites, geo, live, 1)
    assert len(cal) + len(ev) == 3  # each 1-day lead verifies
    cal, ev = live_pairs(sites, geo, live, 2)
    assert len(cal) + len(ev) == 2  # only j->j+2 pairs count
