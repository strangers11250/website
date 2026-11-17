import { useEffect, useId, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isoDate, rangeStart, request, type Bar, type Bars, type Overview, type Symbols } from './api';

const presets = [{ label: '1M', months: 1 }, { label: '3M', months: 3 }, { label: '6M', months: 6 }, { label: '1Y', months: 12 }, { label: '5Y', months: 60 }];
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const count = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Market data could not be loaded.';

function PriceChart({ bars, symbol }: { bars: Bar[]; symbol: string }) {
  const id = useId().replaceAll(':', '');
  const width = 960, height = 300, left = 2, right = 84, top = 20, bottom = 25;
  const values = bars.map(bar => bar.close);
  const low = Math.min(...values), high = Math.max(...values);
  const padding = Math.max((high - low) * 0.12, high * 0.005);
  const min = low - padding, max = high + padding;
  const x = (i: number) => left + (i / Math.max(1, bars.length - 1)) * (width - left - right);
  const y = (value: number) => top + (1 - (value - min) / (max - min)) * (height - top - bottom);
  const path = bars.map((bar, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(bar.close)}`).join(' ');
  const area = `${path} L${x(bars.length - 1)},${height - bottom} L${left},${height - bottom} Z`;
  const ticks = [0, 1, 2, 3].map(i => min + (max - min) * i / 3);
  return <div className="chart-wrap">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${symbol} adjusted daily closing prices, ${bars[0].date} to ${bars.at(-1)!.date}; low ${usd.format(low)}, high ${usd.format(high)}.`}>
      <defs><linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a3e6c5" stopOpacity="0.18"/><stop offset="100%" stopColor="#a3e6c5" stopOpacity="0"/></linearGradient></defs>
      {ticks.map(value => <g key={value}><line x1={left} y1={y(value)} x2={width - right} y2={y(value)} stroke="#263136" strokeDasharray="3 6"/><text x={width - right + 16} y={y(value) + 4} fill="#8f9fa6" fontSize="12">{usd.format(value)}</text></g>)}
      <path d={area} fill={`url(#fill-${id})`}/><path d={path} stroke="#a3e6c5" strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
      <circle cx={x(bars.length - 1)} cy={y(bars.at(-1)!.close)} r="4" fill="#d5f8e7"/>
      <text x={left} y={height - 1} fill="#8f9fa6" fontSize="12">{bars[0].date}</text>
      <text x={width - right} y={height - 1} textAnchor="end" fill="#8f9fa6" fontSize="12">{bars.at(-1)!.date}</text>
    </svg>
  </div>;
}

export function App() {
  const today = isoDate(new Date());
  const [symbol, setSymbol] = useState('SPY');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [months, setMonths] = useState<number | null>(12);
  const [range, setRange] = useState({ start: rangeStart(today, 12), end: today });
  const [draft, setDraft] = useState(range);
  const [formError, setFormError] = useState('');
  const client = useQueryClient();
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim().toUpperCase()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const overview = useQuery({ queryKey: ['overview'], queryFn: ({ signal }) => request<Overview>('/api/overview', signal), refetchInterval: 60_000 });
  const bars = useQuery({ queryKey: ['bars', symbol, range.start, range.end], queryFn: ({ signal }) => request<Bars>(`/api/bars/${encodeURIComponent(symbol)}?start=${range.start}&end=${range.end}`, signal), refetchInterval: 60_000 });
  const suggestions = useQuery({ queryKey: ['symbols', debouncedSearch], queryFn: ({ signal }) => request<Symbols>(`/api/symbols?q=${encodeURIComponent(debouncedSearch)}`, signal), enabled: debouncedSearch.length > 0 && /^[A-Z][A-Z0-9.\-]{0,14}$/.test(debouncedSearch) });
  const status = useQuery({ queryKey: ['status'], queryFn: ({ signal }) => request<{ last_success?: string; interval_hours?: number; last_error?: string | null }>('/api/status', signal), refetchInterval: 60_000 });
  const data = bars.data?.bars ?? [];
  const latest = data.at(-1);
  const first = data[0];
  const performance = latest && first ? (latest.close / first.close - 1) * 100 : null;
  const isFetching = overview.isFetching || bars.isFetching;

  function selectStock(next: string) { setSymbol(next); setSearch(''); setFormError(''); }
  function searchSubmit(event: FormEvent) {
    event.preventDefault();
    const next = search.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(next)) { setFormError('Enter a valid stock symbol, for example AAPL or BRK.B.'); return; }
    selectStock(next);
  }
  function dateSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.start || !draft.end || draft.start > draft.end || draft.end > today || draft.start < rangeStart(draft.end, 120)) {
      setFormError('Choose dates in order, ending today or earlier, within a ten-year window.'); return;
    }
    setRange(draft); setMonths(null); setFormError('');
  }
  function preset(month: number) {
    const next = { start: rangeStart(today, month), end: today };
    setMonths(month); setRange(next); setDraft(next); setFormError('');
  }

  return <div className="app-shell">
    <header className="site-header"><a className="brand" href="/web/" aria-label="LegendaryBroker market dashboard"><span className="brand-mark" aria-hidden="true">L<span>↗</span></span><span>Legendary<span className="brand-light">Broker</span></span></a><span className="header-tag">MARKET RESEARCH</span><a href="/api/health" className="api-link">API health <span aria-hidden="true">↗</span></a></header>
    <main>
      <section className="page-heading"><div><p className="eyebrow">YOUR MARKET, IN PERSPECTIVE</p><h1>Market overview<span>.</span></h1><p className="intro">Follow the broader market. Explore the stocks that matter to you.</p></div><div className="daily-badge"><span className="status-dot"/> DAILY MARKET DATA</div></section>
      <section aria-labelledby="benchmarks-title" className="benchmarks">
        <div className="section-heading"><h2 id="benchmarks-title">The benchmarks</h2><span>Major indexes · ETF proxies</span></div>
        {overview.isError && <div className="inline-error" role="alert">{errorText(overview.error)} <button onClick={() => void overview.refetch()}>Try again</button></div>}
        <div className="benchmark-grid">{(overview.data?.items ?? [
          { symbol: 'SPY', name: 'S&P 500 ETF proxy', close: null, change_percent: null, date: null },
          { symbol: 'QQQ', name: 'Nasdaq-100 ETF proxy', close: null, change_percent: null, date: null },
          { symbol: 'DIA', name: 'Dow Jones ETF proxy', close: null, change_percent: null, date: null },
          { symbol: 'IWM', name: 'Russell 2000 ETF proxy', close: null, change_percent: null, date: null },
        ]).map((item, index) => <button key={item.symbol} className={`benchmark-card ${symbol === item.symbol ? 'selected' : ''}`} onClick={() => selectStock(item.symbol)} aria-pressed={symbol === item.symbol}>
          <div className="card-top"><span>{item.symbol}</span><span className="card-number">0{index + 1}</span></div><p>{item.name}</p><div className="card-price">{item.close == null ? '—' : usd.format(item.close)}<span className={item.change_percent == null ? 'muted' : item.change_percent >= 0 ? 'positive' : 'negative'}>{item.change_percent == null ? (overview.isPending ? 'Loading…' : 'No stored data') : signed(item.change_percent)}</span></div><div className="card-date">{item.date ? `Session ${item.date} · vs. prior close` : 'Completed daily sessions'}</div>
        </button>)}</div>
      </section>

      <section className="explorer" aria-labelledby="explorer-title">
        <div className="section-heading"><h2 id="explorer-title">Stock explorer</h2><span>Historical perspective</span></div>
        <div className="explorer-panel">
          <div className="explorer-toolbar"><div className="instrument"><div className="instrument-icon" aria-hidden="true">{symbol.slice(0, 1)}</div><div><h3>{symbol}</h3><span>Adjusted daily prices · USD</span></div></div>
            <form className="search-form" onSubmit={searchSubmit}><label className="sr-only" htmlFor="stock-search">Search stock symbol</label><span aria-hidden="true">⌕</span><input id="stock-search" list="stored-symbols" value={search} onChange={e => setSearch(e.target.value.toUpperCase())} placeholder="Search symbol, e.g. AAPL" maxLength={15} autoComplete="off"/><datalist id="stored-symbols">{suggestions.data?.symbols.map(item => <option key={item.symbol} value={item.symbol}>Latest: {item.latest_date}</option>)}</datalist><button type="submit">Go <span aria-hidden="true">↗</span></button></form>
          </div>
          <div className="price-toolbar"><div className="quote" aria-live="polite"><strong>{latest ? usd.format(latest.close) : '—'}</strong>{performance != null && <span className={performance >= 0 ? 'positive' : 'negative'}>{signed(performance)} <small>in selected period</small></span>}{latest && <span className="quote-date">Session {latest.date}</span>}</div><div className="range-buttons" role="group" aria-label="Time range">{presets.map(item => <button key={item.label} aria-pressed={months === item.months} className={months === item.months ? 'active' : ''} onClick={() => preset(item.months)}>{item.label}</button>)}</div></div>
          <form className="date-form" onSubmit={dateSubmit}><label>From<input type="date" value={draft.start} max={draft.end || today} onChange={e => setDraft({ ...draft, start: e.target.value })}/></label><span aria-hidden="true">—</span><label>To<input type="date" value={draft.end} min={draft.start} max={today} onChange={e => setDraft({ ...draft, end: e.target.value })}/></label><button type="submit">Apply dates</button><button type="button" className="refresh-button" disabled={isFetching} onClick={() => void client.invalidateQueries()}>{isFetching ? 'Updating…' : '↻ Refresh'}</button></form>
          {formError && <p role="alert" className="inline-error">{formError}</p>}
          {bars.isError ? <div className="chart-state" role="alert"><strong>Data could not be loaded</strong><p>{errorText(bars.error)}</p><button onClick={() => void bars.refetch()}>Try again</button></div> : bars.isPending ? <div className="chart-state" role="status"><span className="loader"/><p>Loading {symbol} history…</p></div> : data.length === 0 ? <div className="chart-state"><span className="empty-icon" aria-hidden="true">⌁</span><strong>No stored bars for {symbol} in this period</strong><p>Try a wider date range or another symbol. Only stocks collected by the server are available.</p></div> : <><PriceChart bars={data} symbol={symbol}/><div className="session-stats"><div><span>PERIOD HIGH</span><strong>{usd.format(Math.max(...data.map(bar => bar.high)))}</strong></div><div><span>PERIOD LOW</span><strong>{usd.format(Math.min(...data.map(bar => bar.low)))}</strong></div><div><span>LATEST VOLUME</span><strong>{count.format(latest!.volume)}</strong></div><div><span>SESSIONS</span><strong>{count.format(data.length)}</strong></div></div><details className="data-details"><summary>View recent session data <span>Last {Math.min(10, data.length)} sessions</span></summary><div className="table-scroll"><table><caption className="sr-only">Recent adjusted daily bars for {symbol}</caption><thead><tr><th scope="col">Session</th><th scope="col">Open</th><th scope="col">High</th><th scope="col">Low</th><th scope="col">Close</th><th scope="col">Volume</th></tr></thead><tbody>{data.slice(-10).reverse().map(bar => <tr key={bar.date}><th scope="row">{bar.date}</th><td>{usd.format(bar.open)}</td><td>{usd.format(bar.high)}</td><td>{usd.format(bar.low)}</td><td>{usd.format(bar.close)}</td><td>{new Intl.NumberFormat('en-US').format(bar.volume)}</td></tr>)}</tbody></table></div></details></>}
          <div className="data-source"><span><span className="status-dot"/> {bars.data?.source ?? overview.data?.source ?? 'Alpaca'} · {(bars.data?.feed ?? overview.data?.feed ?? 'SIP').toUpperCase()} · split & dividend adjusted</span><span>{bars.data?.ingested_at ? `Stored ${new Date(bars.data.ingested_at).toLocaleString()}` : 'Awaiting stored data'}</span></div>
        </div>
      </section>
      {status.data?.last_error && <p className="inline-error" role="status">The latest server sync did not complete. Displayed prices remain the last successfully stored data.{status.data.last_success ? ` Last successful sync: ${new Date(status.data.last_success).toLocaleString()}.` : ''}</p>}
      <aside className="data-note"><span aria-hidden="true">ⓘ</span><p>Prices represent completed daily sessions, not real-time quotes. Benchmarks are tradable ETF proxies and differ from the underlying indexes. {status.data?.interval_hours ? `The server checks for data every ${status.data.interval_hours} hours. ` : ''}Search reads the stored database; it does not request new symbols from the provider.</p></aside>
    </main>
    <footer><span>LEGENDARYBROKER <span className="footer-divider">/</span> Built for a longer view.</span><span>Research data · Not investment advice</span></footer>
  </div>;
}
