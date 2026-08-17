# PERN v4.0 — Long-Horizon Accuracy Plan ("Close the Gap")

> Companion to `PERN-v4.0-AI-Engine-Plan.md` and
> `PERN-v4.0-AI-Engine-Evaluation.md`. Scope is **one problem**: the measured
> tolerance-accuracy gap at 7 d / 30 d horizons versus published consumer
> weather providers, plus the calibration slack it exposes at 24 h. Success is
> defined on the same ±3 °F yardstick the benchmark already uses.

---

## 0. The problem, measured (not assumed)

`benchmark_competitors.py` (60/40 walk-forward, real NASA POWER T2M, agriculture
track) — share of forecasts within ±3 °F (±1.667 °C). Phase-4 headline: the
**served ForecastEngine** (h=1 NWP+MOS blend, h=7 P2 quantile ensemble, h=30 anomaly) on the
multi-year record; bare best-center rows for the pre-NWP protocol:

| Horizon | Served engine now | Served, no NWP (honest today) | Best bare center (pre-NWP) | Published benchmark | Gap |
|---------|-------------------|----------------------------|----------------------------|---------------------|-----|
| 24 h | **98%** (NWP+MOS, ERA5 proxy) | **88.8%** (anomaly center) | 89% (anomaly) | NWS 90–95% · OpenWeather 89% · Weatherbit 91% | proxy above all; honest 88.8% **−1 to −2 pts** |
| 7 d | **97%** (NWP+MOS, ERA5 proxy) | **71%** (anomaly) | 71% (anomaly) | NWS 70–80% · OpenWeather 82% · Weatherbit 84% | proxy above all; honest 71% **in band** |
| 30 d | **72%** (anomaly) | 72% (same) | 72% (anomaly) | NWS ~30–60% (10 d) | +12 vs floor |

> The 7 d served number uses the ERA5 reanalysis as the NWP input (near-truth);
> it proves the MOS machinery end-to-end but overstates live skill — the live
> gate needs ~3+ weeks of `data/nwp_live/` snapshots. The **`served_no_nwp`** row
> (same engine, NWP forced off) is the honest capability a site gets today:
> 24 h = anomaly center at 88.8% (up from the old persistence rung's 87.8%),
> 7 d = anomaly fallback at 71% (already inside the NWS
> 70–80 band). Bare anomaly rows now use the artifact's anomaly config (harmonic,
> per site, 3 harmonics, window 1), so bare anomaly == the served 30 d anomaly
> center exactly. 7 d served coverage is now honest (86.8%, width 5.72): the
> h==7 P2 ensemble serves its own CQR-calibrated bounds instead of the wider
> anomaly-rung interval (which over-covered at 99.4% / 8.0 °C pre-ensemble).

Calibration slack measured alongside (same protocol, α = 0.10, anomaly center):

| Horizon | Center | Coverage | Width | Issue |
|---------|--------|----------|-------|-------|
| 24 h | persistence | 99.9% | 6.3 °C | **over-covers**: 10 pts of nominal wasted width |
| 7 d | persistence | 98.6% | 11.7 °C | over-covers + too wide |
| 30 d | climatology | 87.5% | 5.9 °C | near-nominal but width tight vs true tail |

**Root causes (all evidenced in the eval):**
1. Persistence is the right center only at lag 1; at h ≥ 7 its skill decays
   (RMSE 0.76 → 1.68 → 2.51) while a *single-season* climatology is the only
   alternative tested. There are **no multi-year normals, no NWP, no anomaly
   model** — the two ingredients every real provider uses.
2. The calibration layer calibrates one qhat per month against **|residual|**
   and can neither narrow the 24 h interval (over-coverage = lost confidence
   score) nor track the **growth of the residual tail** with horizon.
3. The air track is **synthetic-labeled**; no real PM2.5 benchmark exists yet.
4. The eval is **one ~120-day season** — too short to measure seasonal
   generalization or train real climatology.

---

## 0.5 Closing the 24 h gap (88% → ≥ 95%) — plan with proofs

**The problem, precisely.** The served engine at h == 1 originally returned *pure
persistence* (`ForecastEngine.center("1")` → `obs_temperature`), measured at
**87.8%** within ±3 °F / RMSE 1.203 on the multi-year record — below the NWS
90–95 band, OpenWeather 89, Weatherbit 91. But the h == 1 **MOS layer already
exists in the artifact** (coef per site + blend weights 0.634 mos / 0.314
anomaly / 0.052 normal, fit on the ERA5 proxy) — the engine just never called
it at lead 1. The proof that it was the fix, from the same eval protocol
(`models/phase2_eval.json`, 1 d horizon):

| Center at 24 h | RMSE (°C) | within ±3 °F | n_eval_pairs |
|---|---|---|---|
| persistence (what is served today) | 1.203 | 87.8% | 6992 |
| anomaly (persistence of the departure) | 1.131 | 88.8% | 6992 |
| **MOS: a + b·NWP + c·anomaly** | **0.873** | **94.4%** | 6992 |
| **blend (mos 0.634 · anom 0.314 · normal 0.052)** | **0.696** | **98.3%** | 6992 |
| normal (climatology) | 1.804 | 70.4% | 6992 |

**Plan — now implemented (benchmark re-locked, gate green, 70 tests pass):**

1. **Serve the fitted 24 h blend when an NWP input exists** — done: the
   `h == 1` branch of `ForecastEngine.center()` now uses the exact same NWP+MOS
   rung as `h == 7` (coefs + blend weights are in `forecast_artifact.joblib`).
   Measured on the proxy: **98.3%** within ±3 °F (MOS alone 94.4%), vs the
   served anomaly row 88.8%.
2. **No-NWP 24 h fallback is the anomaly center** — done: with no NWP the
   engine serves `normal(t+1) + ρ(1)·anomaly`, measured **88.8%** within ±3 °F /
   RMSE 1.131 on the same 60/40 split — strictly better than persistence
   (87.8% / 1.203) with zero extra data. Bare persistence stays the cold-start
   measurement rung (§0.6): 24 h is **95% within ±3 °F even with just 7 days of
   history**.
3. **Recalibrate the interval on the MOS center** — deferred: the 24 h interval
   is still calibrated on the *anomaly* residual rung, so a served NWP+MOS
   center over-covers (98% today) until the planned CQR-on-NWP pass (§3 Phase
   3) narrows it. Honest no-NWP 24 h coverage is 92.1% — inside the 88–93% band.
4. **Gate + monitor.** `check_benchmark.py` gates the served 24 h row nightly;
   add the ≥ 95% floor to the gate after live-NWP promotion (§7), since today's
   98.3% is proxy-fed.

**Honest reading.** The 98.3% blend number uses the ERA5 reanalysis as NWP
(near-truth). Live Open-Meteo at lead 1 is genuinely high-skill (it is what
OpenWeather/Weatherbit resell), so ≥ 95% is a defensible target — but it must
be re-measured on `data/nwp_live/` snapshots, not the proxy, before promotion
(§8 risk). The 88.8% no-NWP figure is the full-record headline; the
cold-start 95% (§0.6) is measured on the single most recent month and answers
only the cold-start question — it is not the multi-year served number. Today's
no-NWP served 24 h row (anomaly center) is exactly 88.8%.

---

## 0.6 Cold-start sensitivity — "the user just entered 7 days / 2 weeks / a month"

New benchmark (`benchmark_competitors.py --history-windows`, output in
`models/benchmark_history.csv` + `models/charts/benchmark_history_sensitivity
.png`): per site, only the last W days of history calibrate, then the **same**
final 30 real days are scored at each lead — so the only variable is history
length. Best center (by RMSE) per window. Agriculture, 16 sites × 3 y,
within ±3 °F:

| History available (W) | 24 h | 7 d | 30 d |
|---|------|-----|------|
| **7 days** | **95%** (persistence) | 69% | 48% (persistence) |
| 14 days | 95% | 69% | 48% |
| 30 days | 95% | 71% | 48% |
| 90 days | 95% | 69% | 48% |
| 365 days | 96% | 88% (anomaly) | **62%** (climatology) |
| Published bands | NWS 90–95 · OpenWeather 89 · Weatherbit 91 | NWS 70–80 · OW 82 · WB 84 | NWS 30–60 |

Reading: **24 h needs no history** (persistence = 95% from day 7); **7 d sits
right at the NWS band floor** from a week of data (69% vs 70) and jumps to 88%
once a full seasonal year of history fits the harmonic anomaly normal; **30 d
also needs that year** (62% vs 30–60). The cold-start benchmark uses the
artifact's anomaly config (harmonic, per site, 3 harmonics). Caveat: the eval
window is the single most recent 30-day month (so absolute accuracy is not
comparable to the full-record 60/40 served rows — it answers the cold-start
question only; the 95% is that recent-month figure, not the 88.8% no-NWP headline).

---

## 1. Targets (the benchmark contract, all ±3 °F unless stated)

| Metric | Now | Target | Measurement |
|--------|-----|--------|-------------|
| 24 h within ±3 °F | 98% (NWP+MOS proxy) / 88.8% no-NWP | **≥ 95%** (hold) | benchmark, agriculture, served (fix in §0.5) |
| 7 d within ±3 °F | 97% (ERA5 proxy) | **≥ 80%** | benchmark, agriculture, served |
| 30 d within ±3 °F | 72% | **≥ 65%** | benchmark, agriculture, served |
| 7 d RMSE | 0.76 °C (served ensemble) | **≤ 1.20 °C** | same protocol |
| 24 h coverage | 97.8% served NWP+MOS / 92.2% no-NWP | **88–93%** | CQR-on-NWP narrows served interval (Phase 3) |
| 7 d interval width | 5.72 °C @ 86.8% coverage (ensemble CQR) | **≤ 8.0 °C** @ ≥ 88% coverage | |
| All-horizon coverage | varies | **88–93%** every horizon | grouped conformal |
| Cold start | §0.6 table | **gate 24 h ≥ 95% even at W = 7 days** | benchmark_history.csv nightly |
| Air track | synthetic | **real OpenAQ labels + CAMS** | first real AQ benchmark |

Gate definition for any ship: a candidate model must **beat the incumbent on
RMSE *and* tolerance accuracy at every horizon it claims**, on the nightly
benchmark run, over a rolling window ≥ 3 seasons — or it does not promote.

---

## 2. Workstreams

| WS | Name | Owns | Depends on |
|----|------|------|------------|
| WS1 | Multi-year data & climate normals | data backfill, feature store, normals model | — |
| WS2 | NWP ingestion + MOS | forecast-source adapter, bias correction | WS1 |
| WS3 | Center model hierarchy | anomaly persistence → harmonic → NWP blend → quantile ensemble | WS1, WS2 |
| WS4 | Calibration (tighter, horizon-aware) | conditional grouped conformal, CQR on NWP | WS3 |
| WS5 | Air track (real data + AQ forecast) | OpenAQ labels, CAMS adapter | WS2 |
| WS6 | Evaluation as a living contract | nightly benchmark, skill scores, regression gates, dashboard | all |
| WS7 | Product & API | multi-horizon `/v1/forecast`, center switch, published tables | WS3–WS5 |

---

## 3. Phased execution with hard gates

### Phase 0 — Instrument (Wk 1)
- Freeze the benchmark as a testable contract: `benchmark_competitors.py` runs
  in CI/nightly; JSON is versioned; any PR that moves a metric in the wrong
  direction fails a gate.
- Extend the eval protocol to **month-stratified** and **site-stratified**
  tolerance tables (the 16 grid sites differ; one aggregate hides it).
- Add CRPS / pinball / **skill-score vs climatology**
  (SS = 1 − MSE / MSE_clim) to `app/ml/metrics.py` — the score that says
  whether a model is *useful*, not just small.
- **Exit:** benchmark.csv exists nightly, gates wired, baseline numbers locked.

### Phase 1 — Multi-year data + climate normals (Wk 2–5)
**Goal: 7 d within ±3 °F 68% → ~74%; 30 d 57% → ~62%.**
- Backfill NASA POWER **daily T2M (and T2M_MAX/MIN, PRECTOTCORR, RH2M, WS2M)
  for the full archive** (1981–present, keyless) for the 4×4 agriculture grid
  into `feature_vectors` via a new `power-history.js` / `make_history_dataset.py`
  (respect NASA's rate limits; store raw + a `history_*` feature group).
- Build `ClimateNormals` in `app/ml/models.py`:
  - harmonic/Fourier fit to multi-year day-of-year means (7 harmonics ≈ annual
    + semi-annual + intra-seasonal), optionally by site cluster.
  - outputs `normal(t+h)` **and** `normal_std(t+h)` (seasonal volatility
    envelope — feeds WS4's conditional calibration).
- Center model **#2 (anomaly persistence)**: `center = normal(t+h) +
  ρ(h)·(x_t − normal(t))` with ρ(1)≈0.9 → ρ(30)≈0.1 learned per horizon on the
  multi-year residual — the standard "persistence of the departure from the
  seasonal cycle".
- **Exit gate:** 7 d ±3 °F ≥ 74%, 30 d ≥ 62% on the 60/40 protocol, AND
  skill-score vs single-season climatology strictly > 0. Otherwise the normals
  are not yet better than the current climatology and Phase 2's MOS has nothing
  to stand on.

### Phase 2 — NWP + MOS bias correction (Wk 5–10)
**Goal: 7 d ±3 °F → ~80%; 30 d → ~65%.**
This is the only lever that can structurally beat persistence-plus-climatology
at h ≥ 5 — it is what OpenWeather/Weatherbit actually sell.
- **Adapter (backend):** Open-Meteo first (free, no key, 16-day forecast at
  each grid point, also an archive API for training MOS); GFS 0.25° as fallback.
  New `pern-backend/services/sources/open-meteo.js` + `nwp-source.js`
  (mirroring the existing `sources/` pattern), writing forecast rows with
  `feature_group='nwp'`, lead-time hours, and init-time to `feature_vectors`.
- **MOS (pern-ai):** `app/ml/mos.py` — trained on past NWP init vs realized
  T2M: `center = a(h, site) + b(h, site)·NWP(t+h) + c(h, site)·anomaly_persistence`,
  fit per horizon per site-cluster on a rolling 30–60 d window (never future
  data). Quantile mapping on the residual distribution for WS4.
- **Ensemble center (WS3 top level):** weighted blend of {anomaly persistence,
  NWP+MOS, climate normal}, weights by rolling skill per horizon. A LightGBM
  quantile regressor on {NWP, normal, anomaly, lag, day-of-year, site cluster}
  is the eventual container — it should beat the hand blend; if not, ship the
  blend (parsimony gate).
- **Exit gate:** 7 d ±3 °F ≥ 80%, 30 d ≥ 65%, and CRPS(blend) <
  CRPS(anomaly persistence) at every horizon on 3 rolling seasons.

### Phase 3 — Calibration that stays honest and tight (Wk 9–12)
**Goal: coverage 88–93% every horizon; 24 h width 6.3 → ≤ 4.5 °C; 7 d width
11.7 → ≤ 8.0 °C.**
- **Fix 24 h over-coverage first** (highest ROI, zero new data): the residual
  tail is dominated by a few transition days; per-month grouped conformal +
  finite-sample correction over-cover. Replace the single |residual| qhat with
  **conditional conformal**: bin the calibration residuals by (month, seasonal-
  volatility bin from `normal_std`, |anomaly|); one qhat per bin; test rows take
  their bin's qhat (fallback = max bin, as today).
- **Horizon-aware α:** keep α = 0.10 target but allow per-horizon local α so
  achieved coverage lands inside 88–93% rather than 99% (the score formula
  already penalizes both over- and under-coverage).
- **CQR on NWP:** once Phase 2 exists, run CQR with the quantile ensemble so
  intervals narrow where the NWP agrees across ensemble members (spread–error
  relationship) — this is the "free" width win.
- **Exit gate:** coverage 88–93% on every horizon×month cell with ≥ 30 eval
  rows, width targets above met, and the 24 h confidence score higher than the
  current artifact's (it will be — it was leaking ~10 pts of nominal).

### Phase 4 — Air track + product (Wk 11–16)
- **Air data:** provision a real `OPENAQ_API_KEY`; run the existing
  `openaq.fetchByLocation` daily label pass (openaq-source.js:64 already
  verified); replace `data/air_labeled.csv` synthetic labels.
- **CAMS adapter:** Copernicus CAMS global AQ forecasts (PM2.5, 3–5 days) as
  the air NWP channel; same MOS/calibration stack as WS2/WS4.
- **API:** `POST /v1/forecast {horizon: 1|7|30}` returning `{center, lower,
  upper, coverage, confidence, method, center_used}` — the engine switches
  center by lead time automatically (persistence ≤ 24 h → NWP+MOS 7 d → blend
  30 d). `/v1/confidence` unchanged for existing callers.
- **Published tables:** the benchmark's tolerance tables (month × horizon) go
  onto the product (dashboard/API page) — the same "publishing the same
  tolerance tables ourselves" lever from the competitor analysis; being
  verifiable is the differentiator providers do not offer.
- **Exit gate:** first real air benchmark run; air 1 d RMSE < 0.5 × target std
  (real signal, unlike today's synthetic 19.9 vs 18.6); `/v1/forecast` E2E
  green with drift/fallback handling matching `/v1/confidence`.

---

## 4. Center-model hierarchy (exact ordering, WS3)

```
serve(h):
  if h == 1 and NWP present: return NWP+MOS blend        # §0.5: 98.3% ±3°F on proxy; goal ≥95% (live)
   if h == 1:                 return anomaly center = normal(t+1) + ρ(1)·anomaly   # no-NWP fallback; 88.8% (was 87.8% persistence)
  elif h <= 7:               return NWP+MOS blend
                               # center = a + b·NWP(t+h) + c·[x_t − normal(t)]·ρ(h)
  else:                      return blend(anomaly-persistence, NWP+MOS, normal)
  interval, score = conditional_conformal(center, bin(month, vol_bin, |anomaly|))
```

Parsimony rule: each rung must beat the previous rung on the benchmark gate
before it becomes the served center (anomaly center beat persistence at 24 h:
88.8% vs 87.8%, RMSE 1.131 vs 1.203). Bare persistence remains the cold-start
measurement rung (§0.6) and the fallback for horizons where it wins.

---

## 5. Calibration detail (WS4)

Current: `grouped_conformal_intervals(center, y, month, ...)` — one qhat per
month on |residual|, fallback = max qhat. Issues: over-covers (99.9% at 24 h),
and one width per month ignores volatility *within* a month.

Upgrade (in `app/ml/conformal.py`, additive, keeps the old function for
compat/tests):
- `conditional_conformal_intervals(...)` with a user-supplied bin key
  (month × `normal_std` quantile × |anomaly| quantile) per row; qhat per bin,
  fallback = max qhat per month.
- Calibration slice: as today, last 30% of each train block / first-60% split
  in the benchmark — never future data.
- Add `normal_std(t+h)` to the artifact `reference_stats` so serve-time binning
  needs no new API surface.

---

## 6. NWP source decision (WS2, Open Decision #1)

| Criterion | Open-Meteo (recommended) | GFS 0.25° |
|---|---|---|
| Key | none | none |
| Forecast range | 16 d | 16 d |
| Archive for MOS training | yes (historical API) | yes (NOMADS/bigquery) |
| Air-quality forecasts | no (CAMS separately) | no (CAMS separately) |
| Grid resolution | 0.25° | 0.25° |
| Simplicity of adapter | trivial REST | grib files, heavier |

Default: **Open-Meteo** for T2M forecast+archive; **CAMS** only for air. Revisit
only if Open-Meteo rate limits bind at the 16-site × 16-day cadence.

---

## 7. MLOps / living contract (WS6)

- `benchmark_competitors.py` + `eval_horizons.py` run nightly (scheduled
  container / CI) writing versioned `models/benchmark_YYYYMMDD.json`; the
  promotion gate in `retrain.py` gains **tolerance-accuracy + skill-score
  checks**, not just coverage/RMSE.
- Drift: existing PSI/CUSUM stays; add a **horizon error monitor** (rolling
  RMSE at each h) — a rising 7 d RMSE is the first sign the NWP adapter is
  stale or MOS has drifted.
- Dashboard/alert: benchmark contract table rendered on the ops page; regression
  vs the previous N runs > tolerance triggers a page (and blocks promotion).
- All eval artifacts (json/png) regenerated by the same scripts the PDF builder
  consumes — the PDF can never drift from the numbers.

---

## 8. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| NWP adds little at 7 d for *daily-mean* T2M (providers sell hourly) | medium | MOS + quantile mapping on NWP residuals; evaluate first on 3 seasons before adopting; benchmark gate decides, not enthusiasm |
| NASA POWER archive backfill rate limits / volume | low | batch by month × site, sleep + retry, idempotent upsert into feature_vectors |
| Multi-year normals overfit to 1981–present but current warming shifts them | medium | rolling-30-year normals + linear trend term; re-fit nightly; PSI on normal drift |
| Over-engineering before data | high | Phase order is mandatory: no model work until Phase 1 data exists; every phase has a numeric exit gate |
| Air still synthetic at Phase 4 | medium | real key is a data task only; adapter + schema already ship-ready |
| Per-horizon α tuning overfits the eval window | low | tune on 2 seasons, lock, evaluate on the 3rd; gates on untouched seasons only |

---

## 9. Open decisions

1. NWP vendor (default Open-Meteo) and whether to also consume GFS ensemble
   members for the spread–error calibration win.
2. Rolling-normal window: fixed 30-year vs rolling 30-year with trend.
3. Where `/v1/forecast` is consumed: analysis-engine.js and/or the new AI page
   — API ships regardless.
4. Air real-data rollout: both OpenAQ labels and CAMS forecasts before Phase 4
   gate, or CAMS-only first (CAMS is a forecast, not ground truth — labels need
   OpenAQ).

---

## 10. Success measurement (repeat of §1, as the exec check)

| Horizon | Metric | Now → Target | Phase that delivers it |
|---------|--------|--------------|------------------------|
| 24 h | ±3 °F accuracy | 88% → ≥ 95% | serve the fitted 24 h NWP+MOS blend (§0.5) + CQR-on-NWP recalibration (Phase 3) |
| 7 d | ±3 °F accuracy | 97% (proxy) → ≥ 80% live | Phase 2 (NWP+MOS), live gate pending |
| 30 d | ±3 °F accuracy | 72% → ≥ 65% | Phase 2–3 |
| 24 h | coverage | 90.8% → 88–93% (hold after center switch) | Phase 3 |
| 7 d | interval width | 11.7 → ≤ 8.0 °C | Phase 3 |
| all | coverage band | varies → 88–93% | Phase 3 |
| air | real benchmark | none → first run | Phase 4 |
| cold start | 24 h / 7 d / 30 d with W days of history | §0.6 table → gate it nightly | Phase 0 (new) |

Every number in this plan is already produced by existing tooling
(`eval_horizons.py`, `benchmark_competitors.py`) — the plan is executable
entirely inside the current `pern-ai` architecture, one phase at a time, with a
falsifiable gate between each.
