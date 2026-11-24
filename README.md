# 🌌 Nordic Aurora Radar｜極光即時雷達

[![Live App (EN)](https://img.shields.io/badge/Live%20App-English-34f0b0?style=flat-square)](https://peteryux.github.io/nordic-aurora-radar/?lang=en)
[![Live App (繁體中文)](https://img.shields.io/badge/線上版-繁體中文-66bdff?style=flat-square)](https://peteryux.github.io/nordic-aurora-radar/?lang=zh)
[![License: MIT](https://img.shields.io/badge/License-MIT-a855f7?style=flat-square)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/Build-Zero%20Deps%20ES%20Modules-ffcf5c?style=flat-square)](src/aurora-engine.js)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20%2B%20Red%20Light-ff6b7b?style=flat-square)](manifest.json)

> **Real-time Nordic & global aurora radar** combining official **Yr.no (MET Norway)** layered cloud forecasts, **NOAA SWPC** solar wind telemetry & G1–G5 storm watches, twilight/moonlight physics, and a **360° clear-sky radar** — zero build step, 100% client-side.
>
> 整合挪威官方 **Yr.no** 分層雲量、美國 **NOAA** 即時太陽風衛星與 G1–G5 地磁暴警報、天文暮光／月光反照物理模型與 **360° 晴空雷達**，零後端、支援 PWA 離線與紅光夜視模式的免費即時追光雷達。

### 👉 Live Links｜直接開啟
- 🌍 **English Version**: **[https://peteryux.github.io/nordic-aurora-radar/?lang=en](https://peteryux.github.io/nordic-aurora-radar/?lang=en)**
- 🇹🇼 **繁體中文版**: **[https://peteryux.github.io/nordic-aurora-radar/?lang=zh](https://peteryux.github.io/nordic-aurora-radar/?lang=zh)**

Built for Arctic hotspots including **Alta, Tromsø, Lofoten, Senja, Narvik, Abisko, Kirkenes, Rovaniemi**, plus verified real-road corridors for **Reykjavik, Fairbanks, Yellowknife, Queenstown, and Hobart** (auto-detects browser language by default, or use `?lang=en` / `?lang=zh` for direct sharing).

---

## ✨ Key Features｜主要功能

- **🌌 Live Sky, 0–99 Viewing Score, True Magnetic Azimuth & Eye vs Camera Guidance（即時天空、方位角、仰角與肉眼／相機判斷）**
  - Dynamic SVG live sky scene with 3-column Clear Sky %, Aurora Activity, and Sky Darkness breakdown.
  - Analytical solar twilight (intensity-aware curve), ELP lunar elevation with **Krisciunas–Schaefer opposition surge**, **true geomagnetic pole compass bearing** (e.g. NNW in Nordics, NNE in Alaska, SSW in NZ), **spherical-Earth viewing elevation angles** (120–300 km), and **Naked-Eye vs Phone Night Mode** visibility guidance.
- **⚡ Solar Wind Energy, NOAA G1–G5 Storm Watch & Earth-Arrival Timeline（太陽風能量、官方地磁暴警報與到達地球時間軸）**
  - Direct **NOAA SWPC** 1-minute real-time solar wind (IMF $B_z$, $B_y$, speed, density) with **Newell magnetopause coupling**, X-axis shifted to **estimated Earth-arrival local time** (uniform 30-min `:00`/`:30` ticks + automatic >5 min L1 telemetry gap splitting), **GOES substorm onset**, CME dynamic pressure shock, and official **NOAA G1–G5 Storm Watch** ribbon.
- **🌤️ 12-Hour Interactive Forecast & 3-Night Outlook（12 小時逐時與未來 3 晚展望）**
  - Uniform 2-hour `HH:00` timeline ticks; tap any hour for clear-sky %, wind chill, moon phase, and NOAA Kp forecast, plus a compact **3-Night Outlook** strip combining NOAA 72h Kp with official dark-sky clouds.
- **🧭 360° Land-Safe Sky Radar（360° 周邊晴空雷達）**
  - Verified paved-road dark-sky corridors for **8 Nordic cities + 5 global hotspots** (Reykjavik, Fairbanks, Yellowknife, Queenstown, Hobart) and Open-Meteo elevation sea-filter elsewhere, with one-tap Google Maps driving navigation.
- **🛰️ Live Cloud Map, Ground Magnetometers & All-Sky Cameras（即時雲圖、北歐地面磁力儀與全天空相機）**
  - Embedded **Windy** live animated cloud map, **NOAA OVATION** Northern/Southern Hemisphere aurora oval, **FMI live Nordic ground magnetometer disturbance map**, and ~1-minute live all-sky cameras from **UiT Skibotn (Norway)**, **IRF Kiruna (Sweden)**, **SGO Sodankylä (Finland)**, and **KHO Svalbard (78°N)**.
- **🔴 Field-Ready PWA & Scotopic Red-Light Mode（紅光夜視模式與離線 PWA）**
  - One-tap **Astronomical Red-Light Mode** preserving human dark adaptation, installable **PWA** (`manifest.json` + conservative network-first `sw.js`), automatic URL bar city sync (`?lat=...&lon=...&name=...&lang=...`), snow/black-ice warnings on the 360° clear-sky radar, aurora alerts, and built-in **Live Observation vs Model Forecast** glossary.

---

## 🗂️ Clean Modular Architecture｜模組化專案架構

Zero build tools, zero npm runtime dependencies — standard browser ES modules served directly from GitHub Pages:

```text
nordic-aurora-radar/
├── index.html              # Semantic HTML5 shell (strict CSP, no-referrer, JSON-LD, zero inline JS)
├── styles.css              # Calm OLED design tokens, 3-column bento layout & scotopic Red-Light mode
├── src/
│   ├── aurora-engine.js    # 100% pure scientific, astronomical, scoring & 11-feed upstream parser module
│   ├── charts.js           # 100% pure SVG visualization builders (uniform ticks + L1 gap splitting)
│   └── app.js              # Browser UI controller, i18n, live data orchestration, alerts & PWA wiring
├── manifest.json / sw.js   # Installable offline-resilient PWA shell + vector icon.svg
├── llms.txt / sitemap.xml  # AI-Search (GEO) & search engine indexing metadata
├── SECURITY.md             # CSP allowlist, zero-tracking privacy guarantees & vulnerability policy
├── tests/
│   ├── aurora.test.mjs     # 29 automated unit, 50-city regression, security, i18n & live API smoke tests
│   ├── benchmark.mjs       # Quantitative quality scorecard (Confusion Matrix, JPL DE441, live cross-check)
│   └── fixtures/           # 44 real historical storm/trap cases + 16 NASA JPL Horizons DE441 checkpoints
└── .github/workflows/ci.yml# Automated push/PR test & benchmark gates + daily live API health check
```

---

## 🔬 Scientific Model & Verified Benchmarks｜科學模型與量化驗證

1. **11 Live NOAA SWPC Feeds**: Fuses 1-minute L1 solar wind (`Bz`/`By`/speed/density with **3-point median spike filtering**, ballistic Earth-arrival ETA, Newell coupling, and **60-min magnetotail preconditioning**), **NOAA Geospace 1h MHD predicted Kp**, 1-minute & 72h Kp, **official SWPC alerts (CME shocks & K5–K9)**, G1–G5 storm scales, OVATION, HPI (GW), and **dual-sector GOES East/West magnetometers**.
2. **Layered Cloud Occlusion & Dual-Model Consensus**: Uses `1 - (1 - low)(1 - mid)(1 - 0.30 × high)(1 - fog)` capped against total cloud fraction from official **MET Norway 2.5 km** inside the Nordics (automatically cross-checked against Open-Meteo at zero extra HTTP cost to flag fjord/valley divergence) and DST-proof **Open-Meteo** globally.
3. **Quantitative Quality Scorecard (`node tests/benchmark.mjs`)**:
   - **Historical Storm & Adversarial Trap Replay (44 cases)** — G5 Gannon (2024-05-10), G4 (2024-10-10, 2023-04-23, 2025-01-01), Nordic quiet-Kp substorms, sudden pre-Kp CME shocks, northward-Bz traps, and mid-latitude G1/G3 traps: **0.0% False Negative Rate**, **100% Recall & Specificity**.
   - **Independent Astronomy Ephemeris Audit (16 NASA JPL Horizons DE441 checkpoints)**: Solar elevation max error **0.006°** (MAE `0.004°`), lunar elevation max error **0.74°** (MAE `0.26°`), lunar illumination max error **1.16%** (MAE `0.33%`).

---

## 🔒 Privacy & Security｜隱私與安全

- **100% Static Client-Side & Zero Dependencies**: Zero backend servers, zero databases, zero npm runtime libraries, zero ads or tracking cookies.
- **Strict Content-Security-Policy & No-Referrer**: Enforces `script-src 'self'`, explicit `connect-src`/`img-src` government/observatory allowlists, `no-referrer`, and `rel="noopener noreferrer"` on every external link (verified 0 CSP violations in headless Chrome). See [`SECURITY.md`](SECURITY.md).
- **Local-First Location Handling**: GPS coordinates stay strictly in your browser (`localStorage`) and are never logged.

---

## 🚀 Local Usage & Testing｜本機執行與測試

No build tools or package installation required:

```bash
git clone https://github.com/peteryuX/nordic-aurora-radar.git
cd nordic-aurora-radar
python3 -m http.server 8000
```

Run the 27 automated test suites & quantitative benchmark (Node.js 20+, zero dependencies):

```bash
node --test tests/aurora.test.mjs
node tests/benchmark.mjs

# Include live NOAA + MET Norway + Open-Meteo end-to-end & multi-source cross-validation:
LIVE_TEST=1 node --test tests/aurora.test.mjs
LIVE_TEST=1 node tests/benchmark.mjs
```

---

## 📡 Data Sources & Attribution｜資料來源與授權

This is a **non-commercial, open-source** personal stargazing tool. All upstream data providers are credited below:

- **Weather & Layered Clouds**: [MET Norway (Yr.no)](https://api.met.no/) (CC BY 4.0 / NLOD 2.0), [Open-Meteo](https://open-meteo.com/) (CC BY 4.0, non-commercial use)
- **Space Weather & Satellites**: [NOAA Space Weather Prediction Center (SWPC)](https://www.spaceweather.gov/) (U.S. Government Public Domain)
- **All-Sky Cams & Ground Magnetometers**: [UiT TGO](https://flux.phys.uit.no/), [IRF Kiruna](https://www.irf.se/), [SGO Sodankylä](https://www.sgo.fi/), [KHO Svalbard](https://kho.unis.no/), [FMI Finland](https://en.ilmatieteenlaitos.fi/auroras-and-space-weather)
- **Cloud Map & Reverse Geocoding**: [Windy.com](https://www.windy.com/), [BigDataCloud](https://www.bigdatacloud.com/)

> ⚠️ **Safety Disclaimer｜安全免責聲明**
> This app is provided "as is" for informational and recreational stargazing purposes only and is **not** an official weather, marine, or road-safety warning. When driving in Arctic winter conditions at night, always prioritize official local road authorities (e.g., [Statens vegvesen](https://www.vegvesen.no/trafikk)) and personal safety.

---

## 📄 License

Released under the [MIT License](LICENSE).
