import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

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

export class StreamServer {
  constructor({ library, coversDir, ffmpegPath }) {
    this.library = library;
    this.coversDir = coversDir;
    this.ffmpegPath = ffmpegPath;
    this.token = crypto.randomBytes(16).toString('hex');
    this.server = null;
    this.port = 0;
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
    const track = this.library.getTrackById(trackId);
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

  stop() {
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
