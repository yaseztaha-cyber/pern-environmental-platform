"""Cross-validation splits that respect time and space (anti-leakage).

- temporal_block_split: sequential blocks of time; train always precedes test.
- leave_locations_out_split: hold out entire (lat, lon) sites.
- calibration_split: carve a conformal calibration set out of training folds.
"""
import numpy as np


def temporal_block_split(df, n_folds=5, target_sort="ts"):
    """Return list of (train_idx, test_idx) index arrays.

    The DataFrame is sorted by time; the last 1/n_folds of rows are the test
    block, the prior contiguous window is the train block. Each fold moves the
    window back in time so that no test point is earlier than any train point.
    """
    order = np.argsort(df[target_sort].values)
    n = len(order)
    folds = []
    step = max(1, n // n_folds)
    for k in range(n_folds - 1):
        test_end = n - k * step
        test_start = max(0, test_end - step)
        if test_start <= 0:
            break
        train = order[:test_start]
        test = order[test_start:test_end]
        folds.append((train, test))
    return folds


def leave_locations_out_split(df, n_groups=5, lat="latitude", lon="longitude"):
    """Group by site; hold out whole sites as test, train on the rest."""
    sites = df.groupby([lat, lon], sort=True).size().sort_values(ascending=False)
    site_ids = list(sites.index)
    np.random.seed(0)
    np.random.shuffle(site_ids)
    chunks = np.array_split(np.arange(len(site_ids)), n_groups)
    folds = []
    for chunk in chunks:
        test_sites = set(site_ids[i] for i in chunk)
        test = np.array(
            [i for i, (la, lo) in enumerate(zip(df[lat].values, df[lon].values)) if (la, lo) in test_sites],
            dtype=int,
        )
        train = np.array([i for i in range(len(df)) if i not in set(test.tolist())], dtype=int)
        folds.append((train, test))
    return folds


def calibration_split(train_idx, df, frac=0.3, target_sort="ts"):
    """Split a train fold into (fit_idx, calib_idx), calib from the most recent rows."""
    train_idx = np.asarray(train_idx)
    order = np.argsort(df[target_sort].values[train_idx])
    sorted_train = train_idx[order]
    cut = max(1, int(len(sorted_train) * (1 - frac)))
    return sorted_train[:cut], sorted_train[cut:]
