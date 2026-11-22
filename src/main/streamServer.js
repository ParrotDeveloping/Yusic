import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { selectBestYouTubeCandidate } from './downloader.js';

const AUDIO_MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.webm': 'audio/webm'
};

const COVER_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

const STREAM_CACHE_TTL_MS = 45 * 60 * 1000;
const MAX_CACHED_BUFFERS = 14;
const MAX_CACHE_BYTES = 120 * 1024 * 1024;

export function detectAudioMime(buf) {
  if (!buf || buf.length < 12) return 'audio/mp4';
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') return 'audio/mp4';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'audio/webm';
  if (buf.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (buf.subarray(0, 4).toString('ascii') === 'fLaC') return 'audio/flac';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF') return 'audio/wav';
  if (
    buf.subarray(0, 3).toString('ascii') === 'ID3' ||
    (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
  ) {
    return 'audio/mpeg';
  }
  return 'audio/mp4';
}

export class StreamServer {
  constructor({
    library,
    coversDir,
    ffmpegPath,
    ffmpegDir = null,
    ytDlpPath = null,
    nodePath = null,
    fetchImpl = fetch
  }) {
    this.library = library;
    this.coversDir = coversDir;
    this.ffmpegPath = ffmpegPath;
    this.ffmpegDir = ffmpegDir;
    this.ytDlpPath = ytDlpPath;
    this.nodePath = nodePath;
    this.fetchImpl = fetchImpl;
    this.token = crypto.randomBytes(16).toString('hex');
    this.server = null;
    this.port = 0;

    this.streamCache = new Map();
    this.bufferCache = new Map();
    this.cacheTotalBytes = 0;
    this.inFlightResolves = new Map();
  }

  start() {
    if (this.server) return Promise.resolve({ port: this.port, token: this.token, url: this.getBaseUrl() });

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this._handleRequest(req, res);
      });
      this.server.on('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server.address();
        this.port = addr.port;
        resolve({ port: this.port, token: this.token, url: this.getBaseUrl() });
      });
    });
  }

  getBaseUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  _sendError(res, status, message) {
    if (res.headersSent) return;
    res.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(message);
  }

  _getCachedBuffer(key) {
    const entry = this.bufferCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.bufferCache.delete(key);
      this.cacheTotalBytes = Math.max(0, this.cacheTotalBytes - entry.buffer.length);
      return null;
    }
    // Refresh LRU order
    this.bufferCache.delete(key);
    this.bufferCache.set(key, entry);
    return entry;
  }

  _setCachedBuffer(key, entry) {
    const prev = this.bufferCache.get(key);
    if (prev) {
      this.bufferCache.delete(key);
      this.cacheTotalBytes = Math.max(0, this.cacheTotalBytes - prev.buffer.length);
    }
    this.bufferCache.set(key, entry);
    this.cacheTotalBytes += entry.buffer.length;

    while (
      this.bufferCache.size > MAX_CACHED_BUFFERS ||
      (this.cacheTotalBytes > MAX_CACHE_BYTES && this.bufferCache.size > 1)
    ) {
      const oldestKey = this.bufferCache.keys().next().value;
      const oldest = this.bufferCache.get(oldestKey);
      this.bufferCache.delete(oldestKey);
      if (oldest) {
        this.cacheTotalBytes = Math.max(0, this.cacheTotalBytes - oldest.buffer.length);
      }
    }
  }

  _handleRequest(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range'
      });
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      this._sendError(res, 405, 'Method Not Allowed');
      return;
    }

    let urlObj;
    try {
      urlObj = new URL(req.url, this.getBaseUrl());
    } catch {
      this._sendError(res, 400, 'Bad Request');
      return;
    }

    if (urlObj.searchParams.get('t') !== this.token) {
      this._sendError(res, 403, 'Forbidden');
      return;
    }

    const pathname = urlObj.pathname;
    if (pathname.startsWith('/audio/')) {
      const trackId = decodeURIComponent(pathname.slice('/audio/'.length));
      this._serveAudio(req, res, trackId);
      return;
    }

    if (pathname.startsWith('/cover/')) {
      const rawName = decodeURIComponent(pathname.slice('/cover/'.length));
      this._serveCover(req, res, rawName);
      return;
    }

    if (pathname.startsWith('/stream/spotify/')) {
      const key = decodeURIComponent(pathname.slice('/stream/spotify/'.length));
      this._serveExternalStream(req, res, key, urlObj).catch((err) => {
        if (err?.name === 'AbortError') return;
        this._sendError(res, 502, err?.message || 'Stream failed');
      });
      return;
    }

    this._sendError(res, 404, 'Not Found');
  }

  _serveCover(req, res, rawName) {
    const safeName = path.basename(rawName);
    if (!safeName || safeName !== rawName) {
      this._sendError(res, 400, 'Invalid cover path');
      return;
    }
    const filePath = path.join(this.coversDir, safeName);
    if (!fs.existsSync(filePath)) {
      this._sendError(res, 404, 'Cover not found');
      return;
    }
    const ext = path.extname(safeName).toLowerCase();
    const mime = COVER_MIME_TYPES[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  }

  _parseRange(rangeHeader, totalSize) {
    if (!rangeHeader) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) return { invalid: true };

    let start = match[1] ? Number.parseInt(match[1], 10) : 0;
    let end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;

    if (!match[1] && match[2]) {
      const suffixLen = Number.parseInt(match[2], 10);
      start = Math.max(0, totalSize - suffixLen);
      end = totalSize - 1;
    }

    if (
      start >= totalSize ||
      end >= totalSize ||
      start > end ||
      Number.isNaN(start) ||
      Number.isNaN(end)
    ) {
      return { invalid: true };
    }
    return { start, end, invalid: false };
  }

  _serveBufferRange(req, res, buffer, contentType) {
    const totalSize = buffer.length;
    const parsed = this._parseRange(req.headers.range, totalSize);

    if (parsed?.invalid) {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`,
        'Access-Control-Allow-Origin': '*'
      });
      res.end();
      return;
    }

    if (parsed) {
      const { start, end } = parsed;
      const chunk = buffer.subarray(start, end + 1);
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunk.length,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(chunk);
      return;
    }

    res.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Content-Length': totalSize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(buffer);
  }

  _serveAudio(req, res, trackId) {
    const track = this.library?.getTrackById(trackId);
    if (!track || !fs.existsSync(track.fullPath)) {
      this._sendError(res, 404, 'Track not found');
      return;
    }

    if (track.ext === '.wma') {
      this._serveWmaTranscode(req, res, track.fullPath);
      return;
    }

    let stat;
    try {
      stat = fs.statSync(track.fullPath);
    } catch {
      this._sendError(res, 404, 'Track unreadable');
      return;
    }

    const totalSize = stat.size;
    const contentType = AUDIO_MIME_TYPES[track.ext] || 'application/octet-stream';
    const parsed = this._parseRange(req.headers.range, totalSize);

    if (parsed?.invalid) {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`,
        'Access-Control-Allow-Origin': '*'
      });
      res.end();
      return;
    }

    if (parsed) {
      const { start, end } = parsed;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(track.fullPath, { start, end });
      stream.on('error', () => {
        if (!res.destroyed) res.destroy();
      });
      stream.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Content-Length': totalSize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(track.fullPath);
    stream.on('error', () => {
      if (!res.destroyed) res.destroy();
    });
    stream.pipe(res);
  }

  _serveWmaTranscode(req, res, filePath) {
    if (!this.ffmpegPath) {
      this._sendError(res, 500, 'ffmpeg not available for WMA playback');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Access-Control-Allow-Origin': '*'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const proc = spawn(
      this.ffmpegPath,
      ['-v', 'error', '-i', filePath, '-f', 'mp3', '-b:a', '192k', 'pipe:1'],
      { windowsHide: true }
    );
    proc.stdout.pipe(res);
    req.on('close', () => {
      if (!proc.killed) proc.kill();
    });
    proc.on('error', () => {
      if (!res.destroyed) res.destroy();
    });
  }

  _ytDlpArgs(extraArgs) {
    const args = ['--encoding', 'utf-8'];
    if (this.nodePath) {
      args.push('--js-runtimes', `node:${this.nodePath}`);
    } else {
      args.push('--js-runtimes', 'node');
    }
    if (this.ffmpegDir) {
      args.push('--ffmpeg-location', this.ffmpegDir);
    }
    return [...args, ...extraArgs];
  }

  _runYtDlp(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.ytDlpPath, this._ytDlpArgs(args), {
        windowsHide: true,
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (c) => {
        stdout += c.toString('utf8');
      });
      proc.stderr.on('data', (c) => {
        stderr += c.toString('utf8');
      });
      proc.on('error', reject);
      proc.on('close', (code) => resolve({ code, stdout, stderr }));
    });
  }

  _runYtDlpBuffer(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.ytDlpPath, this._ytDlpArgs(args), {
        windowsHide: true,
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
      });
      const chunks = [];
      let stderr = '';
      proc.stdout.on('data', (c) => chunks.push(c));
      proc.stderr.on('data', (d) => {
        stderr += d.toString('utf8');
      });
      proc.on('error', reject);
      proc.on('close', (code) => resolve({ code, buffer: Buffer.concat(chunks), stderr }));
    });
  }

  async resolveExternalStream({ key, title, artist, durationMs = 0, previewUrl = '', forceRefresh = false }) {
    const cacheKey = String(key || `${artist}|${title}`);

    if (!forceRefresh) {
      const cachedBuf = this._getCachedBuffer(cacheKey);
      if (cachedBuf) return cachedBuf;

      const cachedUrl = this.streamCache.get(cacheKey);
      if (cachedUrl && cachedUrl.expiresAt > Date.now()) {
        return cachedUrl;
      }

      if (this.inFlightResolves.has(cacheKey)) {
        return this.inFlightResolves.get(cacheKey);
      }
    }

    const promise = (async () => {
      try {
        if (this.ytDlpPath && title) {
          const query = `${artist || ''} - ${title} audio`.trim();
          const searchRes = await this._runYtDlp([
            '--dump-json',
            '--flat-playlist',
            '--no-playlist',
            `ytsearch5:${query}`
          ]);

          if (searchRes.code === 0) {
            const candidates = [];
            for (const line of searchRes.stdout.split(/\r?\n/)) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('{')) continue;
              try {
                candidates.push(JSON.parse(trimmed));
              } catch {
                // Ignore malformed JSON line
              }
            }

            const best = selectBestYouTubeCandidate(candidates, { title, artist, durationMs });
            const ranked = [
              best,
              ...candidates.filter((c) => c && !c.is_live && c !== best)
            ]
              .filter(Boolean)
              .slice(0, 3);

            for (const cand of ranked) {
              const ytUrl =
                cand.webpage_url ||
                (cand.url && cand.url.startsWith('http')
                  ? cand.url
                  : cand.id
                    ? `https://www.youtube.com/watch?v=${cand.id}`
                    : '');
              if (!ytUrl) continue;

              // Stream audio bytes directly via yt-dlp so client IP/PO-token session matches YouTube CDN
              const dlRes = await this._runYtDlpBuffer([
                '-f',
                'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
                '--no-playlist',
                '--no-warnings',
                '-q',
                '-o',
                '-',
                ytUrl
              ]);

              if (dlRes.code === 0 && dlRes.buffer.length > 2048) {
                const entry = {
                  kind: 'buffer',
                  buffer: dlRes.buffer,
                  contentType: detectAudioMime(dlRes.buffer),
                  expiresAt: Date.now() + STREAM_CACHE_TTL_MS
                };
                this._setCachedBuffer(cacheKey, entry);
                return entry;
              }
            }
          }
        }

        if (previewUrl) {
          const entry = {
            kind: 'url',
            url: previewUrl,
            headers: { 'User-Agent': 'Mozilla/5.0' },
            contentType: 'audio/mpeg',
            expiresAt: Date.now() + STREAM_CACHE_TTL_MS
          };
          this.streamCache.set(cacheKey, entry);
          return entry;
        }

        throw new Error('Canlı ses akışı bulunamadı.');
      } finally {
        this.inFlightResolves.delete(cacheKey);
      }
    })();

    this.inFlightResolves.set(cacheKey, promise);
    return promise;
  }

  prefetchExternalStream(track) {
    if (!track || !track.title) return;
    const key = track.id || track.spotifyId || `${track.artist}|${track.title}`;
    this.resolveExternalStream({
      key,
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs || (track.duration ? track.duration * 1000 : 0),
      previewUrl: track.previewUrl || ''
    }).catch(() => {});
  }

  async _serveExternalStream(req, res, key, urlObj) {
    const params = {
      key,
      title: urlObj.searchParams.get('title') || '',
      artist: urlObj.searchParams.get('artist') || '',
      durationMs: Number(urlObj.searchParams.get('dur')) || 0,
      previewUrl: urlObj.searchParams.get('preview') || ''
    };

    const resolved = await this.resolveExternalStream(params);

    if (resolved.kind === 'buffer' || resolved.buffer) {
      this._serveBufferRange(req, res, resolved.buffer, resolved.contentType || 'audio/mp4');
      return;
    }

    const reqHeaders = { ...(resolved.headers || {}) };
    if (req.headers.range) {
      reqHeaders.Range = req.headers.range;
    }
    const controller = new AbortController();
    const onClose = () => controller.abort();
    req.once('close', onClose);

    let upRes;
    try {
      upRes = await this.fetchImpl(resolved.url, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: reqHeaders,
        signal: controller.signal
      });
    } catch (err) {
      req.off('close', onClose);
      throw err;
    }

    if (!upRes.ok && upRes.status !== 206) {
      req.off('close', onClose);
      this._sendError(res, 502, `Upstream stream error ${upRes.status}`);
      return;
    }

    const outHeaders = {
      'Content-Type': upRes.headers.get('content-type') || resolved.contentType || 'audio/mpeg',
      'Accept-Ranges': upRes.headers.get('accept-ranges') || 'bytes',
      'Access-Control-Allow-Origin': '*'
    };
    const len = upRes.headers.get('content-length');
    if (len) outHeaders['Content-Length'] = len;
    const range = upRes.headers.get('content-range');
    if (range) outHeaders['Content-Range'] = range;

    res.writeHead(upRes.status, outHeaders);
    if (req.method === 'HEAD' || !upRes.body) {
      req.off('close', onClose);
      res.end();
      return;
    }

    const nodeStream = typeof upRes.body.pipe === 'function' ? upRes.body : Readable.fromWeb(upRes.body);
    nodeStream.on('error', () => {
      req.off('close', onClose);
      if (!res.destroyed) res.destroy();
    });
    res.on('close', () => {
      req.off('close', onClose);
    });
    nodeStream.pipe(res);
  }

  stop() {
    this.streamCache.clear();
    this.bufferCache.clear();
    this.cacheTotalBytes = 0;
    this.inFlightResolves.clear();
    if (!this.server) return Promise.resolve();
    return new Promise((resolve) => {
      this.server.close(() => {
        this.server = null;
        this.port = 0;
        resolve();
      });
    });
  }
}
