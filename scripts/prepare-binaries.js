import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegStaticPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'build-bin');
const force = process.argv.includes('--force');

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

function copyBinary(srcPath, destName) {
  if (!srcPath || !fs.existsSync(srcPath)) {
    throw new Error(`Missing source binary for ${destName}: ${srcPath}`);
  }
  const destPath = path.join(OUT_DIR, destName);
  fs.copyFileSync(srcPath, destPath);
  const sizeMb = (fs.statSync(destPath).size / 1048576).toFixed(1);
  console.log(`Prepared ${destName} (${sizeMb} MB)`);
}

async function downloadYtDlp(destPath) {
  if (!force && fs.existsSync(destPath) && fs.statSync(destPath).size > 5 * 1048576) {
    const sizeMb = (fs.statSync(destPath).size / 1048576).toFixed(1);
    console.log(`Reusing existing yt-dlp.exe (${sizeMb} MB)`);
    return;
  }
  console.log(`Downloading ${YTDLP_URL} ...`);
  const res = await fetch(YTDLP_URL, {
    redirect: 'follow',
    headers: { 'User-Agent': 'yusic-builder' }
  });
  if (!res.ok) {
    throw new Error(`Failed to download yt-dlp.exe: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5 * 1048576) {
    throw new Error(`Downloaded yt-dlp.exe looks too small (${buf.length} bytes)`);
  }
  const tmpPath = `${destPath}.tmp`;
  fs.writeFileSync(tmpPath, buf);
  fs.renameSync(tmpPath, destPath);
  const sizeMb = (fs.statSync(destPath).size / 1048576).toFixed(1);
  console.log(`Prepared yt-dlp.exe (${sizeMb} MB)`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  copyBinary(ffmpegStaticPath, 'ffmpeg.exe');
  copyBinary(ffprobeStatic?.path, 'ffprobe.exe');
  await downloadYtDlp(path.join(OUT_DIR, 'yt-dlp.exe'));

  for (const name of ['ffmpeg.exe', 'ffprobe.exe', 'yt-dlp.exe']) {
    const p = path.join(OUT_DIR, name);
    if (!fs.existsSync(p)) {
      throw new Error(`Verification failed, missing ${p}`);
    }
  }
  console.log('All Windows binaries prepared in build-bin/.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
