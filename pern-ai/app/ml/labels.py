"""Labeled dataset loading for training.

Training data is a flat CSV (produced by the backend feature ETL + label
extraction job) with columns: ts, latitude, longitude, feature_group,
feature..., target. When no dataset is provided, falls back to the synthetic
generator so the pipeline can be exercised offline.
"""
import numpy as np
import pandas as pd

from .synthetic import make_synthetic

TARGET_COLS = {"target"}


def _prepare(df):
    df = df.copy()
    if "ts" in df.columns and not pd.api.types.is_datetime64_any_dtype(df["ts"]):
        df["ts"] = pd.to_datetime(df["ts"])
    df = df.replace([np.inf, -np.inf], np.nan).dropna(subset=["target"])
    if "month" not in df.columns and "ts" in df.columns:
        df["month"] = df["ts"].dt.month
        df["day_of_year"] = df["ts"].dt.dayofyear
        df["day_of_week"] = df["ts"].dt.dayofweek
    return df.reset_index(drop=True)


def load_training_data(dataset_path=None, feature_group=None, n_sites=12, days=180, seed=7):
    """Return a prepared labeled DataFrame (synthetic fallback when no path)."""
    if dataset_path:
        df = pd.read_csv(dataset_path)
    else:
        df = make_synthetic(n_sites=n_sites, days=days, seed=seed, feature_group=feature_group or "agriculture")
    df = _prepare(df)
    if feature_group and "feature_group" in df.columns:
        df = df[df["feature_group"] == feature_group].reset_index(drop=True)
    if len(df) == 0:
        raise ValueError("no labeled rows after preparation")
    return df
