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
    if (!apiKey) {
      console.warn('[FRED] FRED_API_KEY not configured');
      return undefined;
    }

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

    const [obsResponse, metaResponse] = await Promise.all([
      fetch(`${FRED_API_BASE}/series/observations?${obsParams}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${FRED_API_BASE}/series?${metaParams}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    if (!obsResponse.ok) {
      console.warn(`[FRED] obs API returned ${obsResponse.status}: ${await obsResponse.text().catch(() => 'N/A')}`);
      return undefined;
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
    console.warn('[FRED] fetchFredSeries error:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

export async function getFredSeries(
  _ctx: ServerContext,
  req: GetFredSeriesRequest,
): Promise<GetFredSeriesResponse> {
  if (!req.seriesId) return { series: undefined, _debug: 'empty seriesId' } as any;
  try {
    const hasKey = !!process.env.FRED_API_KEY;
    const cacheKey = `${REDIS_CACHE_KEY}:${req.seriesId}:${req.limit || 0}`;
    const result = await cachedFetchJson<GetFredSeriesResponse>(cacheKey, REDIS_CACHE_TTL, async () => {
      const series = await fetchFredSeries(req);
      return series ? { series } : null;
    });
    if (!result) return { series: undefined, _debug: `null result, hasKey=${hasKey}, sid=${req.seriesId}` } as any;
    return result;
  } catch (err) {
    return { series: undefined, _debug: `catch: ${err instanceof Error ? err.message : String(err)}` } as any;
  }
}
