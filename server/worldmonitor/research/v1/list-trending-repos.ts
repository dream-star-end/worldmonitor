/**
 * RPC: listTrendingRepos
 *
 * Fetches trending GitHub repos from gitterapp JSON API with
 * herokuapp fallback. Returns empty array on any failure.
 */

import type {
  ServerContext,
  ListTrendingReposRequest,
  ListTrendingReposResponse,
  GithubRepo,
} from '../../../../src/generated/server/worldmonitor/research/v1/service_server';

import { CHROME_UA, clampInt } from '../../../_shared/constants';
import { cachedFetchJson } from '../../../_shared/redis';

const REDIS_CACHE_KEY = 'research:trending:v1';
const REDIS_CACHE_TTL = 3600; // 1 hr — daily trending data

// ---------- Fetch ----------

async function fetchTrendingRepos(req: ListTrendingReposRequest): Promise<GithubRepo[]> {
  const language = req.language || 'python';
  const period = req.period || 'daily';
  const pageSize = clampInt(req.pageSize, 50, 1, 100);

  const sinceDate = new Date();
  if (period === 'weekly') sinceDate.setDate(sinceDate.getDate() - 7);
  else if (period === 'monthly') sinceDate.setMonth(sinceDate.getMonth() - 1);
  else sinceDate.setDate(sinceDate.getDate() - 1);
  const dateStr = sinceDate.toISOString().split('T')[0];

  const searchUrl = `https://api.github.com/search/repositories?q=language:${encodeURIComponent(language)}+created:>${dateStr}&sort=stars&order=desc&per_page=${pageSize}`;

  try {
    const response = await fetch(searchUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': CHROME_UA,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    const result = await response.json() as { items?: any[] };
    const items = result.items || [];

    return items.map((raw: any): GithubRepo => ({
      fullName: raw.full_name || '',
      description: raw.description || '',
      language: raw.language || '',
      stars: raw.stargazers_count || 0,
      starsToday: raw.stargazers_count || 0,
      forks: raw.forks_count || 0,
      url: raw.html_url || `https://github.com/${raw.full_name}`,
    }));
  } catch {
    return [];
  }
}

// ---------- Handler ----------

export async function listTrendingRepos(
  _ctx: ServerContext,
  req: ListTrendingReposRequest,
): Promise<ListTrendingReposResponse> {
  try {
    const cacheKey = `${REDIS_CACHE_KEY}:${req.language || 'python'}:${req.period || 'daily'}:${clampInt(req.pageSize, 50, 1, 100)}`;
    const result = await cachedFetchJson<ListTrendingReposResponse>(cacheKey, REDIS_CACHE_TTL, async () => {
      const repos = await fetchTrendingRepos(req);
      return repos.length > 0 ? { repos, pagination: undefined } : null;
    });
    return result || { repos: [], pagination: undefined };
  } catch {
    return { repos: [], pagination: undefined };
  }
}
