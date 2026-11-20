import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMediaUrl, resolveSpotifyUrl } from '../src/main/spotifyResolver.js';
import { sanitizeWindowsName, selectBestYouTubeCandidate } from '../src/main/downloader.js';

test('detectMediaUrl identifies Spotify and YouTube URLs accurately', () => {
  const spTrack = detectMediaUrl('https://open.spotify.com/intl-tr/track/4cOdK2wGLETKBW3PvgPWqT?si=abc');
  assert.deepEqual(
    { provider: spTrack.provider, kind: spTrack.kind, id: spTrack.id },
    { provider: 'spotify', kind: 'track', id: '4cOdK2wGLETKBW3PvgPWqT' }
  );

  const spPlaylist = detectMediaUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
  assert.equal(spPlaylist.provider, 'spotify');
  assert.equal(spPlaylist.kind, 'playlist');

  const spShort = detectMediaUrl('https://spotify.link/abc123');
  assert.equal(spShort.provider, 'spotify');
  assert.equal(spShort.kind, 'short');

  const ytVideo = detectMediaUrl('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(ytVideo.provider, 'youtube');
  assert.equal(ytVideo.kind, 'video');
  assert.equal(ytVideo.hasListParam, false);

  const ytWatchList = detectMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL12345');
  assert.equal(ytWatchList.provider, 'youtube');
  assert.equal(ytWatchList.kind, 'video');
  assert.equal(ytWatchList.hasListParam, true);

  const ytPlaylist = detectMediaUrl('https://music.youtube.com/playlist?list=PL12345');
  assert.equal(ytPlaylist.provider, 'youtube');
  assert.equal(ytPlaylist.kind, 'playlist');

  assert.equal(detectMediaUrl('https://example.com/not-supported'), null);
});

test('selectBestYouTubeCandidate prefers matching duration & official audio over karaoke/slowed', () => {
  const target = { title: 'Blinding Lights', artist: 'The Weeknd', durationMs: 200000 };
  const candidates = [
    { id: '1', title: 'Blinding Lights (Slowed + Reverb)', duration: 245, channel: 'RandomEdit' },
    { id: '2', title: 'Blinding Lights Karaoke Version', duration: 200, channel: 'KaraokeKing' },
    { id: '3', title: 'Blinding Lights (Official Audio)', duration: 201, channel: 'The Weeknd - Topic' }
  ];
  const best = selectBestYouTubeCandidate(candidates, target);
  assert.equal(best.id, '3');
});

test('sanitizeWindowsName removes illegal chars while keeping Turkish characters', () => {
  assert.equal(sanitizeWindowsName('Şarkı: "Gülümse" / Çiçek?'), 'Şarkı Gülümse Çiçek');
  assert.equal(sanitizeWindowsName('CON'), 'CON_');
});

test('resolveSpotifyUrl fetches public Spotify track and playlist metadata', async () => {
  const trackMeta = await resolveSpotifyUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(trackMeta.type, 'track');
  assert.equal(trackMeta.tracks.length, 1);
  assert.match(trackMeta.tracks[0].title, /Never Gonna Give You Up/i);
  assert.match(trackMeta.tracks[0].artist, /Rick Astley/i);
  assert.ok(trackMeta.coverUrl.startsWith('http'));

  const playlistMeta = await resolveSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
  assert.equal(playlistMeta.type, 'playlist');
  assert.ok(playlistMeta.tracks.length >= 10);
  assert.ok(playlistMeta.tracks[0].title.length > 0);
  assert.ok(playlistMeta.tracks[0].artist.length > 0);
});
