import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import chokidar from 'chokidar';
import { parseFile } from 'music-metadata';

export const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.flac',
  '.ogg',
  '.m4a',
  '.aac',
  '.opus',
  '.webm',
  '.wma'
]);

const IGNORED_TEMP_SUFFIXES = [
  '.part',
  '.ytdl',
  '.tmp',
  '.temp',
  '.download',
  '.crdownload'
];

export function isSupportedAudioFile(filePath) {
  const base = path.basename(filePath);
  const lower = base.toLowerCase();
  if (!base || base.startsWith('.')) return false;
  for (const suffix of IGNORED_TEMP_SUFFIXES) {
    if (lower.endsWith(suffix)) return false;
  }
  const ext = path.extname(lower);
  return SUPPORTED_AUDIO_EXTENSIONS.has(ext);
}

export function getDeterministicTrackId(relPath) {
  const normalized = relPath.replace(/\\/g, '/').toLowerCase();
  return crypto.createHash('sha1').update(normalized, 'utf8').digest('hex').slice(0, 16);
}

export function parseFilenameFallback(filePath) {
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext).trim();
  const sepIdx = baseName.indexOf(' - ');
  if (sepIdx > 0 && sepIdx < baseName.length - 3) {
    const artist = baseName.slice(0, sepIdx).trim();
    const title = baseName.slice(sepIdx + 3).trim();
    if (artist && title) {
      return { artist, title };
    }
  }
  return {
    artist: 'Bilinmeyen Sanatçı',
    title: baseName || path.basename(filePath)
  };
}

function getCoverExtension(mime = '') {
  const lower = String(mime).toLowerCase();
  if (lower.includes('png')) return '.png';
  if (lower.includes('webp')) return '.webp';
  return '.jpg';
}

export class LibraryManager extends EventEmitter {
  constructor({ muzikDir, coversDir, store, trashFn = null }) {
    super();
    this.muzikDir = muzikDir;
    this.coversDir = coversDir;
    this.store = store;
    this.trashFn = trashFn;
    this.tracksById = new Map();
    this.idByRelPath = new Map();
    this.watcher = null;
    this._pendingFiles = new Set();
    this._pendingDeletes = new Set();
    this._emitTimer = null;
    this._addedSinceEmit = 0;
    this._removedSinceEmit = 0;
  }

  _ensureDirs() {
    fs.mkdirSync(this.muzikDir, { recursive: true });
    fs.mkdirSync(this.coversDir, { recursive: true });
  }

  _relKey(fullPath) {
    return path.relative(this.muzikDir, fullPath).replace(/\\/g, '/');
  }

  _saveCoverBuffer(picture) {
    if (!picture || !picture.data || picture.data.length === 0) return null;
    const hash = crypto.createHash('sha1').update(picture.data).digest('hex').slice(0, 16);
    const ext = getCoverExtension(picture.format);
    const filename = `${hash}${ext}`;
    const dest = path.join(this.coversDir, filename);
    if (!fs.existsSync(dest)) {
      fs.writeFileSync(dest, picture.data);
    }
    return filename;
  }

  async _readTrackRecord(fullPath) {
    const stat = await fs.promises.stat(fullPath);
    if (!stat.isFile()) return null;

    const relPath = this._relKey(fullPath);
    const cacheKey = relPath.toLowerCase();
    const id = getDeterministicTrackId(relPath);
    const ext = path.extname(fullPath).toLowerCase();
    const dirRel = path.dirname(relPath);
    const folder = dirRel === '.' ? '' : dirRel;

    const cached = this.store.getMetaCache(cacheKey);
    if (
      cached &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.size === stat.size &&
      cached.meta &&
      (!cached.meta.coverFile || fs.existsSync(path.join(this.coversDir, cached.meta.coverFile)))
    ) {
      return {
        id,
        relPath,
        fullPath,
        fileName: path.basename(fullPath),
        folder,
        ext,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        addedAt: stat.birthtimeMs || stat.mtimeMs,
        ...cached.meta
      };
    }

    const fallback = parseFilenameFallback(fullPath);
    let title = fallback.title;
    let artist = fallback.artist;
    let album = folder || '';
    let duration = 0;
    let coverFile = null;

    try {
      const metadata = await parseFile(fullPath, { duration: true });
      const common = metadata.common || {};
      if (common.title && common.title.trim()) title = common.title.trim();
      if (common.artist && common.artist.trim()) artist = common.artist.trim();
      else if (Array.isArray(common.artists) && common.artists.length > 0) {
        artist = common.artists.join(', ').trim();
      }
      if (common.album && common.album.trim()) album = common.album.trim();
      if (Number.isFinite(metadata.format?.duration)) {
        duration = metadata.format.duration;
      }
      if (Array.isArray(common.picture) && common.picture.length > 0) {
        coverFile = this._saveCoverBuffer(common.picture[0]);
      }
    } catch {
      // Fall back cleanly to filename metadata when tags are unreadable
    }

    const meta = { title, artist, album, duration, coverFile };
    this.store.setMetaCache(cacheKey, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      meta
    });

    return {
      id,
      relPath,
      fullPath,
      fileName: path.basename(fullPath),
      folder,
      ext,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      addedAt: stat.birthtimeMs || stat.mtimeMs,
      ...meta
    };
  }

  async _walkAudioFiles(dir, out = []) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) {
          await this._walkAudioFiles(fullPath, out);
        }
      } else if (entry.isFile() && isSupportedAudioFile(fullPath)) {
        out.push(fullPath);
      }
    }
    return out;
  }

  async scanAll(emitUpdate = false) {
    this._ensureDirs();
    const files = await this._walkAudioFiles(this.muzikDir);
    const nextTracks = new Map();
    const nextIdByRel = new Map();
    const validCacheKeys = new Set();

    for (const fullPath of files) {
      try {
        const record = await this._readTrackRecord(fullPath);
        if (!record) continue;
        nextTracks.set(record.id, record);
        nextIdByRel.set(record.relPath.toLowerCase(), record.id);
        validCacheKeys.add(record.relPath.toLowerCase());
      } catch {
        // Ignore transient unreadable file
      }
    }

    this.tracksById = nextTracks;
    this.idByRelPath = nextIdByRel;
    this.store.pruneMetaCache(validCacheKeys);
    this.store.save();
    const tracks = this.getTracks();
    if (emitUpdate) {
      this.emit('updated', { tracks, addedCount: 0, removedCount: 0 });
    }
    return tracks;
  }

  getTracks() {
    return Array.from(this.tracksById.values()).sort((a, b) =>
      a.title.localeCompare(b.title, 'tr', { sensitivity: 'base' })
    );
  }

  getTrackById(id) {
    return this.tracksById.get(id) || null;
  }

  getTrackByPath(fullPath) {
    const rel = this._relKey(fullPath).toLowerCase();
    const id = this.idByRelPath.get(rel);
    return id ? this.tracksById.get(id) || null : null;
  }

  startWatching() {
    if (this.watcher) return;
    this._ensureDirs();

    this.watcher = chokidar.watch(this.muzikDir, {
      ignoreInitial: true,
      persistent: true,
      depth: 8,
      awaitWriteFinish: {
        stabilityThreshold: 1200,
        pollInterval: 200
      }
    });

    const scheduleFlush = () => {
      if (this._emitTimer) clearTimeout(this._emitTimer);
      this._emitTimer = setTimeout(() => {
        this._flushPendingWatchEvents();
      }, 250);
    };

    const handleAddOrChange = (filePath) => {
      if (!isSupportedAudioFile(filePath)) return;
      this._pendingDeletes.delete(filePath);
      this._pendingFiles.add(filePath);
      scheduleFlush();
    };

    const handleUnlink = (filePath) => {
      this._pendingFiles.delete(filePath);
      this._pendingDeletes.add(filePath);
      scheduleFlush();
    };

    this.watcher.on('add', handleAddOrChange);
    this.watcher.on('change', handleAddOrChange);
    this.watcher.on('unlink', handleUnlink);
  }

  async _flushPendingWatchEvents() {
    const toRead = Array.from(this._pendingFiles);
    const toDelete = Array.from(this._pendingDeletes);
    this._pendingFiles.clear();
    this._pendingDeletes.clear();

    let addedCount = 0;
    let removedCount = 0;
    let changed = false;

    for (const filePath of toDelete) {
      const relLower = this._relKey(filePath).toLowerCase();
      const id = this.idByRelPath.get(relLower);
      if (id) {
        this.tracksById.delete(id);
        this.idByRelPath.delete(relLower);
        removedCount++;
        changed = true;
      }
    }

    for (const filePath of toRead) {
      if (!fs.existsSync(filePath)) continue;
      try {
        const record = await this._readTrackRecord(filePath);
        if (record) {
          const existed = this.tracksById.has(record.id);
          this.tracksById.set(record.id, record);
          this.idByRelPath.set(record.relPath.toLowerCase(), record.id);
          if (!existed) addedCount++;
          changed = true;
        }
      } catch {
        // Ignore transient lock
      }
    }

    if (changed) {
      this.store.save();
      this.emit('updated', {
        tracks: this.getTracks(),
        addedCount,
        removedCount
      });
    }
  }

  async stopWatching() {
    if (this._emitTimer) {
      clearTimeout(this._emitTimer);
      this._emitTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  _uniqueDestPath(destDir, originalFileName) {
    const ext = path.extname(originalFileName);
    const base = path.basename(originalFileName, ext);
    let candidate = path.join(destDir, originalFileName);
    let counter = 2;
    while (fs.existsSync(candidate)) {
      candidate = path.join(destDir, `${base} (${counter})${ext}`);
      counter++;
    }
    return candidate;
  }

  async importFiles(sourceFilePaths = []) {
    this._ensureDirs();
    const imported = [];
    for (const srcPath of sourceFilePaths) {
      if (!srcPath || !fs.existsSync(srcPath)) continue;
      if (!isSupportedAudioFile(srcPath)) continue;

      const resolvedSrc = path.resolve(srcPath);
      const resolvedMuzik = path.resolve(this.muzikDir);
      // Skip if file is already inside muzikDir
      if (resolvedSrc.toLowerCase().startsWith(resolvedMuzik.toLowerCase() + path.sep)) {
        continue;
      }

      const destPath = this._uniqueDestPath(this.muzikDir, path.basename(srcPath));
      const tmpDest = `${destPath}.tmp`;
      await fs.promises.copyFile(srcPath, tmpDest);
      await fs.promises.rename(tmpDest, destPath);
      const record = await this._readTrackRecord(destPath);
      if (record) {
        this.tracksById.set(record.id, record);
        this.idByRelPath.set(record.relPath.toLowerCase(), record.id);
        imported.push(record);
      }
    }
    if (imported.length > 0) {
      this.store.save();
      this.emit('updated', {
        tracks: this.getTracks(),
        addedCount: imported.length,
        removedCount: 0
      });
    }
    return imported;
  }

  async deleteTrackFile(trackId) {
    const track = this.tracksById.get(trackId);
    if (!track) return false;

    if (this.trashFn) {
      await this.trashFn(track.fullPath);
    } else if (fs.existsSync(track.fullPath)) {
      await fs.promises.unlink(track.fullPath);
    }

    this.tracksById.delete(trackId);
    this.idByRelPath.delete(track.relPath.toLowerCase());
    this.store.removeTrackFromAllPlaylists(trackId);
    this.store.save();
    this.emit('updated', {
      tracks: this.getTracks(),
      addedCount: 0,
      removedCount: 1
    });
    return true;
  }
}
