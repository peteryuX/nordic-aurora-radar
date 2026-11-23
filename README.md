# 🌌 Nordic Aurora Radar｜極光即時雷達

[![Live App](https://img.shields.io/badge/Live%20App-GitHub%20Pages-34f0b0?style=flat-square)](https://peteryux.github.io/nordic-aurora-radar/)
[![License: MIT](https://img.shields.io/badge/License-MIT-66bdff?style=flat-square)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/Build-Single%20HTML%20%7C%20Zero%20Deps-ffcf5c?style=flat-square)](index.html)
[![Privacy First](https://img.shields.io/badge/Privacy-100%25%20Client--Side-a78bfa?style=flat-square)](#-privacy--security隱私與安全)

> **Real-time Nordic & global aurora radar** combining official **Yr.no (MET Norway)** layered cloud forecasts, **NOAA SWPC** solar wind telemetry, twilight & moonlight physics, and a **360° clear-sky radar** — in a single zero-dependency web app.
>
> 整合挪威官方 **Yr.no** 分層雲量、美國 **NOAA** 即時太陽風衛星、精準天文暮光／月光模型與 **360° 晴空雷達**，打開即知「現在看得到極光嗎、往哪裡開最晴朗」的免費即時追光雷達。

### 👉 **[Open Live Aurora Radar / 立即開啟線上版](https://peteryux.github.io/nordic-aurora-radar/)**

Supports **Traditional Chinese (`繁體中文`)** and **English** with instant one-tap switching. Built for Arctic hotspots including **Alta, Tromsø, Lofoten, Senja, Narvik, Abisko, Kirkenes, Rovaniemi**, as well as **Iceland, Alaska, Canada, and Southern Hemisphere** locations worldwide.

---

## ✨ Key Features｜主要功能

- **🌌 Live Sky & 0–100 Viewing Score（即時天空實況與觀測指數）**
  - Dynamic SVG live sky scene with clear-sky %, aurora activity, and sky darkness breakdown.
  - Analytical solar twilight (`< -4°` ramp to `< -12°` dark) and ELP lunar phase / topocentric elevation modeling.
- **⚡ 2-Hour Solar Wind Energy & Ballistic L1 ETA（過去 2 小時太陽風能量與到達地球倒數）**
  - Direct **NOAA SWPC** 1-minute real-time solar wind (IMF $B_z$, $B_y$, speed, density) with **Newell magnetopause coupling**, L1-to-Earth propagation ETA split ("reaching Earth now" vs "incoming"), **GOES magnetometer substorm onset**, and CME dynamic pressure shock detection.
- **🌤️ 12-Hour Interactive Clear-Sky + Aurora Forecast（未來 12 小時晴空與極光預報）**
  - Tap any hour to inspect clear-sky %, temperature & wind chill, moonlight interference, and NOAA 72h Kp forecast.
- **🧭 360° Land-Safe Sky Radar（360° 周邊晴空雷達）**
  - Verified land-safe Nordic chase corridors + Open-Meteo elevation sea-filter outside presets, with one-tap Google Maps driving navigation to clearer skies.
- **🛰️ Live Cloud Map & Arctic Observatory All-Sky Cameras（即時動態雲圖與北歐天文台全天空相機）**
  - Embedded **Windy** live animated cloud map, **NOAA OVATION** Northern/Southern Hemisphere aurora oval, and ~1-minute live all-sky cameras from **UiT Skibotn (Norway)**, **IRF Kiruna (Sweden)**, and **SGO Sodankylä (Finland)**.
- **📱 Mobile-Ready Chase Toolkit（行動追光工具）**
  - GPS geolocation & global city search, native Web Share / clipboard summary sharing, audio + vibration aurora alert mode (with Screen Wake Lock), 6-hour offline cache fallback, and dynamic moon-aware smartphone photography guide.

---

## 🔬 How the Forecast Model Works｜科學模型說明

Unlike simple Kp-only apps, Nordic Aurora Radar combines space-weather physics, local layered cloud occlusion, and astronomical geometry:

1. **Layered Cloud Occlusion**: Uses random-overlap attenuation `1 - (1 - low)(1 - mid)(1 - 0.30 × high)(1 - fog)` from official **MET Norway 2.5 km** forecasts inside the Nordics (auto-fallback to **Open-Meteo** globally), so thin high cirrus doesn't falsely trigger an overcast alert.
2. **Geomagnetic & Solar Wind Fusion**: Computes **IGRF-14** dipole geomagnetic latitude and **Magnetic Local Time (MLT)** oval shift, fuses **NOAA OVATION** local probability, **Hemispheric Power Index (GW)**, and **1-minute Kp** without double-counting, then applies ballistic **Newell coupling** ($d\Phi/dt = v^{4/3} B_T^{2/3} \sin^{8/3}(\theta/2)$), **GOES substorm dipolarization**, and solar-wind dynamic pressure ($P_{\text{dyn}}$).
3. **Hard Physical Gates**: Automatically suppresses false positives during daylight/bright twilight (`sunAlt >= -4°`) or below auroral latitudes when geomagnetic activity cannot reach the horizon.

---

## 🔒 Privacy & Security｜隱私與安全

- **100% Static Client-Side**: Zero backend servers, zero databases, zero API keys, and zero third-party analytics, ads, or tracking cookies.
- **Local-First Location Handling**: GPS coordinates are processed strictly inside your browser and sent only to the public weather / reverse-geocoding endpoints needed to fetch your local forecast. Saved preferences and the 6-hour offline fallback live solely in your browser's `localStorage`.
- **Auditable Single-File Source**: The entire application lives in [`index.html`](index.html) with no external JavaScript bundles or build steps, making it straightforward to inspect, self-host, or fork.

---

## 🚀 Local Usage & Testing｜本機執行與單元測試

No build tools or package installation required:

```bash
git clone https://github.com/peteryuX/nordic-aurora-radar.git
cd nordic-aurora-radar
python3 -m http.server 8000
```

Run the automated unit test suite (Node.js 20+, zero dependencies):

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
