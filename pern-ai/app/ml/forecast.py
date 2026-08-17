"""ForecastEngine — served multi-horizon temperature forecasts (accuracy plan §4).

Reads `models/forecast_artifact.joblib` (built by build_forecast_artifact.py
from the Phase-3-gated protocol) and serves per the plan §4 lead hierarchy:

    serve(h==1)  = NWP + MOS blend (anomaly center when NWP is missing)
    serve(h==7)  = P2 LightGBM quantile ensemble when NWP is supplied (the
                    parsimony-gated container shipped by the artifact; falls
                    back to the NWP+MOS blend, then the anomaly center)
    serve(h==30) = anomaly-persistence center (normal + rho * anomaly); NWP is
                    16-day only, so the 30d blend reduces to the anomaly rung

Intervals are the Phase-3 conditional-conformal widths: each request is binned
by (month, seasonal-volatility from the normal's ±15-day std, within-month
|anomaly| tercile) and assigned the bin's finite-sample qhat, the month-max
fallback, or the global fallback — scaled by the horizon's holdout inflation
factor, exactly as in the gate.  When the lead's preferred input is missing
(no observation at 1d, no NWP at 7d) the engine falls back to the anomaly
center, the rung the intervals were calibrated on.  At h==7 the ensemble
serves its own CQR-calibrated intervals (tighter, honestly-calibrated widths
instead of the anomaly-calibrated tables the blend rung uses).
"""
import numpy as np
import pandas as pd

from .backtest import confidence_score


class ForecastEngine:
    """Deterministic forecast engine backed by a built artifact."""

    def __init__(self, artifact):
        self.artifact = artifact
        self.version = artifact.get("version")
        self.sites = artifact["sites"]
        self._lats = np.array([s["latitude"] for s in self.sites], float)
        self._lngs = np.array([s["longitude"] for s in self.sites], float)
        self._normals = {}
        for h, rec in artifact["horizons"].items():
            self._normals[h] = {
                int(k): self._rebuild_normal(v) for k, v in rec["normals"].items()
            }

    @classmethod
    def load(cls, path):
        import joblib  # noqa: PLC0415
        return cls(joblib.load(path))

    # ---- normal machinery -------------------------------------------------
    @staticmethod
    def _rebuild_normal(rec):
        from .models import ClimateNormals  # noqa: PLC0415
        m = ClimateNormals(doy_idx=0, year_idx=1, n_harmonics=rec["n_harmonics"])
        m.coef_ = np.asarray(rec["coef"], float)
        m.std_ = np.asarray(rec["std"], float)
        m.is_fitted_ = True
        return m

    def _normal_val(self, h, si, date):
        m = self._normals[h][si]
        ts = pd.Timestamp(date)
        return float(m.predict(np.array([[ts.dayofyear, ts.year]]))[0])

    def _seasonal_vol(self, h, si, date):
        ts = pd.Timestamp(date)
        vals = [self._normal_val(h, si, ts + pd.Timedelta(days=d)) for d in range(-15, 16)]
        return float(np.std(vals))

    # ---- site resolution --------------------------------------------------
    def _site_index(self, lat, lng):
        d2 = (self._lats - float(lat)) ** 2 + (self._lngs - float(lng)) ** 2
        return int(np.argmin(d2)), float(np.sqrt(d2.min()))

    # ---- interval tables --------------------------------------------------
    def _bin_key(self, h, si, target_date, vol, anom_abs):
        rec = self.artifact["horizons"][h]
        ts = pd.Timestamp(target_date)
        month = ts.month
        vb = int(np.digitize(vol, np.asarray(rec["vol_edges"], float), right=True))
        ae = rec["anom_edges"]
        a_edges = ae.get(str(month), ae.get("0"))
        ab = int(np.digitize(anom_abs, np.asarray(a_edges, float), right=True))
        return f"m{month:02d}|v{vb}|a{ab}"

    def _qhat(self, h, bin_key):
        rec = self.artifact["horizons"][h]
        if bin_key in rec["qhats"]:
            return float(rec["qhats"][bin_key])
        month = bin_key.split("|")[0]
        if month in rec["month_fallback"]:
            return float(rec["month_fallback"][month])
        return float(rec["global_fallback"])

    # ---- centers ----------------------------------------------------------
    def _anomaly_center(self, h, si, target_date, today, anomaly):
        rec = self.artifact["horizons"][h]
        rho = rec.get("rho_by_site", {}).get(str(si), rec["rho"])
        if rec.get("rho_by_month"):
            rho = rec["rho_by_month"].get(
                str(pd.Timestamp(target_date).month), rec["rho"])
        normal_k = self._normal_val(h, si, target_date)
        return float(normal_k + rho * anomaly)

    def center(self, h, lat, lng, target_date, obs_temperature=None, nwp_temperature=None):
        """Point forecast for `target_date` at lead h (plan §4 hierarchy).

        h == 1  -> NWP + MOS blend when NWP is present; otherwise the anomaly
                   center (normal + rho * anomaly) when an observation is
                   supplied; otherwise the anomaly center with anomaly = 0.
        h == 7  -> P2 LightGBM quantile ensemble when NWP is supplied (the
                   artifact's parsimony-gated container); otherwise the NWP+MOS
                   blend; otherwise the anomaly center.
        h == 30 -> anomaly-persistence center (NWP is 16-day only).
        Returns (center, method, context) where context carries the anomaly
        input used by `interval()` so the bin features match the center; for
        the ensemble method it also carries the CQR lower/upper bounds.
        """
        h = str(h)
        if h not in self.artifact["horizons"]:
            raise ValueError(f"unsupported horizon {h}: serve 1|7|30")
        rec = self.artifact["horizons"][h]
        si, dist = self._site_index(lat, lng)
        ts = pd.Timestamp(target_date)
        today = ts - pd.Timedelta(days=int(h))
        anomaly = 0.0
        if obs_temperature is not None and np.isfinite(obs_temperature):
            anomaly = float(obs_temperature) - self._normal_val(h, si, today)

        if h == "1":
            mos = rec.get("mos") or {}
            coef = mos.get("coef", {}).get(str(si))
            if nwp_temperature is not None and np.isfinite(nwp_temperature) and coef is not None:
                a, b, c = coef
                c_mos = a + b * float(nwp_temperature) + c * anomaly
                w = mos.get("blend_weights", {})
                normal_k = self._normal_val(h, si, ts)
                anom_c = self._anomaly_center(h, si, ts, today, anomaly)
                w_mos = w.get("mos", 0.0)
                w_anom = w.get("anomaly", 0.0)
                w_norm = w.get("normal", 0.0)
                c_blend = (w_mos * c_mos + w_anom * anom_c + w_norm * normal_k)
                if w_mos + w_anom + w_norm > 0:
                    c_blend /= (w_mos + w_anom + w_norm)
                return float(c_blend), "nwp_mos", {"si": si, "anomaly": anomaly}
            center = self._anomaly_center(h, si, ts, today, anomaly)
            return center, "anomaly", {"si": si, "anomaly": anomaly}

        if h == "7":
            ens = rec.get("ensemble")
            if (ens is not None and nwp_temperature is not None
                    and np.isfinite(nwp_temperature)
                    and obs_temperature is not None and np.isfinite(obs_temperature)):
                X = np.array([[float(nwp_temperature), self._normal_val(h, si, ts),
                               anomaly, float(obs_temperature), float(ts.dayofyear),
                               float(si)]], dtype=float)
                pred = ens.predict(X)[0]
                if np.isfinite(pred).all():
                    return float(pred[0]), "ensemble", {
                        "si": si, "anomaly": anomaly,
                        "lo": float(pred[1]), "hi": float(pred[2]),
                        "alpha": float(ens.alpha)}
            mos = rec.get("mos") or {}
            coef = mos.get("coef", {}).get(str(si))
            if nwp_temperature is not None and np.isfinite(nwp_temperature) and coef is not None:
                a, b, c = coef
                c_mos = a + b * float(nwp_temperature) + c * anomaly
                w = mos.get("blend_weights", {})
                normal_k = self._normal_val(h, si, ts)
                anom_c = self._anomaly_center(h, si, ts, today, anomaly)
                w_mos = w.get("mos", 0.0)
                w_anom = w.get("anomaly", 0.0)
                w_norm = w.get("normal", 0.0)
                c_blend = (w_mos * c_mos + w_anom * anom_c + w_norm * normal_k)
                if w_mos + w_anom + w_norm > 0:
                    c_blend /= (w_mos + w_anom + w_norm)
                return float(c_blend), "nwp_mos", {"si": si, "anomaly": anomaly}
            center = self._anomaly_center(h, si, ts, today, anomaly)
            return center, "anomaly", {"si": si, "anomaly": anomaly}

        center = self._anomaly_center(h, si, ts, today, anomaly)
        return center, "anomaly", {"si": si, "anomaly": anomaly}

    def interval(self, h, lat, lng, target_date, obs_temperature=None, nwp_temperature=None):
        """Calibrated conditional-conformal interval at lead h.

        When the ensemble serves (h==7 with NWP) the bounds are its own
        CQR-calibrated quantile interval; otherwise the anomaly-calibrated
        conditional-conformal table from the artifact."""
        h = str(h)
        rec = self.artifact["horizons"][h]
        center, method, ctx = self.center(h, lat, lng, target_date,
                                          obs_temperature, nwp_temperature)
        if method == "ensemble":
            alpha = float(ctx["alpha"])
            cov = 1.0 - alpha
            lo, hi = float(ctx["lo"]), float(ctx["hi"])
            width = hi - lo
            conf = confidence_score(width, float(rec["target_std"]), cov, alpha)
            return {
                "horizon_days": int(h),
                "method": method,
                "center": round(center, 2),
                "lower": round(lo, 2),
                "upper": round(hi, 2),
                "width": round(width, 2),
                "coverage": round(cov, 3),
                "confidence": conf,
                "site_index": int(ctx["si"]),
                "bin_key": "ensemble",
                "alpha": alpha,
                "inflation": float(rec["inflation"]),
                "rho": float(rec["rho"]),
                "target_std": float(rec["target_std"]),
            }
        ts = pd.Timestamp(target_date)
        vol = self._seasonal_vol(h, ctx["si"], ts)
        anom_abs = abs(float(ctx["anomaly"]))
        bin_key = self._bin_key(h, ctx["si"], ts, vol, anom_abs)
        half = self._qhat(h, bin_key) * float(rec["inflation"])
        lo, hi = float(center - half), float(center + half)
        alpha = float(rec["alpha_tuned"])
        cov = 1.0 - alpha
        width = hi - lo
        conf = confidence_score(width, float(rec["target_std"]), cov, alpha)
        return {
            "horizon_days": int(h),
            "method": method,
            "center": round(center, 2),
            "lower": round(lo, 2),
            "upper": round(hi, 2),
            "width": round(width, 2),
            "coverage": round(cov, 3),
            "confidence": conf,
            "site_index": int(ctx["si"]),
            "bin_key": bin_key,
            "alpha": alpha,
            "inflation": float(rec["inflation"]),
            "rho": float(rec["rho"]),
            "target_std": float(rec["target_std"]),
        }
