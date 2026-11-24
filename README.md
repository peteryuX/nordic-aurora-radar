# Nordic Aurora Radar｜極光即時雷達

[![Live App (EN)](https://img.shields.io/badge/Live%20App-English-34f0b0?style=flat-square)](https://peteryux.github.io/nordic-aurora-radar/?lang=en)
[![Live App (繁體中文)](https://img.shields.io/badge/線上版-繁體中文-66bdff?style=flat-square)](https://peteryux.github.io/nordic-aurora-radar/?lang=zh)
[![License: MIT](https://img.shields.io/badge/License-MIT-a855f7?style=flat-square)](LICENSE)

Real-time Nordic & global aurora radar fusing **MET Norway (Yr.no)** 2.5 km layered clouds, **14 live NOAA SWPC** solar wind & geomagnetic feeds, twilight/moonlight darkness physics, and a **360° winter-road clear-sky radar** — zero build step, zero trackers, 100% client-side.

整合挪威官方 **Yr.no** 2.5 km 分層雲量、**14 項美國 NOAA 即時太空天氣衛星資料**、天文暮光／月光物理與 **360° 冬季實路晴空雷達**；零後端、零追蹤、支援紅光夜視與 PWA 離線使用。

- **English**: https://peteryux.github.io/nordic-aurora-radar/?lang=en
- **繁體中文**: https://peteryux.github.io/nordic-aurora-radar/?lang=zh

## Key Features｜主要功能

- **0–99 Viewing Score & Sky Geometry**：Fuses layered low/mid/high cloud optics, geomagnetic activity, and twilight/moonlight darkness, with exact dark-window countdown, magnetic bearing, viewing elevation, and naked-eye vs camera guidance.
- **Live Solar Wind & Earth-Arrival Timeline**：1-minute NOAA L1 solar wind (IMF Bz, By, speed, density) with causal spike filtering, Newell coupling, Earth-arrival local time axis, GOES substorm onset, Kyoto Dst, WSA-ENLIL CME forecast, and NOAA G1–G5 storm banners.
- **12-Hour & 3-Night Outlook**：Interactive hourly clear-sky & score chart plus a 3-night dark-sky outlook using sustained 2-hour clear windows.
- **360° Winter-Road Clear-Sky Radar**：Verified winter-open paved corridors with road distances & driving hazard warnings (gale/blowing snow, extreme cold, road authority links) for **18 global hubs** — Alta, Tromsø, Lofoten, Senja, Narvik, Abisko, Kiruna, Kirkenes, Rovaniemi, Inari, Reykjavik, Akureyri, Fairbanks, Yellowknife, Whitehorse, Queenstown, Lake Tekapo, and Hobart (plus any global GPS/city search).
- **Live All-Sky Cams & Cloud Map**：Region-aware live observatory cameras (**Nordic**: UiT Skibotn, IRF Kiruna, SGO Sodankylä, KHO Svalbard, FMI ground magnetometers; **North America**: UAF Poker Flat, CSA/UCalgary AuroraMAX), embedded Windy clouds, and NOAA OVATION oval.
- **Field-Ready PWA & Red-Light Mode**：True scotopic red-light mode, screen-on alert monitor, coordinate-keyed offline cache, strict CSP (`script-src 'self'`), and zero cookies/analytics (see [SECURITY.md](SECURITY.md)).

## Architecture｜專案結構

Zero build tools, zero npm runtime dependencies (native ES modules):

- `index.html` / `styles.css` — Semantic PWA shell, strict CSP & scotopic red-light theme
- `src/aurora-engine.js` — Pure physics, astronomy, scoring & 14-feed upstream parsers
- `src/charts.js` — Pure SVG visualizations (live sky, solar wind, 12h wave, 360° radar)
- `src/data-client.js` / `src/storage.js` / `src/i18n.js` / `src/app.js` — Live transport, offline SWR cache, bilingual UI & controller
- `tests/` — 42 automated tests (`aurora.test.mjs`), 72-case + 22 JPL DE441 calibration (`benchmark.mjs`), and 17,255h NASA OMNI2 blind geomagnetic audit (`realworld-validation.mjs`, geomagnetic ROC-AUC 0.92–0.94 excl. clouds)

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

Weather: [MET Norway (Yr.no)](https://api.met.no/) (CC BY 4.0) & [Open-Meteo](https://open-meteo.com/) (CC BY 4.0). Space weather: [NOAA SWPC](https://www.spaceweather.gov/) (Public Domain). All-sky cams: UiT, IRF, SGO, KHO, FMI, UAF Poker Flat, CSA/UCalgary AuroraMAX. Cloud map: [Windy.com](https://www.windy.com/).

For informational stargazing reference only — not an official weather or road-safety warning. Always check local road authorities before winter night driving. Released under the [MIT License](LICENSE).
