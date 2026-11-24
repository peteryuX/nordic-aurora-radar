# 🌌 Nordic Aurora Radar｜極光即時雷達

[![Live App](https://img.shields.io/badge/Live%20App-GitHub%20Pages-34f0b0?style=flat-square)](https://peteryux.github.io/nordic-aurora-radar/)
[![License: MIT](https://img.shields.io/badge/License-MIT-66bdff?style=flat-square)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/Build-Zero%20Deps%20ES%20Modules-ffcf5c?style=flat-square)](src/aurora-engine.js)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20%2B%20Red%20Light-ff6b7b?style=flat-square)](manifest.json)

> **Real-time Nordic & global aurora radar** combining official **Yr.no (MET Norway)** layered cloud forecasts, **NOAA SWPC** solar wind telemetry & G1–G5 storm watches, twilight/moonlight physics, and a **360° clear-sky radar** — zero build step, 100% client-side.
>
> 整合挪威官方 **Yr.no** 分層雲量、美國 **NOAA** 即時太陽風衛星與 G1–G5 地磁暴警報、天文暮光／月光反照物理模型與 **360° 晴空雷達**，零後端、支援 PWA 離線與紅光夜視模式的免費即時追光雷達。

### 👉 **[Open Live Aurora Radar / 立即開啟線上版](https://peteryux.github.io/nordic-aurora-radar/)**

Supports **Traditional Chinese (`繁體中文`)** and **English** with instant one-tap switching. Built for Arctic hotspots including **Alta, Tromsø, Lofoten, Senja, Narvik, Abisko, Kirkenes, Rovaniemi**, plus verified real-road corridors for **Reykjavik, Fairbanks, Yellowknife, Queenstown, and Hobart**.

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
- **🛰️ Live Cloud Map & Arctic Observatory All-Sky Cameras（即時動態雲圖與北歐天文台全天空相機）**
  - Embedded **Windy** live animated cloud map, **NOAA OVATION** Northern/Southern Hemisphere aurora oval, and ~1-minute live all-sky cameras from **UiT Skibotn (Norway)**, **IRF Kiruna (Sweden)**, and **SGO Sodankylä (Finland)**.
- **🔴 Field-Ready PWA & Scotopic Red-Light Mode（紅光夜視模式與離線 PWA）**
  - One-tap **Astronomical Red-Light Mode** preserving human dark adaptation, installable **PWA** (`manifest.json` + conservative network-first `sw.js`), automatic URL bar city sync (`?lat=...&lon=...&name=...&lang=...`), background-capable aurora alerts (score ≥40, broken-cloud G3+ storms, substorms, or incoming CME shocks), and built-in **Live Observation vs Model Forecast** glossary.

---

## 🗂️ Clean Modular Architecture｜模組化專案架構

Zero build tools, zero npm runtime dependencies — standard browser ES modules served directly from GitHub Pages:

```text
nordic-aurora-radar/
├── index.html              # Clean semantic HTML5 shell (monochrome SVG icons, zero inline JS)
├── styles.css              # Calm OLED design tokens, 3-column bento layout & scotopic Red-Light mode
├── src/
│   ├── aurora-engine.js    # 100% pure scientific, astronomical, scoring & upstream API parser module
│   ├── charts.js           # 100% pure SVG visualization builders (uniform ticks + L1 gap splitting)
│   └── app.js              # Browser UI controller, i18n, live data orchestration, alerts & PWA wiring
├── manifest.json / sw.js   # Installable offline-resilient PWA shell + vector icon.svg
├── tests/aurora.test.mjs   # 24 automated unit, 50-city global regression & live API smoke tests
└── .github/workflows/ci.yml# Automated push/PR test runner + daily live upstream API health check
```

---

## 🔬 How the Forecast Model Works｜科學模型說明

1. **Layered Cloud Occlusion**: Uses `1 - (1 - low)(1 - mid)(1 - 0.30 × high)(1 - fog)` capped against total cloud fraction (preventing random-overlap over-estimation) from official **MET Norway 2.5 km** inside the Nordics and DST-proof **Open-Meteo** globally.
2. **Geomagnetic & Solar Wind Fusion**: Computes **IGRF-14 / AACGM-aligned** geomagnetic latitude (with eccentric Southern Hemisphere auroral pole calibration) and true solar-ephemeris **Magnetic Local Time (MLT)** for both hemispheres, fuses **NOAA OVATION**, **Hemispheric Power Index (GW)**, and **1-minute Kp** (filtering provisional trailing `0Z` placeholders) with a real-time **Newell/HPI/GOES/CME storm proxy** so sudden storms before Kp updates are never missed.
3. **50-City Global Calibration**: Tested across 50 cities (Arctic oval, sub-auroral, mid-latitude, Southern Hemisphere, and low-latitude gates) in [`tests/aurora.test.mjs`](tests/aurora.test.mjs).

---

## 🔒 Privacy & Security｜隱私與安全

- **100% Static Client-Side**: Zero backend servers, zero databases, zero API keys, and zero third-party analytics, ads, or tracking cookies.
- **Local-First Location Handling**: GPS coordinates are processed strictly inside your browser and sent only to public weather / reverse-geocoding endpoints needed for your forecast. Preferences and offline fallback live solely in `localStorage`.

---

## 🚀 Local Usage & Testing｜本機執行與單元測試

No build tools or package installation required:

```bash
git clone https://github.com/peteryuX/nordic-aurora-radar.git
cd nordic-aurora-radar
python3 -m http.server 8000
```

Run the 24 automated test suites (Node.js 20+, zero dependencies):

```bash
node --test tests/aurora.test.mjs
# Include live NOAA + MET Norway + Open-Meteo end-to-end verification:
LIVE_TEST=1 node --test tests/aurora.test.mjs
```

---

## 📡 Data Sources & Attribution｜資料來源與授權

This is a **non-commercial, open-source** personal stargazing tool. All upstream data providers are credited below:

- **Weather & Layered Clouds**: [MET Norway (Yr.no)](https://api.met.no/) (CC BY 4.0 / NLOD 2.0), [Open-Meteo](https://open-meteo.com/) (CC BY 4.0, non-commercial use)
- **Space Weather & Satellites**: [NOAA Space Weather Prediction Center (SWPC)](https://www.spaceweather.gov/) (U.S. Government Public Domain)
- **Live All-Sky Cameras**: [UiT Tromsø Geophysical Observatory](https://flux.phys.uit.no/), [IRF Kiruna](https://www.irf.se/), [SGO Sodankylä](https://www.sgo.fi/) (academic non-commercial live feeds)
- **Cloud Map & Reverse Geocoding**: [Windy.com](https://www.windy.com/), [BigDataCloud](https://www.bigdatacloud.com/)

> ⚠️ **Safety Disclaimer｜安全免責聲明**
> This app is provided "as is" for informational and recreational stargazing purposes only and is **not** an official weather, marine, or road-safety warning. When driving in Arctic winter conditions at night, always prioritize official local road authorities (e.g., [Statens vegvesen](https://www.vegvesen.no/trafikk)) and personal safety.

---

## 📄 License

Released under the [MIT License](LICENSE).
