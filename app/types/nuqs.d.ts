declare module 'nuqs' {
  import { ReadonlyURLSearchParams } from 'next/navigation';

  export type ParserOptions<T> = {
    parse: (value: string) => T;
    serialize: (value: T) => string;
  };

  export type SearchParamsOptions<T> = {
    shallow?: boolean;
    scroll?: boolean;
    history?: 'push' | 'replace';
  } & ParserOptions<T>;

  export function useQueryState<T>(
    key: string,
    options?: Partial<SearchParamsOptions<T>>
  ): [T | undefined, (value: T | undefined) => void];

  export function createSearchParamsCache(
    searchParams: ReadonlyURLSearchParams
  ): Map<string, string | string[]>;
} 