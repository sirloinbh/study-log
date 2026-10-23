export type Keyword = { id: number; date: string; keyword: string; memo: string };

export type KeywordForm = Pick<Keyword, 'keyword' | 'memo'>;

export type KeywordSearch = { q: string; from: string; to: string };

// Same limits as the API; the server still validates.
export const keywordLimits = { keyword: 50, memo: 2000, query: 50 } as const;

export const emptyKeywordForm = (): KeywordForm => ({ keyword: '', memo: '' });

// The list request for a search: blank fields are left out, so an empty search lists the most
// recent keywords.
export function searchPath(search: KeywordSearch) {
  const params = [
    ['q', search.q.trim()],
    ['from', search.from],
    ['to', search.to],
  ].filter(([, value]) => value);
  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return query ? `/api/keywords?${query}` : '/api/keywords';
}
