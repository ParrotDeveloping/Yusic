import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  SPOTIFY_REDIRECT_URI,
  SpotifyAccountManager,
  generateCodeChallenge,
  generateCodeVerifier,
  normalizeSpotifyApiTrack
} from '../src/main/spotifyAccount.js';
import { DEFAULT_SPOTIFY_CLIENT_ID, YusicStore } from '../src/main/store.js';
import { StreamServer, detectAudioMime } from '../src/main/streamServer.js';

test('PKCE helpers generate valid S256 challenge and redirect URI uses 127.0.0.1', () => {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  assert.ok(verifier.length >= 43);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(challenge));
  assert.ok(SPOTIFY_REDIRECT_URI.startsWith('http://127.0.0.1:'));
  assert.equal(SPOTIFY_REDIRECT_URI.includes('localhost'), false);
});

test('normalizeSpotifyApiTrack normalizes Spotify API track payloads cleanly', () => {
  const normalized = normalizeSpotifyApiTrack({
    track: {
      id: 'abc123',
      name: 'Kuzu Kuzu',
      duration_ms: 234000,
      preview_url: 'https://p.scdn.co/mp3-preview/sample',
      artists: [{ name: 'Tarkan' }],
      album: {
        name: 'Karma',
        images: [{ url: 'https://i.scdn.co/image/cover.jpg' }]
      },
      external_urls: { spotify: 'https://open.spotify.com/track/abc123' }
    }
  });

  assert.equal(normalized.id, 'sp_abc123');
  assert.equal(normalized.source, 'spotify');
  assert.equal(normalized.title, 'Kuzu Kuzu');
  assert.equal(normalized.artist, 'Tarkan');
  assert.equal(normalized.album, 'Karma');
  assert.equal(normalized.duration, 234);
  assert.equal(normalized.coverUrl, 'https://i.scdn.co/image/cover.jpg');

  assert.equal(normalizeSpotifyApiTrack({ track: { id: 'loc', is_local: true } }), null);
});

test('SpotifyAccountManager handles token refresh and liked/playlists/search endpoints', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yusic-sp-acct-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new YusicStore(path.join(dir, 'db.json'));
  store.setSpotifyAuth({
    clientId: 'client_123',
    accessToken: 'expired_tok',
    refreshToken: 'refresh_tok',
    expiresAt: Date.now() - 5000, // already expired -> triggers auto refresh!
    user: { id: 'u1', displayName: 'Yukasu', imageUrl: '' }
  });

  const calls = [];
  const mockFetch = async (url, init = {}) => {
    calls.push({ url, auth: init?.headers?.Authorization || null });
    if (url === 'https://accounts.spotify.com/api/token') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'fresh_tok',
          refresh_token: 'refresh_tok_2',
          expires_in: 3600
        })
      };
    }
    if (url.includes('/me/tracks')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          next: null,
          items: [
            {
              track: {
                id: 't1',
                name: 'Gülümse',
                duration_ms: 301000,
                artists: [{ name: 'Sezen Aksu' }],
                album: { name: 'Gülümse', images: [{ url: 'https://img/1.jpg' }] }
              }
            }
          ]
        })
      };
    }
    if (url.includes('/me/playlists')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          next: null,
          items: [
            {
              id: 'pl_sp_1',
              name: 'Favoriler',
              description: '<b>En iyiler</b>',
              owner: { display_name: 'Yukasu' },
              tracks: { total: 12 },
              images: [{ url: 'https://img/pl.jpg' }]
            }
          ]
        })
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const mgr = new SpotifyAccountManager({ store, fetchImpl: mockFetch });
  const liked = await mgr.getLikedSongs();
  assert.equal(liked.total, 1);
  assert.equal(liked.tracks[0].title, 'Gülümse');
  assert.equal(calls[0].url, 'https://accounts.spotify.com/api/token');
  assert.equal(calls[1].auth, 'Bearer fresh_tok');

  const playlists = await mgr.getUserPlaylists();
  assert.equal(playlists.playlists[0].id, 'spotify:pl:pl_sp_1');
  assert.equal(playlists.playlists[0].description, 'En iyiler');
});

test('StreamServer streams external Spotify tracks with Range 206 without writing files to muzik/', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yusic-stream-'));
  const muzikDir = path.join(dir, 'muzik');
  const coversDir = path.join(dir, 'covers');
  fs.mkdirSync(muzikDir, { recursive: true });
  fs.mkdirSync(coversDir, { recursive: true });

  // Local mock upstream audio origin supporting Range requests
  const audioBytes = Buffer.from('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  const upstream = http.createServer((req, res) => {
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : audioBytes.length - 1;
      const chunk = audioBytes.subarray(start, end + 1);
      res.writeHead(206, {
        'Content-Type': 'audio/mpeg',
        'Content-Range': `bytes ${start}-${end}/${audioBytes.length}`,
        'Content-Length': chunk.length,
        'Accept-Ranges': 'bytes'
      });
      res.end(chunk);
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBytes.length,
      'Accept-Ranges': 'bytes'
    });
    res.end(audioBytes);
  });

  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstream.address().port;

  const streamServer = new StreamServer({
    library: null,
    coversDir,
    ffmpegPath: null
  });
  const info = await streamServer.start();

  t.after(async () => {
    await streamServer.stop();
    await new Promise((resolve) => upstream.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const previewUrl = `http://127.0.0.1:${upstreamPort}/preview.mp3`;
  const streamUrl = `${info.url}/stream/spotify/sp_demo?t=${info.token}&title=Demo&artist=Artist&preview=${encodeURIComponent(previewUrl)}`;

  const res = await fetch(streamUrl, { headers: { Range: 'bytes=5-14' } });
  assert.equal(res.status, 206);
  const received = Buffer.from(await res.arrayBuffer());
  assert.equal(received.toString('utf8'), '56789ABCDE');

  // Verify zero files were written to muzikDir
  assert.deepEqual(fs.readdirSync(muzikDir), []);
});

test('SpotifyAccountManager defaults clientId, uses /playlists/{id}/items, and falls back to embed on 403', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yusic-sp-v102-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new YusicStore(path.join(dir, 'db.json'));
  const freshMgr = new SpotifyAccountManager({ store, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  assert.equal(freshMgr.getStatus().clientId, DEFAULT_SPOTIFY_CLIENT_ID);
  assert.equal(DEFAULT_SPOTIFY_CLIENT_ID, 'f7dab3d9716247db8368240742febbf5');

  store.setSpotifyAuth({
    clientId: DEFAULT_SPOTIFY_CLIENT_ID,
    accessToken: 'valid_tok',
    refreshToken: 'ref_tok',
    expiresAt: Date.now() + 3600_000,
    user: { id: 'u1', displayName: 'Yukasu', imageUrl: '' }
  });

  const apiCalls = [];
  const mockFetchItems = async (url) => {
    apiCalls.push(url);
    if (url.endsWith('/v1/playlists/pl123')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'pl123',
          name: 'alwaysjustme',
          description: 'Gece mod',
          owner: { display_name: 'Yukasu' },
          items: { total: 1 },
          images: [{ url: 'https://img/pl123.jpg' }]
        })
      };
    }
    if (url.includes('/v1/playlists/pl123/items')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          next: null,
          items: [
            {
              item: {
                id: 'tr_item_1',
                name: 'chimichanga',
                duration_ms: 79000,
                artists: [{ name: 'porcelain' }],
                album: { name: 'chimichanga', images: [{ url: 'https://img/tr1.jpg' }] }
              }
            }
          ]
        })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const mgrItems = new SpotifyAccountManager({ store, fetchImpl: mockFetchItems });
  const plResult = await mgrItems.getPlaylistTracks('pl123');
  assert.equal(plResult.playlist.name, 'alwaysjustme');
  assert.equal(plResult.tracks.length, 1);
  assert.equal(plResult.tracks[0].title, 'chimichanga');
  assert.equal(plResult.tracks[0].artist, 'porcelain');
  assert.ok(apiCalls.some((u) => u.includes('/v1/playlists/pl123/items')));

  // Test 403 Forbidden fallback to public Spotify embed HTML
  const embedNextData = {
    props: {
      pageProps: {
        state: {
          data: {
            entity: {
              title: 'Restricted List',
              coverArt: { sources: [{ url: 'https://img/embed.jpg' }] },
              trackList: [
                {
                  uri: 'spotify:track:pub999',
                  title: 'Fallback Song',
                  subtitle: 'Embed Artist',
                  duration: 185000
                }
              ]
            }
          }
        }
      }
    }
  };
  const embedHtml = `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    embedNextData
  )}</script></body></html>`;

  const mgr403 = new SpotifyAccountManager({
    store,
    fetchImpl: async (url) => {
      if (url.includes('api.spotify.com/v1/playlists/pl403')) {
        return {
          ok: false,
          status: 403,
          text: async () => JSON.stringify({ error: { status: 403, message: 'Forbidden' } })
        };
      }
      if (url.startsWith('https://open.spotify.com/embed/playlist/pl403')) {
        return {
          ok: true,
          status: 200,
          text: async () => embedHtml
        };
      }
      throw new Error(`Unexpected fallback fetch URL: ${url}`);
    }
  });

  const fallbackRes = await mgr403.getPlaylistTracks('pl403');
  assert.equal(fallbackRes.playlist.name, 'Restricted List');
  assert.equal(fallbackRes.tracks.length, 1);
  assert.equal(fallbackRes.tracks[0].title, 'Fallback Song');
  assert.equal(fallbackRes.tracks[0].artist, 'Embed Artist');
});

test('SpotifyAccountManager supports v1.0.3 Feb-2026 playlist CRUD, library, top/albums/artist, and search', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yusic-sp-v103-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new YusicStore(path.join(dir, 'db.json'));
  store.setSpotifyAuth({
    clientId: DEFAULT_SPOTIFY_CLIENT_ID,
    accessToken: 'tok_v103',
    refreshToken: 'ref_v103',
    expiresAt: Date.now() + 3600_000,
    scopes: ['playlist-modify-public', 'playlist-modify-private', 'user-library-modify', 'user-top-read'],
    user: { id: 'u_yukasu', displayName: 'Yukasu', imageUrl: '' }
  });

  const requests = [];
  const mockFetch = async (url, init = {}) => {
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(init.body) : null;
    requests.push({ url, method, body });

    if (url.endsWith('/v1/me/playlists') && method === 'POST') {
      return {
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            id: 'new_pl_1',
            name: body.name,
            description: body.description,
            public: body.public,
            owner: { id: 'u_yukasu', display_name: 'Yukasu' },
            items: { total: 0 }
          })
      };
    }
    if (url.endsWith('/v1/playlists/new_pl_1') && method === 'PUT') {
      return { ok: true, status: 200, text: async () => '' };
    }
    if (url.endsWith('/v1/playlists/new_pl_1/items') && method === 'POST') {
      return { ok: true, status: 201, text: async () => JSON.stringify({ snapshot_id: 'snap_1' }) };
    }
    if (url.endsWith('/v1/playlists/new_pl_1/items') && method === 'PUT') {
      return { ok: true, status: 200, text: async () => JSON.stringify({ snapshot_id: 'snap_2' }) };
    }
    if (url.endsWith('/v1/playlists/new_pl_1/items') && method === 'DELETE') {
      return { ok: true, status: 200, text: async () => JSON.stringify({ snapshot_id: 'snap_3' }) };
    }
    if (url.includes('/v1/me/library/contains')) {
      return { ok: true, status: 200, text: async () => JSON.stringify([true, false]) };
    }
    if (url.includes('/v1/me/library?') && (method === 'PUT' || method === 'DELETE')) {
      return { ok: true, status: 200, text: async () => '' };
    }
    if (url.includes('/v1/me/top/tracks')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            items: [{ id: 'top1', name: 'Top Song', artists: [{ id: 'a1', name: 'Art' }], album: { id: 'al1', name: 'Alb' }, duration_ms: 120000 }]
          })
      };
    }
    if (url.includes('/v1/me/top/artists')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: [{ id: 'a1', name: 'Art', genres: ['indie'] }] })
      };
    }
    if (url.includes('/v1/me/albums')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ total: 1, items: [{ album: { id: 'al1', name: 'Saved Alb', artists: [{ id: 'a1', name: 'Art' }], total_tracks: 8 } }] })
      };
    }
    if (url.endsWith('/v1/albums/al1')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 'al1',
          name: 'Saved Alb',
          artists: [{ id: 'a1', name: 'Art' }],
          images: [{ url: 'https://img/alb.jpg' }],
          tracks: { items: [{ id: 'tr_a1', name: 'Track One', artists: [{ id: 'a1', name: 'Art' }], duration_ms: 90000 }] }
        })
      };
    }
    if (url.endsWith('/v1/artists/a1')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'a1', name: 'Art', genres: ['indie'] }) };
    }
    if (url.includes('/v1/artists/a1/albums')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ items: [{ id: 'al1', name: 'Saved Alb', artists: [{ id: 'a1', name: 'Art' }] }] }) };
    }
    if (url.includes('/v1/search?')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          tracks: { items: [{ id: 'tr_s1', name: 'Search Song', artists: [{ id: 'a1', name: 'Art' }], duration_ms: 100000 }] },
          albums: { items: [{ id: 'al1', name: 'Saved Alb', artists: [{ id: 'a1', name: 'Art' }] }] },
          artists: { items: [{ id: 'a1', name: 'Art' }] },
          playlists: { items: [{ id: 'p_s1', name: 'Search PL', owner: { id: 'other', display_name: 'Other' }, items: { total: 5 } }] }
        })
      };
    }
    throw new Error(`Unexpected URL ${method} ${url}`);
  };

  const mgr = new SpotifyAccountManager({ store, fetchImpl: mockFetch });
  assert.equal(mgr.getStatus().hasWriteScopes, true);

  const created = await mgr.createPlaylist({ name: 'Gece', description: 'Chill', isPublic: false });
  assert.equal(created.spotifyPlaylistId, 'new_pl_1');
  assert.equal(created.isOwner, true);

  await mgr.updatePlaylistDetails('new_pl_1', { name: 'Gece v2' });
  await mgr.addItemsToPlaylist('new_pl_1', ['spotify:track:t1']);
  await mgr.reorderPlaylistItems('new_pl_1', { rangeStart: 0, insertBefore: 2 });
  await mgr.removeItemsFromPlaylist('new_pl_1', ['spotify:track:t1']);
  await mgr.unfollowPlaylist('new_pl_1');

  const delItemsReq = requests.find((r) => r.url.endsWith('/items') && r.method === 'DELETE');
  assert.deepEqual(delItemsReq.body, { items: [{ uri: 'spotify:track:t1' }] });

  await mgr.saveLibraryItems(['spotify:track:t1']);
  const libMap = await mgr.checkLibraryContains(['spotify:track:t1', 'spotify:track:t2']);
  assert.deepEqual(libMap, { 'spotify:track:t1': true, 'spotify:track:t2': false });

  const topTracks = await mgr.getTopTracks();
  const topArtists = await mgr.getTopArtists();
  const savedAlbums = await mgr.getSavedAlbums();
  const albumDetails = await mgr.getAlbumDetails('al1');
  const artistDetails = await mgr.getArtistDetails('a1');
  const catalog = await mgr.searchCatalog('art', { limit: 50 }); // verifies Feb 2026 limit=10 clamp!

  assert.equal(topTracks.tracks[0].title, 'Top Song');
  assert.equal(topArtists.artists[0].name, 'Art');
  assert.equal(savedAlbums.albums[0].name, 'Saved Alb');
  assert.equal(albumDetails.tracks[0].coverUrl, 'https://img/alb.jpg');
  assert.equal(artistDetails.albums[0].name, 'Saved Alb');
  assert.equal(catalog.playlists[0].name, 'Search PL');
  const searchReq = requests.find((r) => r.url.includes('/v1/search?'));
  assert.ok(searchReq.url.includes('limit=10'));
});

test('detectAudioMime and StreamServer in-memory buffer Range 206 streaming', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yusic-buf-stream-'));
  const coversDir = path.join(dir, 'covers');
  fs.mkdirSync(coversDir, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const fakeMp4 = Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('mp42TESTDATA_0123456789ABCDEF')]);
  assert.equal(detectAudioMime(fakeMp4), 'audio/mp4');
  assert.equal(detectAudioMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])), 'audio/webm');

  const srv = new StreamServer({ library: null, coversDir, ffmpegPath: null });
  const info = await srv.start();
  t.after(async () => srv.stop());

  srv._setCachedBuffer('sp_buf_1', {
    kind: 'buffer',
    buffer: fakeMp4,
    contentType: 'audio/mp4',
    expiresAt: Date.now() + 60_000
  });

  const url = `${info.url}/stream/spotify/sp_buf_1?t=${info.token}&title=Loser&artist=Wifi`;
  const res = await fetch(url, { headers: { Range: 'bytes=4-15' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-type'), 'audio/mp4');
  const out = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(out, fakeMp4.subarray(4, 16));
});
