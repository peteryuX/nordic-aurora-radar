# 🌌 Nordic Aurora Radar｜極光視覺即時雷達

一個零依賴、純前端單頁的北歐／全球即時極光視覺雷達，直連挪威官方 **Yr.no (MET Norway)** 2.5 km 高解析分層雲量與美國 **NOAA SWPC** 即時太陽風衛星資料，結合精準天文太陽暮光、月球仰角與磁緯模型，專為行動裝置即時追光設計。

A zero-dependency, single-file real-time aurora radar for the Nordics and worldwide — combining official **Yr.no (MET Norway)** 2.5 km layered cloud forecasts, **Open-Meteo** global fallback, **NOAA SWPC** real-time solar wind telemetry, and analytical solar twilight / lunar elevation models.

🔗 **Live Demo（GitHub Pages）**：https://peteryux.github.io/nordic-aurora-radar/

---

## ✨ 主要功能 / Key Features

- **🌌 即時天空實況視覺儀表板 / Live Sky Dashboard**
  - 動態 SVG 極光與雲層實況視覺、0–100「看見指數」圓環，以及「天空清朗 / 極光強度 / 天黑暗空」三維拆解。
  - 內建太陽仰角與月球相位／仰角解析天文模型，精準判斷暮光與月光干擾。
- **⚡ 過去 2 小時極光能量變化圖 / 2-Hour Solar Wind Energy**
  - 整合 NOAA 即時太陽風（IMF Bz、風速、密度）、L1 飛抵地球估算時間（ETA）、GOES 磁力計、半球能量指數（HPI）與 OVATION 模型。
- **🌤️ 未來 12 小時「晴空＋極光」互動預報 / 12-Hour Interactive Forecast**
  - 點選圖表任一時段即可檢視晴空度、體感溫度、月光影響與 NOAA 官方 72 小時 Kp 預報。
- **🧭 360° 陸路安全雲洞雷達 / 360° Land-Safe Cloud-Gap Radar**
  - 內建北歐經典追光據點（Alta、Tromsø、Lofoten、Senja、Narvik、Abisko、Kirkenes、Rovaniemi）已驗證陸路走廊與海域高程檢查，一鍵開啟 Google Maps 導航追雲洞。
- **🛰️ 動態雲圖與北歐天文台即時全天空實拍 / Live Cloud Map & All-Sky Cams**
  - 內嵌 Windy 即時雲層動畫、NOAA 南／北半球 OVATION 極光橢圓圖，以及挪威 UiT（Skibotn）、瑞典 IRF（Kiruna）、芬蘭 SGO（Sodankylä）天文台約每分鐘更新的即時全天空相機。
- **📱 行動裝置友善工具 / Mobile-Friendly Utilities**
  - 繁體中文／English 一鍵即時切換、GPS 定位與全球城市搜尋、系統原生分享／剪貼簿一鍵複製即時摘要、極光爆發提醒模式與手機拍極光教學。

---

## 🚀 本機使用與部署 / Local Usage & Deployment

本專案為純靜態網頁（單一 `index.html`，無需建置工具或後端伺服器）：

- 直接在瀏覽器開啟 `index.html`，或透過任何靜態伺服器預覽：
  ```bash
  python3 -m http.server 8000
  ```
- 推送至 `main` 分支即會自動透過 GitHub Pages 更新線上站點。

---

## 📡 資料來源與授權聲明 / Data Sources & Attribution

本工具僅作非商業／個人追光與天文氣象參考，並遵循各公開資料來源授權：

- **Weather & Layered Clouds**：[MET Norway (Yr.no)](https://api.met.no/)（CC BY 4.0 / NLOD 2.0）、[Open-Meteo](https://open-meteo.com/)（CC BY 4.0, non-commercial use）
- **Space Weather & Satellites**：[NOAA SWPC](https://www.swpc.noaa.gov/)（U.S. Government Public Domain）
- **Live All-Sky Cameras**：[UiT Tromsø Geophysical Observatory](https://flux.phys.uit.no/)、[IRF Kiruna](https://www.irf.se/)、[SGO Sodankylä](https://www.sgo.fi/)（academic non-commercial）
- **Cloud Map & Reverse Geocoding**：[Windy.com](https://www.windy.com/)、[BigDataCloud](https://www.bigdatacloud.com/)

> ⚠️ **安全提醒 / Safety Notice**：極圈冬季夜間駕駛請務必以當地官方路況（如 Statens vegvesen）與人身安全為優先，本工具之預報與導航建議僅供參考。

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
