# Nordic Aurora Radar｜極光即時雷達

[![Live App (EN)](https://img.shields.io/badge/Live%20App-English-34f0b0?style=flat-square)](https://peteryux.github.io/nordic-aurora-radar/?lang=en)
[![Live App (繁體中文)](https://img.shields.io/badge/線上版-繁體中文-66bdff?style=flat-square)](https://peteryux.github.io/nordic-aurora-radar/?lang=zh)
[![License: MIT](https://img.shields.io/badge/License-MIT-a855f7?style=flat-square)](LICENSE)

Real-time Nordic & global aurora radar fusing **MET Norway (Yr.no)** 2.5 km layered clouds, **14 live NOAA SWPC** solar wind & geomagnetic feeds, twilight/moonlight darkness physics, and a **360° winter-road clear-sky radar** — zero build step, zero trackers, 100% client-side.

整合挪威官方 **Yr.no** 2.5 km 分層雲量、**14 項美國 NOAA 即時太空天氣衛星資料**、天文暮光／月光物理與 **360° 冬季實路晴空雷達**；零後端、零追蹤、支援紅光夜視與 PWA 離線使用。

- **English**: https://peteryux.github.io/nordic-aurora-radar/?lang=en
- **繁體中文**: https://peteryux.github.io/nordic-aurora-radar/?lang=zh

## Key Features｜主要功能

- **0–99 Viewing Score & Pure IGRF-14 Apex-110 Physics**：Fuses layered low/mid/high cloud optics, global dual-model NWP (`MET Norway 2.5km` in Nordics, `best_match + ICON` in Iceland, `best_match + ECMWF` globally), **live Airport METAR laser ceilometer Optimal Interpolation** (`+0h–+3h`), pure **IGRF-14 (n=1..13) Modified Apex-110** geomagnetic coordinates (`0.24°` global MAE vs AACGMv2), and twilight/moonlight darkness physics.
- **Live Solar Wind & Earth-Arrival Timeline**：1-minute NOAA L1 solar wind (IMF Bz, By, speed, density) with causal spike filtering, Newell coupling, Earth-arrival local time axis, GOES substorm onset, Kyoto Dst, WSA-ENLIL CME forecast, and NOAA G1–G5 storm banners.
- **12-Hour & 3-Night Outlook**：Interactive hourly clear-sky & score chart plus a 3-night dark-sky outlook using sustained 2-hour clear windows.
- **360° Winter-Road Clear-Sky Radar**：Verified winter-open paved corridors with road distances & driving hazard warnings (gale/blowing snow, extreme cold, road authority links) for **18 global hubs** — Alta, Tromsø, Lofoten, Senja, Narvik, Abisko, Kiruna, Kirkenes, Rovaniemi, Inari, Reykjavik, Akureyri, Fairbanks, Yellowknife, Whitehorse, Queenstown, Lake Tekapo, and Hobart (plus any global GPS/city search).
- **Live All-Sky Cams & Cloud Map**：Region-aware live observatory cameras (**Nordic**: UiT Skibotn, IRF Kiruna, SGO Sodankylä, KHO Svalbard, FMI ground magnetometers; **North America**: UAF Poker Flat, CSA/UCalgary AuroraMAX), embedded Windy clouds, and NOAA OVATION oval.
- **Field-Ready PWA & Red-Light Mode**：True scotopic red-light mode, screen-on alert monitor, coordinate-keyed offline cache, strict CSP (`script-src 'self'`), and zero cookies/analytics (see [SECURITY.md](SECURITY.md)).

## Architecture｜專案結構

Zero build tools, zero npm runtime dependencies (native ES modules):

- `index.html` / `styles.css` — Semantic PWA shell, strict CSP & scotopic red-light theme
- `src/aurora-engine.js` — Pure physics (IGRF-14 Apex-110, JPL DE441 solar/lunar, Newell coupling, layered clouds, METAR Optimal Interpolation) & 15+ upstream parsers
- `src/charts.js` — Pure SVG visualizations (live sky, solar wind, 12h wave, 360° radar)
- `src/data-client.js` / `src/storage.js` / `src/i18n.js` / `src/app.js` — Live transport (NOAA, MET Norway, Dual-Model Open-Meteo, METAR ceilometers), offline SWR cache, bilingual UI & controller
- `tests/` — 43 automated tests (`aurora.test.mjs`), 72-case physics regression & 22 JPL DE441 checkpoints (`benchmark.mjs`), and blind multi-archive validation (`realworld-validation.mjs`)

## Independent Zero-Fitting Validation｜零擬合盲測驗證

All physics upgrades are verified strictly out-of-sample (zero weight fitting). See the full methodology, 5-archive breakdown, and **6 rigorously rejected hypotheses** in **[VALIDATION.md](VALIDATION.md)**：

- **Geomagnetic Coordinates (IGRF-14 Apex-110 vs AACGMv2, N=14,122)**：Global MAE reduced 12× from `2.88°` → **`0.24°`** (North America `0.28°`, Europe `0.20°`, Nordics `0.17°`, Southern Hemisphere `0.25°`).
- **12-Year Global Human Sightings (Aurorasaurus 2014–2025 + NASA OMNI2, N=20,318, 2,008 dates)**：ROC-AUC **`0.807`** (vs `0.689` Kp-only, UTC-date cluster 95% CI lift `+0.025..+0.046` from IGRF-14 alone; MCC `0.359` → `0.437`).
- **10-Year Nordic All-Sky Camera Optical Photometry (FMI/MIRACLE 557.7 nm, 31M frames, 44,870 dark hours)**：Clear-sky (`N=16,272`) ROC-AUC **`0.87–0.89`** (`≥2–5 kR`), all-weather Prime-tier (`65–99`) optical hit rate **`95.8%`** (`≥2 kR`).
- **Full Solar Cycle Space Weather (GFZ Hp30 2020–2025, 103,656 30-min bins & NASA OMNI2 2015–2025, 95,614h)**：Pure-L1 solar-wind ROC-AUC **`0.87–0.95`** (`Hp30 ≥ 5`) and **`0.91–0.93`** (`AE ≥ 500 nT`).
- **2-Season Global Airport Laser Ceilometers (20 hubs × 2 winters, 60,693 unbiased dark hours)**：Causal METAR Optimal Interpolation improves `+1h` clear-sky ROC-AUC from **`0.81` → `0.90`**, lowers cloud MAE by **`5–6 pts`** (`24% → 18%`), and cuts false-clear alarms by **`>50%`** (`7.5% → 3.3%`). Dual-model consensus in Iceland cuts false-clear alarms from **`20–21%` → `6–7%`** (`AUC 0.79–0.80` → `0.83–0.85`).

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
