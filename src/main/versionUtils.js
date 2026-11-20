export function normalizeVersion(v) {
  return String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .trim();
}

export function compareSemver(a, b) {
  const parse = (v) => {
    const clean = normalizeVersion(v);
    const parts = clean.split('.').map((n) => Number.parseInt(n, 10) || 0);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

export function isNewerVersion(candidate, current) {
  const cleanCandidate = normalizeVersion(candidate);
  const cleanCurrent = normalizeVersion(current);
  if (!cleanCandidate || !cleanCurrent) return false;
  return compareSemver(cleanCandidate, cleanCurrent) > 0;
}

function stripHtmlTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatReleaseNotes(raw) {
  if (!raw) return '';
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        const ver = entry?.version ? `v${normalizeVersion(entry.version)}` : '';
        const body = stripHtmlTags(entry?.note || '');
        return ver ? `${ver}\n${body}` : body;
      })
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }
  return stripHtmlTags(raw);
}
