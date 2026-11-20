import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { clampSpeed } from './playbackLogic.js';

const VIEW_MODES = new Set(['list', 'compact', 'grid']);

const DEFAULT_SETTINGS = Object.freeze({
  volume: 0.85,
  muted: false,
  speed: 1.0,
  preservePitch: true,
  shuffle: false,
  repeatMode: 'off',
  autoCreatePlaylistOnDownload: true,
  downloadYoutubePlaylistOnWatch: true,
  libraryViewMode: 'list'
});

const DEFAULT_SPOTIFY_AUTH = Object.freeze({
  clientId: '',
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
  user: null
});

export function sanitizeSpeedOverride(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const num = Number(raw.speed);
  if (!Number.isFinite(num)) return null;
  return {
    speed: clampSpeed(num),
    preservePitch: raw.preservePitch !== undefined ? Boolean(raw.preservePitch) : true
  };
}

function sanitizeViewMode(mode, fallback = 'list') {
  return VIEW_MODES.has(mode) ? mode : fallback;
}

function createEmptyDb() {
  return {
    version: 1,
    playlists: [],
    settings: { ...DEFAULT_SETTINGS },
    trackSpeedOverrides: {},
    externalListPrefs: {},
    spotifyAuth: { ...DEFAULT_SPOTIFY_AUTH },
    metaCache: {}
  };
}

export class YusicStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.data = createEmptyDb();
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.dbPath)) {
        this.data = createEmptyDb();
        return this.data;
      }
      const raw = fs.readFileSync(this.dbPath, 'utf8');
      const parsed = JSON.parse(raw);

      const rawOverrides =
        parsed?.trackSpeedOverrides && typeof parsed.trackSpeedOverrides === 'object'
          ? parsed.trackSpeedOverrides
          : {};
      const trackSpeedOverrides = {};
      for (const [k, v] of Object.entries(rawOverrides)) {
        const clean = sanitizeSpeedOverride(v);
        if (clean) trackSpeedOverrides[String(k)] = clean;
      }

      const rawExtPrefs =
        parsed?.externalListPrefs && typeof parsed.externalListPrefs === 'object'
          ? parsed.externalListPrefs
          : {};
      const externalListPrefs = {};
      for (const [k, v] of Object.entries(rawExtPrefs)) {
        if (!v || typeof v !== 'object') continue;
        externalListPrefs[String(k)] = {
          speedOverride: sanitizeSpeedOverride(v.speedOverride),
          viewMode: sanitizeViewMode(v.viewMode, 'list'),
          coverFile: v.coverFile ? String(v.coverFile) : null
        };
      }

      const rawAuth = parsed?.spotifyAuth && typeof parsed.spotifyAuth === 'object' ? parsed.spotifyAuth : {};

      this.data = {
        version: 1,
        playlists: Array.isArray(parsed?.playlists)
          ? parsed.playlists.map((p) => ({
              id: String(p.id || `pl_${crypto.randomBytes(6).toString('hex')}`),
              name: String(p.name || 'Adsız Playlist'),
              description: String(p.description || ''),
              coverFile: p.coverFile ? String(p.coverFile) : null,
              viewMode: sanitizeViewMode(p.viewMode, 'list'),
              speedOverride: sanitizeSpeedOverride(p.speedOverride),
              createdAt: Number(p.createdAt) || Date.now(),
              trackIds: Array.isArray(p.trackIds) ? [...new Set(p.trackIds.map(String))] : []
            }))
          : [],
        settings: this._sanitizeSettings({ ...DEFAULT_SETTINGS, ...(parsed?.settings || {}) }),
        trackSpeedOverrides,
        externalListPrefs,
        spotifyAuth: {
          clientId: String(rawAuth.clientId || ''),
          accessToken: String(rawAuth.accessToken || ''),
          refreshToken: String(rawAuth.refreshToken || ''),
          expiresAt: Number(rawAuth.expiresAt) || 0,
          user: rawAuth.user && typeof rawAuth.user === 'object' ? { ...rawAuth.user } : null
        },
        metaCache: parsed?.metaCache && typeof parsed.metaCache === 'object' ? { ...parsed.metaCache } : {}
      };
    } catch {
      this.data = createEmptyDb();
    }
    return this.data;
  }

  save() {
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.dbPath}.${process.pid}.tmp`;
    const serialized = JSON.stringify(this.data, null, 2);
    fs.writeFileSync(tmpPath, serialized, 'utf8');
    try {
      fs.renameSync(tmpPath, this.dbPath);
    } catch {
      fs.copyFileSync(tmpPath, this.dbPath);
      fs.unlinkSync(tmpPath);
    }
  }

  _sanitizeSettings(next) {
    const repeatModes = new Set(['off', 'all', 'one']);
    const vol = Number(next.volume);
    return {
      volume: Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : DEFAULT_SETTINGS.volume,
      muted: Boolean(next.muted),
      speed: clampSpeed(next.speed),
      preservePitch: next.preservePitch !== undefined ? Boolean(next.preservePitch) : true,
      shuffle: Boolean(next.shuffle),
      repeatMode: repeatModes.has(next.repeatMode) ? next.repeatMode : 'off',
      autoCreatePlaylistOnDownload:
        next.autoCreatePlaylistOnDownload !== undefined
          ? Boolean(next.autoCreatePlaylistOnDownload)
          : true,
      downloadYoutubePlaylistOnWatch:
        next.downloadYoutubePlaylistOnWatch !== undefined
          ? Boolean(next.downloadYoutubePlaylistOnWatch)
          : true,
      libraryViewMode: sanitizeViewMode(next.libraryViewMode, 'list')
    };
  }

  _clonePlaylist(p) {
    return {
      ...p,
      speedOverride: p.speedOverride ? { ...p.speedOverride } : null,
      trackIds: [...p.trackIds]
    };
  }

  getPlaylists() {
    return this.data.playlists.map((p) => this._clonePlaylist(p));
  }

  createPlaylist(name) {
    const clean = String(name || '').trim() || 'Yeni Playlist';
    const playlist = {
      id: `pl_${crypto.randomBytes(6).toString('hex')}`,
      name: clean,
      description: '',
      coverFile: null,
      viewMode: 'list',
      speedOverride: null,
      createdAt: Date.now(),
      trackIds: []
    };
    this.data.playlists.push(playlist);
    this.save();
    return this._clonePlaylist(playlist);
  }

  renamePlaylist(id, name) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const pl = this.data.playlists.find((p) => p.id === id);
    if (!pl) return null;
    pl.name = clean;
    this.save();
    return this._clonePlaylist(pl);
  }

  updatePlaylistDetails(id, patch = {}) {
    const pl = this.data.playlists.find((p) => p.id === id);
    if (!pl) return null;
    if (patch.name !== undefined) {
      const cleanName = String(patch.name || '').trim();
      if (cleanName) pl.name = cleanName;
    }
    if (patch.description !== undefined) {
      pl.description = String(patch.description || '').trim();
    }
    if ('coverFile' in patch) {
      pl.coverFile = patch.coverFile ? String(patch.coverFile) : null;
    }
    if (patch.viewMode !== undefined) {
      pl.viewMode = sanitizeViewMode(patch.viewMode, pl.viewMode || 'list');
    }
    if ('speedOverride' in patch) {
      pl.speedOverride = sanitizeSpeedOverride(patch.speedOverride);
    }
    this.save();
    return this._clonePlaylist(pl);
  }

  deletePlaylist(id) {
    const idx = this.data.playlists.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.data.playlists.splice(idx, 1);
    this.save();
    return true;
  }

  addTracksToPlaylist(playlistId, trackIds) {
    const pl = this.data.playlists.find((p) => p.id === playlistId);
    if (!pl) return null;
    const existing = new Set(pl.trackIds);
    for (const tid of trackIds || []) {
      const id = String(tid);
      if (!existing.has(id)) {
        existing.add(id);
        pl.trackIds.push(id);
      }
    }
    this.save();
    return this._clonePlaylist(pl);
  }

  removeTrackFromPlaylist(playlistId, trackId) {
    const pl = this.data.playlists.find((p) => p.id === playlistId);
    if (!pl) return null;
    pl.trackIds = pl.trackIds.filter((id) => id !== trackId);
    this.save();
    return this._clonePlaylist(pl);
  }

  removeTrackFromAllPlaylists(trackId) {
    let changed = false;
    for (const pl of this.data.playlists) {
      const next = pl.trackIds.filter((id) => id !== trackId);
      if (next.length !== pl.trackIds.length) {
        pl.trackIds = next;
        changed = true;
      }
    }
    if (changed) this.save();
    return changed;
  }

  reorderPlaylistTracks(playlistId, orderedTrackIds) {
    const pl = this.data.playlists.find((p) => p.id === playlistId);
    if (!pl) return null;
    const currentSet = new Set(pl.trackIds);
    const nextOrder = [];
    const seen = new Set();
    for (const id of orderedTrackIds || []) {
      if (currentSet.has(id) && !seen.has(id)) {
        seen.add(id);
        nextOrder.push(id);
      }
    }
    for (const id of pl.trackIds) {
      if (!seen.has(id)) {
        seen.add(id);
        nextOrder.push(id);
      }
    }
    pl.trackIds = nextOrder;
    this.save();
    return this._clonePlaylist(pl);
  }

  findOrCreatePlaylistByName(name) {
    const clean = String(name || '').trim() || 'İndirilen Liste';
    const existing = this.data.playlists.find(
      (p) => p.name.localeCompare(clean, 'tr', { sensitivity: 'base' }) === 0
    );
    if (existing) return this._clonePlaylist(existing);
    return this.createPlaylist(clean);
  }

  getTrackSpeedOverrides() {
    const out = {};
    for (const [k, v] of Object.entries(this.data.trackSpeedOverrides)) {
      out[k] = { ...v };
    }
    return out;
  }

  setTrackSpeedOverride(trackId, overrideOrNull) {
    const key = String(trackId || '').trim();
    if (!key) return this.getTrackSpeedOverrides();
    const clean = sanitizeSpeedOverride(overrideOrNull);
    if (clean) {
      this.data.trackSpeedOverrides[key] = clean;
    } else {
      delete this.data.trackSpeedOverrides[key];
    }
    this.save();
    return this.getTrackSpeedOverrides();
  }

  getExternalListPrefs() {
    const out = {};
    for (const [k, v] of Object.entries(this.data.externalListPrefs)) {
      out[k] = {
        speedOverride: v.speedOverride ? { ...v.speedOverride } : null,
        viewMode: v.viewMode || 'list',
        coverFile: v.coverFile || null
      };
    }
    return out;
  }

  updateExternalListPref(listId, patch = {}) {
    const key = String(listId || '').trim();
    if (!key) return this.getExternalListPrefs();
    const prev = this.data.externalListPrefs[key] || {
      speedOverride: null,
      viewMode: 'list',
      coverFile: null
    };
    const next = { ...prev };
    if ('speedOverride' in patch) {
      next.speedOverride = sanitizeSpeedOverride(patch.speedOverride);
    }
    if (patch.viewMode !== undefined) {
      next.viewMode = sanitizeViewMode(patch.viewMode, prev.viewMode || 'list');
    }
    if ('coverFile' in patch) {
      next.coverFile = patch.coverFile ? String(patch.coverFile) : null;
    }
    this.data.externalListPrefs[key] = next;
    this.save();
    return this.getExternalListPrefs();
  }

  getSpotifyAuth() {
    return {
      ...this.data.spotifyAuth,
      user: this.data.spotifyAuth.user ? { ...this.data.spotifyAuth.user } : null
    };
  }

  setSpotifyAuth(patch = {}) {
    const prev = this.data.spotifyAuth;
    this.data.spotifyAuth = {
      clientId: patch.clientId !== undefined ? String(patch.clientId).trim() : prev.clientId,
      accessToken: patch.accessToken !== undefined ? String(patch.accessToken) : prev.accessToken,
      refreshToken: patch.refreshToken !== undefined ? String(patch.refreshToken) : prev.refreshToken,
      expiresAt: patch.expiresAt !== undefined ? Number(patch.expiresAt) || 0 : prev.expiresAt,
      user: patch.user !== undefined ? (patch.user ? { ...patch.user } : null) : prev.user
    };
    this.save();
    return this.getSpotifyAuth();
  }

  clearSpotifyTokens() {
    this.data.spotifyAuth = {
      clientId: this.data.spotifyAuth.clientId || '',
      accessToken: '',
      refreshToken: '',
      expiresAt: 0,
      user: null
    };
    this.save();
    return this.getSpotifyAuth();
  }

  getSettings() {
    return { ...this.data.settings };
  }

  updateSettings(patch) {
    this.data.settings = this._sanitizeSettings({
      ...this.data.settings,
      ...(patch || {})
    });
    this.save();
    return this.getSettings();
  }

  getMetaCache(key) {
    return this.data.metaCache[key] || null;
  }

  setMetaCache(key, entry) {
    this.data.metaCache[key] = entry;
  }

  pruneMetaCache(validKeys) {
    const valid = validKeys instanceof Set ? validKeys : new Set(validKeys);
    let changed = false;
    for (const key of Object.keys(this.data.metaCache)) {
      if (!valid.has(key)) {
        delete this.data.metaCache[key];
        changed = true;
      }
    }
    return changed;
  }
}
