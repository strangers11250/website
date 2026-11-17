export type Bar = { date: string; symbol: string; open: number; high: number; low: number; close: number; volume: number };
export type Provenance = { source: string; feed: string; adjustment: string; ingested_at: string | null };
export type Bars = Provenance & { symbol: string; start: string; end: string; bars: Bar[]; latest_date: string | null };
export type Overview = Provenance & { items: { symbol: string; name: string; close: number | null; change_percent: number | null; date: string | null }[] };
export type Symbols = { symbols: { symbol: string; latest_date: string }[] };

export async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    if (response.status === 429) throw new Error('Too many requests. Please wait a moment and try again.');
    if (response.status === 503) throw new Error('The market database is temporarily unavailable. Please try again shortly.');
    throw new Error(`Unable to load market data (${response.status}). Please try again.`);
  }
  return response.json() as Promise<T>;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function rangeStart(end: string, months: number): string {
  const date = new Date(`${end}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return isoDate(date);
}
