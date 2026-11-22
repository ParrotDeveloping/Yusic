import http from 'node:http';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { resolveSpotifyUrl } from './spotifyResolver.js';
import { DEFAULT_SPOTIFY_CLIENT_ID } from './store.js';

export { DEFAULT_SPOTIFY_CLIENT_ID };

export const SPOTIFY_CALLBACK_PORT = 43821;
export const SPOTIFY_REDIRECT_URI = `http://127.0.0.1:${SPOTIFY_CALLBACK_PORT}/callback`;
export const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-recently-played',
  'user-top-read',
  'user-follow-read',
  'user-follow-modify'
];

export const REQUIRED_WRITE_SCOPES = [
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-modify',
  'user-top-read'
];

const TIME_RANGES = new Set(['short_term', 'medium_term', 'long_term']);

export function generateCodeVerifier() {
  return crypto.randomBytes(48).toString('base64url');
}

export function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(String(verifier)).digest('base64url');
}

export function normalizeSpotifyApiTrack(item, fallbackAlbum = null) {
  const t = item?.item || item?.track || item;
  if (!t || !t.id || item?.is_local || t.is_local || (t.type && t.type !== 'track')) return null;

  const artistsArr = Array.isArray(t.artists) ? t.artists : [];
  const artistsList = artistsArr
    .map((a) => ({ id: String(a?.id || ''), name: String(a?.name || '').trim() }))
    .filter((a) => Boolean(a.name));
  const artistNames = artistsList.map((a) => a.name).join(', ');

  const albumObj = t.album || fallbackAlbum || null;
  const images = Array.isArray(albumObj?.images) ? albumObj.images : [];
  const coverUrl = images[0]?.url || images[images.length - 1]?.url || '';
  const durationMs = Number(t.duration_ms) || 0;
  const spUrl = String(t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`);

  return {
    id: `sp_${t.id}`,
    source: 'spotify',
    spotifyId: String(t.id),
    uri: String(t.uri || `spotify:track:${t.id}`),
    title: String(t.name || 'Adsız Şarkı'),
    artist: artistNames || 'Bilinmeyen Sanatçı',
    artistId: artistsList[0]?.id || '',
    artistsList,
    album: String(albumObj?.name || ''),
    albumId: String(albumObj?.id || ''),
    duration: Math.round(durationMs / 1000),
    durationMs,
    coverUrl: String(coverUrl || ''),
    previewUrl: String(t.preview_url || ''),
    spotifyUrl: spUrl,
    externalUrl: spUrl
  };
}

function normalizeSpotifyPlaylist(p, currentUserId = '') {
  const ownerId = String(p.owner?.id || '');
  return {
    id: `spotify:pl:${p.id}`,
    spotifyPlaylistId: String(p.id),
    uri: String(p.uri || `spotify:playlist:${p.id}`),
    name: String(p.name || 'Adsız Liste'),
    description: String(p.description || '').replace(/<[^>]+>/g, ''),
    ownerId,
    ownerName: String(p.owner?.display_name || ownerId || ''),
    isPublic: p.public !== false,
    collaborative: Boolean(p.collaborative),
    isOwner: Boolean(currentUserId && ownerId && ownerId === currentUserId),
    trackCount: Number(p.items?.total ?? p.tracks?.total ?? 0),
    coverUrl: String(p.images?.[0]?.url || ''),
    externalUrl: String(p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`)
  };
}

function normalizeSpotifyAlbum(a) {
  if (!a || !a.id) return null;
  const artistsArr = Array.isArray(a.artists) ? a.artists : [];
  const primaryArtist = artistsArr[0];
  const images = Array.isArray(a.images) ? a.images : [];
  return {
    id: `spotify:album:${a.id}`,
    albumId: String(a.id),
    uri: String(a.uri || `spotify:album:${a.id}`),
    name: String(a.name || 'Adsız Albüm'),
    artist: artistsArr.map((x) => x?.name).filter(Boolean).join(', ') || 'Bilinmeyen Sanatçı',
    artistId: String(primaryArtist?.id || ''),
    coverUrl: String(images[0]?.url || images[images.length - 1]?.url || ''),
    releaseDate: String(a.release_date || ''),
    totalTracks: Number(a.total_tracks) || 0,
    externalUrl: String(a.external_urls?.spotify || `https://open.spotify.com/album/${a.id}`)
  };
}

function normalizeSpotifyArtist(a) {
  if (!a || !a.id) return null;
  const images = Array.isArray(a.images) ? a.images : [];
  return {
    id: `spotify:artist:${a.id}`,
    artistId: String(a.id),
    uri: String(a.uri || `spotify:artist:${a.id}`),
    name: String(a.name || 'Sanatçı'),
    imageUrl: String(images[0]?.url || images[images.length - 1]?.url || ''),
    genres: Array.isArray(a.genres) ? a.genres.slice(0, 3) : [],
    externalUrl: String(a.external_urls?.spotify || `https://open.spotify.com/artist/${a.id}`)
  };
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function callbackHtmlPage({ ok, title, message }) {
  const accent = ok ? '#38bdf8' : '#ef4444';
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>Yusic — Spotify Bağlantısı</title>
  <style>
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      background: #060911; color: #f8fafc;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    .card {
      max-width: 440px; padding: 32px; border-radius: 16px;
      background: #0f172a; border: 1px solid rgba(56, 189, 248, 0.24);
      text-align: center;
    }
    .dot {
      width: 52px; height: 52px; margin: 0 auto 16px; border-radius: 50%;
      display: grid; place-items: center; font-size: 24px; font-weight: 700;
      background: ${accent}; color: #06101f;
    }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="dot">${ok ? '✓' : '!'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

export class SpotifyAccountManager extends EventEmitter {
  constructor({ store, openExternalFn = null, fetchImpl = fetch } = {}) {
    super();
    this.store = store;
    this.openExternalFn = openExternalFn;
    this.fetchImpl = fetchImpl;
    this._pendingServer = null;
    this._pendingTimer = null;
  }

  getStatus() {
    const auth = this.store.getSpotifyAuth();
    const scopes = Array.isArray(auth.scopes) ? auth.scopes : [];
    const hasWriteScopes = REQUIRED_WRITE_SCOPES.every((s) => scopes.includes(s));
    return {
      connected: Boolean(auth.accessToken && auth.user),
      clientId: auth.clientId || DEFAULT_SPOTIFY_CLIENT_ID,
      user: auth.user ? { ...auth.user } : null,
      scopes,
      hasWriteScopes,
      redirectUri: SPOTIFY_REDIRECT_URI
    };
  }

  setClientId(clientId) {
    this.store.setSpotifyAuth({
      clientId: String(clientId || '').trim() || DEFAULT_SPOTIFY_CLIENT_ID
    });
    const status = this.getStatus();
    this.emit('auth-changed', status);
    return status;
  }

  resetClientId() {
    return this.setClientId(DEFAULT_SPOTIFY_CLIENT_ID);
  }

  logout() {
    this._cleanupPendingLogin();
    this.store.clearSpotifyTokens();
    const status = this.getStatus();
    this.emit('auth-changed', status);
    return status;
  }

  _cleanupPendingLogin() {
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
    if (this._pendingServer) {
      try {
        this._pendingServer.close();
      } catch {
        // Ignore already closed
      }
      this._pendingServer = null;
    }
  }

  async startLogin(clientIdInput, { forceDialog = false } = {}) {
    const cleanClientId =
      String(clientIdInput ?? this.store.getSpotifyAuth().clientId ?? DEFAULT_SPOTIFY_CLIENT_ID).trim() ||
      DEFAULT_SPOTIFY_CLIENT_ID;
    this.store.setSpotifyAuth({ clientId: cleanClientId });

    this._cleanupPendingLogin();

    const stateToken = crypto.randomBytes(16).toString('hex');
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('client_id', cleanClientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', SPOTIFY_REDIRECT_URI);
    authUrl.searchParams.set('scope', SPOTIFY_SCOPES.join(' '));
    authUrl.searchParams.set('state', stateToken);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    if (forceDialog) {
      authUrl.searchParams.set('show_dialog', 'true');
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const finishError = (err) => {
        if (settled) return;
        settled = true;
        this._cleanupPendingLogin();
        reject(err);
      };

      const server = http.createServer(async (req, res) => {
        let parsed;
        try {
          parsed = new URL(req.url, `http://127.0.0.1:${SPOTIFY_CALLBACK_PORT}`);
        } catch {
          res.writeHead(400);
          res.end('Bad Request');
          return;
        }

        if (parsed.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const errParam = parsed.searchParams.get('error');
        const code = parsed.searchParams.get('code');
        const returnedState = parsed.searchParams.get('state');

        if (errParam) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            callbackHtmlPage({
              ok: false,
              title: 'Bağlantı İptal Edildi',
              message: `Spotify oturumu onaylanmadı (${errParam}). Bu sekmeyi kapatabilirsiniz.`
            })
          );
          finishError(new Error(`Spotify girişi iptal edildi: ${errParam}`));
          return;
        }

        if (!code || returnedState !== stateToken) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            callbackHtmlPage({
              ok: false,
              title: 'Geçersiz Doğrulama',
              message: 'Güvenlik doğrulaması eşleşmedi. Lütfen Yusic içinden tekrar deneyin.'
            })
          );
          finishError(new Error('Spotify OAuth state doğrulaması başarısız oldu.'));
          return;
        }

        try {
          const tokenBody = new URLSearchParams({
            client_id: cleanClientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: SPOTIFY_REDIRECT_URI,
            code_verifier: codeVerifier
          });

          const tokenRes = await this.fetchImpl('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody.toString()
          });
          const tokenJson = await tokenRes.json();
          if (!tokenRes.ok || !tokenJson.access_token) {
            throw new Error(tokenJson.error_description || tokenJson.error || 'Token alınamadı.');
          }

          const grantedScopes = String(tokenJson.scope || SPOTIFY_SCOPES.join(' '))
            .split(/\s+/)
            .filter(Boolean);

          const meRes = await this.fetchImpl('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${tokenJson.access_token}` }
          });
          if (!meRes.ok) {
            throw new Error(`Spotify profil bilgisi alınamadı (HTTP ${meRes.status}).`);
          }
          const me = await meRes.json();

          this.store.setSpotifyAuth({
            clientId: cleanClientId,
            accessToken: tokenJson.access_token,
            refreshToken: tokenJson.refresh_token || '',
            expiresAt: Date.now() + (Number(tokenJson.expires_in) || 3600) * 1000,
            scopes: grantedScopes,
            user: {
              id: String(me.id || ''),
              displayName: String(me.display_name || me.id || 'Spotify Kullanıcısı'),
              imageUrl: String(me.images?.[0]?.url || '')
            }
          });

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            callbackHtmlPage({
              ok: true,
              title: 'Spotify Hesabın Bağlandı!',
              message:
                'Listelerin, beğenilen şarkıların ve tüm Spotify kontrolleri artık Yusic içinde hazır. Bu sekmeyi kapatabilirsin.'
            })
          );

          if (!settled) {
            settled = true;
            this._cleanupPendingLogin();
            const status = this.getStatus();
            this.emit('auth-changed', status);
            resolve(status);
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            callbackHtmlPage({
              ok: false,
              title: 'Bağlantı Hatası',
              message: err?.message || 'Spotify oturumu tamamlanamadı.'
            })
          );
          finishError(err);
        }
      });

      server.on('error', (err) => {
        finishError(
          new Error(
            err?.code === 'EADDRINUSE'
              ? `Port ${SPOTIFY_CALLBACK_PORT} başka bir işlem tarafından kullanılıyor.`
              : err?.message || 'Spotify geri dönüş sunucusu başlatılamadı.'
          )
        );
      });

      this._pendingServer = server;
      this._pendingTimer = setTimeout(() => {
        finishError(new Error('Spotify giriş süresi doldu (3 dakika). Lütfen tekrar deneyin.'));
      }, 3 * 60 * 1000);

      server.listen(SPOTIFY_CALLBACK_PORT, '127.0.0.1', async () => {
        try {
          if (this.openExternalFn) {
            await this.openExternalFn(authUrl.toString());
          }
        } catch (err) {
          finishError(err);
        }
      });
    });
  }

  async _refreshAccessToken() {
    const auth = this.store.getSpotifyAuth();
    if (!auth.refreshToken || !auth.clientId) {
      this.store.clearSpotifyTokens();
      this.emit('auth-changed', this.getStatus());
      throw new Error('Spotify oturumu sona erdi. Lütfen tekrar bağlanın.');
    }

    const body = new URLSearchParams({
      client_id: auth.clientId,
      grant_type: 'refresh_token',
      refresh_token: auth.refreshToken
    });

    const res = await this.fetchImpl('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const json = await res.json();
    if (!res.ok || !json.access_token) {
      this.store.clearSpotifyTokens();
      this.emit('auth-changed', this.getStatus());
      throw new Error('Spotify oturumu yenilenemedi. Lütfen tekrar bağlanın.');
    }

    const patch = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || auth.refreshToken,
      expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000
    };
    if (json.scope) {
      patch.scopes = String(json.scope).split(/\s+/).filter(Boolean);
    }
    this.store.setSpotifyAuth(patch);
    return json.access_token;
  }

  async getValidAccessToken() {
    const auth = this.store.getSpotifyAuth();
    if (!auth.accessToken) {
      throw new Error('Spotify hesabı bağlı değil.');
    }
    if (auth.expiresAt && Date.now() >= auth.expiresAt - 60000) {
      return this._refreshAccessToken();
    }
    return auth.accessToken;
  }

  async _apiRequest(endpoint, { method = 'GET', body = undefined } = {}) {
    let token = await this.getValidAccessToken();
    const url = endpoint.startsWith('http') ? endpoint : `https://api.spotify.com/v1${endpoint}`;

    const doFetch = (tok) => {
      const headers = { Authorization: `Bearer ${tok}` };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      return this.fetchImpl(url, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
    };

    let res = await doFetch(token);
    if (res.status === 401) {
      token = await this._refreshAccessToken();
      res = await doFetch(token);
    }

    if (!res.ok) {
      let msg = `Spotify API hatası (HTTP ${res.status})`;
      try {
        if (typeof res.text === 'function') {
          const raw = await res.text();
          if (raw) {
            const errJson = JSON.parse(raw);
            if (errJson?.error?.message) msg = errJson.error.message;
          }
        } else if (typeof res.json === 'function') {
          const errJson = await res.json();
          if (errJson?.error?.message) msg = errJson.error.message;
        }
      } catch {
        // Ignore parse error
      }
      if (res.status === 403 && method !== 'GET') {
        msg = 'Spotify yazma izni eksik — "Yetkileri Güncelle" ile yeniden bağlanın.';
      }
      const err = new Error(msg);
      err.statusCode = res.status;
      throw err;
    }

    if (res.status === 204) return {};
    if (typeof res.text === 'function') {
      const text = await res.text();
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    }
    if (typeof res.json === 'function') {
      return res.json();
    }
    return {};
  }

  async _apiGet(endpoint) {
    return this._apiRequest(endpoint, { method: 'GET' });
  }

  async getLikedSongs({ limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const data = await this._apiGet(`/me/tracks?limit=${safeLimit}&offset=${safeOffset}`);
    const tracks = (data.items || []).map((entry) => normalizeSpotifyApiTrack(entry)).filter(Boolean);
    return {
      total: Number(data.total) || tracks.length,
      offset: safeOffset,
      limit: safeLimit,
      hasMore: Boolean(data.next),
      tracks
    };
  }

  async getUserPlaylists({ limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const currentUserId = this.store.getSpotifyAuth().user?.id || '';
    const data = await this._apiGet(`/me/playlists?limit=${safeLimit}&offset=${safeOffset}`);
    const playlists = (data.items || [])
      .filter((p) => p && p.id)
      .map((p) => normalizeSpotifyPlaylist(p, currentUserId));
    return {
      total: Number(data.total) || playlists.length,
      offset: safeOffset,
      limit: safeLimit,
      hasMore: Boolean(data.next),
      playlists
    };
  }

  async getPlaylistTracks(spotifyPlaylistId, { limit = 100, offset = 0 } = {}) {
    const rawId = String(spotifyPlaylistId || '').trim();
    const safeId = encodeURIComponent(rawId);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 100));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const currentUserId = this.store.getSpotifyAuth().user?.id || '';

    let playlistHeader = null;
    let embeddedMeta = null;
    if (safeOffset === 0) {
      try {
        embeddedMeta = await this._apiGet(`/playlists/${safeId}`);
        playlistHeader = normalizeSpotifyPlaylist(embeddedMeta, currentUserId);
      } catch (metaErr) {
        if (metaErr?.statusCode !== 403 && metaErr?.statusCode !== 404) {
          throw metaErr;
        }
      }
    }

    try {
      const data = await this._apiGet(`/playlists/${safeId}/items?limit=${safeLimit}&offset=${safeOffset}`);
      const rawItems = Array.isArray(data.items) ? data.items : [];
      const tracks = rawItems.map((entry) => normalizeSpotifyApiTrack(entry)).filter(Boolean);
      return {
        playlist: playlistHeader,
        total: Number(data.total) || playlistHeader?.trackCount || tracks.length,
        offset: safeOffset,
        limit: safeLimit,
        hasMore: Boolean(data.next),
        tracks
      };
    } catch (itemsErr) {
      const status = itemsErr?.statusCode;
      if (status !== 403 && status !== 404 && status !== 400) {
        throw itemsErr;
      }

      const embeddedContainer = embeddedMeta?.items || embeddedMeta?.tracks;
      if (safeOffset === 0 && Array.isArray(embeddedContainer?.items) && embeddedContainer.items.length > 0) {
        const tracks = embeddedContainer.items.map((entry) => normalizeSpotifyApiTrack(entry)).filter(Boolean);
        return {
          playlist: playlistHeader,
          total: Number(embeddedContainer.total) || tracks.length,
          offset: 0,
          limit: safeLimit,
          hasMore: Boolean(embeddedContainer.next),
          tracks
        };
      }

      try {
        const pub = await this.openPublicSpotifyLink(`https://open.spotify.com/playlist/${rawId}`);
        return {
          playlist: playlistHeader || {
            id: `spotify:pl:${rawId}`,
            spotifyPlaylistId: rawId,
            uri: `spotify:playlist:${rawId}`,
            name: pub.name,
            description: pub.truncatedAt100 ? 'Herkese açık listeden ilk 100 şarkı' : '',
            ownerId: '',
            ownerName: '',
            isPublic: true,
            collaborative: false,
            isOwner: false,
            trackCount: pub.tracks.length,
            coverUrl: pub.coverUrl
          },
          total: pub.tracks.length,
          offset: 0,
          limit: safeLimit,
          hasMore: false,
          tracks: pub.tracks
        };
      } catch {
        throw itemsErr;
      }
    }
  }

  async createPlaylist({ name, description = '', isPublic = false } = {}) {
    const cleanName = String(name || '').trim() || 'Yeni Playlist';
    const cleanDesc = String(description || '').trim();
    const currentUserId = this.store.getSpotifyAuth().user?.id || '';
    const created = await this._apiRequest('/me/playlists', {
      method: 'POST',
      body: {
        name: cleanName,
        description: cleanDesc,
        public: Boolean(isPublic),
        collaborative: false
      }
    });
    return normalizeSpotifyPlaylist(created, currentUserId);
  }

  async updatePlaylistDetails(spotifyPlaylistId, { name, description, isPublic } = {}) {
    const safeId = encodeURIComponent(String(spotifyPlaylistId || '').trim());
    const body = {};
    if (name !== undefined) {
      const cleanName = String(name || '').trim();
      if (cleanName) body.name = cleanName;
    }
    if (description !== undefined) {
      body.description = String(description || '').trim();
    }
    if (isPublic !== undefined) {
      body.public = Boolean(isPublic);
    }
    await this._apiRequest(`/playlists/${safeId}`, { method: 'PUT', body });
    return { ok: true };
  }

  async unfollowPlaylist(spotifyPlaylistId) {
    const rawId = String(spotifyPlaylistId || '').trim();
    const safeId = encodeURIComponent(rawId);
    const playlistUri = `spotify:playlist:${rawId}`;
    try {
      await this._apiRequest(`/me/library?uris=${encodeURIComponent(playlistUri)}`, {
        method: 'DELETE'
      });
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 400) {
        await this._apiRequest(`/playlists/${safeId}/followers`, { method: 'DELETE' });
      } else {
        throw err;
      }
    }
    return { ok: true };
  }

  async addItemsToPlaylist(spotifyPlaylistId, uris = [], { position = undefined } = {}) {
    const safeId = encodeURIComponent(String(spotifyPlaylistId || '').trim());
    const validUris = (uris || []).map((u) => String(u || '').trim()).filter(Boolean);
    if (validUris.length === 0) return { snapshotId: null };

    let snapshotId = null;
    for (const chunk of chunkArray(validUris, 100)) {
      const body = { uris: chunk };
      if (Number.isInteger(position) && position >= 0) {
        body.position = position;
      }
      const res = await this._apiRequest(`/playlists/${safeId}/items`, {
        method: 'POST',
        body
      });
      if (res?.snapshot_id) snapshotId = res.snapshot_id;
    }
    return { snapshotId };
  }

  async removeItemsFromPlaylist(spotifyPlaylistId, uris = []) {
    const safeId = encodeURIComponent(String(spotifyPlaylistId || '').trim());
    const validUris = (uris || []).map((u) => String(u || '').trim()).filter(Boolean);
    if (validUris.length === 0) return { snapshotId: null };

    let snapshotId = null;
    for (const chunk of chunkArray(validUris, 100)) {
      const res = await this._apiRequest(`/playlists/${safeId}/items`, {
        method: 'DELETE',
        body: {
          items: chunk.map((uri) => ({ uri }))
        }
      });
      if (res?.snapshot_id) snapshotId = res.snapshot_id;
    }
    return { snapshotId };
  }

  async reorderPlaylistItems(spotifyPlaylistId, { rangeStart, insertBefore, rangeLength = 1, snapshotId = undefined } = {}) {
    const safeId = encodeURIComponent(String(spotifyPlaylistId || '').trim());
    const body = {
      range_start: Number(rangeStart) || 0,
      insert_before: Number(insertBefore) || 0,
      range_length: Math.max(1, Number(rangeLength) || 1)
    };
    if (snapshotId) body.snapshot_id = snapshotId;
    const res = await this._apiRequest(`/playlists/${safeId}/items`, {
      method: 'PUT',
      body
    });
    return { snapshotId: res?.snapshot_id || null };
  }

  async saveLibraryItems(uris = []) {
    const validUris = (uris || []).map((u) => String(u || '').trim()).filter(Boolean);
    for (const chunk of chunkArray(validUris, 40)) {
      await this._apiRequest(`/me/library?uris=${encodeURIComponent(chunk.join(','))}`, {
        method: 'PUT'
      });
    }
    return { ok: true };
  }

  async removeLibraryItems(uris = []) {
    const validUris = (uris || []).map((u) => String(u || '').trim()).filter(Boolean);
    for (const chunk of chunkArray(validUris, 40)) {
      await this._apiRequest(`/me/library?uris=${encodeURIComponent(chunk.join(','))}`, {
        method: 'DELETE'
      });
    }
    return { ok: true };
  }

  async checkLibraryContains(uris = []) {
    const validUris = [...new Set((uris || []).map((u) => String(u || '').trim()).filter(Boolean))];
    const map = {};
    for (const chunk of chunkArray(validUris, 40)) {
      const res = await this._apiGet(`/me/library/contains?uris=${encodeURIComponent(chunk.join(','))}`);
      const flags = Array.isArray(res) ? res : [];
      chunk.forEach((uri, idx) => {
        map[uri] = Boolean(flags[idx]);
      });
    }
    return map;
  }

  async getTopTracks({ timeRange = 'short_term', limit = 30 } = {}) {
    const safeRange = TIME_RANGES.has(timeRange) ? timeRange : 'short_term';
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 30));
    const data = await this._apiGet(`/me/top/tracks?time_range=${safeRange}&limit=${safeLimit}`);
    const tracks = (data.items || []).map((entry) => normalizeSpotifyApiTrack(entry)).filter(Boolean);
    return { tracks, timeRange: safeRange };
  }

  async getTopArtists({ timeRange = 'short_term', limit = 20 } = {}) {
    const safeRange = TIME_RANGES.has(timeRange) ? timeRange : 'short_term';
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    const data = await this._apiGet(`/me/top/artists?time_range=${safeRange}&limit=${safeLimit}`);
    const artists = (data.items || []).map(normalizeSpotifyArtist).filter(Boolean);
    return { artists, timeRange: safeRange };
  }

  async getSavedAlbums({ limit = 30, offset = 0 } = {}) {
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 30));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const data = await this._apiGet(`/me/albums?limit=${safeLimit}&offset=${safeOffset}`);
    const albums = (data.items || [])
      .map((entry) => normalizeSpotifyAlbum(entry?.album || entry))
      .filter(Boolean);
    return {
      total: Number(data.total) || albums.length,
      offset: safeOffset,
      limit: safeLimit,
      hasMore: Boolean(data.next),
      albums
    };
  }

  async getAlbumDetails(albumId) {
    const rawId = String(albumId || '').trim();
    const safeId = encodeURIComponent(rawId);
    const albumData = await this._apiGet(`/albums/${safeId}`);
    const album = normalizeSpotifyAlbum(albumData);

    let rawItems = Array.isArray(albumData?.tracks?.items) ? albumData.tracks.items : [];
    if (rawItems.length === 0) {
      const trRes = await this._apiGet(`/albums/${safeId}/tracks?limit=50`);
      rawItems = Array.isArray(trRes?.items) ? trRes.items : [];
    }

    const tracks = rawItems.map((entry) => normalizeSpotifyApiTrack(entry, albumData)).filter(Boolean);

    let isSaved = false;
    try {
      const checkMap = await this.checkLibraryContains([`spotify:album:${rawId}`]);
      isSaved = Boolean(checkMap[`spotify:album:${rawId}`]);
    } catch {
      // Optional status check
    }

    return { album, tracks, isSaved };
  }

  async getArtistDetails(artistId) {
    const rawId = String(artistId || '').trim();
    const safeId = encodeURIComponent(rawId);
    const artistData = await this._apiGet(`/artists/${safeId}`);
    const artist = normalizeSpotifyArtist(artistData);

    let albums = [];
    try {
      const albumsData = await this._apiGet(`/artists/${safeId}/albums?limit=20&include_groups=album,single`);
      albums = (albumsData?.items || []).map(normalizeSpotifyAlbum).filter(Boolean);
    } catch {
      albums = [];
    }

    // Feb 2026 removed GET /artists/{id}/top-tracks -> search tracks by exact artist query
    let tracks = [];
    if (artist?.name) {
      try {
        const searchRes = await this.searchCatalog(`artist:"${artist.name}"`, {
          types: ['track'],
          limit: 10
        });
        tracks = searchRes.tracks;
      } catch {
        tracks = [];
      }
    }

    let isFollowing = false;
    try {
      const checkMap = await this.checkLibraryContains([`spotify:artist:${rawId}`]);
      isFollowing = Boolean(checkMap[`spotify:artist:${rawId}`]);
    } catch {
      // Optional status check
    }

    return { artist, albums, tracks, isFollowing };
  }

  async getRecentlyPlayed({ limit = 30 } = {}) {
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 30));
    const data = await this._apiGet(`/me/player/recently-played?limit=${safeLimit}`);
    const seen = new Set();
    const tracks = [];
    for (const item of data.items || []) {
      const norm = normalizeSpotifyApiTrack(item);
      if (norm && !seen.has(norm.id)) {
        seen.add(norm.id);
        tracks.push(norm);
      }
    }
    return { tracks };
  }

  async searchCatalog(
    query,
    { types = ['track', 'album', 'artist', 'playlist'], limit = 10, offset = 0 } = {}
  ) {
    const q = String(query || '').trim();
    if (!q) return { tracks: [], albums: [], artists: [], playlists: [] };

    // Spotify Feb 2026 Search cap: limit must be 1..10
    const safeLimit = Math.min(10, Math.max(1, Number(limit) || 10));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const validTypes = ['track', 'album', 'artist', 'playlist'];
    const typeList = (Array.isArray(types) ? types : [types]).filter((t) => validTypes.includes(t));
    const finalTypes = typeList.length > 0 ? typeList.join(',') : 'track,album,artist,playlist';

    const currentUserId = this.store.getSpotifyAuth().user?.id || '';
    const data = await this._apiGet(
      `/search?type=${finalTypes}&limit=${safeLimit}&offset=${safeOffset}&q=${encodeURIComponent(q)}`
    );

    const tracks = (data.tracks?.items || []).map((entry) => normalizeSpotifyApiTrack(entry)).filter(Boolean);
    const albums = (data.albums?.items || []).map(normalizeSpotifyAlbum).filter(Boolean);
    const artists = (data.artists?.items || []).map(normalizeSpotifyArtist).filter(Boolean);
    const playlists = (data.playlists?.items || [])
      .filter((p) => p && p.id)
      .map((p) => normalizeSpotifyPlaylist(p, currentUserId));

    return { tracks, albums, artists, playlists };
  }

  async searchTracks(query, { limit = 10, offset = 0 } = {}) {
    const res = await this.searchCatalog(query, { types: ['track'], limit, offset });
    return { tracks: res.tracks };
  }

  async openPublicSpotifyLink(rawUrl) {
    const resolved = await resolveSpotifyUrl(rawUrl, this.fetchImpl);
    const listId = `spotify:public:${resolved.type}:${resolved.id}`;
    const tracks = resolved.tracks.map((t, idx) => {
      const fallbackHash = crypto
        .createHash('sha1')
        .update(`${t.artist}|${t.title}|${idx}`)
        .digest('hex')
        .slice(0, 12);
      const spId = t.spotifyId || '';
      const spUrl = spId ? `https://open.spotify.com/track/${spId}` : '';
      return {
        id: spId ? `sp_${spId}` : `sp_pub_${fallbackHash}`,
        source: 'spotify',
        spotifyId: spId,
        uri: spId ? `spotify:track:${spId}` : '',
        title: t.title,
        artist: t.artist,
        artistId: '',
        artistsList: [],
        album: t.album || resolved.name,
        albumId: '',
        duration: Math.round((Number(t.durationMs) || 0) / 1000),
        durationMs: Number(t.durationMs) || 0,
        coverUrl: t.coverUrl || resolved.coverUrl || '',
        previewUrl: '',
        spotifyUrl: spUrl,
        externalUrl: spUrl
      };
    });

    return {
      id: listId,
      type: resolved.type,
      name: resolved.name,
      coverUrl: resolved.coverUrl || '',
      truncatedAt100: Boolean(resolved.truncatedAt100),
      tracks
    };
  }
}
