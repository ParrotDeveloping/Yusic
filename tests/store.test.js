import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { YusicStore } from '../src/main/store.js';

test('YusicStore playlist CRUD, reordering, settings, and persistence', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yusic-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const dbPath = path.join(dir, 'yusic-db.json');
  const store = new YusicStore(dbPath);

  const pl = store.createPlaylist('Gece Listesi');
  assert.equal(pl.name, 'Gece Listesi');
  assert.deepEqual(pl.trackIds, []);

  store.addTracksToPlaylist(pl.id, ['t1', 't2', 't3', 't2']);
  let loaded = store.getPlaylists().find((p) => p.id === pl.id);
  assert.deepEqual(loaded.trackIds, ['t1', 't2', 't3']);

  store.reorderPlaylistTracks(pl.id, ['t3', 't1', 't2']);
  loaded = store.getPlaylists().find((p) => p.id === pl.id);
  assert.deepEqual(loaded.trackIds, ['t3', 't1', 't2']);

  store.renamePlaylist(pl.id, 'Yolculuk');
  store.removeTrackFromPlaylist(pl.id, 't1');

  const foundExisting = store.findOrCreatePlaylistByName('yolculuk');
  assert.equal(foundExisting.id, pl.id);

  const settings = store.updateSettings({
    speed: 1.75,
    preservePitch: false,
    repeatMode: 'one',
    shuffle: true,
    volume: 1.4
  });
  assert.equal(settings.speed, 1.75);
  assert.equal(settings.preservePitch, false);
  assert.equal(settings.repeatMode, 'one');
  assert.equal(settings.shuffle, true);
  assert.equal(settings.volume, 1);

  // Reload from disk to verify atomic persistence
  const reloaded = new YusicStore(dbPath);
  const pl2 = reloaded.getPlaylists().find((p) => p.id === pl.id);
  assert.equal(pl2.name, 'Yolculuk');
  assert.deepEqual(pl2.trackIds, ['t3', 't2']);
  assert.equal(reloaded.getSettings().preservePitch, false);
  assert.equal(reloaded.getSettings().repeatMode, 'one');

  assert.equal(reloaded.deletePlaylist(pl.id), true);
  assert.equal(reloaded.getPlaylists().length, 0);
});

test('YusicStore persists playlist covers/viewModes, track overrides, external prefs, and Spotify auth', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yusic-store-v2-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const dbPath = path.join(dir, 'yusic-db.json');
  const store = new YusicStore(dbPath);
  const pl = store.createPlaylist('Spor');

  store.updatePlaylistDetails(pl.id, {
    description: 'Antrenman şarkıları',
    coverFile: 'pl_abc123.jpg',
    viewMode: 'grid',
    speedOverride: { speed: 1.3, preservePitch: false }
  });

  store.setTrackSpeedOverride('sp_12345', { speed: 1.5, preservePitch: false });
  store.updateExternalListPref('spotify:liked', {
    viewMode: 'compact',
    speedOverride: { speed: 1.15, preservePitch: true },
    coverFile: 'pl_liked.png'
  });
  store.setSpotifyAuth({
    clientId: 'my-client-id',
    accessToken: 'tok_1',
    refreshToken: 'ref_1',
    expiresAt: 1234567890,
    user: { id: 'u1', displayName: 'Yukasu', imageUrl: '' }
  });

  const reloaded = new YusicStore(dbPath);
  const plLoaded = reloaded.getPlaylists().find((p) => p.id === pl.id);
  assert.equal(plLoaded.description, 'Antrenman şarkıları');
  assert.equal(plLoaded.coverFile, 'pl_abc123.jpg');
  assert.equal(plLoaded.viewMode, 'grid');
  assert.deepEqual(plLoaded.speedOverride, { speed: 1.3, preservePitch: false });
  assert.deepEqual(reloaded.getTrackSpeedOverrides()['sp_12345'], { speed: 1.5, preservePitch: false });
  assert.equal(reloaded.getExternalListPrefs()['spotify:liked'].viewMode, 'compact');
  assert.equal(reloaded.getSpotifyAuth().clientId, 'my-client-id');
  assert.equal(reloaded.getSpotifyAuth().user.displayName, 'Yukasu');

  reloaded.clearSpotifyTokens();
  assert.equal(reloaded.getSpotifyAuth().clientId, 'my-client-id');
  assert.equal(reloaded.getSpotifyAuth().accessToken, '');
  assert.equal(reloaded.getSpotifyAuth().user, null);
});
