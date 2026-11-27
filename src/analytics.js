/**
 * Nordic Aurora Radar — Zero-Script, Cookieless GoatCounter Analytics Beacon
 *
 * Uses GoatCounter's native 1×1 GIF /count pixel endpoint via Image(), keeping
 * strict `script-src 'self'` CSP intact (zero 3rd-party JS), zero cookies,
 * zero PII, and zero raw GPS coordinates. Only fires on production GitHub Pages.
 */

export const GOATCOUNTER_ENDPOINT = 'https://ohwhatif.goatcounter.com/count';
const PROD_HOSTS = new Set(['ohwhatif.com', 'www.ohwhatif.com', 'ohwhatif.github.io', 'peteryux.github.io']);

const sentOnce = new Set();
let pageviewSent = false;

/** Strict environment guard: never pollute analytics from localhost, file://, or headless tests */
export function shouldSendAnalytics(envOpt = null) {
  const loc = envOpt?.location ?? (typeof location !== 'undefined' ? location : null);
  const nav = envOpt?.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
  const doc = envOpt?.document ?? (typeof document !== 'undefined' ? document : null);
  if (!loc || loc.protocol !== 'https:' || !PROD_HOSTS.has(loc.hostname)) return false;
  if (nav?.webdriver) return false;
  if (doc?.visibilityState === 'prerender') return false;
  return true;
}

/** Normalize a city object to a safe, anonymous lowercase slug (never leaks raw GPS coordinates) */
export function normalizeCitySlug(pos) {
  if (!pos || typeof pos !== 'object') return 'custom';
  const raw = String(pos.nameEn || pos.name || '').trim();
  if (!raw || /^GPS\s*\(/i.test(raw) || /\d+\.\d+°?[NS]/i.test(raw)) return 'custom';
  const cityPart = raw.includes('·') ? raw.split('·').pop().trim() : raw;
  const ascii = cityPart
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/gi, 'o')
    .replace(/æ/gi, 'ae')
    .replace(/å/gi, 'a')
    .replace(/ð/gi, 'd')
    .replace(/þ/gi, 'th')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return ascii || 'custom';
}

/** Build GoatCounter /count beacon URL matching official gc.zgo.at/count.js query schema */
export function buildAnalyticsUrl({
  path = '/nordic-aurora-radar/',
  title = '',
  referrer = '',
  event = false,
  screenWidth = null,
  rnd = '',
  endpoint = GOATCOUNTER_ENDPOINT
} = {}) {
  const params = new URLSearchParams();
  const rawPath = String(path || '/').trim() || '/';
  const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  params.set('p', cleanPath);
  if (title) params.set('t', String(title).slice(0, 140));
  if (referrer && !event) params.set('r', String(referrer).slice(0, 240));
  if (event) params.set('e', 'true');
  if (Number.isFinite(screenWidth) && screenWidth > 0) params.set('s', String(Math.round(screenWidth)));
  params.set('rnd', rnd || Math.random().toString(36).slice(2, 7));
  return `${endpoint}?${params.toString()}`;
}

function sendBeaconUrl(url) {
  try {
    if (typeof Image === 'undefined') return false;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    return true;
  } catch {
    return false;
  }
}

/** Send a single anonymized pageview beacon on production load */
export function trackPageview({ path, title } = {}) {
  if (pageviewSent || !shouldSendAnalytics()) return false;
  pageviewSent = true;
  const rawPath = path || (typeof location !== 'undefined' ? location.pathname : '/nordic-aurora-radar/');
  const rawTitle = title || (typeof document !== 'undefined' ? document.title : '');
  const ref = typeof document !== 'undefined' ? (document.referrer || '') : '';
  const sw = typeof window !== 'undefined' && window.screen ? window.screen.width : null;
  return sendBeaconUrl(buildAnalyticsUrl({ path: rawPath, title: rawTitle, referrer: ref, event: false, screenWidth: sw }));
}

/** Send an anonymized feature/city event beacon (optional per-session dedupe via once=true) */
export function trackEvent(slug, title = '', { once = false } = {}) {
  if (!slug || !shouldSendAnalytics()) return false;
  const key = String(slug).replace(/^\/+/, '');
  if (once && sentOnce.has(key)) return false;
  if (once) sentOnce.add(key);
  const sw = typeof window !== 'undefined' && window.screen ? window.screen.width : null;
  const evPath = key.startsWith('aurora/') ? `/event/${key}` : `/event/aurora/${key}`;
  return sendBeaconUrl(buildAnalyticsUrl({ path: evPath, title: title || key, event: true, screenWidth: sw }));
}
