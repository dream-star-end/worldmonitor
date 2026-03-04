/**
 * RPC: getFredSeries -- Federal Reserve Economic Data (FRED) time series
 * Port from api/fred-data.js
 */
import type {
  ServerContext,
  GetFredSeriesRequest,
  GetFredSeriesResponse,
  FredSeries,
  FredObservation,
} from '../../../../src/generated/server/worldmonitor/economic/v1/service_server';

import { cachedFetchJson } from '../../../_shared/redis';

const FRED_API_BASE = 'https://api.stlouisfed.org/fred';
const REDIS_CACHE_KEY = 'economic:fred:v1';
const REDIS_CACHE_TTL = 3600; // 1 hr — FRED data updates infrequently

async function fetchFredSeries(req: GetFredSeriesRequest): Promise<FredSeries | undefined> {
  try {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) return undefined;

    const limit = req.limit > 0 ? Math.min(req.limit, 1000) : 120;

    // Fetch observations and series metadata in parallel
    const obsParams = new URLSearchParams({
      series_id: req.seriesId,
      api_key: apiKey,
      file_type: 'json',
      sort_order: 'desc',
      limit: String(limit),
    });

    const metaParams = new URLSearchParams({
      series_id: req.seriesId,
      api_key: apiKey,
      file_type: 'json',
    });

    async function fetchWithRetry(url: string, maxRetries = 1): Promise<Response> {
      for (let i = 0; i <= maxRetries; i++) {
        try {
          const resp = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'WorldMonitor/1.0' },
            signal: AbortSignal.timeout(15000),
          });
          if (resp.ok || i === maxRetries) return resp;
        } catch (err) {
          if (i === maxRetries) throw err;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      throw new Error('unreachable');
    }

    const [obsResponse, metaResponse] = await Promise.all([
      fetchWithRetry(`${FRED_API_BASE}/series/observations?${obsParams}`),
      fetchWithRetry(`${FRED_API_BASE}/series?${metaParams}`),
    ]);

    if (!obsResponse.ok) {
      return { _error: `FRED API returned ${obsResponse.status}` } as any;
    }

    const obsData = await obsResponse.json() as { observations?: Array<{ date: string; value: string }> };

    const observations: FredObservation[] = (obsData.observations || [])
      .map((obs) => {
        const value = parseFloat(obs.value);
        if (isNaN(value) || obs.value === '.') return null;
        return { date: obs.date, value };
      })
      .filter((o): o is FredObservation => o !== null)
      .reverse(); // oldest first

    let title = req.seriesId;
    let units = '';
    let frequency = '';

    if (metaResponse.ok) {
      const metaData = await metaResponse.json() as { seriess?: Array<{ title?: string; units?: string; frequency?: string }> };
      const meta = metaData.seriess?.[0];
      if (meta) {
        title = meta.title || req.seriesId;
        units = meta.units || '';
        frequency = meta.frequency || '';
      }
    }

    return {
      seriesId: req.seriesId,
      title,
      units,
      frequency,
      observations,
    };
  } catch (err) {
    return { _error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) } as any;
  }
}

export async function getFredSeries(
  _ctx: ServerContext,
  req: GetFredSeriesRequest,
): Promise<GetFredSeriesResponse> {
  if (!req.seriesId) return { series: undefined };
  try {
    const cacheKey = `${REDIS_CACHE_KEY}:${req.seriesId}:${req.limit || 0}`;
    const result = await cachedFetchJson<GetFredSeriesResponse>(cacheKey, REDIS_CACHE_TTL, async () => {
      const series = await fetchFredSeries(req);
      if (series && (series as any)._error) return series as any;
      return series ? { series } : null;
    });
    return result || { series: undefined };
  } catch {
    return { series: undefined };
  }
}
