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

const STREAM_CACHE_TTL_MS = 25 * 60 * 1000;

function mimeForExt(ext = '') {
  const lower = String(ext).toLowerCase().replace(/^\./, '');
  if (lower === 'm4a' || lower === 'mp4') return 'audio/mp4';
  if (lower === 'webm' || lower === 'opus') return 'audio/webm';
  if (lower === 'mp3') return 'audio/mpeg';
  if (lower === 'ogg') return 'audio/ogg';
  return 'audio/mp4';
}

export class StreamServer {
  constructor({ library, coversDir, ffmpegPath, ytDlpPath = null, nodePath = null, fetchImpl = fetch }) {
    this.library = library;
    this.coversDir = coversDir;
    this.ffmpegPath = ffmpegPath;
    this.ytDlpPath = ytDlpPath;
    this.nodePath = nodePath;
    this.fetchImpl = fetchImpl;
    this.token = crypto.randomBytes(16).toString('hex');
    this.server = null;
    this.port = 0;

    this.streamCache = new Map();
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
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (!match) {
        res.writeHead(416, {
          'Content-Range': `bytes */${totalSize}`,
          'Access-Control-Allow-Origin': '*'
        });
        res.end();
        return;
      }

      let start = match[1] ? Number.parseInt(match[1], 10) : 0;
      let end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;

      if (!match[1] && match[2]) {
        const suffixLen = Number.parseInt(match[2], 10);
        start = Math.max(0, totalSize - suffixLen);
        end = totalSize - 1;
      }

      if (start >= totalSize || end >= totalSize || start > end || Number.isNaN(start) || Number.isNaN(end)) {
        res.writeHead(416, {
          'Content-Range': `bytes */${totalSize}`,
          'Access-Control-Allow-Origin': '*'
        });
        res.end();
        return;
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
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

  async resolveExternalStream({ key, title, artist, durationMs = 0, previewUrl = '', forceRefresh = false }) {
    const cacheKey = String(key || `${artist}|${title}`);
    const cached = !forceRefresh ? this.streamCache.get(cacheKey) : null;
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    if (!forceRefresh && this.inFlightResolves.has(cacheKey)) {
      return this.inFlightResolves.get(cacheKey);
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
            if (best) {
              const ytUrl =
                best.webpage_url ||
                (best.url && best.url.startsWith('http')
                  ? best.url
                  : `https://www.youtube.com/watch?v=${best.id}`);

              const infoRes = await this._runYtDlp([
                '-f',
                'bestaudio[protocol^=http][protocol!*=m3u8][ext=m4a]/bestaudio[protocol^=http][protocol!*=m3u8][ext=webm]/bestaudio[protocol^=http][protocol!*=m3u8]/bestaudio',
                '--no-playlist',
                '--dump-single-json',
                ytUrl
              ]);

              if (infoRes.code === 0) {
                try {
                  const info = JSON.parse(infoRes.stdout);
                  let directUrl = info.url;
                  let ext = info.ext;
                  let headers = info.http_headers || {};
                  let protocol = String(info.protocol || '');

                  const looksHls = (u, proto) =>
                    String(proto || '').includes('m3u8') || /\.m3u8(?:\?|$)/i.test(String(u || ''));

                  if ((!directUrl || looksHls(directUrl, protocol)) && Array.isArray(info.formats)) {
                    const directAudio = info.formats
                      .filter(
                        (f) =>
                          f &&
                          f.url &&
                          f.acodec &&
                          f.acodec !== 'none' &&
                          (!f.vcodec || f.vcodec === 'none') &&
                          !looksHls(f.url, f.protocol)
                      )
                      .sort((a, b) => (Number(b.abr) || 0) - (Number(a.abr) || 0));
                    if (directAudio[0]) {
                      directUrl = directAudio[0].url;
                      ext = directAudio[0].ext;
                      protocol = String(directAudio[0].protocol || '');
                      headers = directAudio[0].http_headers || headers;
                    } else if (!directUrl) {
                      const anyAudio = info.formats
                        .filter((f) => f && f.url && f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
                        .sort((a, b) => (Number(b.abr) || 0) - (Number(a.abr) || 0));
                      if (anyAudio[0]) {
                        directUrl = anyAudio[0].url;
                        ext = anyAudio[0].ext;
                        protocol = String(anyAudio[0].protocol || '');
                        headers = anyAudio[0].http_headers || headers;
                      }
                    }
                  }

                  if (directUrl) {
                    const isHls = looksHls(directUrl, protocol);
                    const entry = {
                      url: directUrl,
                      headers,
                      contentType: isHls ? 'audio/mpeg' : mimeForExt(ext),
                      isHls,
                      expiresAt: Date.now() + STREAM_CACHE_TTL_MS
                    };
                    this.streamCache.set(cacheKey, entry);
                    return entry;
                  }
                } catch {
                  // Fall through to previewUrl fallback if present
                }
              }
            }
          }
        }

        if (previewUrl) {
          const entry = {
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

    let resolved = await this.resolveExternalStream(params);

    if (resolved.isHls && this.ffmpegPath) {
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
        ['-v', 'error', '-i', resolved.url, '-f', 'mp3', '-b:a', '192k', 'pipe:1'],
        { windowsHide: true }
      );
      proc.stdout.pipe(res);
      req.on('close', () => {
        if (!proc.killed) proc.kill();
      });
      proc.on('error', () => {
        if (!res.destroyed) res.destroy();
      });
      return;
    }

    const fetchUpstream = async (targetEntry) => {
      const reqHeaders = { ...(targetEntry.headers || {}) };
      if (req.headers.range) {
        reqHeaders.Range = req.headers.range;
      }
      const controller = new AbortController();
      const onClose = () => controller.abort();
      req.once('close', onClose);
      try {
        const upRes = await this.fetchImpl(targetEntry.url, {
          method: req.method === 'HEAD' ? 'HEAD' : 'GET',
          headers: reqHeaders,
          signal: controller.signal
        });
        return { upRes, controller, onClose };
      } catch (err) {
        req.off('close', onClose);
        throw err;
      }
    };

    let attempt = await fetchUpstream(resolved);
    if ((attempt.upRes.status === 403 || attempt.upRes.status === 410) && params.title) {
      req.off('close', attempt.onClose);
      try {
        await attempt.upRes.body?.cancel();
      } catch {
        // Ignore cancel failure
      }
      resolved = await this.resolveExternalStream({ ...params, forceRefresh: true });
      attempt = await fetchUpstream(resolved);
    }

    const { upRes, onClose } = attempt;
    if (!upRes.ok && upRes.status !== 206) {
      req.off('close', onClose);
      this._sendError(res, 502, `Upstream stream error ${upRes.status}`);
      return;
    }

    const outHeaders = {
      'Content-Type': upRes.headers.get('content-type') || resolved.contentType || 'audio/mp4',
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
