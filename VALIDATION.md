# Independent Zero-Fitting Validation Report｜獨立零擬合盲測驗證報告

This document records the complete out-of-sample verification methodology, independent public datasets, empirical performance metrics, and rejected hypotheses for **Nordic Aurora Radar**.

Every physics upgrade shipped in [`src/aurora-engine.js`](src/aurora-engine.js) is derived strictly from first-principles geophysics, atmospheric optics, or operational meteorological data assimilation. **No scoring weights, thresholds, or multipliers in `computeAuroraScore` were fitted to any validation dataset.**

---

## 1. Anti-Overfitting Protocol｜防過擬合審核紀律

1. **Frozen Scoring Weights**: All scoring weights and tier thresholds (`0–17`, `18–39`, `40–64`, `65–99`) remained strictly frozen throughout validation.
2. **Causal Time Ordering**: All forecast and nowcast checks evaluate strictly causal pairs (for example, airport METAR observed at `t - 1h` or `t - 2h` used to predict cloud cover at `t`). Zero future data leakage.
3. **Zero Target Leakage**: Space-weather L1 evaluations strip out Kp, Dst, and Hp30 from inputs so ROC-AUC measures pure solar-wind predictive skill.
4. **Clustered Uncertainty**: Human sighting evaluations compute 95% confidence intervals using UTC-date block bootstrap (`2,008` independent dates) rather than i.i.d. report assumptions.
5. **Pre-Registered Holdouts & Rejections**: Hypotheses that failed to improve both temporal holdouts and independent optical/sighting archives were formally rejected (Section 4).

---

## 2. Independent Public Validation Archives (5 Datasets)

| Archive | Independent Source & Coverage | Sample Size | What It Audits |
|---|---|---|---|
| **A. Geomagnetic Reference Grid** | IGRF-14 (`n=1..13`, epoch 2025.0) vs AACGMv2 global grid (`110 km`) | `14,122` global points | Pure geomagnetic coordinate accuracy |
| **B. 12-Year Global Sightings** | Aurorasaurus citizen sightings (`2014–2025`) joined with NASA OMNI2 | `20,318` reports (`2,008` UTC dates) | Global cross-continental auroral oval discrimination |
| **C. 10-Year Optical Photometry** | Nordic All-Sky Cameras (`557.7 nm` FMI/MIRACLE: Abisko, Kilpisjärvi, Sodankylä; Zenodo DOI `10.5281/zenodo.19365681`) + METAR | `31,006,700` frames → `44,870` dark hours | Direct optical aurora occurrence & score-tier reliability |
| **D. Full Solar Cycle Space Weather** | GFZ Potsdam 30-min `Hp30` (`2020–2025`) + 11-yr NASA CDAWeb OMNI2 (`2015–2025`) | `103,656` 30-min bins + `95,614` hours | Pure-L1 solar-wind predictive skill across solar min to max |
| **E. 2-Winter Global Laser Ceilometers** | Official airport METAR/ASOS laser ceilometers across `20` global hubs (`2024–25` & `2025–26` winters) | `63,548` unbiased dark hours (`60,693` causal `+1h` pairs) | Layered clouds, Dual-Model NWP & causal METAR Optimal Interpolation |

---

## 3. Verified First-Principles Physics Upgrades

### 3.1 Pure IGRF-14 (`n=1..13`, 2025.0) Modified Apex-110 Coordinates

- **Implementation**: Analytic centered dipole + `1.77 KB` Base64 signed-Int8 delta grid (`5° × 10°`, `h = 110 km`) in [`geoToMagLat`](src/aurora-engine.js).
- **Coordinate Accuracy vs AACGMv2 (`N = 14,122`)**:
  - Global MAE: **`2.88° → 0.236°`** (12.2× improvement)
  - Regional MAE: North America `3.23° → 0.28°`, Europe `2.50° → 0.20°`, Nordics `0.72° → 0.17°`, Southern Hemisphere `1.06° → 0.25°`.
- **Blind 12-Year Aurorasaurus Impact (`N = 20,318`, zero weight changes)**:
  - Global ROC-AUC: **`0.7739 → 0.8074`** (`+0.0335`, UTC-date cluster 95% CI `[+0.0247, +0.0462]`, vs Kp-only `0.6893`)
  - Temporal split: Era 1 (`2014–2020`) `0.8121 → 0.8579`; Era 2 Holdout (`2021–2025`) `0.7722 → 0.7962`
  - Matthews Correlation Coefficient (MCC): **`0.3588 → 0.4368`** (`+0.078`).

### 3.2 Global Dual-Model High-Resolution NWP Consensus

- **Implementation**: Nordic belt fuses MET Norway `2.5 km` (`MEPS`) + Open-Meteo; Iceland fuses `best_match + icon_seamless`; outside Nordics globally fuses `best_match + ecmwf_ifs025` in a single Open-Meteo request (50/50 physical blend + divergence consensus).
- **Layered Cloud Optics (`computeEffectiveCloud`) vs Raw Total Cloud**: Outperformed raw total cloud in **7/7 global regions** across `63,548` unbiased dark hours.
- **2-Winter Independent Laser Ceilometer Holdout**:
  - **Iceland (`N = 10,152` hours)**: Clear-sky ROC-AUC `0.786 → 0.827` (Winter 1) and `0.802 → 0.854` (Winter 2); False-Clear alarm rate cut by >63% (`20.4% → 7.4%` in Winter 1; `21.4% → 5.8%` in Winter 2).
  - **Canada (`N = 12,934` hours)**: Clear-sky ROC-AUC `0.846 → 0.865` (Winter 1) and `0.819 → 0.843` (Winter 2); False-Clear rate `9.5% → 3.3%` and `9.1% → 6.3%`.

### 3.3 Live Airport METAR Laser Ceilometer Optimal Interpolation (Daley 1991 OI)

- **Implementation**: 61-airport global auroral/high-latitude registry fetched directly from official CORS endpoints (MET Norway `tafmetar/1.0/metar.txt` in Norway; IEM `currents.json` globally). Causal exponential decorrelation weighting `w = 0.72 · exp(-d / 40 km) · exp(-dt / 1.6 h) · exp(-age / 90 min)` applied strictly to `+0h..+3h`, `d ≤ 55 km`, `age ≤ 90 min`.
- **2-Winter Strictly Causal Nowcast Verification (on top of Dual-Model NWP)**:

| Season | Lead Time | Causal Pairs (N) | Cloud MAE | Clear-Sky ROC-AUC | False-Clear Rate |
|---|---|---|---|---|---|
| **Winter 1 (2024–25)** | `+1h` (METAR at `t-1h`) | `19,299` | `22.36% → 17.50%` (`-4.9 pts`) | `0.8159 → 0.8982` (`+0.0823`) | `5.9% → 2.8%` (`-53%`) |
| **Winter 1 (2024–25)** | `+2h` (METAR at `t-2h`) | `18,881` | `22.36% → 20.20%` (`-2.2 pts`) | `0.8153 → 0.8590` (`+0.0437`) | `5.9% → 4.7%` |
| **Winter 2 (2025–26)** | `+1h` (METAR at `t-1h`) | `41,394` | `23.95% → 18.38%` (`-5.6 pts`) | `0.8102 → 0.8954` (`+0.0852`) | `7.5% → 3.3%` (`-56%`) |
| **Winter 2 (2025–26)** | `+2h` (METAR at `t-2h`) | `40,707` | `23.88% → 21.31%` (`-2.6 pts`) | `0.8103 → 0.8547` (`+0.0444`) | `7.5% → 6.3%` |

- **Cross-Airport Spatial Decorrelation Checks (`+1h` causal)**:
  - Reykjavik ← Keflavik (`36 km`, `N = 1,435`): MAE `24.03% → 22.36%`, AUC `0.8354 → 0.8407`
  - Svolvær ← Leknes (`45 km`, `N = 2,300`): MAE `32.82% → 31.41%`, AUC `0.7645 → 0.7729`
  - Tromsø ← Bardufoss (`71 km`, `N = 1,903`): MAE `22.46% → 21.63%`, AUC `0.7004 → 0.7388`

### 3.4 Full Solar Cycle & Optical All-Sky Camera Audit (Frozen Engine)

- **6-Year Solar Cycle Pure-L1 vs GFZ `Hp30 ≥ 5` (`N = 103,656` 30-min bins, zero Kp/Dst leakage)**:
  - `2020` (Solar Min): **`0.9486`** | `2021`: **`0.9203`** | `2022`: **`0.8690`** | `2023`: **`0.9050`** | `2024`: **`0.9184`** | `2025`: **`0.8799`**
- **11-Year NASA OMNI2 Pure-L1 vs Arctic Magnetometer `AE ≥ 500 nT` (`2015–2025`, `N = 95,614` hours)**:
  - `2015–2021` (`N = 61,085`): **AUC `0.9274`** | `2022–2025` Holdout (`N = 34,529`): **AUC `0.9139`**
- **10-Year Nordic All-Sky Cameras (`557.7 nm`, `31M` frames, `N = 44,870` METAR-joined dark hours)**:
  - Clear-sky occurrence (`N = 16,272`): **AUC `0.871`** (`≥ 2 kR` arc) / **AUC `0.889`** (`≥ 5 kR` bright, beating Kp-only `+0.011`)
  - All-weather UI score-tier optical hit rate (`≥ 2 kR`): `0–17` `31.5%` → `18–39` `42.9%` → `40–64` `75.4%` → **`65–99` `95.8%`**
- **NASA JPL Horizons DE441 Ephemeris Audit (`22` global checkpoints)**:
  - Solar elevation max error **`0.006°`** (`MAE 0.004°`); lunar elevation `MAE 0.298°`; lunar illumination `MAE 0.399%`.

---

## 4. Hypotheses Tested & Rigorously Rejected｜主動否決假說紀錄

Publishing rejected ideas is essential proof against overfitting and cherry-picking:

| Hypothesis Tested | Out-of-Sample Empirical Finding | Decision |
|---|---|---|
| **Geostationary IR satellite cloud overlay** | Missed 100% of low Arctic stratus at Tromsø (`BKN008 OVC012`) and misclassified `-13°C` snow in clear Kiruna as clouds | **Rejected** |
| **Standalone `gem_seamless` (2.5 km HRDPS) in Canada** | Holdout cloud MAE degraded `23.6% → 40.1%` and False-Clear alarms surged `10.4% → 60.7%` | **Rejected** |
| **3-hour EMA magnetotail loading (`tau = 90 min`)** | Degraded 11-year NASA OMNI2 (`0.927 → 0.923`, `0.914 → 0.910`), Nordic optical ASC, and Aurorasaurus | **Rejected** |
| **Symmetric Newell MLT cosine weighting (`0.85 + 0.27·cos`)** | Helped Arctic ASC (`+0.014`) but degraded global Aurorasaurus holdout (`-0.0037`) due to evening mid-latitude penalty | **Rejected** |
| **Dayside oval recession weight adjustment** | Marginal ASC change (`+0.003`), flat/negative Aurorasaurus (`-0.0001`); rejected to preserve frozen weights | **Rejected** |
| **Fitting `computeAuroraScore` thresholds to Aurorasaurus** | Would overfit to mid-latitude smartphone photography and citizen selection bias | **Rejected** |

---

## 5. Reproducibility｜本機重現指令

Run the full automated unit suite, 72-case physics & ephemeris benchmark, and live multi-archive validation using Node.js 20+ (zero external npm dependencies):

```bash
node --test tests/aurora.test.mjs
node tests/benchmark.mjs
node tests/realworld-validation.mjs
```
