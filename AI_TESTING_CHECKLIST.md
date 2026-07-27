# PERN AI Core – Manual Testing Checklist

**Version:** 2.0 (Phase 1–4 Upgrades)  
**Date:** July 2026  
**Focus:** Analysis, Prediction, Recommendation, and Confidence Scoring

---

## **1. Environmental Health Index (EHI) Testing**

### Test Cases:

| # | Test Scenario                          | Expected Behavior                                      | Pass/Fail | Notes |
|---|----------------------------------------|--------------------------------------------------------|-----------|-------|
| 1 | Normal conditions (PM2.5=22, pH=7.2)   | EHI should be in "Good" or "Excellent" range           |           |       |
| 2 | High PM2.5 (PM2.5=48)                  | Air Quality sub-index should drop significantly        |           |       |
| 3 | Acidic water (pH=6.4)                  | Water Quality sub-index should decrease                |           |       |
| 4 | High temperature + high humidity       | Human Comfort sub-index should drop                    |           |       |
| 5 | All sensors in safe range              | Overall EHI should be ≥ 75                             |           |       |
| 6 | Multiple poor readings                 | EHI should fall into "Poor" or "Critical"              |           |       |

**Method Used:** WHO 2021 + EPA AQI aligned

---

## **2. Prediction Engine Testing**

### Test Cases:

| # | Test Scenario                          | Expected Behavior                                      | Pass/Fail | Notes |
|---|----------------------------------------|--------------------------------------------------------|-----------|-------|
| 1 | 12 hours of stable EHI data            | 24h prediction should be close to current value        |           |       |
| 2 | Clear upward trend in last 8 hours     | 24h prediction should be higher than current           |           |       |
| 3 | Noisy / fluctuating data               | Confidence should be lower                             |           |       |
| 4 | Very short history (only 3 points)     | Should fall back gracefully with low confidence        |           |       |
| 5 | 7-day horizon                          | Confidence should be noticeably lower than 24h         |           |       |

**Method Used:** Double Exponential Smoothing (Holt)

---

## **3. Recommendation Engine Testing**

### Test Cases:

| # | Test Scenario                          | Expected Behavior                                      | Pass/Fail | Notes |
|---|----------------------------------------|--------------------------------------------------------|-----------|-------|
| 1 | PM2.5 > 35                             | Should recommend reducing outdoor exposure             |           |       |
| 2 | CO₂ > 1000 ppm                         | Should recommend improving ventilation                 |           |       |
| 3 | High temperature + high humidity       | Should issue heat stress advisory                      |           |       |
| 4 | EHI < 50                               | Should recommend comprehensive environmental review    |           |       |
| 5 | All virtual sensors "Good" or better   | Should show minimal or no high-priority recommendations|           |       |
| 6 | Multiple poor virtual sensors          | Should list specific sensors to investigate            |           |       |

**Sources:** WHO, EPA, ASHRAE, Egyptian Standards

---

## **4. Statistical Confidence Scoring Testing**

### Test Cases:

| # | Test Scenario                          | Expected Behavior                                      | Pass/Fail | Notes |
|---|----------------------------------------|--------------------------------------------------------|-----------|-------|
| 1 | Fresh data (< 5 min old) + full sensors| Confidence should be high (≥ 75)                       |           |       |
| 2 | Old data (> 30 min)                    | Freshness score should drop significantly              |           |       |
| 3 | Only 5 out of 13 sensors reporting     | Coverage score should be low                           |           |       |
| 4 | Strong upward/downward trend           | Trend strength score should be high                    |           |       |
| 5 | Inconsistent sensor readings           | Cross-consistency score should decrease                |           |       |

**Method:** Multi-factor statistical model (Freshness + Coverage + Accuracy + Trend + Consistency)

---

## **5. End-to-End AI Page Testing**

| # | Test Scenario                          | Expected Behavior                                      | Pass/Fail | Notes |
|---|----------------------------------------|--------------------------------------------------------|-----------|-------|
| 1 | Open AI Engine page                    | Should show Scientific EHI with sources                |           |       |
| 2 | Check sub-indices                      | Each sub-index should show source (WHO/EPA/ASHRAE)     |           |       |
| 3 | View Recommendations                   | Should show prioritized, source-linked recommendations |           |       |
| 4 | Check Statistical Confidence           | Should display multi-factor confidence score           |           |       |
| 5 | Switch between organizations           | Recommendations and EHI should adapt to org context    |           |       |

---

## **6. Integration Testing**

| Area                        | Test Description                                      | Pass/Fail |
|----------------------------|-------------------------------------------------------|-----------|
| Dashboard → AI Engine      | Clicking "View Full AI Analysis" should open correct page |           |
| Predictions Page           | Should show upgraded prediction with confidence bands |           |
| Live Mode                  | Predictions and recommendations should update with real data |           |
| Automation + AI            | Recommendations should reflect current automation state |           |

---

## **Testing Notes**

- Use **Simulation Mode** for controlled testing
- Use **Live Mode** (if MQTT is running) to test with real data
- Document any unexpected behavior with screenshots

---

**End of Testing Checklist**