"""Evaluation metrics for probabilistic regression.

Point metrics: RMSE, MAE, MAPE.
Probabilistic metrics: coverage, interval width, CRPS (via pinball loss
across a grid of quantile levels).
"""
import numpy as np


def rmse(y_true, y_pred):
    return float(np.sqrt(np.mean((np.asarray(y_true) - np.asarray(y_pred)) ** 2)))


def mae(y_true, y_pred):
    return float(np.mean(np.abs(np.asarray(y_true) - np.asarray(y_pred))))


def mape(y_true, y_pred):
    yt = np.asarray(y_true, dtype=float)
    yp = np.asarray(y_pred, dtype=float)
    mask = np.abs(yt) > 1e-6
    if mask.sum() == 0:
        return float("nan")
    return float(np.mean(np.abs(yt[mask] - yp[mask]) / np.abs(yt[mask])) * 100)


def pinball_loss(y_true, y_pred, alpha):
    yt = np.asarray(y_true)
    yp = np.asarray(y_pred)
    err = yt - yp
    return float(np.mean(np.where(err >= 0, alpha * err, (alpha - 1) * err)))


def crps_from_quantiles(y_true, q_grid, alphas):
    """CRPS approximated as 2 * average pinball loss over quantile levels.

    q_grid: (n_samples, n_levels) quantile predictions.
    alphas: quantile levels matching columns of q_grid (ascending).
    """
    q_grid = np.asarray(q_grid)
    losses = [
        pinball_loss(y_true, q_grid[:, i], alphas[i]) for i in range(q_grid.shape[1])
    ]
    return float(2.0 * np.mean(losses))


def interval_coverage(y_true, lower, upper):
    yt = np.asarray(y_true)
    return float(np.mean((yt >= lower) & (yt <= upper)))


def mean_interval_width(lower, upper):
    return float(np.mean(np.asarray(upper) - np.asarray(lower)))


def skill_score(y_true, y_pred, baseline):
    """Skill score vs a baseline forecast: SS = 1 - MSE(model) / MSE(baseline).

    Positive = the model beats the baseline (e.g. climatology); 0 = tied;
    negative = worse. This is the standard seasonal-forecasting convention.
    """
    mse_model = float(np.mean((np.asarray(y_true) - np.asarray(y_pred)) ** 2))
    mse_base = float(np.mean((np.asarray(y_true) - np.asarray(baseline)) ** 2))
    if mse_base <= 0:
        return 0.0
    return 1.0 - mse_model / mse_base


def summarize(y_true, center, lower, upper, q_grid=None, alphas=None):
    out = {
        "rmse": rmse(y_true, center),
        "mae": mae(y_true, center),
        "mape": mape(y_true, center),
        "coverage": interval_coverage(y_true, lower, upper),
        "interval_width": mean_interval_width(lower, upper),
        "n": int(len(y_true)),
    }
    if q_grid is not None and alphas is not None:
        out["crps"] = crps_from_quantiles(y_true, q_grid, alphas)
    return out
