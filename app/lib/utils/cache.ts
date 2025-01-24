import { unstable_cache } from 'next/cache';

// Define base types for cache parameters
type CacheParamValue = 
  | string 
  | number 
  | boolean 
  | null 
  | undefined
  | CacheParamValue[] 
  | { [key: string]: CacheParamValue };

type CacheParams = Record<string, CacheParamValue>;

// Cache key generator
const generateCacheKey = (prefix: string, params: CacheParams) => {
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {} as CacheParams);

  return `${prefix}:${JSON.stringify(sortedParams)}`;
};

// Cache configuration
const DEFAULT_CACHE_OPTIONS = {
  revalidate: 30, // 30 seconds
  tags: [] as string[],
};

// Generic cache wrapper
export async function withCache<T>(
  prefix: string,
  params: CacheParams,
  fn: () => Promise<T>,
  options: Partial<typeof DEFAULT_CACHE_OPTIONS> = {}
): Promise<T> {
  const { revalidate, tags } = { ...DEFAULT_CACHE_OPTIONS, ...options };
  const cacheKey = generateCacheKey(prefix, params);

  return unstable_cache(
    fn,
    [cacheKey],
    {
      revalidate,
      tags: [...tags, prefix],
    }
  )();
}

// Cache invalidation helper
export function generateCacheTags(entity: string, ids: string[]) {
  return ids.map(id => `${entity}:${id}`);
}

// Common cache keys
export const CACHE_KEYS = {
  TICKET_LIST: 'ticket:list',
  TICKET_DETAIL: 'ticket:detail',
  USER_LIST: 'user:list',
  TEAM_LIST: 'team:list',
} as const; 