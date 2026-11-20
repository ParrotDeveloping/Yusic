import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { clampSpeed } from './playbackLogic.js';

const DEFAULT_SETTINGS = Object.freeze({
  volume: 0.85,
  muted: false,
  speed: 1.0,
  preservePitch: true,
  shuffle: false,
  repeatMode: 'off',
  autoCreatePlaylistOnDownload: true,
  downloadYoutubePlaylistOnWatch: true
});

function createEmptyDb() {
  return {
    version: 1,
    playlists: [],
    settings: { ...DEFAULT_SETTINGS },
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
      this.data = {
        version: 1,
        playlists: Array.isArray(parsed?.playlists)
          ? parsed.playlists.map((p) => ({
              id: String(p.id || `pl_${crypto.randomBytes(6).toString('hex')}`),
              name: String(p.name || 'Adsız Playlist'),
              createdAt: Number(p.createdAt) || Date.now(),
              trackIds: Array.isArray(p.trackIds) ? [...new Set(p.trackIds.map(String))] : []
            }))
          : [],
        settings: this._sanitizeSettings({ ...DEFAULT_SETTINGS, ...(parsed?.settings || {}) }),
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
          : true
    };
  }

  getPlaylists() {
    return this.data.playlists.map((p) => ({ ...p, trackIds: [...p.trackIds] }));
  }

  createPlaylist(name) {
    const clean = String(name || '').trim() || 'Yeni Playlist';
    const playlist = {
      id: `pl_${crypto.randomBytes(6).toString('hex')}`,
      name: clean,
      createdAt: Date.now(),
      trackIds: []
    };
    this.data.playlists.push(playlist);
    this.save();
    return { ...playlist, trackIds: [] };
  }

  renamePlaylist(id, name) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const pl = this.data.playlists.find((p) => p.id === id);
    if (!pl) return null;
    pl.name = clean;
    this.save();
    return { ...pl, trackIds: [...pl.trackIds] };
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
    return { ...pl, trackIds: [...pl.trackIds] };
  }

  removeTrackFromPlaylist(playlistId, trackId) {
    const pl = this.data.playlists.find((p) => p.id === playlistId);
    if (!pl) return null;
    pl.trackIds = pl.trackIds.filter((id) => id !== trackId);
    this.save();
    return { ...pl, trackIds: [...pl.trackIds] };
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
    return { ...pl, trackIds: [...pl.trackIds] };
  }

  findOrCreatePlaylistByName(name) {
    const clean = String(name || '').trim() || 'İndirilen Liste';
    const existing = this.data.playlists.find(
      (p) => p.name.localeCompare(clean, 'tr', { sensitivity: 'base' }) === 0
    );
    if (existing) return { ...existing, trackIds: [...existing.trackIds] };
    return this.createPlaylist(clean);
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
