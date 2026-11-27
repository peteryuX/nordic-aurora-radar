# Security & Privacy Policy

## Architecture & Zero-Trust Guarantees

**Nordic Aurora Radar** is a 100% open-source, static client-side web application hosted over HTTPS on GitHub Pages (`https://ohwhatif.com/nordic-aurora-radar/`).

- **Zero Third-Party JavaScript Dependencies**: No CDN scripts, no npm runtime bundles, no obfuscated or minified binaries. Every line of code in `index.html`, `styles.css`, and `src/*.js` is directly readable and auditable on GitHub.
- **Strict Content-Security-Policy (CSP)**: Enforced via `<meta http-equiv="Content-Security-Policy">` in `index.html`:
  - `script-src 'self'` — blocks inline script injection and `eval()` XSS.
  - `connect-src` — strictly allowlists only official public scientific & geocoding APIs (`services.swpc.noaa.gov`, `api.met.no`, `api.open-meteo.com`, `geocoding-api.open-meteo.com`, `api.bigdatacloud.net`).
  - `img-src` — strictly allowlists official Nordic observatory cameras and NOAA/FMI plots.
  - `object-src 'none'; base-uri 'self'; form-action 'none'`.
- **Zero Referrer Leakage**: `<meta name="referrer" content="no-referrer">` plus `rel="noopener noreferrer"` on every external link ensures user coordinates in shareable URLs (`?lat=...&lon=...`) are never leaked to external websites and prevents reverse tabnabbing.
- **Zero Cookies, Accounts, or Tracking**: No cookies, no login, no advertising SDKs, and no backend database. GPS coordinates and preferences (`localStorage`) stay strictly on the user's device.
- **Input Sanitization**: Shareable URL query parameters (`parseUrlLocation`) validate finite coordinate bounds and strip HTML angle brackets / control characters.

## Reporting a Vulnerability

If you discover a security issue, XSS vector, or broken/compromised upstream link, please email `hello@ohwhatif.com` or open a [GitHub Security Advisory](https://github.com/ohwhatif/nordic-aurora-radar/security/advisories/new) on `ohwhatif/nordic-aurora-radar`.
