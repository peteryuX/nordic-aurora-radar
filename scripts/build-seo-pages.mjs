/**
 * Deterministic SEO & AI-Search (GEO) static page generator for Nordic Aurora Radar.
 * Generates 10 high-utility bilingual destination pages (/spots/<slug>/index.html),
 * sitemap.xml, robots.txt, and llms-full.txt directly from live physics & corridor data.
 * Zero external npm dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeAuroraScore,
  computeCompassPoints,
  findNearestMetarStation,
  tDirLabel
} from '../src/aurora-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'https://peteryux.github.io/nordic-aurora-radar';
const LASTMOD = '2026-11-26';

const SPOTS = [
  {
    slug: 'tromso',
    cityEn: 'Tromsø',
    cityZh: '特羅姆瑟',
    countryEn: 'Norway',
    countryZh: '挪威',
    urlNameEn: 'Norway · Tromsø',
    urlNameZh: '挪威 · Tromsø',
    lat: 69.6492, lon: 18.9553,
    seasonEn: 'Sep – early Apr (darkest Nov – Feb)',
    seasonZh: '9 月至隔年 4 月初（11–2 月夜最長）',
    weatherModelEn: 'MET Norway (Yr.no) 2.5 km MEPS layered clouds + Open-Meteo cross-check',
    weatherModelZh: '挪威官方 Yr.no 2.5 km 分層雲量＋Open-Meteo 雙模型比對',
    roadNameEn: 'Norway Vegvesen Traffic', roadNameZh: '挪威 Vegvesen 即時路況', roadUrl: 'https://www.vegvesen.no/trafikk',
    tipEn: 'Coastal marine clouds often cover Tromsø island while inland valleys (Skibotn, Lyngen Alps rain shadow) stay crystal clear — check the 360° clear-sky polar radar before booking or driving.',
    tipZh: '特羅姆瑟靠海常受海洋低雲籠罩，但往東南內陸的 Skibotn（林根阿爾卑斯山雨影區）經常晴朗，出發前建議先看 360° 周邊晴空雷達。',
    keywords: 'Tromsø aurora forecast, Tromso northern lights tonight, Tromsø cloud cover, Skibotn clear sky, 特羅姆瑟極光預報, 挪威極光雲層'
  },
  {
    slug: 'lofoten',
    cityEn: 'Lofoten Islands',
    cityZh: '羅浮敦群島',
    countryEn: 'Norway',
    countryZh: '挪威',
    urlNameEn: 'Norway · Lofoten',
    urlNameZh: '挪威 · Lofoten',
    lat: 68.2342, lon: 14.5683,
    seasonEn: 'Sep – early Apr (polar night Dec – Jan)',
    seasonZh: '9 月至隔年 4 月初（12–1 月極夜）',
    weatherModelEn: 'MET Norway (Yr.no) 2.5 km MEPS layered clouds + Open-Meteo cross-check',
    weatherModelZh: '挪威官方 Yr.no 2.5 km 分層雲量＋Open-Meteo 雙模型比對',
    roadNameEn: 'Norway Vegvesen Traffic', roadNameZh: '挪威 Vegvesen 即時路況', roadUrl: 'https://www.vegvesen.no/trafikk',
    tipEn: 'Fast-moving North Atlantic cloud fronts cross Lofoten along the E10 corridor; a 30–60 minute drive between Svolvær, Gimsøy, and Leknes frequently finds clear breaks.',
    tipZh: '羅浮敦位於大西洋鋒面帶，雲層移動極快；沿 E10 公路在 Svolvær、Gimsøy 與 Leknes 之間移動 30–60 分鐘常能找到晴空空檔。',
    keywords: 'Lofoten aurora forecast, Lofoten northern lights tonight, Svolvær aurora clouds, 羅浮敦極光預報, 羅浮敦晴空'
  },
  {
    slug: 'alta',
    cityEn: 'Alta',
    cityZh: '阿爾塔',
    countryEn: 'Norway',
    countryZh: '挪威',
    urlNameEn: 'Norway · Alta',
    urlNameZh: '挪威 · Alta',
    lat: 69.9689, lon: 23.2716,
    seasonEn: 'Sep – early Apr',
    seasonZh: '9 月至隔年 4 月初',
    weatherModelEn: 'MET Norway (Yr.no) 2.5 km MEPS layered clouds + Open-Meteo cross-check',
    weatherModelZh: '挪威官方 Yr.no 2.5 km 分層雲量＋Open-Meteo 雙模型比對',
    roadNameEn: 'Norway Vegvesen Traffic', roadNameZh: '挪威 Vegvesen 即時路況', roadUrl: 'https://www.vegvesen.no/trafikk',
    tipEn: 'Known as the "City of the Northern Lights," Alta sits in a dry fjord microclimate protected by Finnmark plateau mountains — inland Kautokeino and Karasjok are prime cold-air clear-sky backups.',
    tipZh: '阿爾塔有「極光之城」之稱，因峽灣與高原地形阻擋海雲，晴空率高於多數北挪威沿岸城市；往南 Kautokeino 內陸更乾冷。',
    keywords: 'Alta Norway aurora forecast, Alta northern lights tonight, Finnmark aurora, 阿爾塔極光預報'
  },
  {
    slug: 'abisko',
    cityEn: 'Abisko',
    cityZh: '阿比斯庫',
    countryEn: 'Sweden',
    countryZh: '瑞典',
    urlNameEn: 'Sweden · Abisko',
    urlNameZh: '瑞典 · Abisko',
    lat: 68.3495, lon: 18.8312,
    seasonEn: 'Sep – early Apr',
    seasonZh: '9 月至隔年 4 月初',
    weatherModelEn: 'MET Norway (Yr.no) 2.5 km MEPS layered clouds + Open-Meteo cross-check',
    weatherModelZh: '挪威官方 Yr.no 2.5 km 分層雲量＋Open-Meteo 雙模型比對',
    roadNameEn: 'Sweden Trafikverket', roadNameZh: '瑞典 Trafikverket 路況', roadUrl: 'https://www.trafikverket.se/trafikinformation/vag/',
    tipEn: 'Abisko sits inside a renowned mountain rain shadow ("Blue Hole of Abisko") along Lake Torneträsk, giving it one of the highest clear-sky frequencies in Arctic Europe.',
    tipZh: '阿比斯庫位於山脈背風側，擁有著名的「藍洞（Blue Hole）」晴空微氣候，是全歐洲極光晴空率最高的地點之一。',
    keywords: 'Abisko aurora forecast, Abisko blue hole clouds, Kiruna northern lights, 阿比斯庫極光預報, 瑞典極光'
  },
  {
    slug: 'rovaniemi',
    cityEn: 'Rovaniemi',
    cityZh: '羅瓦涅米',
    countryEn: 'Finland',
    countryZh: '芬蘭',
    urlNameEn: 'Finland · Rovaniemi',
    urlNameZh: '芬蘭 · Rovaniemi',
    lat: 66.5039, lon: 25.7294,
    seasonEn: 'Sep – early Apr',
    seasonZh: '9 月至隔年 4 月初',
    weatherModelEn: 'MET Norway (Yr.no) 2.5 km MEPS layered clouds + Open-Meteo cross-check',
    weatherModelZh: '挪威官方 Yr.no 2.5 km 分層雲量＋Open-Meteo 雙模型比對',
    roadNameEn: 'Finland Fintraffic Roads', roadNameZh: '芬蘭 Fintraffic 路況', roadUrl: 'https://liikennetilanne.fintraffic.fi/',
    tipEn: 'Rovaniemi sits right on the Arctic Circle: escape city light pollution by driving 15–30 minutes north or northwest toward Olkkajärvi or Ranua, and watch for northern horizon arcs on quiet Kp 2 nights.',
    tipZh: '羅瓦涅米位於北極圈上，市區光害較明顯，建議往北或西北開 15–30 分鐘至湖畔暗空處；平靜夜（Kp 2）請優先留意北方低空。',
    keywords: 'Rovaniemi aurora forecast, Finnish Lapland northern lights, Rovaniemi cloud cover, 羅瓦涅米極光預報, 芬蘭極光'
  },
  {
    slug: 'reykjavik',
    cityEn: 'Reykjavik',
    cityZh: '雷克雅維克',
    countryEn: 'Iceland',
    countryZh: '冰島',
    urlNameEn: 'Iceland · Reykjavik',
    urlNameZh: '冰島 · Reykjavik',
    lat: 64.1466, lon: -21.9426,
    seasonEn: 'Sep – mid Apr',
    seasonZh: '9 月至隔年 4 月中',
    weatherModelEn: 'Dual-Model Open-Meteo (best_match + ICON) + live BIRK airport METAR',
    weatherModelZh: '冰島雙氣象模型（Open-Meteo + ICON）＋雷克雅維克機場實測校正',
    roadNameEn: 'Iceland Umferðin Road Status', roadNameZh: '冰島 Umferðin 即時路況', roadUrl: 'https://umferdin.is/en',
    tipEn: 'Iceland weather shifts rapidly between the Reykjanes peninsula, Þingvellir, and Borgarnes. Always verify wind and ice warnings on Umferðin before chasing clear gaps outside Reykjavik.',
    tipZh: '冰島西南部的雷克雅內斯半島、辛格韋德利與 Borgarnes 雲量落差極大；夜間自駕追晴空前務必先查 Umferðin 強風與結冰警示。',
    keywords: 'Reykjavik aurora forecast, Iceland northern lights cloud cover, Iceland aurora tonight, 冰島極光預報, 雷克雅維克極光'
  },
  {
    slug: 'akureyri',
    cityEn: 'Akureyri',
    cityZh: '阿克雷里',
    countryEn: 'Iceland',
    countryZh: '冰島',
    urlNameEn: 'Iceland · Akureyri',
    urlNameZh: '冰島 · Akureyri',
    lat: 65.6885, lon: -18.1262,
    seasonEn: 'Sep – mid Apr',
    seasonZh: '9 月至隔年 4 月中',
    weatherModelEn: 'Dual-Model Open-Meteo (best_match + ICON) + live BIAR airport METAR',
    weatherModelZh: '冰島雙氣象模型（Open-Meteo + ICON）＋阿克雷里機場實測校正',
    roadNameEn: 'Iceland Umferðin Road Status', roadNameZh: '冰島 Umferðin 即時路況', roadUrl: 'https://umferdin.is/en',
    tipEn: 'Northern Iceland enjoys drier fjord conditions than the southwest; Goðafoss and Lake Mývatn to the east are classic clear-sky dark corridors (note highland route F26 south is closed in winter).',
    tipZh: '冰島北部峽灣較西南部乾爽，往東的眾神瀑布（Goðafoss）與米湖是經典暗空走廊（注意南側高地 F26 冬季封閉）。',
    keywords: 'Akureyri aurora forecast, North Iceland northern lights, Myvatn aurora clouds, 阿克雷里極光預報, 冰島北部極光'
  },
  {
    slug: 'fairbanks',
    cityEn: 'Fairbanks',
    cityZh: '費爾班克斯',
    countryEn: 'Alaska, USA',
    countryZh: '美國阿拉斯加',
    urlNameEn: 'USA · Fairbanks',
    urlNameZh: '美國 · Fairbanks',
    lat: 64.8378, lon: -147.7164,
    seasonEn: 'Late Aug – mid Apr',
    seasonZh: '8 月底至隔年 4 月中',
    weatherModelEn: 'Dual-Model Open-Meteo (best_match + ECMWF IFS) + live PAFA airport METAR',
    weatherModelZh: '北美雙氣象模型（Open-Meteo + ECMWF）＋費爾班克斯機場實測校正',
    roadNameEn: 'Alaska 511 Road Conditions', roadNameZh: '阿拉斯加 511 路況', roadUrl: 'https://511.alaska.gov/',
    tipEn: 'Fairbanks sits directly beneath the auroral oval in an interior continental climate with frequent clear sub-zero nights. Murphy Dome, Cleary Summit, and Chena Hot Springs offer dark horizons — prepare for extreme cold (°F supported).',
    tipZh: '費爾班克斯位處極光帶正下方且屬大陸性乾冷氣候，晴夜比例極高；Cleary Summit 與 Chena 方向視野開闊，務必做好極寒保暖。',
    keywords: 'Fairbanks aurora forecast, Alaska northern lights tonight, Fairbanks clear sky, 費爾班克斯極光預報, 阿拉斯加極光'
  },
  {
    slug: 'yellowknife',
    cityEn: 'Yellowknife',
    cityZh: '黃刀鎮',
    countryEn: 'Canada',
    countryZh: '加拿大',
    urlNameEn: 'Canada · Yellowknife',
    urlNameZh: '加拿大 · Yellowknife',
    lat: 62.4540, lon: -114.3718,
    seasonEn: 'Mid Aug – mid Apr',
    seasonZh: '8 月中至隔年 4 月中',
    weatherModelEn: 'Dual-Model Open-Meteo (best_match + ECMWF IFS) + live CYZF airport METAR',
    weatherModelZh: '北美雙氣象模型（Open-Meteo + ECMWF）＋黃刀機場實測校正',
    roadNameEn: 'NWT Highway Conditions', roadNameZh: '西北領地公路路況', roadUrl: 'https://www.inf.gov.nt.ca/en/services/highways/highway-conditions',
    tipEn: 'With 68° geomagnetic latitude and flat sub-Arctic terrain, Yellowknife sees overhead aurora even on quiet Kp 1–2 nights. Ingraham Trail (east) and Highway 3 (west) provide unobstructed dark-sky lakes.',
    tipZh: '黃刀鎮地磁緯度高達 68° 且地形平坦開闊，即使在平靜的 Kp 1–2 夜也常有頭頂極光；沿 Ingraham Trail 與 3 號公路可快速遠離市區光害。',
    keywords: 'Yellowknife aurora forecast, Yellowknife northern lights tonight, Canada aurora, 黃刀鎮極光預報, 加拿大極光'
  },
  {
    slug: 'queenstown',
    cityEn: 'Queenstown',
    cityZh: '皇后鎮',
    countryEn: 'New Zealand',
    countryZh: '紐西蘭',
    urlNameEn: 'New Zealand · Queenstown',
    urlNameZh: '紐西蘭 · Queenstown',
    lat: -45.0312, lon: 168.6626,
    seasonEn: 'Mar – Oct (southern autumn/winter storms)',
    seasonZh: '3 月至 10 月（南半球秋冬地磁暴期間）',
    weatherModelEn: 'Dual-Model Open-Meteo (best_match + ECMWF IFS) + live NZQN airport METAR',
    weatherModelZh: '南半球雙氣象模型（Open-Meteo + ECMWF）＋皇后鎮機場實測校正',
    roadNameEn: 'NZTA Journeys Road Status', roadNameZh: '紐西蘭 NZTA 路況', roadUrl: 'https://www.journeys.nzta.govt.nz/',
    tipEn: 'Queenstown watches the Southern Lights (Aurora Australis) toward the southern horizon. Because geomagnetic latitude is 52°S, strong geomagnetic activity (G1–G2+ / Kp ≥ 5–6 or strong southward Bz) is needed — monitor NOAA solar wind and face south with an open lake view.',
    tipZh: '皇后鎮觀測的是南極光（Aurora Australis），地磁緯度約 52°S，通常需要 G1–G2 以上地磁暴（Kp ≥ 5–6 或強烈南向 Bz）才容易在南方低空出現，建議找南方無山遮蔽的湖岸。',
    keywords: 'Queenstown aurora australis forecast, New Zealand southern lights tonight, Lake Tekapo aurora, 皇后鎮南極光預報, 紐西蘭南極光'
  },
  {
    slug: 'vik',
    cityEn: 'Vík í Mýrdal',
    cityZh: '冰島維克',
    countryEn: 'Iceland',
    countryZh: '冰島',
    urlNameEn: 'Iceland · Vík',
    urlNameZh: '冰島 · Vík',
    lat: 63.4186, lon: -19.0060,
    seasonEn: 'Sep – early Apr',
    seasonZh: '9 月至隔年 4 月初',
    weatherModelEn: 'Open-Meteo ECMWF + ICON layered clouds · Vegagerðin live road cam',
    weatherModelZh: 'Open-Meteo ECMWF + ICON 分層雲量 · 冰島公路局 Vík 即時鏡頭',
    roadNameEn: 'Iceland Road.is & SafeTravel', roadNameZh: '冰島 Road.is 路況與安全', roadUrl: 'https://umferdin.is/en',
    tipEn: 'South Coast oceanic clouds roll in quickly at Reynisfjara and Vík, while driving 35–70 km east toward Kirkjubæjarklaustur or west toward Skógar often reveals dramatic clear gaps over glaciers.',
    tipZh: '冰島南岸黑沙灘（Vík）受大西洋雲帶影響變化快，沿一號環島公路往東（Kirkjubæjarklaustur）或往西（Skógar）常能找到冰川上空的晴空破口。',
    keywords: 'Vik Iceland aurora forecast, South Coast Iceland northern lights, Reynisfjara aurora clouds, 冰島維克極光預報, 冰島南岸極光'
  },
  {
    slug: 'levi',
    cityEn: 'Levi',
    cityZh: '芬蘭萊維',
    countryEn: 'Finland',
    countryZh: '芬蘭',
    urlNameEn: 'Finland · Levi',
    urlNameZh: '芬蘭 · Levi',
    lat: 67.8040, lon: 24.8080,
    seasonEn: 'Sep – early Apr',
    seasonZh: '9 月至隔年 4 月初',
    weatherModelEn: 'MET Norway (Yr.no) 2.5 km MEPS + FMI Lapland cloud & magnetometer sensors',
    weatherModelZh: '挪威 Yr.no 2.5 km 分層雲量＋芬蘭氣象局 FMI 地面磁力儀與雲量測站',
    roadNameEn: 'Finland Fintraffic Roads', roadNameZh: '芬蘭 Fintraffic 路況', roadUrl: 'https://liikennetilanne.fintraffic.fi/',
    tipEn: 'Levi sits well north of the Arctic Circle in Finnish Lapland: escape ski-resort slope lights by driving 15–30 minutes toward Lake Immeljärvi, Muonio, or Kittilä.',
    tipZh: '萊維深入北極圈內，避開滑雪場夜間燈光往北或西開 15–30 分鐘至湖畔或 Muonio 方向視野極佳，且鄰近 FMI 地面磁力儀即時偵測爆發。',
    keywords: 'Levi Finland aurora forecast, Kittila northern lights tonight, Finnish Lapland aurora, 芬蘭萊維極光預報'
  },
  {
    slug: 'saariselka',
    cityEn: 'Saariselkä',
    cityZh: '薩利色爾卡',
    countryEn: 'Finland',
    countryZh: '芬蘭',
    urlNameEn: 'Finland · Saariselkä',
    urlNameZh: '芬蘭 · Saariselkä',
    lat: 68.4197, lon: 27.4106,
    seasonEn: 'Sep – early Apr',
    seasonZh: '9 月至隔年 4 月初',
    weatherModelEn: 'MET Norway (Yr.no) 2.5 km MEPS + FMI Ivalo/Sodankylä ground sensors',
    weatherModelZh: '挪威 Yr.no 2.5 km 分層雲量＋芬蘭 FMI Ivalo 機場與地面磁力儀',
    roadNameEn: 'Finland Fintraffic Roads', roadNameZh: '芬蘭 Fintraffic 路況', roadUrl: 'https://liikennetilanne.fintraffic.fi/',
    tipEn: 'Home to Finland’s famous glass igloos, Saariselkä enjoys dark Arctic wilderness skies under the core auroral oval — check Kaunispää fell or north toward Inari when valley mist forms.',
    tipZh: '芬蘭經典玻璃屋所在地，位於極光帶核心且光害極低；若谷地起霧可上 Kaunispää 山頂或沿 E75 往北 Inari 方向找晴空。',
    keywords: 'Saariselka aurora forecast, Kakslauttanen glass igloo northern lights, Inari aurora tonight, 薩利色爾卡極光預報, 芬蘭玻璃屋極光'
  },
  {
    slug: 'anchorage',
    cityEn: 'Anchorage',
    cityZh: '安克拉治',
    countryEn: 'USA (Alaska)',
    countryZh: '美國阿拉斯加',
    urlNameEn: 'USA · Anchorage',
    urlNameZh: '美國 · Anchorage',
    lat: 61.2181, lon: -149.9003,
    seasonEn: 'Sep – early Apr',
    seasonZh: '9 月至隔年 4 月初',
    weatherModelEn: 'Open-Meteo ECMWF + GFS layered clouds · METAR PANC airport obs',
    weatherModelZh: 'Open-Meteo ECMWF + GFS 分層雲量 · PANC 機場實測校正',
    roadNameEn: 'Alaska 511 Road Status', roadNameZh: '阿拉斯加 511 路況', roadUrl: 'https://511.alaska.gov/',
    tipEn: 'Anchorage requires moderate geomagnetic activity (Kp 3–4+) for bright northern arcs — drive 35–60 minutes north along Glenn Hwy toward Eklutna or Palmer to escape Cook Inlet city glow.',
    tipZh: '安克拉治需中等地磁活動（Kp 3–4+）時北向低空清晰可見，建議沿 Glenn Hwy 往北開 35–60 分鐘至 Eklutna 或 Palmer 避開市區光害。',
    keywords: 'Anchorage aurora forecast, Alaska northern lights tonight, Palmer aurora clouds, 安克拉治極光預報, 阿拉斯加極光'
  },
  {
    slug: 'banff',
    cityEn: 'Banff',
    cityZh: '加拿大班夫',
    countryEn: 'Canada',
    countryZh: '加拿大',
    urlNameEn: 'Canada · Banff',
    urlNameZh: '加拿大 · Banff',
    lat: 51.1784, lon: -115.5708,
    seasonEn: 'Sep – Apr (best on Kp 4+ nights)',
    seasonZh: '9 月至隔年 4 月（Kp 4+ 機會佳）',
    weatherModelEn: 'Open-Meteo ECMWF + GEM layered clouds · Alberta 511 winter highway status',
    weatherModelZh: 'Open-Meteo ECMWF + GEM 分層雲量 · 亞伯達 511 公路即時路況',
    roadNameEn: 'Alberta 511 Road Conditions', roadNameZh: '亞伯達 511 路況', roadUrl: 'https://511.alberta.ca/',
    tipEn: 'Banff sits in the Canadian Rockies storm-aurora zone: Lake Minnewanka and Vermilion Lakes offer iconic north-facing reflections on Kp 4–5+ nights, while foothills east toward Canmore often clear first.',
    tipZh: '班夫屬於洛磯山脈風暴極光帶，當 Kp 達 4–5+ 時於 Lake Minnewanka 或 Vermilion Lakes 可拍出北向極光倒影；若山區雲厚可往東 Canmore 方向找晴空。',
    keywords: 'Banff aurora forecast, Banff northern lights tonight, Lake Minnewanka aurora, 班夫極光預報, 加拿大極光'
  }
];

const esc = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const spotRecords = SPOTS.map(spot => {
  const sc = computeAuroraScore({ lat: spot.lat, lon: spot.lon, cloudNow: 10, sunAlt: -18, bz: -3, speed: 450, kp: 3 });
  const metar = findNearestMetarStation(spot.lat, spot.lon);
  const corridors = computeCompassPoints(spot.lat, spot.lon).slice(1);
  const hemi = spot.lat >= 0 ? 'N' : 'S';
  const kpTextEn = sc.neededKp <= 0.5 ? 'Kp 0–1 (directly under the auroral oval)' : `Kp ≥ ${sc.neededKp.toFixed(1)}`;
  const kpTextZh = sc.neededKp <= 0.5 ? 'Kp 0–1（位於極光帶正下方）' : `Kp ≥ ${sc.neededKp.toFixed(1)}`;
  return { ...spot, magLat: sc.magLat, neededKp: sc.neededKp, hemi, metar, corridors, kpTextEn, kpTextZh };
});

// 1. Write 10 /spots/<slug>/index.html pages
for (const s of spotRecords) {
  const dir = path.join(ROOT, 'spots', s.slug);
  fs.mkdirSync(dir, { recursive: true });
  const canonical = `${BASE_URL}/spots/${s.slug}/`;
  const appUrlEn = `../../?lat=${s.lat}&lon=${s.lon}&name=${encodeURIComponent(s.urlNameEn)}&lang=en`;
  const appUrlZh = `../../?lat=${s.lat}&lon=${s.lon}&name=${encodeURIComponent(s.urlNameZh)}&lang=zh`;
  const auroraTypeEn = s.lat >= 0 ? 'Northern Lights (Aurora Borealis)' : 'Southern Lights (Aurora Australis)';
  const auroraTypeZh = s.lat >= 0 ? '北極光' : '南極光';

  const corridorRows = s.corridors.map(c => {
    const km = c.roadKm ?? c.distKm ?? '--';
    const noteEn = c.roadNoteEn || (c.isOcean ? 'Open sea reference' : 'Clear-sky backup direction');
    const noteZh = c.roadNote || (c.isOcean ? '海域參考' : '晴空備案方向');
    return `<tr>
      <td><strong>${esc(tDirLabel(c.label, 'en'))}</strong><br/><span class="muted">${esc(c.label)}</span></td>
      <td class="num">${km} km</td>
      <td>${esc(noteEn)}<br/><span class="muted">${esc(noteZh)}</span></td>
    </tr>`;
  }).join('\n');

  const siblingLinks = spotRecords
    .filter(o => o.slug !== s.slug)
    .map(o => `<a class="spot-chip" href="../${o.slug}/">${esc(o.cityEn)} · ${esc(o.cityZh)}</a>`)
    .join('\n          ');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: `${s.cityEn} Aurora Forecast Tonight｜${s.cityZh}${auroraTypeZh}即時預報`,
        url: canonical,
        inLanguage: ['en', 'zh-Hant'],
        dateModified: LASTMOD,
        isPartOf: { '@type': 'WebApplication', name: 'Nordic Aurora Radar', url: `${BASE_URL}/` },
        about: {
          '@type': 'Place',
          name: `${s.cityEn}, ${s.countryEn}`,
          geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lon }
        }
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `What Kp index is needed to see aurora in ${s.cityEn}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `${s.cityEn} sits at ${s.magLat}°${s.hemi} geomagnetic latitude (IGRF-14 Apex-110). Typical viewing threshold is ${s.kpTextEn}, combined with dark sky and clear local cloud cover.`
            }
          },
          {
            '@type': 'Question',
            name: `How do I check live clouds and aurora in ${s.cityEn} tonight?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Nordic Aurora Radar combines ${s.weatherModelEn}${s.metar ? ` and live ${s.metar.icao} airport ceilometer readings` : ''} with 14 NOAA SWPC live solar wind feeds into a single 0–99 hourly viewing score and a 360° clear-sky driving radar.`
            }
          }
        ]
      }
    ]
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(s.cityEn)} Aurora Forecast Tonight｜${esc(s.cityZh)}${auroraTypeZh}即時預報 — Nordic Aurora Radar</title>
  <meta name="description" content="Live ${esc(s.cityEn)}, ${esc(s.countryEn)} ${auroraTypeEn} forecast: 24-hour viewing score, layered cloud cover, 360° clear-sky driving radar &amp; 14 NOAA solar wind feeds. ${esc(s.cityZh)}${auroraTypeZh}即時晴空與太陽風預報。" />
  <meta name="keywords" content="${esc(s.keywords)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta name="referrer" content="no-referrer" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.open-meteo.com https://services.swpc.noaa.gov; object-src 'none'; base-uri 'self'; form-action 'none';" />
  <meta name="theme-color" content="#08090c" />
  <link rel="canonical" href="${canonical}" />
  <link rel="icon" type="image/svg+xml" href="../../icon.svg" />
  <link rel="apple-touch-icon" sizes="180x180" href="../../apple-touch-icon.png" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${esc(s.cityEn)} Aurora Forecast Tonight — Live Clouds &amp; Solar Wind" />
  <meta property="og:description" content="Free, no-ad live ${esc(s.cityEn)} aurora viewing score (0–99), 24h cloud strip, 3-night peak window &amp; 360° clear-sky radar." />
  <meta property="og:image" content="${BASE_URL}/og-cover.png?v=2" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${BASE_URL}/og-cover.png?v=2" />
  <link rel="stylesheet" href="../../styles.css" />
  <style>
    .spot-wrap { max-width: 680px; margin: 0 auto; padding: 18px 14px 48px; }
    .spot-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; font-size: 0.82rem; }
    .spot-nav a { color: var(--green); text-decoration: none; font-weight: 700; }
    .spot-hero h1 { margin: 0 0 6px; font-size: 1.48rem; line-height: 1.25; }
    .spot-sub { margin: 0 0 14px; color: var(--text-soft); font-size: 0.9rem; line-height: 1.55; }
    .spot-live {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px;
      margin: 0 0 12px; padding: 10px 12px; border-radius: 12px;
      background: var(--surface-2); border: 1px solid var(--border-strong);
      font-size: 0.84rem; font-variant-numeric: tabular-nums;
    }
    .spot-live-lbl { font-size: 0.72rem; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .spot-live-score { font-size: 1rem; font-weight: 900; color: var(--text); }
    .spot-live-meta { font-size: 0.8rem; color: var(--text-soft); font-weight: 600; }
    .spot-cta-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 9px; margin-top: 12px; }
    .spot-cta {
      display: flex; align-items: center; justify-content: center; min-height: 48px; padding: 10px 14px;
      border-radius: 13px; text-decoration: none; font-weight: 800; font-size: 0.9rem; text-align: center;
    }
    .spot-cta.primary { background: var(--green-bg); border: 1px solid var(--green-border); color: var(--green-text); }
    .spot-cta.secondary { background: var(--surface-2); border: 1px solid var(--border-strong); color: var(--text); }
    .spot-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 10px; }
    .spot-kv { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 10px 11px; }
    .spot-kv span { display: block; font-size: 0.72rem; color: var(--muted); margin-bottom: 3px; }
    .spot-kv strong { font-size: 0.88rem; color: var(--text); line-height: 1.35; }
    .spot-tbl { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.82rem; }
    .spot-tbl th, .spot-tbl td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .spot-tbl th { color: var(--muted); font-size: 0.74rem; font-weight: 700; }
    .spot-tbl td.num { white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--text-soft); }
    .muted { color: var(--muted); font-size: 0.76rem; }
    .spot-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
    .spot-chip {
      display: inline-flex; align-items: center; padding: 7px 11px; border-radius: 999px;
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text-soft);
      font-size: 0.78rem; font-weight: 700; text-decoration: none;
    }
    .spot-chip:hover { border-color: var(--green-border); color: var(--text); }
  </style>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
  <div class="spot-wrap">
    <nav class="spot-nav" aria-label="Breadcrumb">
      <a href="../../">← Nordic Aurora Radar｜極光即時雷達</a>
      <a href="${esc(s.roadUrl)}" target="_blank" rel="noopener noreferrer">${esc(s.roadNameEn)} ↗</a>
    </nav>

    <section class="card spot-hero">
      <h1>${esc(s.cityEn)}, ${esc(s.countryEn)} Aurora Forecast<br/><span style="font-size:1.05rem;color:var(--text-soft);font-weight:700;">${esc(s.countryZh)} · ${esc(s.cityZh)}${auroraTypeZh}即時預報</span></h1>
      <div id="spotLiveBox" class="spot-live" data-lat="${s.lat}" data-lon="${s.lon}" aria-live="polite">
        <div>
          <div class="spot-live-lbl">Live Now｜即時觀測</div>
          <div id="spotLiveScore" class="spot-live-score">Loading live sky &amp; Kp…</div>
        </div>
        <div id="spotLiveMeta" class="spot-live-meta">NOAA SWPC · Open-Meteo</div>
      </div>
      <p class="spot-sub">${esc(s.tipEn)}<br/>${esc(s.tipZh)}</p>
      <div class="spot-cta-row">
        <a class="spot-cta primary" href="${appUrlEn}">Open Live ${esc(s.cityEn)} Radar (EN) →</a>
        <a class="spot-cta secondary" href="${appUrlZh}">開啟即時${esc(s.cityZh)}雷達（繁體中文）→</a>
      </div>
    </section>

    <section class="card">
      <h2>Local Aurora Physics &amp; Live Data｜在地觀測參數</h2>
      <div class="spot-grid">
        <div class="spot-kv"><span>Geomagnetic Latitude｜地磁緯度 (IGRF-14)</span><strong>${s.magLat}°${s.hemi}</strong></div>
        <div class="spot-kv"><span>Typical Activity Needed｜一般所需地磁活動</span><strong>${esc(s.kpTextEn)}<br/><span class="muted">${esc(s.kpTextZh)}</span></strong></div>
        <div class="spot-kv"><span>Best Viewing Season｜主要觀測季節</span><strong>${esc(s.seasonEn)}<br/><span class="muted">${esc(s.seasonZh)}</span></strong></div>
        <div class="spot-kv"><span>Cloud Model &amp; Airport Obs｜雲量與機場實測</span><strong>${esc(s.weatherModelEn)}${s.metar ? ` · METAR ${s.metar.icao} (${s.metar.distKm} km)` : ''}</strong></div>
      </div>
    </section>

    <section class="card">
      <h2>360° Clear-Sky Driving Corridors｜周邊晴空追光路線</h2>
      <p class="spot-sub" style="margin-bottom:6px;">Road-verified winter backup directions plotted on the live 360° polar radar with wind, snow &amp; black-ice safety checks.</p>
      <table class="spot-tbl">
        <thead><tr><th>Corridor｜方向</th><th>Road</th><th>Microclimate &amp; Road Notes｜微氣候與路況備註</th></tr></thead>
        <tbody>
          ${corridorRows}
        </tbody>
      </table>
      <div style="margin-top:12px;font-size:0.8rem;color:var(--muted);">
        Official road &amp; closure status｜官方即時路況：<a href="${esc(s.roadUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--green);">${esc(s.roadNameEn)} / ${esc(s.roadNameZh)} ↗</a>
      </div>
    </section>

    <section class="card">
      <h2>More Aurora Destinations｜其他極光熱點即時預報</h2>
      <div class="spot-chips">
          ${siblingLinks}
      </div>
      <p style="margin:12px 0 0;font-size:0.76rem;color:var(--muted);">
        Free, open-source, zero tracking · Supports °C / °F &amp; scotopic red-light night-vision mode ·
        <a href="https://github.com/peteryuX/nordic-aurora-radar/blob/main/VALIDATION.md" target="_blank" rel="noopener noreferrer" style="color:var(--text-soft);">Validation Report (VALIDATION.md) ↗</a>
      </p>
    </section>
  </div>
  <script type="module" src="../../src/spot-live.js"></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
}

// 2. Write sitemap.xml
const urls = [
  { loc: `${BASE_URL}/`, freq: 'daily', prio: '1.0' },
  ...spotRecords.map(s => ({ loc: `${BASE_URL}/spots/${s.slug}/`, freq: 'weekly', prio: '0.85' })),
  { loc: `${BASE_URL}/llms.txt`, freq: 'weekly', prio: '0.6' },
  { loc: `${BASE_URL}/llms-full.txt`, freq: 'weekly', prio: '0.6' }
];
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.prio}</priority>
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapXml, 'utf8');

// 3. Write robots.txt (explicitly welcoming search engines & AI search crawlers)
const robotsTxt = `User-agent: *
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Applebot
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robotsTxt, 'utf8');

// 4. Write llms-full.txt (comprehensive structured context for AI search & RAG pipelines)
const llmsFull = `# Nordic Aurora Radar (極光即時雷達) — Full Technical & Destination Reference

> Free, open-source (MIT), zero-tracking real-time aurora forecast PWA for Northern Norway, Iceland, Lapland, Alaska, Canada, New Zealand, Tasmania, and global GPS locations.

- Live App (繁體中文): ${BASE_URL}/
- Live App (English): ${BASE_URL}/?lang=en
- Source Repository: https://github.com/peteryuX/nordic-aurora-radar
- Validation & Known Limitations: https://github.com/peteryuX/nordic-aurora-radar/blob/main/VALIDATION.md
- Last Updated: ${LASTMOD}

## Core Architecture & User Experience

1. **Unified 0–99 Viewing Score** (four tiers: \`>=65\` Excellent / 極佳, \`40–64\` Good / 適合觀測, \`18–39\` Fair / 普通, \`<18\` Low / 偏低):
   - Multiplicative model combining effective layered clear sky, geomagnetic aurora activity, and twilight/lunar darkness.
   - Single-metric 24-hour score bar chart with a separated monochrome clear-sky context strip (zero dual-axis ambiguity).
   - 3-night outlook displaying unified peak score, 3-hour local peak viewing window (e.g., \`21–00\`), clear-sky %, and Kp/G-scale.
2. **True 360° Continuous Polar Clear-Sky Radar**:
   - Plots winter-road-verified backup destinations at their exact spherical compass bearing and proportional road distance.
   - Flags gale wind (\`>=12 m/s\`), blowing snow, and ice hazards in red while keeping ordinary cloudy directions muted grey.
3. **14 Live NOAA SWPC Space-Weather Feeds + Layered Clouds + METAR Ceilometers**:
   - L1 solar wind (\`Bz\`, \`By\`, \`Bt\`, speed, density) with ballistic Earth-arrival ETA, Newell coupling, 60-min substorm preconditioning, Geospace 1h MHD Kp, 1m Kp, 72h Kp forecast, G1–G5 scales, SWPC warnings/CME shocks, OVATION grid, HPI (GW), dual GOES-East/West magnetometers, Kyoto Dst, Propagated Solar Wind, and WSA-ENLIL 96h.
   - Official MET Norway (Yr.no) 2.5 km MEPS layered clouds in the Nordics + Dual-Model Open-Meteo (\`ICON\` in Iceland, \`ECMWF IFS\` globally) + live 61-airport METAR laser ceilometer Optimal Interpolation (\`+0..3h\`, \`<=55 km\`).
4. **Field-Ready Design**:
   - Auto \`°C / °F\` by locale with manual toggle, zero-leak deep-red scotopic night-vision mode, Wake Lock alert monitor, offline SWR PWA cache, zero cookies/analytics, and 50 automated unit tests (including bilingual zh-TW/EN copy & chart-clarity lint gate).

## Supported Key Aurora Destinations (Direct Landing Pages)

${spotRecords.map(s => `### ${s.cityEn}, ${s.countryEn} (${s.cityZh})
- Guide & Direct Launch: ${BASE_URL}/spots/${s.slug}/
- Coordinates: \`${s.lat}, ${s.lon}\` | Geomagnetic Latitude (IGRF-14): \`${s.magLat}°${s.hemi}\`
- Typical Activity Threshold: ${s.kpTextEn}
- Best Season: ${s.seasonEn}
- Weather & Airport METAR: ${s.weatherModelEn}${s.metar ? ` + ${s.metar.icao} (${s.metar.distKm} km)` : ''}
- Field Note: ${s.tipEn}
- Road-Verified Corridors: ${s.corridors.map(c => `${tDirLabel(c.label, 'en')} (~${c.roadKm ?? c.distKm ?? '?'} km)`).join('; ')}
- Official Road Authority: ${s.roadNameEn} (${s.roadUrl})
`).join('\n')}
`;
fs.writeFileSync(path.join(ROOT, 'llms-full.txt'), llmsFull, 'utf8');

console.log(`SEO_BUILD_OK: ${spotRecords.length} spot pages, ${urls.length} sitemap URLs, robots.txt, llms-full.txt`);
