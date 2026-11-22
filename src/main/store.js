import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { clampSpeed } from './playbackLogic.js';

export const DEFAULT_SPOTIFY_CLIENT_ID = 'f7dab3d9716247db8368240742febbf5';
export const DEFAULT_EQ_FREQUENCIES = Object.freeze([32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);

const VIEW_MODES = new Set(['list', 'compact', 'grid']);

const DEFAULT_EQ = Object.freeze({
  enabled: false,
  preset: 'flat',
  bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
});

const DEFAULT_LAYOUT = Object.freeze({
  sidebarWidth: 288,
  sidebarNavHeight: 204,
  playerBarHeight: 90
});

const DEFAULT_SETTINGS = Object.freeze({
  volume: 0.85,
  muted: false,
  speed: 1.0,
  preservePitch: true,
  shuffle: false,
  repeatMode: 'off',
  autoCreatePlaylistOnDownload: true,
  downloadYoutubePlaylistOnWatch: true,
  libraryViewMode: 'list',
  uiScale: 1.0,
  eq: DEFAULT_EQ,
  layout: DEFAULT_LAYOUT
});

const DEFAULT_SPOTIFY_AUTH = Object.freeze({
  clientId: DEFAULT_SPOTIFY_CLIENT_ID,
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
  scopes: [],
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

function sanitizeUiScale(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return DEFAULT_SETTINGS.uiScale;
  const clamped = Math.min(1.5, Math.max(0.75, num));
  return Math.round(clamped * 100) / 100;
}

function sanitizeEq(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const rawBands = Array.isArray(r.bands) ? r.bands : DEFAULT_EQ.bands;
  const bands = DEFAULT_EQ_FREQUENCIES.map((_, idx) => {
    const val = Number(rawBands[idx]);
    if (!Number.isFinite(val)) return 0;
    return Math.round(Math.min(12, Math.max(-12, val)) * 10) / 10;
  });
  return {
    enabled: Boolean(r.enabled),
    preset: String(r.preset || 'flat'),
    bands
  };
}

function clampInt(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
}

function sanitizeLayout(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    sidebarWidth: clampInt(r.sidebarWidth, 220, 520, DEFAULT_LAYOUT.sidebarWidth),
    sidebarNavHeight: clampInt(r.sidebarNavHeight, 145, 360, DEFAULT_LAYOUT.sidebarNavHeight),
    playerBarHeight: clampInt(r.playerBarHeight, 76, 140, DEFAULT_LAYOUT.playerBarHeight)
  };
}

function createEmptyDb() {
  return {
    version: 1,
    playlists: [],
    settings: {
      ...DEFAULT_SETTINGS,
      eq: { ...DEFAULT_EQ, bands: [...DEFAULT_EQ.bands] },
      layout: { ...DEFAULT_LAYOUT }
    },
    trackSpeedOverrides: {},
    externalListPrefs: {},
    spotifyAuth: { ...DEFAULT_SPOTIFY_AUTH, scopes: [] },
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
          coverFile: v.coverFile ? String(v.coverFile) : null,
          localTrackIds: Array.isArray(v.localTrackIds) ? [...new Set(v.localTrackIds.map(String))] : []
        };
      }

      const rawAuth = parsed?.spotifyAuth && typeof parsed.spotifyAuth === 'object' ? parsed.spotifyAuth : {};
      const clientId = String(rawAuth.clientId || '').trim() || DEFAULT_SPOTIFY_CLIENT_ID;

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
          clientId,
          accessToken: String(rawAuth.accessToken || ''),
          refreshToken: String(rawAuth.refreshToken || ''),
          expiresAt: Number(rawAuth.expiresAt) || 0,
          scopes: Array.isArray(rawAuth.scopes)
            ? [...new Set(rawAuth.scopes.map((s) => String(s || '').trim()).filter(Boolean))]
            : [],
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
      libraryViewMode: sanitizeViewMode(next.libraryViewMode, 'list'),
      uiScale: sanitizeUiScale(next.uiScale),
      eq: sanitizeEq(next.eq),
      layout: sanitizeLayout(next.layout)
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
    for (const pref of Object.values(this.data.externalListPrefs)) {
      if (Array.isArray(pref?.localTrackIds)) {
        const next = pref.localTrackIds.filter((id) => id !== trackId);
        if (next.length !== pref.localTrackIds.length) {
          pref.localTrackIds = next;
          changed = true;
        }
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
        coverFile: v.coverFile || null,
        localTrackIds: Array.isArray(v.localTrackIds) ? [...v.localTrackIds] : []
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
      coverFile: null,
      localTrackIds: []
    };
    const next = {
      ...prev,
      localTrackIds: Array.isArray(prev.localTrackIds) ? [...prev.localTrackIds] : []
    };
    if ('speedOverride' in patch) {
      next.speedOverride = sanitizeSpeedOverride(patch.speedOverride);
    }
    if (patch.viewMode !== undefined) {
      next.viewMode = sanitizeViewMode(patch.viewMode, prev.viewMode || 'list');
    }
    if ('coverFile' in patch) {
      next.coverFile = patch.coverFile ? String(patch.coverFile) : null;
    }
    if (Array.isArray(patch.localTrackIds)) {
      next.localTrackIds = [...new Set(patch.localTrackIds.map(String))];
    }
    this.data.externalListPrefs[key] = next;
    this.save();
    return this.getExternalListPrefs();
  }

  addLocalTracksToExternalList(listId, trackIds = []) {
    const key = String(listId || '').trim();
    if (!key) return this.getExternalListPrefs();
    const prev = this.data.externalListPrefs[key] || {
      speedOverride: null,
      viewMode: 'list',
      coverFile: null,
      localTrackIds: []
    };
    const current = Array.isArray(prev.localTrackIds) ? [...prev.localTrackIds] : [];
    const seen = new Set(current);
    for (const rawId of trackIds || []) {
      const id = String(rawId || '').trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        current.push(id);
      }
    }
    this.data.externalListPrefs[key] = { ...prev, localTrackIds: current };
    this.save();
    return this.getExternalListPrefs();
  }

  removeLocalTrackFromExternalList(listId, trackId) {
    const key = String(listId || '').trim();
    if (!key || !this.data.externalListPrefs[key]) return this.getExternalListPrefs();
    const prev = this.data.externalListPrefs[key];
    const nextIds = (prev.localTrackIds || []).filter((id) => id !== String(trackId));
    this.data.externalListPrefs[key] = { ...prev, localTrackIds: nextIds };
    this.save();
    return this.getExternalListPrefs();
  }

  getSpotifyAuth() {
    return {
      ...this.data.spotifyAuth,
      clientId: this.data.spotifyAuth.clientId || DEFAULT_SPOTIFY_CLIENT_ID,
      scopes: Array.isArray(this.data.spotifyAuth.scopes) ? [...this.data.spotifyAuth.scopes] : [],
      user: this.data.spotifyAuth.user ? { ...this.data.spotifyAuth.user } : null
    };
  }

  setSpotifyAuth(patch = {}) {
    const prev = this.data.spotifyAuth;
    const nextClientId =
      patch.clientId !== undefined
        ? String(patch.clientId).trim() || DEFAULT_SPOTIFY_CLIENT_ID
        : prev.clientId || DEFAULT_SPOTIFY_CLIENT_ID;
    const nextScopes = Array.isArray(patch.scopes)
      ? [...new Set(patch.scopes.map((s) => String(s || '').trim()).filter(Boolean))]
      : Array.isArray(prev.scopes)
        ? [...prev.scopes]
        : [];
    this.data.spotifyAuth = {
      clientId: nextClientId,
      accessToken: patch.accessToken !== undefined ? String(patch.accessToken) : prev.accessToken,
      refreshToken: patch.refreshToken !== undefined ? String(patch.refreshToken) : prev.refreshToken,
      expiresAt: patch.expiresAt !== undefined ? Number(patch.expiresAt) || 0 : prev.expiresAt,
      scopes: nextScopes,
      user: patch.user !== undefined ? (patch.user ? { ...patch.user } : null) : prev.user
    };
    this.save();
    return this.getSpotifyAuth();
  }

  clearSpotifyTokens() {
    this.data.spotifyAuth = {
      clientId: this.data.spotifyAuth.clientId || DEFAULT_SPOTIFY_CLIENT_ID,
      accessToken: '',
      refreshToken: '',
      expiresAt: 0,
      scopes: [],
      user: null
    };
    this.save();
    return this.getSpotifyAuth();
  }

  getSettings() {
    return {
      ...this.data.settings,
      eq: {
        ...this.data.settings.eq,
        bands: [...this.data.settings.eq.bands]
      },
      layout: { ...this.data.settings.layout }
    };
  }

  updateSettings(patch = {}) {
    const merged = {
      ...this.data.settings,
      ...patch
    };
    if (patch.eq && typeof patch.eq === 'object') {
      merged.eq = {
        ...this.data.settings.eq,
        ...patch.eq
      };
    }
    if (patch.layout && typeof patch.layout === 'object') {
      merged.layout = {
        ...this.data.settings.layout,
        ...patch.layout
      };
    }
    this.data.settings = this._sanitizeSettings(merged);
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
