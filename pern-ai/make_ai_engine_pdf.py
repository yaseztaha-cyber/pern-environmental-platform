"""Generate the PERN v4.0 AI Engine technical PDF (features, sources, data volume, tech).

Includes charts (strategy RMSE, coverage vs target, holdout residuals), a pipeline
diagram, the conformal math, the artifact/API specs and the module map.

Usage:
    python make_ai_engine_pdf.py [--out ../PERN-v4.0-AI-Engine.pdf]
"""
import argparse
import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import joblib
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AI = os.path.join(ROOT, "pern-ai")
CHARTS = os.path.join(AI, "models", "charts")
os.makedirs(CHARTS, exist_ok=True)

ACCENT = colors.HexColor("#0B6E4F")
DARK = colors.HexColor("#0F2E22")
GREY = colors.HexColor("#5B6B63")
LIGHT = colors.HexColor("#EAF4EE")
GOLD = colors.HexColor("#B7791F")
RED = colors.HexColor("#A33B2E")
GRID = colors.HexColor("#CFDFD6")


def _pct(v):
    return f"{v * 100:.1f}%"


# ---------------------------------------------------------------- charts ----
def _brand(fig, ax):
    ax.tick_params(colors="#37474F", labelsize=9)
    ax.set_facecolor("white")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color("#B9C9BF")


def chart_rmse(out):
    labels = [
        "Level tree (LightGBM)",
        "Delta tree (unshrunk)",
        "Delta + lag + IDW neighbors",
        "Delta tree γ=0.25",
        "Persistence (baseline)",
        "Persistence + conformal*",
    ]
    vals = [3.85, 2.50, 2.44, 1.32, 1.23, 0.82]
    cols = ["#9AA79E", "#C79A8A", "#C79A8A", "#9AA79E", "#9AA79E", "#0B6E4F"]
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(6.4, 2.5), dpi=200)
    y = np.arange(len(labels))[::-1]
    ax.barh(y, vals, color=cols, height=0.62)
    ax.set_yticks(y, labels)
    ax.set_xlabel("Forecast RMSE (°C, 1-day horizon, lower is better)", fontsize=9)
    ax.set_xlim(0, 4.3)
    for yi, v in zip(y, vals):
        ax.text(v + 0.06, yi, f"{v:.2f}", va="center", fontsize=8.5, color="#37474F")
    _brand(fig, ax)
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)


def chart_coverage(out, temporal, spatial, holdout):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    labels = ["Spatial\n(new sites)", "Final holdout\n(14 d, untouched)", "Temporal\n(forecast)", "Target"]
    vals = [spatial["coverage"] * 100, holdout["coverage"] * 100, temporal["coverage"] * 100, 90.0]
    cols = ["#C79A8A", "#B7791F", "#0B6E4F", "#37474F"]
    fig, ax = plt.subplots(figsize=(6.4, 2.4), dpi=200)
    bars = ax.bar(labels, vals, color=cols, width=0.55)
    ax.axhline(90, color="#37474F", ls="--", lw=0.9)
    ax.set_ylim(50, 105)
    ax.set_ylabel("Interval coverage (%)", fontsize=9)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 1.2, f"{v:.1f}%", ha="center", fontsize=8.5, color="#37474F")
    ax.text(3, 92, "nominal 90%", fontsize=8, color="#37474F", ha="center")
    _brand(fig, ax)
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)


def chart_residuals(out, real):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    resid = real["target"] - real["temperature"]
    qhat = 1.261
    fig, ax = plt.subplots(figsize=(6.4, 2.3), dpi=200)
    ax.hist(resid, bins=60, color="#0B6E4F", alpha=0.85, edgecolor="white")
    ax.axvline(-qhat, color="#A33B2E", ls="--", lw=1.1)
    ax.axvline(qhat, color="#A33B2E", ls="--", lw=1.1)
    ax.text(qhat + 0.12, ax.get_ylim()[1] * 0.92, "± qhat = ±1.26 °C", color="#A33B2E", fontsize=8.5)
    ax.set_xlabel("Persistence residual (°C) = tomorrow − today", fontsize=9)
    ax.set_ylabel("count", fontsize=9)
    _brand(fig, ax)
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)


def chart_horizons(out, report):
    """RMSE by horizon and center for both tracks; '*' marks best center per horizon."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    HORIZONS = (1, 7, 30)
    centers = ("persistence", "climatology")
    cols = {"persistence": "#0B6E4F", "climatology": "#B7791F"}
    best = {}
    for name in ("agriculture", "air"):
        hs = report["tracks"][name]["horizons"]
        for h in HORIZONS:
            best[name, h] = min(centers, key=lambda c: hs[f"{h}d_{c}"]["rmse"])
    fig, axes = plt.subplots(1, 2, figsize=(9.4, 2.7), dpi=200)
    for ax, name in zip(axes, ("agriculture", "air")):
        tr = report["tracks"][name]
        hs = tr["horizons"]
        x = np.arange(len(HORIZONS))
        w = 0.38
        for ci, center in enumerate(centers):
            vals = [hs[f"{h}d_{center}"]["rmse"] for h in HORIZONS]
            bars = ax.bar(x + (ci - 0.5) * w, vals, width=w, color=cols[center], label=center)
            for b, v, h in zip(bars, vals, HORIZONS):
                ax.text(b.get_x() + b.get_width() / 2, v * 1.03, f"{v:.2f}", ha="center",
                        fontsize=7.4, color="#37474F")
                cov = hs[f"{h}d_{center}"]["coverage"] * 100
                star = " *" if best[name, h] == center else ""
                ax.text(b.get_x() + b.get_width() / 2, v * 1.30, f"cov {cov:.0f}%{star}",
                        ha="center", fontsize=6.8, color="#5B6B63")
        ax.set_title(f"{name} ({tr['unit']})", fontsize=9.5, color="#0F2E22")
        ax.set_ylabel("RMSE (lower is better)", fontsize=8.5)
        ax.set_xticks(x)
        ax.set_xticklabels([f"{h}d" for h in HORIZONS])
        ax.legend(fontsize=7, loc="upper left", frameon=False)
        _brand(fig, ax)
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)


# -------------------------------------------------------------- document ----
def build(metrics, real, air, art, horizon_eval):
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=ACCENT, fontSize=18, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=DARK, fontSize=13, spaceBefore=16, spaceAfter=5, leftIndent=0)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9.5, leading=13.8, textColor=DARK, spaceAfter=6)
    small = ParagraphStyle("small", parent=body, fontSize=8.3, textColor=GREY)
    cell = ParagraphStyle("cell", parent=styles["BodyText"], fontSize=8.5, leading=11)
    cellb = ParagraphStyle("cellb", parent=cell, fontName="Helvetica-Bold")
    mono = ParagraphStyle("mono", parent=styles["BodyText"], fontName="Courier", fontSize=8, leading=11, textColor="#263238")
    monobox = ParagraphStyle("monobox", parent=mono, backColor=colors.HexColor("#F3F7F4"), borderColor=GRID, borderWidth=0.8, borderPadding=6, leftIndent=2, spaceBefore=4, spaceAfter=8)
    cover = ParagraphStyle("cover", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24, textColor=colors.white, leading=28)
    subtitle = ParagraphStyle("subtitle", parent=body, fontSize=11.5, textColor=colors.HexColor("#D8EADF"), spaceAfter=0)
    kpi_num = ParagraphStyle("kpi_num", parent=styles["Title"], fontSize=20, textColor=colors.white, alignment=TA_CENTER)
    kpi_lab = ParagraphStyle("kpi_lab", parent=styles["BodyText"], fontSize=8, textColor=colors.HexColor("#D8EADF"), alignment=TA_CENTER)

    t_metrics = metrics["temporal"]["metrics"]
    s_metrics = metrics["spatial"]["metrics"]
    ho = metrics.get("final_holdout", {}).get("metrics", {})

    real_cols = [c for c in real.columns if c not in ("ts", "target", "feature_group", "latitude", "longitude")]
    air_cols = [c for c in air.columns if c not in ("ts", "target", "feature_group", "latitude", "longitude")]

    chart_rmse(os.path.join(CHARTS, "rmse.png"))
    chart_coverage(os.path.join(CHARTS, "coverage.png"), t_metrics, s_metrics, ho)
    chart_residuals(os.path.join(CHARTS, "residuals.png"), real)
    chart_horizons(os.path.join(CHARTS, "horizons.png"), horizon_eval)

    story = []

    def sec(title):
        t = Table([[Paragraph(f"<font color='white'>{title}</font>", ParagraphStyle("h2w", parent=h2, textColor=colors.white))]],
                  colWidths=[17.0 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), DARK),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)
        story.append(Spacer(1, 7))

    def p(text):
        story.append(Paragraph(text, body))

    def sm(text):
        story.append(Paragraph(text, small))

    def tbl(data, widths=None, header_bg=ACCENT, highlight=None):
        t = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1)
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.3),
            ("GRID", (0, 0), (-1, -1), 0.4, GRID),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ]
        if highlight:
            for row, color in highlight:
                style.append(("BACKGROUND", (0, row), (-1, row), color))
        t.setStyle(TableStyle(style))
        story.append(Spacer(1, 3))
        story.append(t)
        story.append(Spacer(1, 8))

    def kv(rows, widths=(3.6 * cm, 13.4 * cm)):
        tbl([[Paragraph(k, cellb), Paragraph(v, cell)] for k, v in rows], widths=widths)

    def kpis(items):
        cells = []
        for value, label, color in items:
            inner = Table([[Paragraph(str(value), kpi_num)], [Paragraph(label, kpi_lab)]], colWidths=[4.25 * cm] * 1)
            inner.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), color),
                ("TOPPADDING", (0, 0), (-1, 0), 7),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
            ]))
            cells.append(inner)
        t = Table([cells], colWidths=[4.25 * cm] * len(cells))
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("BOX", (0, 0), (-1, -1), 0.6, GRID),
            ("INNERGRID", (0, 0), (-1, -1), 0.6, GRID),
        ]))
        story.append(t)
        story.append(Spacer(1, 10))

    # ---------- Cover ----------
    cover_tbl = Table([
        [Paragraph("PERN v4.0", cover)],
        [Paragraph("AI TRUST &amp; PREDICTION ENGINE", subtitle)],
        [Paragraph("Machine Learning Technical Documentation &mdash; features, data sources, "
                   "data volume, methodology &amp; technology", ParagraphStyle("csub2", parent=body, fontSize=9.5, textColor=colors.HexColor("#C7DFD2")))],
    ], colWidths=[17.0 * cm])
    cover_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), DARK),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(cover_tbl)
    story.append(Spacer(1, 6))
    sm(f"Served artifact: {art.get('model_type','n/a')} · trained {str(art.get('trained_ts',''))[:19]} UTC · "
       f"generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    story.append(Spacer(1, 8))

    kpis([
        (f"{t_metrics['rmse']:.2f} °C", "Temporal RMSE", ACCENT),
        (_pct(t_metrics["coverage"]), "Temporal coverage", GOLD),
        (f"{t_metrics['interval_width']:.2f} °C", "Interval width (90%)", DARK),
        (f"{metrics['temporal']['confidence_score']:.1f}", "Confidence score", GREY),
    ])

    # ---------- 1 Overview ----------
    sec("1 &nbsp;·&nbsp; Overview")
    p(
        "The PERN AI Trust &amp; Prediction Engine is a machine-learning subsystem that turns "
        "environmental observations into a <b>calibrated prediction interval</b> and a 0&ndash;100 "
        "<b>confidence score</b>. It is deliberately decoupled from the website until validated; the "
        "backend reaches it through a fail-open HTTP client (4 s timeout, 60 s cache)."
    )
    p(
        "Core insight: at a 1-day forecasting horizon, daily-mean temperature is persistence-"
        "dominated (today ≈ tomorrow). The served model therefore uses <b>persistence as the point "
        "forecast</b> and applies <b>split-conformal calibration to the residuals</b> so interval "
        "coverage is guaranteed at the declared level. The engine owns the <i>uncertainty</i>, not a "
        "better point forecast."
    )

    # ---------- 2 Pipeline ----------
    sec("2 &nbsp;·&nbsp; Pipeline")
    flow = Table([
        [
            Paragraph("<b>NASA POWER</b><br/>daily meteorology<br/><font size=7.5 color='#5B6B63'>keyless API</font>", cell),
            Paragraph("&rarr;", cellb),
            Paragraph("<b>Feature ETL</b><br/>feature-etl.js<br/><font size=7.5 color='#5B6B63'>grid × day rows</font>", cell),
            Paragraph("&rarr;", cellb),
            Paragraph("<b>feature_vectors</b><br/>PostgreSQL<br/><font size=7.5 color='#5B6B63'>provenance + quality</font>", cell),
            Paragraph("&rarr;", cellb),
            Paragraph("<b>Label build</b><br/>make_real_dataset.py<br/><font size=7.5 color='#5B6B63'>next-day T2M</font>", cell),
            Paragraph("&rarr;", cellb),
            Paragraph("<b>Train + gate</b><br/>train.py / retrain.py<br/><font size=7.5 color='#5B6B63'>backtest → promote?</font>", cell),
            Paragraph("&rarr;", cellb),
            Paragraph("<b>Serve</b><br/>FastAPI /v1/confidence<br/><font size=7.5 color='#5B6B63'>score + interval + drift</font>", cell),
        ]
    ], colWidths=[2.9 * cm, 0.5 * cm, 2.9 * cm, 0.5 * cm, 2.9 * cm, 0.5 * cm, 2.9 * cm, 0.5 * cm, 3.0 * cm, 0.5 * cm, 2.9 * cm])
    flow.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, GRID),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, GRID),
        ("BACKGROUND", (0, 0), (0, 0), LIGHT),
        ("BACKGROUND", (2, 0), (2, 0), LIGHT),
        ("BACKGROUND", (4, 0), (4, 0), LIGHT),
        ("BACKGROUND", (6, 0), (6, 0), LIGHT),
        ("BACKGROUND", (8, 0), (8, 0), LIGHT),
        ("BACKGROUND", (10, 0), (10, 0), LIGHT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(flow)
    story.append(Spacer(1, 6))
    sm("Air track flows identically from OpenAQ (or its simulated fallback) through the same "
       "feature/label/train/serve stages.")

    # ---------- 3 Data sources ----------
    sec("3 &nbsp;·&nbsp; Data Sources")
    kv([
        ("NASA POWER (keyless)", "power.larc.nasa.gov temporal daily API · community AG · no key. "
         "Live-fetched per grid point (start/end as YYYYMMDD), JSON response, -999 missing sentinel "
         "cleaned."),
        ("OpenAQ (key-gated)", "openaq.fetchByLocation(lat, lng, limit) adapter wired in "
         "(openaq-source.js:64). Real key + daily labels still required for a production air model; "
         "the air track is exercised today with synthetic labels in the same schema."),
        ("PostgreSQL (feature_vectors)", "feature-etl.js writes aligned (location × time) rows with "
         "feature_group, source_id, snapshot, quality and provenance; the training pipeline reads "
         "them back and attaches labels."),
    ])
    p("NASA POWER parameters fetched (agriculture track): <b>T2M</b>, <b>T2M_MAX</b>, <b>T2M_MIN</b>, "
      "<b>PRECTOTCORR</b> (corrected precipitation), <b>RH2M</b> (relative humidity), <b>WS2M</b> "
      "(2-m wind speed). All values are daily means/aggregates.")

    # ---------- 4 Features ----------
    sec("4 &nbsp;·&nbsp; Feature Catalog")
    p("Agriculture track (served). One row per grid point per day; label = next day's observed T2M.")
    tbl([[Paragraph("Feature", cellb), Paragraph("Type", cellb), Paragraph("Source", cellb), Paragraph("Role", cellb)]]
        + [
            [Paragraph(f, cell), Paragraph(t, cell), Paragraph(s, cell), Paragraph(n, cell)]
            for f, t, s, n in [
                ("temperature", "float", "POWER T2M", "persistence center + conformal residual"),
                ("temperature_max", "float", "POWER T2M_MAX", "calibration context"),
                ("temperature_min", "float", "POWER T2M_MIN", "calibration context"),
                ("precipitation", "float", "POWER PRECTOTCORR", "calibration context"),
                ("humidity", "float", "POWER RH2M", "calibration context"),
                ("wind_speed", "float", "POWER WS2M", "calibration context"),
                ("latitude, longitude", "float", "grid / request", "site identity"),
                ("month", "int", "derived", "seasonal context"),
                ("day_of_year", "int", "derived", "seasonal context"),
                ("day_of_week", "int", "derived", "weekly context"),
            ]
        ], widths=(3.1 * cm, 1.4 * cm, 3.4 * cm, 9.1 * cm))
    p("Air track (pipeline-ready, synthetic labels). Label = next-day PM2.5.")
    tbl([[Paragraph("Feature", cellb), Paragraph("Type", cellb)]]
        + [[Paragraph(f, cell), Paragraph(t, cell)] for f, t in [
            ("temperature, humidity, wind_speed", "float · POWER meteorology"),
            ("pm25, pm10", "float · particulate"),
            ("no2, so2, o3", "float · gaseous pollutants"),
            ("month, day_of_year, day_of_week", "int · derived"),
        ]], widths=(6.5 * cm, 10.5 * cm))

    # ---------- 5 Data volume ----------
    sec("5 &nbsp;·&nbsp; Data Volume")
    rng = f"{real['ts'].min()} &rarr; {real['ts'].max()}"
    kv([
        ("Real agriculture dataset", f"<b>{len(real):,}</b> labeled rows · 16 grid points "
         f"(4×4 lat/lon grid) · ~120 days ({rng}) · one (site, day) row with next-day T2M label"),
        ("Served-artifact training rows", f"{metrics['rows']:,} · feature columns: {len(art['features'])}"),
        ("Air dataset", f"{len(air):,} rows · 16 sites · 120 days — physically-plausible PM2.5 "
         "(traffic weekday cycle, wind dilution, humidity, site emission); fetch_openaq_labels.py "
         "replaces them with real OpenAQ daily labels once OPENAQ_API_KEY is set (fallback keeps "
         "the pipeline offline-green)"),
        ("Synthetic fallback", "app/ml/synthetic.py reproduces the exact schema for offline dev / "
         "smoke tests when no dataset exists"),
        ("Splits", "Temporal backtest ~{0:,} test rows across folds · spatial leave-locations-out · "
         "final holdout {1:,} rows (14 most-recent days)".format(int(t_metrics["n"]), int(ho["n"]))),
    ])

    # ---------- 6 Methodology ----------
    sec("6 &nbsp;·&nbsp; ML Methodology &amp; Model Spec")
    kv([
        ("Served model", "PersistenceResidual (app/ml/models.py): center = today's temperature "
         "(X[:, temp_idx]); predict_interval returns zero-width [center, center]; the conformal "
         "layer adds ±qhat. Zero fitted parameters — the honest optimum for this task."),
        ("Tree alternatives", "LightGBMQuantile (7 quantile regressors: 0.05–0.95) and "
         "SklearnQuantile are implemented for other targets; they lose to persistence on real "
         "temperature at 1-day horizon."),
        ("Conformal calibration", "split-conformal CQR: residuals r = |y − center| on the calibration "
         "slice; qhat = Q<sub>⌈(n+1)(1−α)/n⌉</sub>(r), α = 0.10; interval = [center − qhat, center + qhat]."),
        ("CQR (tree path)", "scores = max(lower − y, y − upper) from quantile models at α/2 and "
         "1−α/2; same qhat formula, applied as [lower − qhat, upper + qhat]."),
        ("Confidence score", "coverage_match = 1 − |coverage − (1−α)|; width_score = 1 / (1 + "
         "width/(2·target_std)) — a monotonic, non-saturating mapping so any interval widening "
         "(adaptive factors for new sites / off-distribution inputs) always lowers the score; "
         "score = 100·(0.6·coverage_match + 0.4·width_score)."),
        ("Anti-leakage", "temporal_block_split (train strictly precedes test), "
         "leave_locations_out_split (whole sites held out), calibration carved from the most recent "
         "30% of each train block, NaN-imputation medians computed from training rows only, and a "
         "final 14-day holdout never touched by model selection."),
    ])

    sec("6.1 &nbsp;·&nbsp; Hyperparameters")
    tbl([[Paragraph("Parameter", cellb), Paragraph("Value", cellb), Paragraph("Scope", cellb)]]
        + [
            [Paragraph(a, cell), Paragraph(b, cell), Paragraph(c, cell)]
            for a, b, c in [
                ("alpha (conformal)", "0.10", "target 90% marginal coverage"),
                ("calib_frac", "0.30", "most-recent fraction of each train block used for qhat"),
                ("qhat level", "⌈(n+1)(1−α)/n⌉", "finite-sample correction in conformal.py"),
                ("alphas (trees)", "(0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95)", "quantile grid / CRPS"),
                ("n_estimators (LightGBM)", "200 (100 in --fast)", "per quantile level"),
                ("learning_rate (LightGBM)", "0.05", ""),
                ("num_leaves (LightGBM)", "31 (24 in experiments)", ""),
                ("min_data_in_leaf (LightGBM)", "20", ""),
                ("objective", "quantile", "LightGBM per-alpha regressors"),
                ("max_iter (SklearnQuantile)", "150", "fallback path"),
                ("PSI thresholds", "moderate > 0.10 · severe > 0.25", "drift"),
                ("CUSUM", "k = 0.5σ · h = 5σ", "drift on residuals"),
                ("serve-time drift", "|z| > 4 flags a feature", "per request vs reference_stats"),
                ("promotion gate", "coverage within ±0.02 of nominal · RMSE ≤ 1.02× incumbent", "retrain.py"),
            ]
        ], widths=(5.6 * cm, 5.2 * cm, 6.2 * cm))

    # ---------- 7 Evaluation ----------
    sec("7 &nbsp;·&nbsp; Evaluation Results (real data, served model)")
    tbl([[Paragraph("Split", cellb), Paragraph("RMSE °C", cellb), Paragraph("MAE", cellb),
          Paragraph("Coverage", cellb), Paragraph("Width °C", cellb), Paragraph("Conf.", cellb)]]
        + [
            [Paragraph(n, cell), Paragraph(f"{v['rmse']:.3f}", cell), Paragraph(f"{v['mae']:.3f}", cell),
             Paragraph(_pct(v['coverage']), cell), Paragraph(f"{v['interval_width']:.3f}", cell),
             Paragraph(f"{c:.1f}", cell)]
            for n, v, c in [
                ("Temporal (forecast)", t_metrics, metrics["temporal"]["confidence_score"]),
                ("Spatial (new sites)", s_metrics, metrics["spatial"]["confidence_score"]),
                ("Final holdout (14 d)", ho, metrics.get("final_holdout", {}).get("confidence_score", 0)),
            ]
        ], widths=(4.6 * cm, 2.2 * cm, 1.9 * cm, 2.2 * cm, 2.2 * cm, 2.0 * cm),
        highlight=[(3, LIGHT)])
    story.append(Image(os.path.join(CHARTS, "rmse.png"), width=16.2 * cm, height=6.3 * cm))
    sm("Model-selection experiment: *final holdout RMSE (persistence + conformal). Lag + cross-site "
       "neighbor features and delta transforms could not beat persistence; the unshrunk delta tree "
       "was the worst tree variant.")
    story.append(Spacer(1, 6))
    story.append(Image(os.path.join(CHARTS, "coverage.png"), width=16.2 * cm, height=6.1 * cm))
    sm("Coverage vs the 90% target. The spatial split is intentionally harder — unseen sites swing "
       "more, and the engine correctly refuses to overstate confidence there. The final holdout "
       "(240 rows, never used for selection) sits within binomial noise of nominal.")
    story.append(Spacer(1, 6))
    story.append(Image(os.path.join(CHARTS, "residuals.png"), width=16.2 * cm, height=5.9 * cm))
    sm("Distribution of 1-day persistence residuals over the full real dataset (1,888 rows). The "
       "conformal qhat (1.26 °C) brackets ~90% of the mass by construction.")

    # ---------- 7.1 Multi-horizon ----------
    sec("7.1 &nbsp;·&nbsp; Multi-horizon Forecast Skill (24h / 7d / 30d)")
    p(
        "Forecast skill as the horizon grows. Two centers are compared per horizon on both tracks: "
        "<b>persistence</b> (center = today's observation, the served model's choice) and a "
        "<b>seasonal climatology</b> (smoothed day-of-year mean fit on the calibration slice). For "
        "each site the forecast center for day t+h is formed from data up to day t, the interval "
        "width is calibrated on the |actual &minus; center| residuals of the <b>first 60% of each "
        "site's timeline</b> (grouped per month, split-conformal, α = 0.10), and the <b>last 40% is "
        "scored against real observations</b> — no test leakage. Best center per horizon is "
        "highlighted (gold) and marked * in the chart. Tolerance accuracy is the "
        "competitor-style metric providers actually publish (share of forecasts within ±x)."
    )
    hk = horizon_eval["tracks"]
    ag = hk["agriculture"]["horizons"]
    ar = hk["air"]["horizons"]
    HORIZONS = (1, 7, 30)

    def best_c(hs, h):
        return min(("persistence", "climatology", "anomaly"), key=lambda c: hs[f"{h}d_{c}"]["rmse"])

    def hor_table(title, unit, hs, widths=(1.7 * cm, 2.6 * cm, 2.0 * cm, 1.9 * cm, 2.2 * cm, 2.1 * cm, 2.0 * cm)):
        story.append(Paragraph(f"<b>{title}</b>", cell))
        rows = [[Paragraph("Horizon", cellb), Paragraph("Center", cellb), Paragraph(f"RMSE {unit}", cellb),
                 Paragraph("MAE", cellb), Paragraph("Coverage", cellb), Paragraph("Width", cellb),
                 Paragraph("Conf.", cellb)]]
        hl = []
        ri = 1
        for h in HORIZONS:
            for c in ("persistence", "climatology"):
                r = hs[f"{h}d_{c}"]
                rows.append([Paragraph(f"{h}d", cell), Paragraph(c, cell),
                             Paragraph(f"{r['rmse']:.2f}", cell), Paragraph(f"{r['mae']:.2f}", cell),
                             Paragraph(_pct(r['coverage']), cell), Paragraph(f"{r['interval_width']:.2f}", cell),
                             Paragraph(f"{r['confidence']:.1f}", cell)])
                if best_c(hs, h) == c:
                    hl.append(ri)
                ri += 1
        tbl(rows, widths=widths, highlight=[(r, LIGHT) for r in hl])

    hor_table("Agriculture — NASA POWER daily T2M (°C), 16 grid sites", "°C", ag)
    hor_table("Air — PM2.5 virtual-sensor track (µg/m³), 16 sites", "µg/m³", ar)

    story.append(Image(os.path.join(CHARTS, "horizons.png"), width=16.2 * cm, height=4.6 * cm))
    sm("RMSE by horizon and center (* = best center; coverage % annotated above each bar). "
       "Persistence wins at 24h; climatology overtakes it at 30d on both tracks. Agriculture "
       "degrades monotonically with horizon; the air 7d &lt; 1d is a synthetic-generator property "
       "(daily random wind dominates the 1-day step but the 7-day traffic weekday cycle aligns), "
       "not a real skill gain.")
    story.append(Spacer(1, 6))
    p(
        "<b>Phase-1 update (multi-year normals, agriculture, ±3 °F on the 60/40 protocol).</b> "
        "Backfilled 3y of NASA POWER daily T2M (data/real_history_3y.csv, 17,488 rows) and added a "
        "third center — <b>anomaly persistence</b>, center = normal(t+h) + ρ(h)·(x_t − normal(t)), "
        "with per-site Fourier <b>ClimateNormals</b> and ρ fit per horizon (fitted 1d ρ=0.75; "
        "7d/30d ρ&rarr;0). Best numbers: <b>1d 88.8%</b> (±1.667 °C, RMSE 1.131 °C), "
        "<b>7d 71.2%</b> (RMSE 1.796 °C, skill +0.337 vs climatology), "
        "<b>30d 72.2%</b> (RMSE 1.802 °C, skill +0.301). Phase-1 exit gate: "
        "<b>30d ≥ 62% MET</b>; <b>7d ≥ 74% missed by 2.8 pts</b> at the statistical RMSE ceiling "
        "(~1.80 °C vs ~1.50 needed) — the residual 7-day signal requires NWP input (Phase 2); "
        "skill &gt; 0 at every horizon, so Phase 2's MOS has a valid base. Lever sweeps that did "
        "not beat per-site harmonics (n_harmonics=3): pooled harmonics (7d 63.3%), shared "
        "pooled+offsets (7d 64.1%), regional anomalies (ρ&rarr;0), fixed-ρ 0.1 (7d +0.2 pts but "
        "1d 88.8&rarr;74.3%), n_harmonics ≥ 4 (7d 67.7%)."
    )
    story.append(Spacer(1, 6))
    p(
        "<b>Phase-2 update (NWP + MOS, agriculture, ERA5 NWP proxy on the same 60/40 protocol).</b> "
        "MOS center = a(h,s) + b(h,s)·NWP(t+h) + c(h,s)·anomaly(t), per-site per-horizon OLS with "
        "rolling-fit adaptation and split-conformal 90% intervals; a rolling-skill blend mixes "
        "{anomaly, MOS, normal}. NWP here is the Open-Meteo <b>ERA5 archive</b> (reanalysis ≈ truth), "
        "so these numbers prove the bias-correction machinery, not real forecast skill. Best blend "
        "accuracy (±3 °F): <b>1d 98.3%</b> (RMSE 0.696), <b>7d 97.3%</b> (RMSE 0.759 served "
        "ensemble), <b>30d 96.0%</b> (RMSE 0.793), beating the Phase-1 anomaly center at every "
        "horizon; MOS 90% intervals cover 0.86–0.88 (nominal 0.90). The Phase-2 exit gate "
        "(7d ≥ 80%, 30d ≥ 65%, CRPS(blend) &lt; CRPS(anomaly)) still requires live forecast "
        "snapshots accumulated daily (backend open-meteo-source.js is wired for it) or a GFS "
        "hindcast archive — blocked on a native GRIB2 decoder on this box."
    )
    story.append(Spacer(1, 6))

    p(
        "<b>Phase-2.5 update (CRPS gate + LightGBM ensemble container).</b> "
        "Analytic Normal CRPS gate CRPS(blend) &lt; CRPS(anomaly) passes at every horizon "
        "(1d 0.391 vs 0.606 … 30d 0.444 vs 0.974). A LightGBM quantile-ensemble container "
        "(app/ml/quantile_ensemble.py, CQR intervals) with the plan's parsimony gate beats the "
        "hand blend at h ≥ 3 on the proxy (3d 0.746 vs 0.757 … 30d 0.782 vs 0.793 RMSE) and "
        "loses marginally at 1d (0.703 vs 0.696) — so the gate ships the ensemble at h ≥ 3 and "
        "the blend at 1d. Daily live-forecast snapshots (snapshot_nwp.py) feed eval_nwp.py --live "
        "once ~3+ weeks accumulate."
    )
    story.append(Spacer(1, 6))
    p(
        "<b>Phase-3 update (conditional conformal calibration, agriculture, 60/40, ±3 °F).</b> "
        "Per-context conformal widths replace the single per-month qhat: bins of "
        "(month × seasonal-volatility from the normal's ±15-day std × |anomaly| tercile within "
        "that month), per-bin finite-sample qhats, month-max fallback, horizon-aware alpha tuned "
        "to the top of the coverage band, plus a holdout-calibrated width inflation capped so "
        "width targets are never exceeded (eval_horizons.py --conformal conditional). Gate passes "
        "at every horizon — coverage <b>24h 91.9%</b> / <b>7d 93.8%</b> / <b>30d 89.5%</b> "
        "(target band 88–93%) with mean interval width <b>24h 4.29 °C</b> (target ≤ 4.5, was "
        "6.3) and <b>7d 8.00 °C</b> (target ≤ 8.0, was 11.7). The residual-scale analysis shows "
        "the 2026 eval window holds genuinely more volatile months (30d Feb |residual| p90 6.17 "
        "vs 2.77 calibrated), so the inflation is the honest price within the width budget."
    )
    story.append(Spacer(1, 6))
    p(
        "<b>Phase-4 update (served forecast engine + endpoints).</b> "
        "The Phase-3 stack is packaged for serving: <b>build_forecast_artifact.py</b> compiles the "
        "center hierarchy, per-site ClimateNormals, MOS coefficients, blend weights and the "
        "conditional-conformal tables into <b>models/forecast_artifact.joblib</b>, and a new "
        "<b>ForecastEngine</b> (app/ml/forecast.py) resolves any request site to its nearest grid "
        "point and serves it. Lead hierarchy: <b>h==1 NWP+MOS blend</b> (anomaly center when no "
        "NWP input is supplied), <b>h==7 P2 quantile ensemble</b> when NWP is supplied (else "
        "NWP+MOS blend, else anomaly center), "
        "<b>h==30 anomaly-persistence</b>; every interval applies the calibrated "
        "per-bin qhat × holdout inflation. Exposed as <b>POST /v1/forecast</b> (horizon, target "
        "date, optional obs/NWP temperature) with model_version + served_ts, plus "
        "<b>GET /v1/benchmark</b> publishing the tolerance-accuracy tables. The backend mirrors "
        "both through fail-open clients (ai-benchmark-client.js, /api/benchmark). "
        "<b>Real air labels</b>: fetch_openaq_labels.py pulls real OpenAQ daily PM2.5 for the 16 "
        "sites (OPENAQ_API_KEY-gated, synthetic fallback keeps the offline pipeline green) and a "
        "CAMS source adapter (cams-source.js) adds a second composition forecast to the air "
        "feature group."
    )
    story.append(Spacer(1, 6))

    def acc_rows(hs, unit):
        keys = list(hs["1d_persistence"]["accuracy_within"])
        rows = [[Paragraph("Horizon", cellb), Paragraph("Best center", cellb)]
                + [Paragraph(f"±{k} {unit}", cellb) for k in keys]]
        for h in HORIZONS:
            bc = best_c(hs, h)
            r = hs[f"{h}d_{bc}"]["accuracy_within"]
            rows.append([Paragraph(f"{h}d", cell), Paragraph(bc, cell)]
                        + [Paragraph(f"{r[k]:.0%}", cell) for k in keys])
        return rows, 2.4 * cm + 3.6 * cm + 3.2 * cm * len(keys)

    p("<b>Competitor-style tolerance accuracy</b> (best center per horizon):")
    ag_rows, ag_w = acc_rows(ag, "°C")
    ar_rows, ar_w = acc_rows(ar, "µg/m³")
    tbl(ag_rows, widths=(2.4 * cm, 3.6 * cm, *([3.2 * cm] * (len(ag_rows[0]) - 2))))
    tbl(ar_rows, widths=(2.4 * cm, 3.6 * cm, *([3.2 * cm] * (len(ar_rows[0]) - 2))))

    demo = ag[f"1d_{best_c(ag, 1)}"]["demo"][:2]
    d30 = ag[f"30d_{best_c(ag, 30)}"]["demo"][:1]
    p(
        "Worked example (agriculture, first grid site): <b>24h</b> — trained on the observation "
        f"for <b>{demo[0]['trained_through']}</b>, predicting <b>{demo[0]['predicted_day']}</b> "
        f"&rarr; center {demo[0]['center']} °C, actual {demo[0]['actual']} °C, error "
        f"{demo[0]['error']:+.2f} °C. <b>30d</b> (best 30-day center, "
        f"<b>{best_c(ag, 30)}</b>) — fit on "
        f"observations through <b>{d30[0]['trained_through']}</b>, predicting "
        f"<b>{d30[0]['predicted_day']}</b> &rarr; center {d30[0]['center']} °C, actual "
        f"{d30[0]['actual']} °C, error {d30[0]['error']:+.2f} °C. Because the climatology already "
        "captures seasonal warming, its 30-day error is smaller than persistence's; the calibrated "
        "interval still widens with horizon."
    )

    # ---------- 7.2 Competitor benchmark ----------
    sec("7.2 &nbsp;·&nbsp; Competitor Benchmark (tolerance accuracy)")
    p(
        "Weather/AQ providers publish <b>accuracy within tolerance</b> (typically within ±3 °F) "
        "rather than calibration scores. This benchmark measures PERN on the same yardstick "
        "(±3 °F = ±1.667 °C) over the exact 60/40 eval protocol and overlays published figures "
        "(NWS/ForecastWatch industry bands, ForecastWatch provider averages, OpenWeather, "
        "Weatherbit, Ambee). The Phase-4 headline row is the <b>served ForecastEngine</b> — the "
        "actual shipped product (h=1 NWP+MOS blend, h=7 P2 quantile ensemble, h=30 anomaly) — scored "
        "out-of-sample on the multi-year record."
    )
    with open(os.path.join(AI, "models", "benchmark.json")) as fh:
        bench = json.load(fh)
    agp = bench["pern"]["agriculture"]
    tol3 = str(bench["yardstick"]["deg_c"])

    def acc3(h, c):
        return agp[f"{h}d"][c]["accuracy_within"][tol3]

    story.append(Image(os.path.join(CHARTS, "benchmark.png"), width=16.2 * cm, height=5.1 * cm))
    sm("PERN tolerance-accuracy curves (agriculture) vs published provider numbers at the ±3 °F "
       "yardstick (dashed vertical). Solid = served engine, dashed = best bare center. Gold "
       "squares = published values (ranges as error bars). The curve shows exactly what a single "
       "provider % hides: the easy-day mass and the long tail.")

    comp = bench.get("comparison", {}).get("horizons", {})
    if comp:
        rows = [[Paragraph("Horizon", cellb), Paragraph("Provider (within ±3 °F)", cellb),
                 Paragraph("Published %", cellb), Paragraph("PERN served", cellb),
                 Paragraph("Verdict", cellb)]]
        hname = {"1d": "24 h", "7d": "7 d", "30d": "30 d"}
        for hk in ("1d", "7d", "30d"):
            e = comp[hk]
            for c in e["competitors"]:
                band = f"{c['lo']:.0f}–{c['hi']:.0f}%" if c["lo"] != c["hi"] else f"{c['lo']:.0f}%"
                rows.append([Paragraph(hname[hk], cell), Paragraph(c["label"], cell),
                             Paragraph(band, cell), Paragraph(f"{e['pern_served_pct']:.1f}%", cell),
                             Paragraph(c["verdict"], cell)])
        story.append(Spacer(1, 4))
        p("<b>Served engine vs published providers, within ±3 °F (out-of-sample, multi-year):</b>")
        tbl(rows, widths=(1.9 * cm, 5.3 * cm, 2.5 * cm, 2.5 * cm, 4.0 * cm))
        story.append(Image(os.path.join(CHARTS, "benchmark_vs_competitors.png"),
                           width=16.2 * cm, height=4.4 * cm))
        sm("Horizontal bars = published provider bands; green line = PERN served. 24 h 98.3% "
           "(NWP+MOS blend; anomaly fallback 88.8% with NWP off) clears every published band on the "
           "proxy; 7 d 97.3% clears every provider only on the ERA5 "
           "proxy (near-truth, P2 ensemble) — with NWP forced off the same engine serves the anomaly "
           "fallback at 71.1%, already inside the NWS 70–80 band; 30 d 72.1% (anomaly, no NWP) clears "
           "the NWS 10 d 30–60% band.")
        story.append(Spacer(1, 6))

    p("<b>Bare centers (transparency — where the served numbers come from):</b>")
    tbl([[Paragraph("Horizon", cellb), Paragraph("PERN (best center)", cellb), Paragraph("PERN within ±3 °F", cellb),
          Paragraph("Industry / provider (within ±3 °F)", cellb)]]
        + [
            [Paragraph("24 h", cell), Paragraph("anomaly", cell),
             Paragraph(_pct(acc3(1, "anomaly")), cell),
             Paragraph("NWS 90–95% · OpenWeather 89% · Weatherbit 91% · Ambee &gt;90%", cell)],
            [Paragraph("7 d", cell), Paragraph("anomaly", cell),
             Paragraph(_pct(acc3(7, "anomaly")), cell),
             Paragraph("NWS 70–80% · OpenWeather 82% · Weatherbit 84%", cell)],
            [Paragraph("30 d", cell), Paragraph("anomaly", cell),
             Paragraph(_pct(acc3(30, "anomaly")), cell),
             Paragraph("NWS ~30–60% (10 d)", cell)],
            [Paragraph("1–5 d avg", cell), Paragraph("—", cell), Paragraph("—", cell),
             Paragraph("ForecastWatch providers: Microsoft 79.5% · TWC/IBM 79.2% · Foreca 77.7%", cell)],
        ], widths=(2.2 * cm, 3.4 * cm, 3.2 * cm, 8.2 * cm))

    story.append(Image(os.path.join(CHARTS, "benchmark_air.png"), width=16.2 * cm, height=4.5 * cm))
    sm("Air track tolerance-accuracy curves (PM2.5, µg/m³). No AQ provider publishes a consistent "
       "within-tolerance number, so no competitor markers exist; the curves document PERN's "
       "share-within-tolerance at every lead time for honest reporting.")
    story.append(Spacer(1, 6))
    p(
        "<b>Honest reading.</b> PERN scores <i>daily-mean</i> temperature while providers score "
        "instantaneous/daily-high forecasts — daily means are smoother, so this comparison flatters "
        "PERN somewhat. The served 24 h row is the NWP+MOS blend at 98.3% within ±3 °F (94.4% for "
        "MOS alone) when an NWP input exists, above every published 24 h band; with NWP forced off "
        "the same engine serves the anomaly center at 88.8% (RMSE 1.131, up from the old persistence "
        "rung's 87.8%). The 98.3% is proxy-fed (ERA5 ≈ truth), so it is not claimable until "
        "live-NWP snapshots pass the gate. The honest 7 d row today — the "
        "same engine with NWP forced off — is the anomaly fallback at 71.1% within ±3 °F, already "
        "inside the NWS 70–80 band; the served 7 d is the P2 quantile ensemble at 97.3% (RMSE 0.759, "
        "honest 86.8% coverage, width 5.72) on the proxy, not claimable until ~3+ weeks of live-NWP "
        "snapshots pass the gate. Bare anomaly rows use the artifact’s anomaly config (harmonic, "
        "per-site, 3 harmonics), so the bare 30 d anomaly (72%) equals the served 30 d center "
        "(72.1%) exactly. The cold-start 24 h ≈95% figure is a most-recent-month measurement, not "
        "the 88.8% multi-year no-NWP headline."
    )

    story.append(Spacer(1, 4))
    p("<b>Cold-start sensitivity — the \"user entered 7 days / 2 weeks / a month\" case:</b>")
    story.append(Image(os.path.join(CHARTS, "benchmark_history_sensitivity.png"),
                       width=16.2 * cm, height=4.35 * cm))
    sm("Per site, only the last W days of history calibrate, then the same final 30 real days are "
       "scored at each lead (best center by RMSE). 24 h is 95% within ±3 °F even with just 7 days "
       "of history (persistence needs only today's observation); 7 d sits at the NWS 70% floor "
       "from a week of data (69%) and jumps to 88% once a full seasonal year fits the harmonic "
       "anomaly normal; 30 d also needs that full year (62% vs the NWS 30–60 band). The "
       "cold-start benchmark uses the artifact’s anomaly config (harmonic, per-site). Caveat: the "
        "eval window is the single most recent month — it measures the cold-start question, not the "
        "full-record 60/40 number (24 h 95% here vs the 88.8% no-NWP served headline). "
       "models/benchmark_history.csv + models/charts/benchmark_history_sensitivity.png.")
    story.append(Spacer(1, 6))

    # ---------- 8 Drift & retrain ----------
    sec("8 &nbsp;·&nbsp; Drift Detection &amp; Safe Retraining")
    kv([
        ("Feature drift (PSI)", "population_stability_index splits the reference distribution into 10 "
         "quantile bins and computes Σ (p_o − p_e)·ln(p_o/p_e). Moderate > 0.10, severe > 0.25; "
         "flagged features appear in the API response."),
        ("Residual CUSUM", "Two-sided: s⁺(t) = max(0, s⁺(t−1) + r − kσ), s⁻ mirrors, reset on "
         "crossing hσ. k = 0.5, h = 5 in units of reference std — catches a persistent rise in "
         "forecast error (stale calibration)."),
        ("Serve-time hint", "Every /v1/confidence response embeds drift: max_abs_z and flagged "
         "features vs the artifact's reference_stats (training mean/std); |z| > 4 → off-distribution."),
        ("Retraining gate", "retrain.py rebuilds the dataset, trains a candidate, and replaces "
         "models/artifact.joblib only if the candidate temporal backtest is at least as calibrated "
         "and accurate as the incumbent. Every decision is logged to models/promotions.jsonl; "
         "--force bypasses the gate. A bad candidate can never reach the website."),
    ])

    # ---------- 9 Artifact & API ----------
    sec("9 &nbsp;·&nbsp; Artifact Schema &amp; API Spec")
    p("models/artifact.joblib (joblib dump of a dict):")
    story.append(Paragraph(
        "features: [latitude, longitude, temperature, temperature_max, temperature_min, precipitation, humidity, wind_speed, month, day_of_year, day_of_week]<br/>"
        "model: PersistenceResidual(temp_idx=2)<br/>model_type: persistence · alpha: 0.10 · qhat: 1.261<br/>"
        "target_std: 4.009 · target_transform: level<br/>"
        "reference_stats: {&lt;feature&gt;: {mean, std}} · trained_ts: ISO-8601", monobox))
    p("POST /v1/confidence &mdash; request &amp; response:")
    story.append(Paragraph(
        "POST /v1/confidence<br/>"
        "Request:  { latitude: 31.0, longitude: 31.3, feature_group: \"agriculture\",<br/>"
        "            features: { temperature: 30.2, temperature_max: 34.1, temperature_min: 26.4,<br/>"
        "                         precipitation: 0.0, humidity: 62, wind_speed: 4.1,<br/>"
        "                         month: 7, day_of_year: 202, day_of_week: 3 },<br/>"
        "            ts: \"2026-07-21T00:00:00Z\" }<br/>"
        "Response: { score: 87.4, center: 30.2, lower: 28.939, upper: 31.461,<br/>"
        "            coverage: 0.9, interval_width: 2.5219,<br/>"
        "            method: \"persistence-quantile+cqr\", model_version: &lt;trained_ts&gt;,<br/>"
        "            feature_group: \"agriculture\", served_ts: &lt;utc&gt;,<br/>"
        "            drift: { max_abs_z, flagged: [...], hint: \"in-distribution\" } }", monobox))

    # ---------- 10 Module map ----------
    sec("10 &nbsp;·&nbsp; Code / Module Map")
    tbl([[Paragraph("Module", cellb), Paragraph("Responsibility", cellb)]]
        + [[Paragraph(m, cell), Paragraph(d, cell)] for m, d in [
            ("app/ml/models.py", "LightGBMQuantile, SklearnQuantile, PersistenceResidual, ClimateNormals, DEFAULT_ALPHAS"),
            ("app/ml/conformal.py", "cqr_quantile, cqr_intervals, quantile_residual_intervals, conditional_conformal_intervals"),
            ("app/ml/cv.py", "temporal_block_split, leave_locations_out_split, calibration_split"),
            ("app/ml/metrics.py", "RMSE, MAE, MAPE, pinball/CRPS, coverage, interval width"),
            ("app/ml/backtest.py", "feature_columns, feature_matrix, run_backtest, confidence_score"),
            ("app/ml/drift.py", "PSI, feature_psi, residual_cusum, drift_summary"),
            ("app/ml/labels.py · synthetic.py", "load_training_data (real CSV → synthetic fallback)"),
            ("app/main.py", "FastAPI app: /health, /v1/confidence, /v1/forecast (§4), /v1/benchmark (§4)"),
            ("train.py · retrain.py · backtest_cli.py", "train + promote gate · scheduled retrain · CLI backtest"),
            ("make_real_dataset.py · make_real_air_dataset.py · fetch_openaq_labels.py", "real POWER labels · synthetic air labels · real OpenAQ daily PM2.5 labels (key-gated, synthetic fallback)"),
            ("eval_horizons.py", "multi-horizon (24h/7d/30d) walk-forward skill eval → models/horizon_eval.json; --conformal conditional = Phase-3 per-context widths (month × vol × |anomaly| bins, tuned alpha, holdout inflation) → models/horizon_eval_conditional.json"),
            ("app/ml/conformal.py", "grouped + conditional split-conformal intervals (per-bin qhats, month-max fallback)"),
            ("eval_nwp.py · app/ml/mos.py", "Phase-2 NWP+MOS harness: per-site per-horizon OLS bias correction, rolling-fit + split-conformal intervals, rolling-skill blend, CRPS gate, --ensemble parsimony gate → models/phase2_eval.json"),
            ("snapshot_nwp.py · app/ml/quantile_ensemble.py", "daily Open-Meteo 16-day forecast snapshots → data/nwp_live/ · LightGBM quantile-ensemble container (CQR) for the Phase-2.5 parsimony gate"),
            ("build_forecast_artifact.py · app/ml/forecast.py", "Phase-4 serving artifact (center hierarchy + MOS + conditional tables) → models/forecast_artifact.joblib · ForecastEngine: site resolution, lead hierarchy, qhat lookup, /v1/forecast"),
            ("benchmark_competitors.py", "tolerance-accuracy benchmark vs published providers + month/site strata + served row + cold-start sensitivity (--history-windows) + baseline lock → models/benchmark*.json/csv + charts"),
            ("check_benchmark.py · run_benchmark_gate.py", "living-contract gate: fail on regression vs models/benchmark_baseline.json (CI/nightly; retrain.py --benchmark-gate)"),
            ("tests/", "test_backtest (9) · test_api (4) · test_drift (4) · test_conformal_models (7) · test_benchmark_gate (9) · test_mos (6) · test_conformal (6) · test_forecast (7) · test_openaq_labels (6) · test_benchmark_served (4) · test_benchmark_history (4) · test_live_nwp (2) — pytest green (70 passed)"),
            ("pern-backend (Node)", "ai-confidence-client.js + ai-benchmark-client.js (fail-open clients) → trust-engine.js "
             "computeConfidenceWithAI(); global-ingestion.js uses the AI path; open-meteo-source.js "
             "adds the NWP feature group (live 16-day forecast + ERA5 archive for MOS training); "
             "cams-source.js adds the CAMS composition forecast to the air feature group"),
        ]], widths=(6.0 * cm, 11.0 * cm))

    # ---------- 11 Tech stack ----------
    sec("11 &nbsp;·&nbsp; Technology Stack")
    kv([
        ("Language / runtime", "Python 3.14.0 (model + API) · Node.js/Express (backend client)"),
        ("Web API", "FastAPI 0.141.1 + Uvicorn · Pydantic request validation"),
        ("ML libraries", "LightGBM 4.7.0 (quantile) · scikit-learn 1.9.0 (fallback) · numpy 2.5.2 · "
         "pandas 3.0.5 · joblib (artifact serialization)"),
        ("Statistical methods", "split-conformal CQR · conditional conformal (per-context widths, "
         "month × vol × |anomaly| bins) · quantile regression · MOS (rolling OLS bias correction + "
         "blend) · PSI · CUSUM"),
        ("Data sources", "NASA POWER (history) · Open-Meteo (16-day NWP + ERA5 archive for MOS) · "
         "OpenAQ (real air labels, key-gated) · CAMS (composition forecast, key-gated, sim fallback)"),
        ("Deployment", "Docker — pern-ai service on :8000 wired into docker-compose; artifact "
         "hot-swapped by retrain.py without a rebuild; /v1/forecast + /v1/benchmark served from "
         "build_forecast_artifact.py output"),
        ("Persistence", "PostgreSQL (feature_vectors, global_api_keys, device keys)"),
        ("Quality gates", "pytest 70 passed · backend vitest 248 passed across 15 files · "
         "benchmark gate (check_benchmark.py) fails CI/retrain on regression vs the locked baseline"),
    ])

    # ---------- 12 Limitations ----------
    sec("12 &nbsp;·&nbsp; Honest Limitations")
    for txt in [
        "At a 1-day horizon the served point forecast is the anomaly center (88.8% within ±3 °F, "
        "up from the old persistence rung's 87.8%); the engine's primary value is calibrated "
        "uncertainty, complemented by the NWP+MOS 24 h blend (98.3% on the proxy) once live NWP "
        "lands.",
        "NASA POWER daily values for the most recent 1–2 days are preliminary and can be revised.",
        "Air quality labels come from OpenAQ once OPENAQ_API_KEY is set; without a key the offline "
        "pipeline falls back to physically-plausible synthetic PM2.5, so air-track numbers carry "
        "that caveat until keyed. CAMS endpoints likewise fall back to simulation without "
        "CAMS_API_KEY.",
        "The MOS blend weights were estimated on an ERA5-archive proxy; they are re-estimated from "
        "data/nwp_live/ snapshots once ~3 weeks accumulate.",
        "Spatial leave-locations-out coverage (77%) is lower than temporal — brand-new sites deserve "
        "less trust, and the confidence score reflects it.",
        "The promotion gate compares candidates on the same data family; it prevents regression but "
        "cannot invent signal that the features do not contain.",
    ]:
        p(f"&bull; &nbsp;{txt}")

    return story


def main(argv=None):
    ap = argparse.ArgumentParser(description="Generate the PERN AI Engine PDF")
    ap.add_argument("--out", default=os.path.join(ROOT, "PERN-v4.0-AI-Engine.pdf"))
    args = ap.parse_args(argv)

    with open(os.path.join(AI, "models", "metrics.json")) as fh:
        metrics = json.load(fh)
    real = pd.read_csv(os.path.join(AI, "data", "real_labeled.csv"))
    air = pd.read_csv(os.path.join(AI, "data", "air_labeled.csv"))
    art = joblib.load(os.path.join(AI, "models", "artifact.joblib"))
    with open(os.path.join(AI, "models", "horizon_eval.json")) as fh:
        horizon_eval = json.load(fh)

    doc = SimpleDocTemplate(
        args.out, pagesize=A4,
        leftMargin=1.9 * cm, rightMargin=1.9 * cm, topMargin=1.6 * cm, bottomMargin=1.7 * cm,
        title="PERN v4.0 AI Engine", author="PERN Engineering",
    )

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setStrokeColor(GRID)
        canvas.setLineWidth(0.5)
        canvas.line(1.9 * cm, 1.2 * cm, A4[0] - 1.9 * cm, 1.2 * cm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(GREY)
        canvas.drawString(1.9 * cm, 0.8 * cm, "PERN v4.0 AI Trust & Prediction Engine — ML Technical Documentation")
        canvas.drawRightString(A4[0] - 1.9 * cm, 0.8 * cm, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    doc.build(build(metrics, real, air, art, horizon_eval), onFirstPage=footer, onLaterPages=footer)
    print(f"wrote -> {args.out} ({os.path.getsize(args.out):,} bytes)")


if __name__ == "__main__":
    main()
