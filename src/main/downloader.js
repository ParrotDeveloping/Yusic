import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import {
  detectMediaUrl,
  resolveSpotifyUrl,
  fetchSpotifyTrackOembedCover
} from './spotifyResolver.js';

const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeWindowsName(name, fallback = 'Adsiz') {
  let clean = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  if (!clean) clean = fallback;
  if (WINDOWS_RESERVED_RE.test(clean)) {
    clean = `${clean}_`;
  }
  if (clean.length > 140) {
    clean = clean.slice(0, 140).trim().replace(/[. ]+$/g, '');
  }
  return clean || fallback;
}

const PENALTY_TERMS = [
  'karaoke',
  'instrumental',
  'cover',
  'live',
  'concert',
  'konser',
  'canlı',
  'canli',
  'remix',
  'slowed',
  'sped up',
  'nightcore',
  '8d audio',
  'reaction',
  'tutorial',
  'teaser',
  'trailer',
  'shorts'
];

export function selectBestYouTubeCandidate(candidates = [], spotifyTrack = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const targetTitle = String(spotifyTrack.title || '').toLowerCase();
  const targetArtist = String(spotifyTrack.artist || '').toLowerCase();
  const targetSec = Number(spotifyTrack.durationMs) > 0 ? Number(spotifyTrack.durationMs) / 1000 : 0;

  let best = null;
  let bestScore = -Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c || (!c.id && !c.url && !c.webpage_url)) continue;
    if (c.is_live) continue;

    let score = Math.max(0, 10 - i * 2); // slight preference for top search rank
    const cTitle = String(c.title || '').toLowerCase();
    const cChannel = String(c.channel || c.uploader || '').toLowerCase();
    const cDuration = Number(c.duration) || 0;

    if (targetSec > 0 && cDuration > 0) {
      const diff = Math.abs(cDuration - targetSec);
      if (diff <= 3) score += 50;
      else if (diff <= 7) score += 35;
      else if (diff <= 15) score += 15;
      else if (diff > 45) score -= 35;
      if (diff > 120) score -= 40;
    }

    if (cChannel.includes('- topic')) score += 25;
    if (cTitle.includes('official audio')) score += 18;
    else if (cTitle.includes('audio')) score += 8;

    const primaryArtist = targetArtist.split(',')[0]?.trim();
    if (primaryArtist && (cTitle.includes(primaryArtist) || cChannel.includes(primaryArtist))) {
      score += 12;
    }

    const cleanTrackWord = targetTitle.replace(/\([^)]*\)/g, '').trim();
    if (cleanTrackWord && cTitle.includes(cleanTrackWord)) {
      score += 12;
    }

    for (const term of PENALTY_TERMS) {
      if (cTitle.includes(term) && !targetTitle.includes(term)) {
        score -= 32;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best;
}

function uniqueFilePath(dir, fileName) {
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(dir, fileName);
  let idx = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${idx})${ext}`);
    idx++;
  }
  return candidate;
}

async function moveFileSafe(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmpDest = `${dest}.tmp`;
  try {
    await fs.promises.rename(src, tmpDest);
  } catch {
    await fs.promises.copyFile(src, tmpDest);
    await fs.promises.unlink(src).catch(() => {});
  }
  await fs.promises.rename(tmpDest, dest);
  return dest;
}

function killProcessTree(proc) {
  if (!proc || proc.killed || !proc.pid) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {
      try {
        proc.kill();
      } catch {
        // Ignore already dead
      }
    });
  } else {
    proc.kill('SIGTERM');
  }
}

export class DownloadManager extends EventEmitter {
  constructor({ muzikDir, tmpDir, library, store, ytDlpPath, ffmpegPath, ffmpegDir, nodePath }) {
    super();
    this.muzikDir = muzikDir;
    this.tmpDir = tmpDir;
    this.library = library;
    this.store = store;
    this.ytDlpPath = ytDlpPath;
    this.ffmpegPath = ffmpegPath;
    this.ffmpegDir = ffmpegDir;
    this.nodePath = nodePath;

    this.jobs = new Map();
    this.queue = [];
    this.isProcessing = false;
    this.activeProc = null;
  }

  _childEnv() {
    return {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8'
    };
  }

  _baseYtDlpArgs() {
    const args = ['--encoding', 'utf-8'];
    if (this.nodePath) {
      args.push('--js-runtimes', `node:${this.nodePath}`);
    } else {
      args.push('--js-runtimes', 'node');
    }
    if (this.ffmpegDir) {
      args.push('--ffmpeg-location', this.ffmpegDir);
    }
    return args;
  }

  _emitJob(job) {
    const snapshot = {
      ...job,
      items: job.items.map((it) => ({ ...it }))
    };
    this.emit('job:updated', snapshot);
  }

  listJobs() {
    return Array.from(this.jobs.values())
      .map((job) => ({
        ...job,
        items: job.items.map((it) => ({ ...it }))
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  clearCompleted() {
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') {
        this.jobs.delete(id);
      }
    }
    return this.listJobs();
  }

  enqueue(rawUrl, options = {}) {
    if (!this.ytDlpPath || !this.ffmpegPath) {
      throw new Error('İndirme araçları (yt-dlp veya ffmpeg) sistemde bulunamadı.');
    }
    const detected = detectMediaUrl(rawUrl);
    if (!detected) {
      throw new Error('Desteklenmeyen bağlantı. Lütfen geçerli bir Spotify veya YouTube linki yapıştırın.');
    }

    const jobId = `dl_${crypto.randomBytes(6).toString('hex')}`;
    const job = {
      id: jobId,
      url: detected.url,
      provider: detected.provider,
      kind: detected.kind,
      hasListParam: Boolean(detected.hasListParam),
      title: detected.provider === 'spotify' ? 'Spotify bağlantısı hazırlanıyor...' : 'YouTube bağlantısı hazırlanıyor...',
      status: 'queued',
      progress: 0,
      message: 'Sırada bekliyor...',
      totalTracks: 0,
      completedTracks: 0,
      failedTracks: 0,
      items: [],
      playlistId: null,
      playlistName: null,
      truncatedAt100: false,
      error: null,
      cancelled: false,
      options: {
        autoCreatePlaylist: options.autoCreatePlaylist !== false,
        downloadYoutubePlaylist: options.downloadYoutubePlaylist !== false
      },
      createdAt: Date.now()
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);
    this._emitJob(job);
    this._pumpQueue();
    return { ...job, items: [] };
  }

  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.cancelled = true;
    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.message = 'İptal edildi.';
      this._emitJob(job);
      return true;
    }
    if (job.status === 'running' && this.activeProc) {
      job.message = 'İptal ediliyor...';
      this._emitJob(job);
      killProcessTree(this.activeProc);
      return true;
    }
    return false;
  }

  async _pumpQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const jobId = this.queue.shift();
        const job = this.jobs.get(jobId);
        if (!job || job.cancelled || job.status === 'cancelled') continue;

        job.status = 'running';
        job.message = 'Bilgiler alınıyor...';
        this._emitJob(job);

        try {
          if (job.provider === 'youtube') {
            await this._processYoutubeJob(job);
          } else {
            await this._processSpotifyJob(job);
          }

          if (job.cancelled) {
            job.status = 'cancelled';
            job.message = 'İndirme iptal edildi.';
          } else if (job.completedTracks === 0 && job.failedTracks > 0) {
            job.status = 'error';
            job.error = 'Hiçbir parça indirilemedi.';
            job.message = job.error;
          } else {
            job.status = 'completed';
            job.progress = 100;
            job.message =
              job.failedTracks > 0
                ? `${job.completedTracks} şarkı indirildi (${job.failedTracks} başarısız).`
                : `${job.completedTracks} şarkı başarıyla indirildi.`;
          }
          this._emitJob(job);
          if (job.status === 'completed') {
            this.emit('job:completed', { ...job, items: job.items.map((it) => ({ ...it })) });
          }
        } catch (err) {
          if (job.cancelled) {
            job.status = 'cancelled';
            job.message = 'İndirme iptal edildi.';
          } else {
            job.status = 'error';
            job.error = err?.message || 'İndirme sırasında hata oluştu.';
            job.message = job.error;
            this.emit('job:error', { ...job, items: job.items.map((it) => ({ ...it })) });
          }
          this._emitJob(job);
        }
      }
    } finally {
      this.isProcessing = false;
      this.activeProc = null;
    }
  }

  _runProcess(exe, args, { onStdoutLine, onStderrLine } = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(exe, args, {
        windowsHide: true,
        env: this._childEnv()
      });
      this.activeProc = proc;

      let stdoutAll = '';
      let stderrAll = '';
      let outBuf = '';
      let errBuf = '';

      const flushLines = (chunk, isErr) => {
        const text = chunk.toString('utf8');
        if (isErr) {
          stderrAll += text;
          errBuf += text;
          const parts = errBuf.split(/[\r\n]+/);
          errBuf = parts.pop() ?? '';
          for (const line of parts) {
            if (line.trim() && onStderrLine) onStderrLine(line);
          }
        } else {
          stdoutAll += text;
          outBuf += text;
          const parts = outBuf.split(/[\r\n]+/);
          outBuf = parts.pop() ?? '';
          for (const line of parts) {
            if (line.trim() && onStdoutLine) onStdoutLine(line);
          }
        }
      };

      proc.stdout.on('data', (c) => flushLines(c, false));
      proc.stderr.on('data', (c) => flushLines(c, true));

      proc.on('error', (err) => {
        if (this.activeProc === proc) this.activeProc = null;
        reject(err);
      });

      proc.on('close', (code) => {
        if (outBuf.trim() && onStdoutLine) onStdoutLine(outBuf.trim());
        if (errBuf.trim() && onStderrLine) onStderrLine(errBuf.trim());
        if (this.activeProc === proc) this.activeProc = null;
        resolve({ code, stdout: stdoutAll, stderr: stderrAll });
      });
    });
  }

  async _downloadSingleYoutubeToMp3({ url, workDir, fileBaseName, onProgress }) {
    fs.mkdirSync(workDir, { recursive: true });
    const outputTemplate = fileBaseName
      ? path.join(workDir, `${fileBaseName}.%(ext)s`)
      : path.join(workDir, '%(title)s.%(ext)s');

    let printedFilePath = '';
    const args = [
      ...this._baseYtDlpArgs(),
      '--no-playlist',
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0',
      '--embed-thumbnail',
      '--convert-thumbnails',
      'jpg',
      '--add-metadata',
      '--windows-filenames',
      '--newline',
      '--progress',
      '--print',
      'after_move:filepath',
      '-o',
      outputTemplate,
      url
    ];

    const res = await this._runProcess(this.ytDlpPath, args, {
      onStdoutLine: (line) => {
        const pctMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (pctMatch && onProgress) {
          onProgress(Math.min(90, Number(pctMatch[1]) * 0.9), 'İndiriliyor...');
        } else if (line.includes('[ExtractAudio]') && onProgress) {
          onProgress(94, 'MP3 formatına dönüştürülüyor...');
        } else if (line.toLowerCase().endsWith('.mp3') && fs.existsSync(line.trim())) {
          printedFilePath = line.trim();
        }
      },
      onStderrLine: (line) => {
        const pctMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (pctMatch && onProgress) {
          onProgress(Math.min(90, Number(pctMatch[1]) * 0.9), 'İndiriliyor...');
        }
      }
    });

    if (res.code !== 0) {
      const errLines = res.stderr
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith('ERROR:'));
      throw new Error(errLines[0] || 'YouTube indirilemedi.');
    }

    if (printedFilePath && fs.existsSync(printedFilePath)) {
      return printedFilePath;
    }

    const mp3s = fs
      .readdirSync(workDir)
      .filter((f) => f.toLowerCase().endsWith('.mp3'))
      .map((f) => path.join(workDir, f));
    if (mp3s.length === 0) {
      throw new Error('MP3 çıktı dosyası oluşturulamadı.');
    }
    return mp3s[0];
  }

  async _processYoutubeJob(job) {
    const isPlaylist =
      job.kind === 'playlist' ||
      (job.kind === 'video' && job.hasListParam && job.options.downloadYoutubePlaylist);

    const jobTmpRoot = path.join(this.tmpDir, job.id);
    fs.mkdirSync(jobTmpRoot, { recursive: true });

    try {
      if (!isPlaylist) {
        job.totalTracks = 1;
        job.title = 'YouTube MP3 İndirme';
        job.items = [{ title: 'YouTube Parçası', status: 'running', progress: 0 }];
        this._emitJob(job);

        const mp3Src = await this._downloadSingleYoutubeToMp3({
          url: job.url,
          workDir: jobTmpRoot,
          onProgress: (pct, msg) => {
            job.progress = Math.round(pct);
            job.message = msg;
            job.items[0].progress = Math.round(pct);
            this._emitJob(job);
          }
        });

        const cleanName = sanitizeWindowsName(path.basename(mp3Src, '.mp3'), 'YouTube Müzik') + '.mp3';
        const destPath = uniqueFilePath(this.muzikDir, cleanName);
        await moveFileSafe(mp3Src, destPath);

        job.title = path.basename(destPath, '.mp3');
        job.items[0].title = job.title;
        job.items[0].status = 'completed';
        job.items[0].progress = 100;
        job.completedTracks = 1;
        job.progress = 100;
        await this.library.scanAll(true);
        return;
      }

      // YouTube Playlist
      job.message = 'YouTube playlist listesi alınıyor...';
      this._emitJob(job);

      const metaArgs = [
        ...this._baseYtDlpArgs(),
        '--flat-playlist',
        '--dump-single-json',
        '--yes-playlist',
        job.url
      ];
      const metaRes = await this._runProcess(this.ytDlpPath, metaArgs);
      if (job.cancelled) return;
      if (metaRes.code !== 0) {
        throw new Error('YouTube playlist bilgileri alınamadı.');
      }

      let playlistJson;
      try {
        playlistJson = JSON.parse(metaRes.stdout);
      } catch {
        throw new Error('YouTube playlist verisi ayrıştırılamadı.');
      }

      const entries = Array.isArray(playlistJson?.entries)
        ? playlistJson.entries.filter((e) => e && (e.id || e.url))
        : [];
      if (entries.length === 0) {
        throw new Error('Bu YouTube playlistinde indirilebilir video bulunamadı.');
      }

      const playlistTitle = sanitizeWindowsName(playlistJson.title || 'YouTube Playlist', 'YouTube Playlist');
      const targetDir = path.join(this.muzikDir, playlistTitle);
      fs.mkdirSync(targetDir, { recursive: true });

      job.title = playlistJson.title || playlistTitle;
      job.playlistName = playlistJson.title || playlistTitle;
      job.totalTracks = entries.length;
      job.items = entries.map((e, idx) => ({
        title: e.title || `Parça ${idx + 1}`,
        status: 'queued',
        progress: 0
      }));
      this._emitJob(job);

      const savedPaths = [];

      for (let i = 0; i < entries.length; i++) {
        if (job.cancelled) break;
        const entry = entries[i];
        const item = job.items[i];
        item.status = 'running';
        job.message = `İndiriliyor (${i + 1}/${entries.length}): ${item.title}`;
        this._emitJob(job);

        const entryUrl =
          entry.webpage_url ||
          (entry.url && entry.url.startsWith('http')
            ? entry.url
            : `https://www.youtube.com/watch?v=${entry.id}`);

        const trackTmpDir = path.join(jobTmpRoot, `item_${i}`);
        try {
          const mp3Src = await this._downloadSingleYoutubeToMp3({
            url: entryUrl,
            workDir: trackTmpDir,
            onProgress: (pct) => {
              item.progress = Math.round(pct);
              job.progress = Math.round(((i + pct / 100) / entries.length) * 100);
              this._emitJob(job);
            }
          });
          const rawBase = path.basename(mp3Src, '.mp3');
          const destName = `${sanitizeWindowsName(rawBase, `Parca ${i + 1}`)}.mp3`;
          const destPath = uniqueFilePath(targetDir, destName);
          await moveFileSafe(mp3Src, destPath);
          savedPaths.push(destPath);
          item.title = path.basename(destPath, '.mp3');
          item.status = 'completed';
          item.progress = 100;
          job.completedTracks++;
        } catch (err) {
          if (job.cancelled) break;
          item.status = 'error';
          item.error = err?.message || 'İndirilemedi';
          job.failedTracks++;
        } finally {
          fs.rmSync(trackTmpDir, { recursive: true, force: true });
        }
        job.progress = Math.round(((i + 1) / entries.length) * 100);
        this._emitJob(job);
      }

      if (!job.cancelled && savedPaths.length > 0) {
        await this.library.scanAll(true);
        if (job.options.autoCreatePlaylist) {
          const trackIds = savedPaths
            .map((p) => this.library.getTrackByPath(p)?.id)
            .filter(Boolean);
          if (trackIds.length > 0) {
            const pl = this.store.findOrCreatePlaylistByName(job.playlistName);
            this.store.addTracksToPlaylist(pl.id, trackIds);
            job.playlistId = pl.id;
            this.emit('playlists:updated', this.store.getPlaylists());
          }
        }
      }
    } finally {
      fs.rmSync(jobTmpRoot, { recursive: true, force: true });
    }
  }

  async _searchYoutubeCandidates(query) {
    const args = [
      ...this._baseYtDlpArgs(),
      '--dump-json',
      '--flat-playlist',
      '--no-playlist',
      `ytsearch5:${query}`
    ];
    const res = await this._runProcess(this.ytDlpPath, args);
    if (res.code !== 0) return [];
    const candidates = [];
    for (const line of res.stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;
      try {
        candidates.push(JSON.parse(trimmed));
      } catch {
        // Ignore malformed JSON line
      }
    }
    return candidates;
  }

  async _downloadCoverImage(url, destPath) {
    if (!url) return null;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 256) return null;
      await fs.promises.writeFile(destPath, buf);
      return destPath;
    } catch {
      return null;
    }
  }

  async _tagMp3WithFfmpeg({ inputMp3, coverPath, outputMp3, title, artist, album }) {
    const args = ['-v', 'error', '-y', '-i', inputMp3];
    if (coverPath && fs.existsSync(coverPath)) {
      args.push(
        '-i',
        coverPath,
        '-map',
        '0:a',
        '-map',
        '1:v',
        '-c:a',
        'copy',
        '-c:v',
        'mjpeg',
        '-disposition:v:0',
        'attached_pic',
        '-metadata:s:v',
        'title=Album cover',
        '-metadata:s:v',
        'comment=Cover (front)'
      );
    } else {
      args.push('-map', '0:a', '-c:a', 'copy');
    }

    args.push('-id3v2_version', '3');
    if (title) args.push('-metadata', `title=${title}`);
    if (artist) args.push('-metadata', `artist=${artist}`);
    if (album) args.push('-metadata', `album=${album}`);
    args.push(outputMp3);

    const res = await this._runProcess(this.ffmpegPath, args);
    if (res.code !== 0 || !fs.existsSync(outputMp3)) {
      throw new Error('MP3 etiketleme başarısız oldu.');
    }
    return outputMp3;
  }

  async _processSpotifyJob(job) {
    job.message = 'Spotify bilgileri alınıyor...';
    this._emitJob(job);

    const resolved = await resolveSpotifyUrl(job.url);
    if (job.cancelled) return;

    const isCollection = resolved.type === 'playlist' || resolved.type === 'album';
    const targetDir = isCollection
      ? path.join(this.muzikDir, sanitizeWindowsName(resolved.name, 'Spotify Liste'))
      : this.muzikDir;
    fs.mkdirSync(targetDir, { recursive: true });

    job.title = resolved.name;
    job.playlistName = isCollection ? resolved.name : null;
    job.truncatedAt100 = Boolean(resolved.truncatedAt100);
    job.totalTracks = resolved.tracks.length;
    job.items = resolved.tracks.map((t) => ({
      title: `${t.artist} - ${t.title}`,
      status: 'queued',
      progress: 0
    }));
    this._emitJob(job);

    const jobTmpRoot = path.join(this.tmpDir, job.id);
    fs.mkdirSync(jobTmpRoot, { recursive: true });
    const savedPaths = [];

    try {
      for (let i = 0; i < resolved.tracks.length; i++) {
        if (job.cancelled) break;
        const track = resolved.tracks[i];
        const item = job.items[i];
        item.status = 'running';
        job.message = `Eşleştiriliyor (${i + 1}/${resolved.tracks.length}): ${item.title}`;
        this._emitJob(job);

        const trackTmpDir = path.join(jobTmpRoot, `sp_${i}`);
        fs.mkdirSync(trackTmpDir, { recursive: true });

        try {
          const query = `${track.artist} - ${track.title} audio`;
          const candidates = await this._searchYoutubeCandidates(query);
          if (job.cancelled) break;

          const best = selectBestYouTubeCandidate(candidates, track);
          if (!best) {
            throw new Error('Eşleşen ses kaynağı bulunamadı.');
          }

          const ytUrl =
            best.webpage_url ||
            (best.url && best.url.startsWith('http')
              ? best.url
              : `https://www.youtube.com/watch?v=${best.id}`);

          item.progress = 20;
          job.message = `İndiriliyor (${i + 1}/${resolved.tracks.length}): ${item.title}`;
          this._emitJob(job);

          const rawMp3 = await this._downloadSingleYoutubeToMp3({
            url: ytUrl,
            workDir: trackTmpDir,
            fileBaseName: `raw_${i}`,
            onProgress: (pct) => {
              const mapped = 20 + pct * 0.65;
              item.progress = Math.round(mapped);
              job.progress = Math.round(((i + mapped / 100) / resolved.tracks.length) * 100);
              this._emitJob(job);
            }
          });
          if (job.cancelled) break;

          let coverUrl = track.coverUrl;
          if (!coverUrl && track.spotifyId) {
            coverUrl = await fetchSpotifyTrackOembedCover(track.spotifyId);
          }
          if (!coverUrl) coverUrl = resolved.coverUrl;

          const coverPath = coverUrl
            ? await this._downloadCoverImage(coverUrl, path.join(trackTmpDir, `cover_${i}.jpg`))
            : null;

          const taggedMp3 = path.join(trackTmpDir, `tagged_${i}.mp3`);
          await this._tagMp3WithFfmpeg({
            inputMp3: rawMp3,
            coverPath,
            outputMp3: taggedMp3,
            title: track.title,
            artist: track.artist,
            album: track.album || resolved.name
          });

          const destName = `${sanitizeWindowsName(`${track.artist} - ${track.title}`, `Spotify_${i + 1}`)}.mp3`;
          const destPath = uniqueFilePath(targetDir, destName);
          await moveFileSafe(taggedMp3, destPath);
          savedPaths.push(destPath);

          item.status = 'completed';
          item.progress = 100;
          job.completedTracks++;
        } catch (err) {
          if (job.cancelled) break;
          item.status = 'error';
          item.error = err?.message || 'İndirilemedi';
          job.failedTracks++;
        } finally {
          fs.rmSync(trackTmpDir, { recursive: true, force: true });
        }

        job.progress = Math.round(((i + 1) / resolved.tracks.length) * 100);
        this._emitJob(job);
      }

      if (!job.cancelled && savedPaths.length > 0) {
        await this.library.scanAll(true);
        if (isCollection && job.options.autoCreatePlaylist) {
          const trackIds = savedPaths
            .map((p) => this.library.getTrackByPath(p)?.id)
            .filter(Boolean);
          if (trackIds.length > 0) {
            const pl = this.store.findOrCreatePlaylistByName(resolved.name);
            this.store.addTracksToPlaylist(pl.id, trackIds);
            job.playlistId = pl.id;
            this.emit('playlists:updated', this.store.getPlaylists());
          }
        }
      }
    } finally {
      fs.rmSync(jobTmpRoot, { recursive: true, force: true });
    }
  }
}
