import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cleanTrackMetadataForLyrics,
  findActiveLyricIndex,
  parseLrc,
  selectBestLyricsCandidate
} from '../src/main/lyricsLogic.js';
import { LyricsService } from '../src/main/lyricsService.js';

test('parseLrc parses multi-timestamp lines, offset tag, and sorts chronologically', () => {
  const sample = [
    '[offset:+250]',
    '[00:12.50][00:45.100]Nakarat satırı',
    '[00:05.00]İlk satır <00:05.40> burada',
    '[00:20]Yirmi saniye'
  ].join('\n');

  const parsed = parseLrc(sample);
  assert.equal(parsed.offsetHeaderMs, 250);
  assert.equal(parsed.lines.length, 4);
  assert.deepEqual(parsed.lines[0], { timeMs: 5000, text: 'İlk satır burada' });
  assert.deepEqual(parsed.lines[1], { timeMs: 12500, text: 'Nakarat satırı' });
  assert.deepEqual(parsed.lines[2], { timeMs: 20000, text: 'Yirmi saniye' });
  assert.deepEqual(parsed.lines[3], { timeMs: 45100, text: 'Nakarat satırı' });
});

test('findActiveLyricIndex binary-searches with offset accurately', () => {
  const lines = [
    { timeMs: 5000, text: 'One' },
    { timeMs: 12000, text: 'Two' },
    { timeMs: 20000, text: 'Three' }
  ];
  assert.equal(findActiveLyricIndex(lines, 2000, 0), -1);
  assert.equal(findActiveLyricIndex(lines, 5000, 0), 0);
  assert.equal(findActiveLyricIndex(lines, 11900, 0), 0);
  assert.equal(findActiveLyricIndex(lines, 11900, 200), 1);
  assert.equal(findActiveLyricIndex(lines, 25000, 0), 2);
});

test('cleanTrackMetadataForLyrics auto-detects artist & title from messy local filename', () => {
  const cleaned = cleanTrackMetadataForLyrics({
    title: '03 - Duman - Senden_Daha_Guzel (Official Video) [320kbps].mp3',
    artist: 'Bilinmeyen Sanatçı',
    fileName: '03 - Duman - Senden_Daha_Guzel (Official Video) [320kbps].mp3'
  });

  assert.equal(cleaned.artist, 'Duman');
  assert.equal(cleaned.title, 'Senden Daha Guzel');
  assert.equal(cleaned.autoDetectedFromFilename, true);
});

test('selectBestLyricsCandidate prefers synced lyrics and matching duration', () => {
  const best = selectBestLyricsCandidate(
    [
      {
        id: 1,
        trackName: 'Numb',
        artistName: 'Linkin Park',
        duration: 185,
        plainLyrics: 'I am tired of being what you want me to be'
      },
      {
        id: 2,
        trackName: 'Numb',
        artistName: 'Linkin Park',
        duration: 186,
        syncedLyrics: '[00:10.00] I am tired of being what you want me to be'
      }
    ],
    { title: 'Numb', baseTitle: 'Numb', artist: 'Linkin Park', durationSec: 186 }
  );

  assert.equal(best.id, 2);
});

test('LyricsService reads sidecar .lrc for local tracks and falls back cleanly to mocked LRCLIB + cache', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yusic-lyrics-'));
  const cacheDir = path.join(tmpDir, 'cache');
  const audioPath = path.join(tmpDir, 'Teoman - Papatya.mp3');
  const lrcPath = path.join(tmpDir, 'Teoman - Papatya.lrc');
  fs.writeFileSync(audioPath, 'fake-mp3');
  fs.writeFileSync(lrcPath, '[00:08.00] Sabah güneş doğarken');

  let fetchCalls = 0;
  const mockFetch = async (url) => {
    fetchCalls++;
    if (url.includes('/api/get')) {
      return { status: 404, ok: false };
    }
    return {
      status: 200,
      ok: true,
      async json() {
        return [
          {
            id: 99,
            trackName: 'Hello',
            artistName: 'Adele',
            duration: 295,
            syncedLyrics: '[00:06.00] Hello, it is me'
          }
        ];
      }
    };
  };

  try {
    const svc = new LyricsService({ cacheDir, fetchFn: mockFetch });

    // 1. Local sidecar .lrc should bypass network completely
    const localRes = await svc.getLyricsForTrack({
      id: 'loc1',
      title: 'Papatya',
      artist: 'Teoman',
      fullPath: audioPath,
      source: 'local'
    });
    assert.equal(localRes.found, true);
    assert.equal(localRes.synced, true);
    assert.equal(localRes.source, 'sidecar-lrc');
    assert.equal(fetchCalls, 0);

    // 2. Messy local track without .lrc should auto-detect artist/title and query LRCLIB + cache
    const autoPath = path.join(tmpDir, '01 - Adele - Hello (Official Audio).mp3');
    fs.writeFileSync(autoPath, 'fake-mp3');
    const netRes = await svc.getLyricsForTrack({
      id: 'loc2',
      title: '01 - Adele - Hello (Official Audio)',
      artist: 'Bilinmeyen Sanatçı',
      fullPath: autoPath,
      duration: 295,
      source: 'local'
    });
    assert.equal(netRes.found, true);
    assert.equal(netRes.synced, true);
    assert.equal(netRes.matchedArtist, 'Adele');
    assert.equal(netRes.autoDetected, true);
    assert.equal(netRes.lines[0].text, 'Hello, it is me');
    const callsAfterFirst = fetchCalls;
    assert.ok(callsAfterFirst >= 1);

    // Offset persists on cache and second call hits cache (0 extra fetch calls)
    const savedOffset = svc.setTrackOffset(netRes.trackKey, -500);
    assert.equal(savedOffset, -500);
    const cachedRes = await svc.getLyricsForTrack({
      id: 'loc2',
      title: '01 - Adele - Hello (Official Audio)',
      artist: 'Bilinmeyen Sanatçı',
      fullPath: autoPath,
      duration: 295,
      source: 'local'
    });
    assert.equal(cachedRes.offsetMs, -500);
    assert.equal(fetchCalls, callsAfterFirst);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
