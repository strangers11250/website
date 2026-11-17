# Market dashboard

React and TypeScript dashboard served by FastAPI under `/web/`. All API calls use
the same origin under `/api/`; no provider credentials are accepted or bundled.

```powershell
cd web
npm ci
npm test
npm run build
```

`npm run dev` serves a local development preview and proxies `/api` to
`http://127.0.0.1:8000`. Production builds set Vite's base to `/web/` and emit
`web/dist`, which the backend mounts. The original landing page is preserved in
`welcome.html`; deployment does not need to replace the server root landing page.

The default cards represent SPY, QQQ, DIA, and IWM, labeled explicitly as ETF
proxies. Cards show the latest stored close and change against the prior stored
session. The graph shows adjusted daily closes; period performance compares its
first and last closes. Period high/low use the intraday high/low fields of the
stored daily bars. Date bounds are inclusive. No stored data is never replaced
with synthetic data. Searching a symbol only reads the database and never starts
a provider request or adds it to collection configuration.

TanStack Query keys include symbol and both date bounds, deduplicate concurrent
requests, cache fresh data for 60 seconds, and retain inactive results for 15
minutes. Active views revalidate each minute and on window focus. Requests pass
AbortSignal to fetch; switching symbols cannot render a previous symbol's chart.
The browser also honors API ETags/cache headers. Refresh explicitly invalidates
query data. Search suggestions debounce for 250 ms. Errors are user-facing and
do not expose backend response bodies. All third-party JavaScript is bundled;
there are no remote script, font, or chart dependencies at runtime.

Tests verify ETF labeling, missing data, sanitized errors, query reuse, symbol
switching without stale chart leakage, date selection, month-end arithmetic, and
cancellation signal propagation.
