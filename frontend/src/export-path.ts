// The address of one download; a blank end of the range is left out, so no range exports everything.
export function exportPath(path: string, from: string, to: string) {
  const query = [
    ['from', from],
    ['to', to],
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return query ? `${path}?${query}` : path;
}
