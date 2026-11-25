# Nordic Aurora Radar｜極光即時雷達

[![Live App (EN)](https://img.shields.io/badge/Live%20App-English-34f0b0?style=flat-square)](https://peteryux.github.io/nordic-aurora-radar/?lang=en)
[![Live App (繁體中文)](https://img.shields.io/badge/線上版-繁體中文-66bdff?style=flat-square)](https://peteryux.github.io/nordic-aurora-radar/?lang=zh)
[![License: MIT](https://img.shields.io/badge/License-MIT-a855f7?style=flat-square)](LICENSE)

Real-time Nordic & global aurora radar fusing **MET Norway (Yr.no)** 2.5 km layered clouds, **14 live NOAA SWPC** space-weather feeds, twilight/moonlight darkness physics, live airport METAR laser ceilometers, and a **360° winter-road clear-sky radar** — zero build step, zero trackers, 100% client-side.

整合挪威官方 **Yr.no** 2.5 km 分層雲量、**14 項美國 NOAA 即時太空天氣衛星資料**、機場 METAR 雷射雲高短時融合、天文暮光／月光物理與 **360° 冬季實路晴空雷達**；零後端、零追蹤、支援紅光夜視與 PWA 離線使用。

- **English**: https://peteryux.github.io/nordic-aurora-radar/?lang=en
- **繁體中文**: https://peteryux.github.io/nordic-aurora-radar/?lang=zh

## Key Features｜主要功能

- **0–99 Viewing Score & Pure IGRF-14 Apex-110 Physics**：Fuses layered low/mid/high cloud optics, MET Norway `2.5 km` primary clouds in Nordics (with Open-Meteo divergence consensus) and dual-model NWP globally (`best_match + ICON` in Iceland, `best_match + ECMWF` elsewhere), **live Airport METAR Optimal Interpolation** (`+0h–+3h`, `≤ 55 km`), pure **IGRF-14 (n=1..13) Modified Apex-110** geomagnetic latitude, and JPL DE441-verified twilight/moonlight physics.
- **Live Solar Wind & Earth-Arrival Timeline**：14 NOAA SWPC feeds including 1-minute L1 magnetometer/plasma with causal spike filtering, ballistic Earth-arrival local time axis, Newell coupling, Geospace 1h predicted Kp, GOES East/West magnetometers, Kyoto Dst, WSA-ENLIL CME forecast, and SWPC G1–G5 storm alerts.
- **12-Hour & 3-Night Outlook**：Interactive hourly clear-sky & score chart plus a 3-night dark-sky outlook using sustained 2-hour clear windows.
- **360° Winter-Road Clear-Sky Radar**：Verified winter-open paved corridors with road distances & driving hazard warnings (gale/blowing snow, extreme cold, road authority links) for **18 global hubs** — Alta, Tromsø, Lofoten, Senja, Narvik, Abisko, Kiruna, Kirkenes, Rovaniemi, Inari, Reykjavik, Akureyri, Fairbanks, Yellowknife, Whitehorse, Queenstown, Lake Tekapo, and Hobart (plus any global GPS/city search).
- **Live All-Sky Cams & Cloud Map**：Region-aware live observatory cameras (**Nordic**: UiT Skibotn, IRF Kiruna, SGO Sodankylä, KHO Svalbard, FMI ground magnetometers; **North America**: UAF Poker Flat, CSA/UCalgary AuroraMAX), embedded Windy clouds, and NOAA OVATION oval.
- **Field-Ready PWA & Red-Light Mode**：Zero-leak scotopic red-light mode, screen-on alert monitor (with auto Wake Lock re-acquire), coordinate-keyed offline cache, strict CSP (`script-src 'self'`), and zero cookies/analytics (see [SECURITY.md](SECURITY.md)).

## Architecture｜專案結構

Zero build tools, zero npm runtime dependencies (native ES modules):

- `index.html` / `styles.css` — Semantic PWA shell, strict CSP & scotopic red-light theme
- `src/aurora-engine.js` — Pure physics (IGRF-14 Apex-110, JPL DE441 solar/lunar, Newell coupling, layered clouds, METAR Optimal Interpolation) & 15+ upstream parsers
- `src/charts.js` — Pure SVG visualizations (live sky, solar wind, 12h wave, 360° radar)
- `src/data-client.js` / `src/storage.js` / `src/i18n.js` / `src/app.js` — Live transport (NOAA, MET Norway, Dual-Model Open-Meteo, METAR ceilometers), offline SWR cache, bilingual UI & controller
- `tests/` — `46` automated tests (`45` unit + `1` optional live in `aurora.test.mjs`), `72` curated scenario regression guardrails & `22` JPL DE441 checkpoints (`benchmark.mjs`), and live public-data audit (`realworld-validation.mjs`)

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
