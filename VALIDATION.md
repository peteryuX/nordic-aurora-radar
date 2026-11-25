# Independent Zero-Fitting Validation & Limitations Report｜獨立零擬合盲測驗證與限制報告

This document records the out-of-sample verification methodology, empirical metrics, **baseline comparisons, known regressions, class-imbalance caveats, and rejected hypotheses** for **Nordic Aurora Radar**.

Every physics upgrade shipped in [`src/aurora-engine.js`](src/aurora-engine.js) is derived strictly from first-principles geophysics, atmospheric optics, or operational meteorological data assimilation. **No scoring weights, thresholds, or multipliers in `computeAuroraScore` were fitted to any validation dataset.**

> **Transparency & Reproducibility Scope**
> - **Directly reproducible in this repository** (zero external dependencies):
>   - `node --test tests/aurora.test.mjs` — `48` automated tests (`47` unit + `1` optional live API test).
>   - `node tests/benchmark.mjs` — `72` curated/synthetic scenario regression guardrails (**not** real-world statistical accuracy) + `22` NASA JPL Horizons DE441 ephemeris checkpoints.
>   - `node tests/realworld-validation.mjs` — live public-data audit against 2-year NASA OMNI2 (`2024–2025`, `N = 17,255` continuous hours, zero Dst input leakage, reporting both ROC-AUC and PR-AUC), a 3-month storm-enriched GFZ `Hp30` smoke check (`May/Oct 2024 + Feb 2025`), live NOAA telemetry, and a 9-airport same-hour METAR check.
> - **Offline multi-year public-archive studies (Sections 2–3)**: Conducted offline against large public scientific archives (AACGMv2, Aurorasaurus, FMI/MIRACLE Zenodo `10.5281/zenodo.19365681`, 6-yr GFZ `Hp30`, 11-yr NASA OMNI2, 2-winter IEM/METAR + Open-Meteo archive). Those multi-gigabyte archive pulls are not bundled in this static client-side repo; every figure below includes sample sizes, base rates, naive baselines, and negative results so claims cannot be cherry-picked.

---

## 1. Anti-Overfitting Protocol｜防過擬合審核紀律

1. **Frozen Scoring Weights**: Scoring weights and UI tier boundaries (`0–17`, `18–39`, `40–64`, `65–99`) in `computeAuroraScore` remained strictly frozen throughout validation.
2. **Causal Time Ordering**: Forecast and nowcast checks strictly use causal inputs (e.g., airport METAR at `t - 1h` or `t - 2h` predicting cloud cover at `t`).
3. **Zero Target Leakage**: Pure-L1 evaluations strip Kp, Dst, and Hp30 from inputs. Mid-latitude `Dst ≤ -100 nT` storm tests in [`tests/realworld-validation.mjs`](tests/realworld-validation.mjs) evaluate **all continuous hours** (`N = 17,255`) with `dst: null` (no extreme-vs-quiet filtering).
4. **Imbalance-Aware Metrics**: Rare-event geomagnetic checks report **PR-AUC, base rate, and best F1** alongside ROC-AUC, because ROC-AUC alone can appear artificially high when positives are `< 2%` of hours.
5. **Clustered Uncertainty & Negative Results**: Citizen-sighting CIs use UTC-date block bootstrap (`2,008` dates). Regressions, naive baselines that beat our model, and rejected hypotheses are published alongside wins.

---

## 2. Independent Public Validation Archives (5 Offline Datasets)

| Archive | Independent Source & Coverage | Sample Size & Sampling Caveat | What It Audits |
|---|---|---|---|
| **A. Geomagnetic Reference** | IGRF-14 (`n=1..13`, epoch 2025.0) vs AACGMv2 (`110 km`) | `14,122` Aurorasaurus coordinates (`94.7%` NA/EU mid-latitudes; **not** a uniform global grid) | Pure geomagnetic latitude accuracy |
| **B. 12-Year Global Sightings** | Aurorasaurus sightings (`2014–2025`) + NASA OMNI2 | `20,318` reports (`2,008` UTC dates; `77.1%` positive; `31.1%` from 7 superstorm days; **cloudless `cloudNow = 5%` assumed**) | Geomagnetic oval discrimination (space weather only) |
| **C. 10-Year Optical Photometry** | FMI/MIRACLE `557.7 nm` All-Sky Cameras (Abisko, Kilpisjärvi, Sodankylä; Zenodo `10.5281/zenodo.19365681`) + METAR | `21.8M` evaluated dark-hour frames (`31.0M` raw CSV rows) → `44,870` dark hours (`39.9%` base rate at `≥ 2 kR`; METAR airports `87–102 km` away) | Direct optical emission vs clear-sky & all-weather UI score |
| **D. Full Solar Cycle Space Weather** | GFZ Potsdam 30-min `Hp30` (`2020–2025`) + 11-yr NASA OMNI2 (`2015–2025`) | `103,656` 30-min bins + `95,614` hours (clear sky assumed) | Pure-L1 solar-wind coupling across solar min to max |
| **E. 2-Winter Airport Laser Ceilometers** | Official airport METAR/ASOS (`2024–25` & `2025–26` winters) | `19` unique hubs (**Winter 1: `9/20` hubs**, **Winter 2: `19/20`**, `NZQN = 0` both winters); `63,548` dark hours (`60,693` causal `+1h` pairs at `d = 0 km`) | Layered clouds, Dual-Model NWP & causal METAR OI |

---

## 3. Empirical Results, Baselines & Known Limitations

### 3.1 Pure IGRF-14 (`n=1..13`, 2025.0) Modified Apex-110 Coordinates

- **Implementation**: Analytic centered dipole + `1.77 KB` Base64 signed-Int8 delta grid (`5° × 10°`, `h = 110 km`) in [`computeGeomagneticLat`](src/aurora-engine.js).
- **Coordinate Accuracy vs AACGMv2 (`N = 14,122` Aurorasaurus coords, `94.7%` NA/EU)**:
  - Overall MAE: **`2.88° → 0.236°`** (`P95 = 0.330°`, `RMSE = 0.418°`).
  - Production Int8 regional MAEs: North America **`0.250°`** (down from `3.23°`), Europe **`0.212°`** (`2.50°`), Nordics **`0.151°`** (`0.72°`), Southern Hemisphere **`0.222°`** (`1.06°`). High latitudes (`|lat| ≥ 58°`): MAE **`0.144°`**, max **`0.398°`**.
  - **Known limitation**: At low latitudes (`|lat| < 30°`, e.g., Canary Islands — well outside normal auroral latitudes), coarse `5° × 10°` bilinear interpolation near the magnetic dip equator reaches a max error of **`10.98°`**.
- **Blind 12-Year Aurorasaurus Impact (`N = 20,318`, cloudless `cloudNow = 5%`, zero weight changes)**:
  - Global ROC-AUC: **`0.7739 → 0.8074`** (`+0.0335`, UTC-date cluster 95% CI `[+0.0247, +0.0462]`, vs Kp-only `0.6893`); MCC **`0.3588 → 0.4368`**.
  - Temporal split: **`2014–2023`** (`N = 7,042`) `0.8121 → 0.8579`; **`2024–2025`** (`N = 13,276`) `0.7722 → 0.7962`.
  - **Critical limitations & regressions**:
    1. **Cloudless assumption**: The `20,318`-row benchmark sets `cloudNow = 5%` (isolating geomagnetic oval geometry, not local weather). On a real-cloud MERRA-2 subset (`N = 240`), ROC-AUC fell to **`0.6217`** (`MCC = 0.1708`) and tiers were non-monotonic (`65–99` `57.1%` < `18–39` `66.7%`), confirming that cloud forecast accuracy dominates real-world viewing outcomes.
    2. **Regional regressions**: High-latitude (`|lat| ≥ 58°`) AUC slightly regressed **`-0.0059`** (95% CI `[-0.0114, -0.0007]`); Southern Hemisphere (`N` small) regressed **`-0.0251`** (CI `[-0.0607, -0.0073]`); North America specificity dropped `77.4% → 66.9%`.
    3. **Event skew**: `77.1%` of Aurorasaurus reports are positive, and `31.1%` come from 7 superstorm days (May/Oct 2024, where specificity was only `22.1%`).

### 3.2 Layered Cloud Optics & Global Dual-Model NWP

- **Production routing**:
  - **Nordics (`55–72°N, 4–33°E`)**: Uses official **MET Norway `2.5 km` (`MEPS`)** as primary cloud forecast; Open-Meteo is fetched in parallel solely for **3-hour divergence consensus** (not blended into Nordic primary clouds).
  - **Iceland**: 50/50 physical blend of Open-Meteo `best_match + icon_seamless`.
  - **Outside Nordics & Iceland globally**: 50/50 blend of Open-Meteo `best_match + ecmwf_ifs025`.
- **Layered Cloud Optics (`computeEffectiveCloud`) vs Raw Total Cloud**: Outperformed raw total cloud in `7/7` regional subsets across `63,548` dark hours. *Caveat*: `parseMetarSkyCover` shares the `0.30` high-cloud weighting, and airport laser ceilometers miss thin high cirrus above sensor range, which structurally favors layered cloud formulas over total cloud.
- **2-Winter Dual-Model NWP Results (Wins AND Regressions)**:
  - **Iceland (`N = 10,152` hours, `best_match + ICON`)**: Clear-sky ROC-AUC **`0.786 → 0.827`** (Winter 1) and **`0.802 → 0.854`** (Winter 2); False-Clear alarm rate cut `20.4% → 7.4%` and `21.4% → 5.8%`.
  - **Canada (`N = 12,934` hours, `best_match + ECMWF`)**: ROC-AUC **`0.846 → 0.865`** and **`0.819 → 0.843`**; False-Clear `9.5% → 3.3%` and `9.1% → 6.3%`.
  - **Disclosed regressions & coverage gaps**:
    - **UK**: Dual-model blend **degraded** both winters (`0.7401 → 0.7055` in Winter 1; `0.7101 → 0.7059` in Winter 2).
    - **Southern Hemisphere**: Slight **regression** (`0.7707 → 0.7655`, MAE `29.39% → 29.65%`).
    - **CONUS**: Cloud MAE **worsened** (`20.58% → 22.26%`).
    - **Alaska**: `ecmwf_ifs025` had **`N = 0`** archived rows in the offline run (archive tested `gfs_seamless` instead), so Alaska `best_match + ecmwf_ifs025` remains unverified in that archive.

### 3.3 Live Airport METAR Laser Ceilometer Optimal Interpolation (Daley 1991 OI)

- **Implementation**: 61-airport registry (MET Norway `tafmetar/1.0/metar.txt` in Norway; IEM `currents.json` globally). Causal weighting `w = 0.72 · exp(-d / 40 km) · exp(-dt / 1.6 h) · exp(-age / 90 min)` applied strictly to `+0h..+3h`, `d ≤ 55 km`, `age ≤ 90 min`.
- **2-Winter Strictly Causal Nowcast at Co-Located Airport Runways (`d = 0 km, age = 0 min` Upper Bound)**:

| Season (Coverage) | Lead | Causal Pairs (N) | NWP Only (MAE / AUC / FC) | App METAR OI (MAE / AUC / FC) | Naive METAR Persistence `METAR[t-1h]` (MAE / AUC / FC) |
|---|---|---|---|---|---|
| **Winter 1 (2024–25, 9/20 hubs)** | `+1h` | `19,299` | `22.44% / 0.8159 / 5.9%` | `17.54% / 0.8986 / 2.8%` | **`12.01% / 0.9222 / 4.6%`** |
| **Winter 1 (2024–25, 9/20 hubs)** | `+2h` | `18,881` | `22.44% / 0.8153 / 5.9%` | `20.20% / 0.8590 / 4.7%` | — |
| **Winter 2 (2025–26, 19/20 hubs)** | `+1h` | `41,394` | `23.95% / 0.8102 / 7.5%` | `18.26% / 0.8975 / 3.2%` | **`11.49% / 0.9227 / 4.6%`** |
| **Winter 2 (2025–26, 19/20 hubs)** | `+2h` | `40,707` | `23.88% / 0.8103 / 7.5%` | `21.31% / 0.8547 / 6.3%` | — |

- **Critical caveats (why `0.90` is an upper bound, not typical field accuracy)**:
  1. **Naive Persistence beats OI at `d = 0 km`**: Directly at the airport runway (`d = 0`), simple persistence (`METAR[t-1h]`) beats App OI on ROC-AUC (`0.922 vs 0.898`), MAE (`11.5–12.0% vs 17.5–18.3%`), and F1 (`78.5–80.8% vs 64.6–66.0%`). OI's practical edge is **fewer False-Clear traps** (`2.8–3.2% vs 4.6%`) and smooth spatial/temporal decay into NWP away from the runway and at `+2h..+3h`.
  2. **Rapid spatial decay away from the airport (`+1h` causal)**:
     - Reykjavik ← Keflavik (`36 km`, `N = 1,435`): MAE `24.03% → 22.36%`, AUC `0.8354 → 0.8407` (`+0.0053`).
     - Svolvær ← Leknes (`45 km`, `N = 2,300`): MAE `32.82% → 31.41%`, AUC `0.7645 → 0.7729` (`+0.0084`).
     - Tromsø ← Bardufoss (`71 km`, `N = 1,903`): MAE `22.46% → 21.63%`, AUC `0.7004 → 0.7388` (**outside** production's `55 km` cutoff).
  3. **Incomplete hub matrix**: Winter 1 covered only `9/20` hubs (`alaska = 0`, `conus = 0`, `south = 0`); `NZQN` (Queenstown) had `N = 0` in both winters (`19` unique hubs total).

### 3.4 Full Solar Cycle Pure-L1 Space Weather (ROC-AUC + PR-AUC + Base Rate)

- **6-Year GFZ `Hp30` (`2020–2025`, `N = 103,656` 30-min bins, zero Kp/Dst inputs)**:
  - **`Hp30 ≥ 5` (storm)**:
    - `2020` (Solar Min, **`0.34%` base rate**, `59/17,564`): ROC **`0.9486`**, **PR-AUC `0.2159`**, best F1 `24.7%` (at UI `≥ 65`: Precision `15.8%`, Recall `32.2%`).
    - `2021–2025`: ROC `0.9203 / 0.8690 / 0.9050 / 0.9184 / 0.8799`; **PR-AUC `0.399 / 0.290 / 0.536 / 0.618 / 0.536`**.
  - **`Hp30 ≥ 4` (moderate active)**: ROC **`0.820–0.897`** (`2025`, `17.4%` base rate: ROC `0.8202`, **PR-AUC `0.6125`**).
  - *Resolution check*: 5-min vs 1-hour OMNI solar wind on 2024 Aurorasaurus yielded `0.8170 → 0.8171` (`+0.0001`, negligible difference).
- **11-Year NASA OMNI2 Pure-L1 vs Arctic `AE` (`2015–2025`, `N = 95,614` hours, cloudless)**:
  - `AE ≥ 500 nT`: `2015–2021` (`6.3%` base) ROC `0.9274` / **PR-AUC `0.599`** (best F1 `59.2%`); `2022–2025` (`10.4%` base) ROC `0.9139` / **PR-AUC `0.640`** (best F1 `61.1%`).
  - `AE ≥ 300 nT`: ROC `0.885 / 0.876`, **PR-AUC `0.700 / 0.749`**.
- **2024–2025 Reproducible Continuous OMNI2 (`tests/realworld-validation.mjs`, `N = 17,255` hours)**:
  - Pure-L1 vs `AE ≥ 300 nT`: ROC `0.8635` / **PR-AUC `0.7552`** (`26.4%` base).
  - Pure-L1 vs `AE ≥ 500 nT`: ROC `0.9019` / **PR-AUC `0.6545`** (`11.7%` base).
  - Mid-latitude `Dst ≤ -100 nT` (all `17,255` hours, **`dst: null`**, `1.1%` base): Oslo ROC `0.9594` / **PR-AUC `0.3333`**; Hobart ROC `0.9592` / **PR-AUC `0.5047`**.

### 3.5 10-Year Nordic All-Sky Camera Optical Photometry (`557.7 nm`)

- **Archive**: FMI/MIRACLE (`Abisko`, `Kilpisjärvi`, `Sodankylä`, `21.8M` dark frames → `N = 44,870` dark hours, base rate `39.9%` at `≥ 2 kR`).
- **All-Weather Performance (Important Caveat)**:
  - **All-weather UI score ROC-AUC is `0.6512` (`≥ 2 kR`) / `0.6650` (`≥ 5 kR`) vs Kp-only `0.8612 / 0.8722` (`-0.21` worse than Kp-only)**.
  - *Why*: Two compounding factors — (a) the UI score intentionally gates down under clouds, while sensitive `557.7 nm` photometers still record aurora through thin/broken clouds; and (b) the nearest archived METAR airports (`ESNQ 87.1 km`, `ENTC 101.6 km`, `EFRO 98.1 km`) were nearly **2× outside** production's `55 km` METAR radius, injecting remote cloud error.
- **Clear-Sky Subset (`N = 16,272` hours)**:
  - Trails Kp-only slightly at `≥ 1 kR` (`0.8395 vs 0.8509`, `-0.0114`) and `≥ 2 kR` (`0.8705 vs 0.8738`, `-0.0033`).
  - Beats Kp-only on bright arcs `≥ 5 kR` (`0.8885 vs 0.8781`, **`+0.0104`**).
- **UI Score-Tier Optical Hit Rate (`≥ 2 kR`, base `39.9%`)**:
  - `0–17` (`68.0%` of hours): `31.5%` hit rate (`53.6%` of all optical aurora hours occurred while cloud-gated).
  - `18–39`: `42.9%` | `40–64`: `75.4%` | `65–99`: **`95.8%`** (`N = 1,516`, representing `3.4%` of dark hours / `8.1%` recall).

### 3.6 NASA JPL Horizons DE441 Ephemeris Audit (`22` Global Checkpoints)

Directly reproducible via `node tests/benchmark.mjs`:
- **Solar elevation**: `MAE = 0.004°`, **max error `0.006°`** (`alta_equinox_twilight`).
- **Lunar elevation**: `MAE = 0.298°`, **max error `0.74°`** (`alta_summer_midnight`).
- **Lunar illumination**: `MAE = 0.399%`, **max error `1.16%`** (`taipei_subtropical_noon`).

---

## 4. Hypotheses Tested & Rejected｜主動否決假說紀錄

| Hypothesis Tested | Empirical Evidence & Scope | Decision |
|---|---|---|
| **Geostationary IR satellite cloud overlay** | **Qualitative `N = 1` live-snapshot check**: missed low Arctic stratus at Tromsø (`BKN008 OVC012`) and misclassified `-13°C` snow in clear Kiruna as cloud (not a multi-season study) | **Rejected** |
| **Standalone `gem_seamless` (2.5 km HRDPS) in Canada** | Offline winter holdout cloud MAE degraded `23.6% → 40.1%` and False-Clear alarms surged `10.4% → 60.7%` | **Rejected** |
| **3-hour EMA magnetotail loading (`tau = 90 min`)** | Degraded 11-year NASA OMNI2 (`0.927 → 0.923`, `0.914 → 0.910`), Nordic optical ASC, and Aurorasaurus | **Rejected** |
| **Symmetric Newell MLT cosine weighting (`0.85 + 0.27·cos`)** | Helped Arctic ASC (`+0.014`) but degraded global Aurorasaurus (`-0.0037`) due to evening mid-latitude penalty | **Rejected** |
| **Dayside oval recession weight adjustment** | Marginal ASC change (`+0.003`), flat/negative Aurorasaurus (`-0.0001`); rejected to preserve frozen weights | **Rejected** |
| **Fitting `computeAuroraScore` thresholds to Aurorasaurus** | Would overfit to mid-latitude smartphone photography and citizen selection bias (`77.1%` positive skew) | **Rejected** |

---

## 5. Reproducible Local Verification Commands｜本機可重現指令

Run all repo-bundled checks with Node.js 20+ (zero npm dependencies):

```bash
node --test tests/aurora.test.mjs    # 47 unit tests (+ 1 optional live test)
node tests/benchmark.mjs             # 72 curated regression guardrails + 22 JPL DE441 checkpoints
node tests/realworld-validation.mjs  # 2-yr OMNI2 (ROC+PR-AUC), 3-mo GFZ Hp30, live NOAA & 9-airport METAR
```
