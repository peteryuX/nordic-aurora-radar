# Nordic Aurora Radar｜極光即時雷達

[![Live App (EN)](https://img.shields.io/badge/Live%20App-English-34f0b0?style=flat-square)](https://ohwhatif.com/nordic-aurora-radar/?lang=en)
[![Live App (繁體中文)](https://img.shields.io/badge/線上版-繁體中文-66bdff?style=flat-square)](https://ohwhatif.com/nordic-aurora-radar/?lang=zh)
[![Live 30d Verification](https://img.shields.io/badge/Daily%20Verification-METAR%20%2B%20GFZ%20Hp30-fbbf24?style=flat-square)](https://ohwhatif.com/nordic-aurora-radar/verification/)
[![License: MIT](https://img.shields.io/badge/License-MIT-a855f7?style=flat-square)](LICENSE)

Real-time Nordic & global aurora radar fusing **MET Norway (Yr.no)** 2.5 km layered clouds, **14 live NOAA SWPC** space-weather feeds, **FMI Nordic & USGS North America** real-time ground magnetometers, **Copernicus GLO-30** satellite mountain-ridge horizon lower bounds, daily automated **METAR laser-ceilometer + GFZ Hp30** verification, and an **ETA arrival-time 360° winter-road clear-sky radar** — zero build step, zero cookies, 100% client-side.

整合挪威官方 **Yr.no** 2.5 km 分層雲量、**14 項美國 NOAA 即時太空天氣衛星**、**北歐 FMI 與北美 USGS 即時地面磁力儀**、歐洲太空總署 **Copernicus GLO-30** 衛星遠山遮蔽下界、每日自動 **9 站 METAR 雷射測雲儀＋GFZ Hp30 驗證頁**，以及計算**抵達時（ETA）晴空率**的 360° 冬季實路雷達；零後端、零廣告、零 Cookie，支援紅光夜視與無訊號峽灣離線求生。

- **English**: https://ohwhatif.com/nordic-aurora-radar/?lang=en
- **繁體中文**: https://ohwhatif.com/nordic-aurora-radar/?lang=zh
- **Live Daily 30-Day Verification**: https://ohwhatif.com/nordic-aurora-radar/verification/
- **More Free Tools (OhWhatIf Studio)**: https://ohwhatif.com/
- **Field Report / Feedback**: hello@ohwhatif.com · https://github.com/ohwhatif/nordic-aurora-radar/issues/new/choose

## Key Features｜主要功能

- **0–99 Viewing Score & Pure IGRF-14 Apex-110 Physics**：Fuses layered low/mid/high cloud optics, MET Norway `2.5 km` primary clouds + ECMWF 51-member ensemble + Adaptive BMA calibrated against live ground sky sensors (**METAR / SMHI / FMI** `≤ 55 km`), pure **IGRF-14 (n=1..13) Modified Apex-110** geomagnetic latitude, and NASA JPL DE441-verified (`0.004°` MAE) twilight/moonlight physics.
- **Live Solar Wind + Dual-Continent Ground Magnetometers**：14 NOAA SWPC feeds (1-min L1 magnetometer/plasma, ballistic Earth-arrival timeline, Newell coupling, 60-min magnetotail preconditioning, Geospace 1h MHD Kp/Dst, GOES-18/19, Kyoto Dst, WSA-ENLIL) plus live **FMI Nordic** and **USGS North America** (`0.8m` lag) ground magnetometer substorm detection.
- **ETA Arrival-Time 360° Clear-Sky Radar & Satellite Ridge Masks**：Scores the **3-hour window AFTER winter driving ETA** (preventing closing-cloud traps), includes mid-drive anti-whiplash stability, flags local ice-fog/gale/snow hazards, checks azimuthal city light-dome escape, and shows precomputed **Copernicus GLO-30** mountain-ridge horizon lower bounds across **26 global hubs (112 curated points)**.
- **Sky & Maps (觀測地圖)**：Region-aware live cameras (**Nordic**: UiT, IRF, SGO, KHO, FMI mag; **Iceland**: 3 official Vegagerðin road/sky cams; **North America**: UAF Poker Flat, AuroraMAX), Windy 3-layer switcher (`All clouds / Low clouds / Satellite IR`), and NOAA OVATION 30-min forecast.
- **Field-Ready PWA, Fjord Offline Survival & Daily Self-Verification**：18h offline cache with `150 km` dead-zone fallback & live hour-pointer advance, zero-leak scotopic red-light mode, shareable PNG forecast cards, 5-city batched Trip Compare, 15 live bilingual SEO destination pages (`/spots/`), and a transparent daily GitHub Actions verification scorecard (`/verification/`).

## Architecture｜專案結構

Zero build tools, zero npm runtime dependencies (native ES modules):

- `index.html` / `styles.css` / `sw.js` — Atomic versioned PWA shell, strict CSP & scotopic red-light theme
- `src/aurora-engine.js` / `src/horizon-data.js` — Pure physics (IGRF-14 Apex-110, JPL DE441, Newell coupling, layered clouds, FMI/USGS magnetometers, Copernicus GLO-30 horizon lower bounds)
- `src/charts.js` / `src/share-card.js` — Pure SVG visualizations & Retina 4:5 PNG forecast card generator
- `src/data-client.js` / `src/storage.js` / `src/i18n.js` / `src/copy-formatters.js` / `src/app.js` — Live transport, 150 km offline fjord recovery, bilingual copy contract & UI controller
- `verification/` & `spots/` — Public live 30-day instrument verification scorecard + 15 live bilingual destination pages
- `tests/` — `72` automated tests (incl. 6-stage real-human chase simulation), `17` copy/semantic invariants (`17,631` checks), `72`-case `MCC=1.0000` + `22` JPL DE441 benchmark, `18` multi-font real-iPhone UI QA cases, and `15` real-app headless Chrome E2E scenarios

## Independent Zero-Fitting Validation & Known Caveats｜零擬合盲測驗證與限制

All scoring weights remained frozen (zero weight fitting). Full methodology, naive baselines, **PR-AUC under class imbalance, known regional regressions, and 6 rejected hypotheses** are published transparently in **[VALIDATION.md](VALIDATION.md)**：

- **Astronomy (JPL Horizons DE441, 22 checkpoints)**：Solar elevation max error **`0.006°`** (`MAE 0.004°`); lunar elevation max **`0.74°`** (`MAE 0.298°`); lunar illumination max **`1.16%`** (`MAE 0.399%`).
- **Geomagnetic Coordinates (`computeGeomagneticLat` vs AACGMv2, N=14,122 Aurorasaurus coords, 94.7% NA/EU)**：MAE reduced `2.88° → 0.236°` (`NA 0.250°`, `EU 0.212°`, `Nordics 0.151°`, `SH 0.222°`; `|lat| ≥ 58°` MAE `0.144°`). *Caveat*: low-latitude `|lat| < 30°` max error reaches `10.98°`.
- **Space Weather (Pure-L1 Solar Wind, Zero Kp/Dst Inputs, Clear-Sky Assumed)**：
  - 2024–2025 continuous NASA OMNI2 (`N=17,255h`, reproducible locally): `AE ≥ 500 nT` (`11.7%` base) ROC `0.902` / **PR-AUC `0.655`**; `AE ≥ 300 nT` (`26.4%` base) ROC `0.864` / **PR-AUC `0.755`**.
  - 6-year GFZ `Hp30 ≥ 5` (`2020–2025`): ROC `0.869–0.949`, **PR-AUC `0.216–0.618`** (`2020` solar min base rate is only `0.34%`).
- **Sightings & Optical All-Sky Cameras**：
  - 12-year Aurorasaurus (`N=20,318`, **cloudless `cloudNow = 5%` assumed**): IGRF-14 lifts global ROC-AUC `0.774 → 0.807` (`+0.034`, cluster 95% CI `[+0.025, +0.046]`). Real-cloud MERRA-2 subset (`N=240`) drops to AUC `0.622` — weather dominates real viewing.
  - 10-year Nordic `557.7 nm` All-Sky Cameras (`N=44,870` dark hours): Clear-sky (`N=16,272`) ROC `0.871` (`≥2 kR`) / `0.889` (`≥5 kR`, `+0.010` vs Kp); **all-weather ROC is `0.651` vs Kp `0.861`** due to cloud gating and `87–102 km` archive METAR distance.
- **Cloud Nowcasting & Dual-Model NWP (`19` unique airport hubs, 2 winters)**：
  - Dual-model consensus improves Iceland (`AUC 0.79–0.80 → 0.83–0.85`, False-Clear `20–21% → 6–7%`) and Canada (`AUC 0.82–0.85 → 0.84–0.87`), while UK (`-0.004..-0.035`), SH (`-0.005`), and CONUS MAE (`+1.7 pts`) slightly regressed.
  - Causal METAR OI (`+1h`) at the airport runway (`d = 0 km`) improves over NWP (`AUC 0.81 → 0.90`, False-Clear `6–7.5% → 2.8–3.2%`), though naive runway persistence (`METAR[t-1h]`, `AUC 0.922`) beats OI at `d = 0 km` and spatial lift shrinks to `+0.005..+0.008` at `36–45 km`.

## Local Run & Tests｜本機執行與測試

```bash
git clone https://github.com/peteryuX/nordic-aurora-radar.git
cd nordic-aurora-radar
python3 -m http.server 8000

# Run tests & benchmarks (Node.js 20+, zero dependencies)
node --test tests/aurora.test.mjs
node tests/benchmark.mjs
node tests/realworld-validation.mjs
```

## Data Sources & Disclaimer｜資料來源與聲明

Weather: [MET Norway (Yr.no)](https://api.met.no/) (CC BY 4.0), [Open-Meteo](https://open-meteo.com/) (CC BY 4.0) & Airport METAR/ASOS ([MET Norway](https://api.met.no/) / [IEM](https://mesonet.agron.iastate.edu/)). Space weather: [NOAA SWPC](https://www.spaceweather.gov/) (Public Domain) & [GFZ Potsdam](https://kp.gfz.de/). All-sky cams: UiT, IRF, SGO, KHO, FMI, UAF Poker Flat, CSA/UCalgary AuroraMAX. Cloud map: [Windy.com](https://www.windy.com/).

For informational stargazing reference only — not an official weather or road-safety warning. Always check local road authorities before winter night driving. Released under the [MIT License](LICENSE).
