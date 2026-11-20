import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveFfmpeg } from '../src/main/paths.js';
import { YusicStore } from '../src/main/store.js';
import { LibraryManager } from '../src/main/library.js';

test('LibraryManager scans metadata/covers and watches live folder changes', async (t) => {
  const { ffmpegPath } = resolveFfmpeg();
  assert.ok(ffmpegPath, 'ffmpeg must be available for library test');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yusic-lib-'));
  t.after(async () => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  const muzikDir = path.join(tmpRoot, 'muzik');
  const coversDir = path.join(tmpRoot, 'covers');
  const dbPath = path.join(tmpRoot, 'db.json');
  fs.mkdirSync(muzikDir, { recursive: true });

  // Create a temporary cover image and a tagged Turkish MP3
  const coverJpg = path.join(tmpRoot, 'cover.jpg');
  execFileSync(
    ffmpegPath,
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=purple:s=64x64:d=1', '-frames:v', '1', coverJpg],
    { windowsHide: true }
  );

  const mp3Path = path.join(muzikDir, 'Sezen Aksu - Gülümse.mp3');
  execFileSync(
    ffmpegPath,
    [
      '-v', 'error', '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5',
      '-i', coverJpg,
      '-map', '0:a', '-map', '1:v',
      '-c:a', 'libmp3lame', '-b:a', '128k',
      '-c:v', 'mjpeg',
      '-id3v2_version', '3',
      '-metadata', 'title=Gülümse',
      '-metadata', 'artist=Sezen Aksu',
      '-metadata', 'album=Gülümse Albüm',
      mp3Path
    ],
    { windowsHide: true }
  );

  const wavPath = path.join(muzikDir, 'enstrümantal.wav');
  execFileSync(
    ffmpegPath,
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=523:duration=1.2', wavPath],
    { windowsHide: true }
  );

  const store = new YusicStore(dbPath);
  const library = new LibraryManager({ muzikDir, coversDir, store });
  t.after(async () => {
    await library.stopWatching();
  });

  const initial = await library.scanAll();
  assert.equal(initial.length, 2);

  const sezen = initial.find((x) => x.fileName === 'Sezen Aksu - Gülümse.mp3');
  assert.ok(sezen);
  assert.equal(sezen.title, 'Gülümse');
  assert.equal(sezen.artist, 'Sezen Aksu');
  assert.equal(sezen.album, 'Gülümse Albüm');
  assert.ok(sezen.duration > 1.0);
  assert.ok(sezen.coverFile);
  assert.ok(fs.existsSync(path.join(coversDir, sezen.coverFile)));

  const wav = initial.find((x) => x.fileName === 'enstrümantal.wav');
  assert.ok(wav);
  assert.equal(wav.artist, 'Bilinmeyen Sanatçı');
  assert.ok(wav.duration > 0.9);

  // Start watching and test live add + delete detection
  library.startWatching();
  await new Promise((r) => setTimeout(r, 400));

  const addedPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Watcher add timed out')), 8000);
    library.once('updated', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

  const droppedMp3 = path.join(muzikDir, 'Tarkan - Kuzu Kuzu.mp3');
  execFileSync(
    ffmpegPath,
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=1', droppedMp3],
    { windowsHide: true }
  );

  const afterAdd = await addedPromise;
  assert.equal(afterAdd.tracks.length, 3);
  assert.ok(afterAdd.tracks.some((x) => x.title === 'Kuzu Kuzu' && x.artist === 'Tarkan'));

  const deletedPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Watcher unlink timed out')), 8000);
    library.once('updated', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

  fs.unlinkSync(droppedMp3);
  const afterDelete = await deletedPromise;
  assert.equal(afterDelete.tracks.length, 2);
});
