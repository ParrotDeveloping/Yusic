import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '../..');
export const MUZIK_DIR = path.join(ROOT_DIR, 'muzik');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const COVERS_DIR = path.join(DATA_DIR, 'covers');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const LYRICS_CACHE_DIR = path.join(DATA_DIR, 'lyrics-cache');
export const DB_PATH = path.join(DATA_DIR, 'yusic-db.json');
export const ICON_PATH = path.join(ROOT_DIR, 'assets', 'icon.png');

const runtime = {
  isPackaged: false,
  rootDir: ROOT_DIR,
  exeDir: '',
  muzikDir: MUZIK_DIR,
  dataDir: DATA_DIR,
  coversDir: COVERS_DIR,
  tmpDir: TMP_DIR,
  lyricsCacheDir: LYRICS_CACHE_DIR,
  dbPath: DB_PATH,
  iconPath: ICON_PATH,
  bundledBinDir: path.join(ROOT_DIR, 'build-bin')
};

export function initRuntimePaths({
  isPackaged = false,
  userDataDir = '',
  musicDir = '',
  exeDir = '',
  resourcesDir = ''
} = {}) {
  runtime.isPackaged = Boolean(isPackaged);
  runtime.exeDir = exeDir || '';

  if (runtime.isPackaged) {
    const safeMusicBase = musicDir || userDataDir || ROOT_DIR;
    const safeDataBase = userDataDir || ROOT_DIR;
    runtime.muzikDir = path.join(safeMusicBase, 'Yusic');
    runtime.dataDir = path.join(safeDataBase, 'data');
    runtime.bundledBinDir = resourcesDir ? path.join(resourcesDir, 'bin') : path.join(ROOT_DIR, 'build-bin');
  } else {
    runtime.muzikDir = MUZIK_DIR;
    runtime.dataDir = DATA_DIR;
    runtime.bundledBinDir = path.join(ROOT_DIR, 'build-bin');
  }

  runtime.coversDir = path.join(runtime.dataDir, 'covers');
  runtime.tmpDir = path.join(runtime.dataDir, 'tmp');
  runtime.lyricsCacheDir = path.join(runtime.dataDir, 'lyrics-cache');
  runtime.dbPath = path.join(runtime.dataDir, 'yusic-db.json');
  return getRuntimePaths();
}

export function getRuntimePaths() {
  return { ...runtime };
}

export function ensureAppDirs() {
  for (const dir of [
    runtime.muzikDir,
    runtime.dataDir,
    runtime.coversDir,
    runtime.tmpDir,
    runtime.lyricsCacheDir
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function whereFirst(cmdName) {
  try {
    const out = execFileSync('where.exe', [cmdName], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000
    });
    const first = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

export function resolveYtDlp() {
  const bundledExe = path.join(runtime.bundledBinDir, 'yt-dlp.exe');
  if (fs.existsSync(bundledExe)) return bundledExe;
  const venvExe = path.join(ROOT_DIR, '.venv', 'Scripts', 'yt-dlp.exe');
  if (fs.existsSync(venvExe)) return venvExe;
  const binExe = path.join(ROOT_DIR, 'bin', 'yt-dlp.exe');
  if (fs.existsSync(binExe)) return binExe;
  return whereFirst('yt-dlp');
}

export function resolveFfmpeg() {
  const bundledExe = path.join(runtime.bundledBinDir, 'ffmpeg.exe');
  const ffmpegPath = fs.existsSync(bundledExe) ? bundledExe : whereFirst('ffmpeg');
  if (!ffmpegPath) return { ffmpegPath: null, ffmpegDir: null };
  return {
    ffmpegPath,
    ffmpegDir: path.dirname(ffmpegPath)
  };
}

export function resolveFfprobe() {
  const bundledExe = path.join(runtime.bundledBinDir, 'ffprobe.exe');
  if (fs.existsSync(bundledExe)) return bundledExe;
  return whereFirst('ffprobe');
}

export function resolveNode() {
  const fromPath = whereFirst('node');
  if (fromPath && fs.existsSync(fromPath)) return fromPath;
  const standard = 'C:\\Program Files\\nodejs\\node.exe';
  if (fs.existsSync(standard)) return standard;
  const x86 = 'C:\\Program Files (x86)\\nodejs\\node.exe';
  if (fs.existsSync(x86)) return x86;
  return null;
}

export function getToolsStatus() {
  const ytDlpPath = resolveYtDlp();
  const { ffmpegPath, ffmpegDir } = resolveFfmpeg();
  const nodePath = resolveNode();
  return {
    ytDlpPath,
    ffmpegPath,
    ffmpegDir,
    nodePath,
    readyForYoutube: Boolean(ytDlpPath && ffmpegPath),
    readyForSpotify: Boolean(ytDlpPath && ffmpegPath)
  };
}
