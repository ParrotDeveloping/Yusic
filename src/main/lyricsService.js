import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import {
  cleanTrackMetadataForLyrics,
  findActiveLyricIndex,
  parseLrc,
  selectBestLyricsCandidate,
  stripAudioExtension
} from './lyricsLogic.js';

export { cleanTrackMetadataForLyrics, findActiveLyricIndex, parseLrc, selectBestLyricsCandidate };

const LRCLIB_BASE = 'https://lrclib.net';
const USER_AGENT = 'Yusic/1.0.4 (https://github.com/ParrotDeveloping/Yusic)';

function buildTrackKey(track = {}) {
  if (track.id) return String(track.id);
  const cleaned = cleanTrackMetadataForLyrics(track);
  return `${cleaned.artist}:${cleaned.title}`.toLowerCase();
}

function clampOffsetMs(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.max(-5000, Math.min(5000, Math.round(num)));
}

function toNormalizedCandidate(item) {
  return {
    id: item.id ?? `${item.trackName || item.name}-${item.artistName}`,
    title: String(item.trackName || item.name || item.title || ''),
    artist: String(item.artistName || item.artist || ''),
    album: String(item.albumName || item.album || ''),
    duration: Number(item.duration || 0),
    instrumental: Boolean(item.instrumental),
    syncedLyrics: item.syncedLyrics ? String(item.syncedLyrics) : '',
    plainLyrics: item.plainLyrics ? String(item.plainLyrics) : '',
    hasSynced: Boolean(item.syncedLyrics && String(item.syncedLyrics).trim())
  };
}

function buildResult({
  trackKey,
  title,
  artist,
  album = '',
  matchedTitle = '',
  matchedArtist = '',
  source,
  sourceLabel,
  autoDetected = false,
  instrumental = false,
  syncedLyrics = '',
  plainLyrics = '',
  parsedLines = null,
  offsetMs = 0
}) {
  let lines = Array.isArray(parsedLines) ? parsedLines : [];
  let effectiveOffset = Number(offsetMs || 0);

  if (lines.length === 0 && syncedLyrics && syncedLyrics.trim()) {
    const parsed = parseLrc(syncedLyrics);
    lines = parsed.lines;
    if (!offsetMs && parsed.offsetHeaderMs) {
      effectiveOffset = parsed.offsetHeaderMs;
    }
  }

  const plainLines = plainLyrics && plainLyrics.trim()
    ? plainLyrics.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : lines.map((l) => l.text);

  const synced = lines.length > 0;
  const found = synced || plainLines.length > 0 || instrumental;

  return {
    trackKey,
    found,
    synced,
    instrumental,
    title: title || '',
    artist: artist || '',
    album: album || '',
    matchedTitle: matchedTitle || title || '',
    matchedArtist: matchedArtist || artist || '',
    source,
    sourceLabel,
    autoDetected,
    lines,
    plainLines,
    offsetMs: clampOffsetMs(effectiveOffset)
  };
}

export class LyricsService {
  constructor({ cacheDir, fetchFn = null } = {}) {
    this.cacheDir = cacheDir || null;
    this.fetchFn = fetchFn || ((...args) => globalThis.fetch(...args));
  }

  _cachePath(trackKey) {
    if (!this.cacheDir) return null;
    const hash = crypto.createHash('sha1').update(String(trackKey), 'utf8').digest('hex').slice(0, 20);
    return path.join(this.cacheDir, `${hash}.json`);
  }

  _readCache(trackKey) {
    const p = this._cachePath(trackKey);
    if (!p || !fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  }

  _writeCache(trackKey, payload) {
    const p = this._cachePath(trackKey);
    if (!p) return;
    fs.mkdirSync(this.cacheDir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf8');
  }

  async _readLocalSidecarOrEmbedded(track) {
    if (!track?.fullPath || !fs.existsSync(track.fullPath)) return null;
    const trackKey = buildTrackKey(track);

    // 1. Sibling .lrc file
    const dir = path.dirname(track.fullPath);
    const base = stripAudioExtension(path.basename(track.fullPath));
    const lrcPath = path.join(dir, `${base}.lrc`);
    if (fs.existsSync(lrcPath)) {
      const lrcText = await fs.promises.readFile(lrcPath, 'utf8');
      const parsed = parseLrc(lrcText);
      if (parsed.lines.length > 0) {
        return buildResult({
          trackKey,
          title: track.title,
          artist: track.artist,
          album: track.album,
          source: 'sidecar-lrc',
          sourceLabel: 'Yerel .lrc Dosyası',
          autoDetected: false,
          syncedLyrics: lrcText,
          parsedLines: parsed.lines,
          offsetMs: parsed.offsetHeaderMs
        });
      }
      if (lrcText.trim()) {
        return buildResult({
          trackKey,
          title: track.title,
          artist: track.artist,
          album: track.album,
          source: 'sidecar-lrc',
          sourceLabel: 'Yerel Metin Sözler',
          autoDetected: false,
          plainLyrics: lrcText
        });
      }
    }

    // 2. Embedded metadata lyrics (ID3 SYLT / USLT / Vorbis / M4A)
    try {
      const meta = await parseFile(track.fullPath, { skipCovers: true });
      const tags = meta?.common?.lyrics;
      if (Array.isArray(tags) && tags.length > 0) {
        for (const tag of tags) {
          if (Array.isArray(tag?.syncText) && tag.syncText.length > 0) {
            const syncLines = tag.syncText
              .map((entry) => ({
                timeMs: Math.max(0, Number(entry?.timestamp) || 0),
                text: String(entry?.text || '').trim() || '♪'
              }))
              .sort((a, b) => a.timeMs - b.timeMs);
            if (syncLines.length > 0) {
              return buildResult({
                trackKey,
                title: track.title,
                artist: track.artist,
                album: track.album,
                source: 'embedded',
                sourceLabel: 'Dosya İçi Senkron Sözler',
                autoDetected: false,
                parsedLines: syncLines
              });
            }
          }
          if (tag?.text && String(tag.text).trim()) {
            const parsed = parseLrc(tag.text);
            if (parsed.lines.length > 0) {
              return buildResult({
                trackKey,
                title: track.title,
                artist: track.artist,
                album: track.album,
                source: 'embedded',
                sourceLabel: 'Dosya İçi Senkron Sözler',
                autoDetected: false,
                syncedLyrics: tag.text,
                parsedLines: parsed.lines,
                offsetMs: parsed.offsetHeaderMs
              });
            }
            return buildResult({
              trackKey,
              title: track.title,
              artist: track.artist,
              album: track.album,
              source: 'embedded',
              sourceLabel: 'Dosya İçi Sözler',
              autoDetected: false,
              plainLyrics: tag.text
            });
          }
        }
      }
    } catch {
      // Fall through cleanly to online auto-detection
    }

    return null;
  }

  async _lrclibJson(url) {
    const res = await this.fetchFn(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json'
      }
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`LRCLIB HTTP ${res.status}`);
    }
    return res.json();
  }

  async searchLyricsCandidates(query) {
    const clean = String(query || '').trim();
    if (!clean) return [];
    const url = `${LRCLIB_BASE}/api/search?q=${encodeURIComponent(clean)}`;
    const list = await this._lrclibJson(url);
    if (!Array.isArray(list)) return [];
    return list.slice(0, 10).map(toNormalizedCandidate);
  }

  async getLyricsForTrack(track = {}, { forceRefresh = false } = {}) {
    if (!track || (!track.title && !track.fileName)) {
      return buildResult({
        trackKey: 'empty',
        source: 'none',
        sourceLabel: 'Şarkı seçilmedi'
      });
    }

    const trackKey = buildTrackKey(track);
    const cached = this._readCache(trackKey);
    const savedOffsetMs = cached ? clampOffsetMs(cached.offsetMs) : 0;

    if (!forceRefresh && cached && (cached.found || cached.manualSelection)) {
      return { ...cached, trackKey, offsetMs: savedOffsetMs };
    }

    // Check sidecar .lrc or embedded tags for local files (unless cache was explicit manual selection)
    if (!forceRefresh || track.source !== 'spotify') {
      const localFound = await this._readLocalSidecarOrEmbedded(track);
      if (localFound) {
        const finalDoc = { ...localFound, offsetMs: savedOffsetMs || localFound.offsetMs };
        this._writeCache(trackKey, finalDoc);
        return finalDoc;
      }
    }

    const cleaned = cleanTrackMetadataForLyrics(track);
    const durationSec = track.durationMs
      ? Math.round(track.durationMs / 1000)
      : Math.round(Number(track.duration || 0));

    let bestCand = null;

    // Step 1: exact /api/get when both artist & title exist
    if (cleaned.artist && cleaned.title) {
      try {
        const params = new URLSearchParams({
          track_name: cleaned.title,
          artist_name: cleaned.artist
        });
        if (cleaned.album) params.set('album_name', cleaned.album);
        if (durationSec > 0) params.set('duration', String(durationSec));
        const exact = await this._lrclibJson(`${LRCLIB_BASE}/api/get?${params.toString()}`);
        if (exact && (exact.syncedLyrics || exact.plainLyrics || exact.instrumental)) {
          bestCand = exact;
        }
      } catch {
        // Ignore transient network errors and fall back to search
      }
    }

    // Step 2: smart /api/search if exact lookup failed or returned unsynced lyrics
    if (!bestCand || (!bestCand.syncedLyrics && !bestCand.instrumental)) {
      const queries = [];
      if (cleaned.rawQuery) queries.push(cleaned.rawQuery);
      if (cleaned.baseTitle && cleaned.baseTitle !== cleaned.rawQuery) {
        queries.push(cleaned.artist ? `${cleaned.artist} ${cleaned.baseTitle}` : cleaned.baseTitle);
      }
      if (cleaned.baseTitle && cleaned.artist) {
        queries.push(cleaned.baseTitle);
      }

      const seenIds = new Set();
      const pool = [];
      if (bestCand) {
        pool.push(bestCand);
        if (bestCand.id != null) seenIds.add(bestCand.id);
      }

      for (const q of [...new Set(queries)]) {
        try {
          const rows = await this._lrclibJson(`${LRCLIB_BASE}/api/search?q=${encodeURIComponent(q)}`);
          if (Array.isArray(rows)) {
            for (const row of rows) {
              const key = row?.id ?? `${row?.trackName}:${row?.artistName}`;
              if (!seenIds.has(key)) {
                seenIds.add(key);
                pool.push(row);
              }
            }
          }
          if (pool.some((r) => Boolean(r?.syncedLyrics))) break;
        } catch {
          // Try next query variant
        }
      }

      const scored = selectBestLyricsCandidate(pool, {
        title: cleaned.title,
        baseTitle: cleaned.baseTitle,
        artist: cleaned.artist,
        durationSec
      });
      if (scored) bestCand = scored;
    }

    if (!bestCand) {
      const missDoc = buildResult({
        trackKey,
        title: cleaned.title || track.title,
        artist: cleaned.artist || track.artist,
        album: cleaned.album,
        source: 'none',
        sourceLabel: 'Söz Bulunamadı',
        autoDetected: cleaned.autoDetectedFromFilename,
        offsetMs: savedOffsetMs
      });
      this._writeCache(trackKey, missDoc);
      return missDoc;
    }

    const doc = buildResult({
      trackKey,
      title: cleaned.title || track.title,
      artist: cleaned.artist || track.artist,
      album: cleaned.album,
      matchedTitle: bestCand.trackName || bestCand.name || cleaned.title,
      matchedArtist: bestCand.artistName || cleaned.artist,
      source: 'lrclib',
      sourceLabel: bestCand.syncedLyrics
        ? (cleaned.autoDetectedFromFilename ? 'Senkronize • Dosya Adından Algılandı' : 'Senkronize Sözler')
        : 'Düz Metin Sözler',
      autoDetected: cleaned.autoDetectedFromFilename || track.source !== 'spotify',
      instrumental: Boolean(bestCand.instrumental),
      syncedLyrics: bestCand.syncedLyrics || '',
      plainLyrics: bestCand.plainLyrics || '',
      offsetMs: savedOffsetMs
    });

    this._writeCache(trackKey, doc);
    return doc;
  }

  selectCandidateForTrack(trackKey, candidate) {
    const existing = this._readCache(trackKey);
    const savedOffsetMs = existing ? clampOffsetMs(existing.offsetMs) : 0;
    const doc = buildResult({
      trackKey,
      title: existing?.title || candidate.title,
      artist: existing?.artist || candidate.artist,
      album: existing?.album || candidate.album || '',
      matchedTitle: candidate.title || candidate.trackName,
      matchedArtist: candidate.artist || candidate.artistName,
      source: 'lrclib-manual',
      sourceLabel: candidate.syncedLyrics ? 'Senkronize (Manuel Seçim)' : 'Düz Metin (Manuel Seçim)',
      autoDetected: false,
      instrumental: Boolean(candidate.instrumental),
      syncedLyrics: candidate.syncedLyrics || '',
      plainLyrics: candidate.plainLyrics || '',
      offsetMs: savedOffsetMs
    });
    const saved = { ...doc, manualSelection: true };
    this._writeCache(trackKey, saved);
    return saved;
  }

  setTrackOffset(trackKey, offsetMs) {
    const cleanOffset = clampOffsetMs(offsetMs);
    const existing = this._readCache(trackKey);
    if (existing) {
      this._writeCache(trackKey, { ...existing, offsetMs: cleanOffset });
    } else {
      this._writeCache(trackKey, buildResult({
        trackKey,
        source: 'offset-only',
        sourceLabel: '',
        offsetMs: cleanOffset
      }));
    }
    return cleanOffset;
  }
}
