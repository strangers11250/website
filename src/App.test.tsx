import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { rangeStart, request } from './api';

const provenance = { source: 'alpaca', feed: 'sip', adjustment: 'all', ingested_at: '2026-11-14T00:00:00Z' };
const exampleBars = (symbol: string) => ({
  ...provenance, symbol, start: '2025-11-16', end: '2026-11-16', latest_date: '2026-11-13',
  bars: [{ date: '2026-11-12', symbol, open: 99, high: 103, low: 98, close: 100, volume: 2000 },
    { date: '2026-11-13', symbol, open: 100, high: 104, low: 99, close: 102, volume: 2100 }],
});
let clients: QueryClient[] = [];
function showApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  return client;
}
function response(data: unknown, status = 200) { return Promise.resolve(new Response(JSON.stringify(data), { status })); }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((path: string) => {
    if (path === '/api/overview') return response({ ...provenance, items: [
      { symbol: 'SPY', name: 'S&P 500 ETF proxy', close: 102, change_percent: 2, date: '2026-11-13' },
      { symbol: 'QQQ', name: 'Nasdaq-100 ETF proxy', close: null, change_percent: null, date: null },
    ] });
    if (path === '/api/status') return response({ interval_hours: 6 });
    if (path.startsWith('/api/symbols')) return response({ symbols: [{ symbol: 'AAPL', latest_date: '2026-11-13' }] });
    return response(exampleBars(path.split('/')[3].split('?')[0]));
  }));
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients = []; vi.unstubAllGlobals(); });

describe('market dashboard', () => {
  it('labels ETF proxies and displays stored sessions and provenance', async () => {
    showApp();
    expect(await screen.findByRole('img', { name: /SPY adjusted daily closing prices/ })).toBeInTheDocument();
    expect(screen.getByText('S&P 500 ETF proxy')).toBeInTheDocument();
    expect(screen.getByText('No stored data')).toBeInTheDocument();
    expect(screen.getByText(/The server checks for data every 6 hours/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/View recent session data/));
    expect(screen.getByRole('table')).toHaveTextContent('2026-11-13');
    expect(screen.getByRole('table')).toHaveTextContent('2,100');
  });

  it('switches stock without showing the previous stock chart and reuses fresh cached history', async () => {
    let finishQQQ: ((value: Response) => void) | undefined;
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn((path: string, options?: RequestInit) => path.startsWith('/api/bars/QQQ')
      ? new Promise<Response>(resolve => { finishQQQ = resolve; }) : originalFetch(path, options)));
    showApp();
    await screen.findByRole('img', { name: /SPY adjusted daily/ });
    fireEvent.click(screen.getByRole('button', { name: /QQQ/ }));
    expect(screen.queryByRole('img', { name: /SPY adjusted daily/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading QQQ');
    await act(async () => { finishQQQ!(new Response(JSON.stringify(exampleBars('QQQ')))); });
    await screen.findByRole('img', { name: /QQQ adjusted daily/ });
    fireEvent.click(screen.getByRole('button', { name: /SPY/ }));
    await screen.findByRole('img', { name: /SPY adjusted daily/ });
    const spyCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith('/api/bars/SPY'));
    expect(spyCalls).toHaveLength(1);
  });

  it('searches the stored API with normalized symbols and presents empty results honestly', async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn((path: string, options?: RequestInit) => path.startsWith('/api/bars/AAPL')
      ? response({ ...exampleBars('AAPL'), bars: [], latest_date: null }) : originalFetch(path, options)));
    showApp();
    await screen.findByRole('img', { name: /SPY adjusted daily/ });
    fireEvent.change(screen.getByLabelText('Search stock symbol'), { target: { value: 'aapl' } });
    fireEvent.submit(screen.getByLabelText('Search stock symbol').closest('form')!);
    expect(await screen.findByText('No stored bars for AAPL in this period')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).startsWith('/api/bars/AAPL?start='))).toBe(true);
  });

  it('renders sanitized server errors and offers a retry', async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn((path: string, options?: RequestInit) => path.startsWith('/api/bars/')
      ? response({ detail: 'secret internal database path' }, 503) : originalFetch(path, options)));
    showApp();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('temporarily unavailable');
    expect(alert).not.toHaveTextContent('secret internal database path');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('preset dates change the request and exact date ranges are applied', async () => {
    showApp();
    await screen.findByRole('img', { name: /SPY adjusted daily/ });
    fireEvent.click(screen.getByRole('button', { name: '1M' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith('/api/bars/SPY'))).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply dates' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('start=2026-01-01&end=2026-06-01'))).toBe(true));
  });
});

describe('date and API boundaries', () => {
  it('clamps month ends including leap years', () => {
    expect(rangeStart('2026-03-31', 1)).toBe('2026-02-28');
    expect(rangeStart('2024-03-31', 1)).toBe('2024-02-29');
    expect(rangeStart('2024-02-29', 12)).toBe('2023-02-28');
  });
  it('passes abort signals to fetch and explains rate limiting', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(() => response({}, 429)));
    await expect(request('/api/overview', controller.signal)).rejects.toThrow('Too many requests');
    expect(fetch).toHaveBeenCalledWith('/api/overview', expect.objectContaining({ signal: controller.signal }));
  });
});
