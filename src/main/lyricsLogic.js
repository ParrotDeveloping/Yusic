const UNKNOWN_ARTISTS = new Set([
  '',
  'bilinmeyen sanatçı',
  'bilinmeyen sanatci',
  'unknown artist',
  '<unknown>',
  'unknown',
  'various artists',
  'va'
]);

const NOISE_PATTERNS = [
  /\[[^\]]*(?:official|lyric|lyrics|audio|video|hd|hq|4k|1080p|720p|320\s*kbps|128\s*kbps|mp3|mv|visualizer|sped\s*up|slowed|reverb|nightcore|remaster(?:ed)?|explicit|topic|vevo|tiktok|clean|dirty)[^\]]*\]/gi,
  /\([^\)]*(?:official|lyric|lyrics|audio|video|hd|hq|4k|1080p|720p|320\s*kbps|128\s*kbps|mp3|mv|visualizer|sped\s*up|slowed|reverb|nightcore|remaster(?:ed)?|explicit|topic|vevo|tiktok|clean|dirty)[^\)]*\)/gi,
  /\b(?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|with\s*lyrics|lyrics|visualizer|320\s*kbps|128\s*kbps|high\s*quality)\b/gi
];

const FEAT_PATTERN = /\s*[\(\[]?\b(?:feat\.?|ft\.?|featuring)\b[^\)\]]*[\)\]]?/gi;

export function stripAudioExtension(name = '') {
  return String(name || '').replace(/\.(mp3|wav|flac|ogg|m4a|aac|opus|webm|wma|lrc)$/i, '');
}

function cleanTextFragment(raw = '') {
  let out = String(raw || '').replace(/[_]+/g, ' ').trim();
  for (const re of NOISE_PATTERNS) {
    out = out.replace(re, ' ');
  }
  out = out
    .replace(/\s*\(\s*\)\s*/g, ' ')
    .replace(/\s*\[\s*\]\s*/g, ' ')
    .replace(/\s+[-|•]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out;
}

/**
 * Normalizes messy local file tags / filenames (e.g. "01 - Artist_Name - Song (Official Audio).mp3")
 * and automatically detects Artist vs Title when metadata tags are missing.
 */
export function cleanTrackMetadataForLyrics(track = {}) {
  const album = cleanTextFragment(track.album || '');
  let rawArtist = String(track.artist || '').trim();
  let rawTitle = String(track.title || '').trim();
  const fallbackName = stripAudioExtension(track.fileName || '');

  if (!rawTitle && fallbackName) rawTitle = fallbackName;

  // Remove leading track index prefixes like "01. ", "02 - ", "03_"
  rawTitle = stripAudioExtension(rawTitle)
    .replace(/^\d{1,3}\s*[.\-_)]\s+/, '')
    .trim();

  let artist = UNKNOWN_ARTISTS.has(rawArtist.toLowerCase()) ? '' : cleanTextFragment(rawArtist);
  let title = cleanTextFragment(rawTitle);
  let autoDetectedFromFilename = false;

  // Remove accidental leading "- Topic" on YouTube artists
  artist = artist.replace(/\s*-\s*Topic$/i, '').trim();

  // Auto-split "Artist - Song Title" if artist is missing or equals track title
  if (!artist || artist.toLowerCase() === title.toLowerCase()) {
    const sourceText = title || cleanTextFragment(fallbackName.replace(/^\d{1,3}\s*[.\-_)]\s+/, ''));
    const sepMatch = sourceText.match(/^(.{2,60}?)\s+(?:-|–|—|\|)\s+(.{2,100})$/);
    if (sepMatch) {
      artist = cleanTextFragment(sepMatch[1]).replace(/\s*-\s*Topic$/i, '').trim();
      title = cleanTextFragment(sepMatch[2]);
      autoDetectedFromFilename = true;
    }
  }

  // Also check fileName if tags had unknown artist and title lacked separator
  if (!artist && fallbackName) {
    const cleanedFile = cleanTextFragment(stripAudioExtension(fallbackName).replace(/^\d{1,3}\s*[.\-_)]\s+/, ''));
    const sepMatch = cleanedFile.match(/^(.{2,60}?)\s+(?:-|–|—|\|)\s+(.{2,100})$/);
    if (sepMatch) {
      artist = cleanTextFragment(sepMatch[1]).replace(/\s*-\s*Topic$/i, '').trim();
      title = cleanTextFragment(sepMatch[2]);
      autoDetectedFromFilename = true;
    }
  }

  const baseTitle = title.replace(FEAT_PATTERN, '').replace(/\s{2,}/g, ' ').trim() || title;
  const rawQuery = [artist, title].filter(Boolean).join(' ').trim();

  return {
    artist,
    title,
    baseTitle,
    album,
    rawQuery,
    autoDetectedFromFilename
  };
}

/**
 * Parses LRC text into sorted [{ timeMs, text }] lines + [offset:+/-ms] header.
 */
export function parseLrc(lrcText = '') {
  const raw = String(lrcText || '');
  if (!raw.trim()) return { lines: [], offsetHeaderMs: 0 };

  let offsetHeaderMs = 0;
  const lines = [];
  const timeTagRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const inlineWordTagRegex = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const offsetMatch = line.match(/^\[offset:\s*([+-]?\d+)\s*\]$/i);
    if (offsetMatch) {
      offsetHeaderMs = Number(offsetMatch[1]) || 0;
      continue;
    }

    const timestamps = [];
    let match;
    timeTagRegex.lastIndex = 0;
    while ((match = timeTagRegex.exec(line)) !== null) {
      const min = Number(match[1]) || 0;
      const sec = Number(match[2]) || 0;
      const fracStr = match[3] || '';
      let ms = 0;
      if (fracStr.length === 1) ms = Number(fracStr) * 100;
      else if (fracStr.length === 2) ms = Number(fracStr) * 10;
      else if (fracStr.length >= 3) ms = Number(fracStr.slice(0, 3));
      timestamps.push(min * 60_000 + sec * 1000 + ms);
    }

    if (timestamps.length === 0) continue;

    const text = line
      .replace(timeTagRegex, '')
      .replace(inlineWordTagRegex, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    for (const timeMs of timestamps) {
      lines.push({ timeMs, text: text || '♪' });
    }
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return { lines, offsetHeaderMs };
}

/**
 * Binary-searches sorted lyric lines for the active line at currentTimeMs + userOffsetMs.
 */
export function findActiveLyricIndex(lines = [], currentTimeMs = 0, userOffsetMs = 0) {
  if (!Array.isArray(lines) || lines.length === 0) return -1;
  const effectiveMs = Math.max(0, Number(currentTimeMs || 0) + Number(userOffsetMs || 0));
  if (effectiveMs < lines[0].timeMs) return -1;

  let lo = 0;
  let hi = lines.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= effectiveMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * Scores LRCLIB search candidates to pick the best synced match for a track.
 */
export function selectBestLyricsCandidate(candidates = [], target = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const targetTitle = String(target.title || '').toLowerCase().trim();
  const targetBase = String(target.baseTitle || targetTitle).toLowerCase().trim();
  const targetArtist = String(target.artist || '').toLowerCase().trim();
  const targetDurationSec = Number(target.durationSec || 0);

  let best = null;
  let bestScore = -Infinity;

  for (const cand of candidates) {
    if (!cand) continue;
    const hasSynced = Boolean(cand.syncedLyrics && String(cand.syncedLyrics).trim());
    const hasPlain = Boolean(cand.plainLyrics && String(cand.plainLyrics).trim());
    if (!hasSynced && !hasPlain && !cand.instrumental) continue;

    let score = 0;
    if (hasSynced) score += 45;
    else if (hasPlain) score += 10;
    if (cand.instrumental) score -= 20;

    const cTitle = String(cand.trackName || cand.name || cand.title || '').toLowerCase().trim();
    const cArtist = String(cand.artistName || cand.artist || '').toLowerCase().trim();

    if (targetTitle && cTitle === targetTitle) score += 35;
    else if (targetBase && cTitle === targetBase) score += 28;
    else if (targetBase && (cTitle.includes(targetBase) || targetBase.includes(cTitle))) score += 18;

    if (targetArtist) {
      if (cArtist === targetArtist) score += 30;
      else if (cArtist.includes(targetArtist) || targetArtist.includes(cArtist)) score += 20;
      else {
        const artistTokens = targetArtist.split(/[\s,&]+/).filter((t) => t.length >= 2);
        const hits = artistTokens.filter((t) => cArtist.includes(t)).length;
        if (hits > 0) score += Math.min(18, hits * 8);
      }
    }

    const candDur = Number(cand.duration || 0);
    if (targetDurationSec > 0 && candDur > 0) {
      const diff = Math.abs(candDur - targetDurationSec);
      if (diff <= 3) score += 35;
      else if (diff <= 8) score += 22;
      else if (diff <= 18) score += 10;
      else if (diff > 45) score -= 25;
    }

    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }

  return best;
}
