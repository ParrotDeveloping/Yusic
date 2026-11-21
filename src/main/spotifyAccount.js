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
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-recently-played'
];

export function generateCodeVerifier() {
  return crypto.randomBytes(48).toString('base64url');
}

export function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(String(verifier)).digest('base64url');
}

export function normalizeSpotifyApiTrack(item) {
  const t = item?.item || item?.track || item;
  if (!t || !t.id || item?.is_local || t.is_local || (t.type && t.type !== 'track')) return null;

  const artists = Array.isArray(t.artists)
    ? t.artists.map((a) => String(a?.name || '').trim()).filter(Boolean).join(', ')
    : '';
  const images = Array.isArray(t.album?.images) ? t.album.images : [];
  const coverUrl = images[0]?.url || images[images.length - 1]?.url || '';
  const durationMs = Number(t.duration_ms) || 0;

  return {
    id: `sp_${t.id}`,
    source: 'spotify',
    spotifyId: String(t.id),
    title: String(t.name || 'Adsız Şarkı'),
    artist: artists || 'Bilinmeyen Sanatçı',
    album: String(t.album?.name || ''),
    duration: Math.round(durationMs / 1000),
    durationMs,
    coverUrl: String(coverUrl || ''),
    previewUrl: String(t.preview_url || ''),
    spotifyUrl: String(t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`)
  };
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
      background: #0a0a0a; color: #ffffff;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    .card {
      max-width: 440px; padding: 32px; border-radius: 16px;
      background: #141414; border: 1px solid rgba(255,255,255,0.12);
      text-align: center;
    }
    .dot {
      width: 52px; height: 52px; margin: 0 auto 16px; border-radius: 50%;
      display: grid; place-items: center; font-size: 24px; font-weight: 700;
      background: ${accent}; color: #000000;
    }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0; color: #b3b3b3; font-size: 14px; line-height: 1.5; }
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
    return {
      connected: Boolean(auth.accessToken && auth.user),
      clientId: auth.clientId || DEFAULT_SPOTIFY_CLIENT_ID,
      user: auth.user ? { ...auth.user } : null,
      redirectUri: SPOTIFY_REDIRECT_URI
    };
  }

  setClientId(clientId) {
    this.store.setSpotifyAuth({ clientId: String(clientId || '').trim() || DEFAULT_SPOTIFY_CLIENT_ID });
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

  async startLogin(clientIdInput) {
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
              message: 'Beğenilen şarkıların ve listelerin artık Yusic içinde hazır. Bu sekmeyi kapatabilirsin.'
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

    this.store.setSpotifyAuth({
      accessToken: json.access_token,
      refreshToken: json.refresh_token || auth.refreshToken,
      expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000
    });
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

  async _apiGet(endpoint) {
    let token = await this.getValidAccessToken();
    const url = endpoint.startsWith('http') ? endpoint : `https://api.spotify.com/v1${endpoint}`;

    let res = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 401) {
      token = await this._refreshAccessToken();
      res = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
    }

    if (!res.ok) {
      let msg = `Spotify API hatası (HTTP ${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson?.error?.message) msg = errJson.error.message;
      } catch {
        // Ignore parse error
      }
      const err = new Error(msg);
      err.statusCode = res.status;
      throw err;
    }

    return res.json();
  }

  async getLikedSongs({ limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const data = await this._apiGet(`/me/tracks?limit=${safeLimit}&offset=${safeOffset}`);
    const tracks = (data.items || []).map(normalizeSpotifyApiTrack).filter(Boolean);
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
    const data = await this._apiGet(`/me/playlists?limit=${safeLimit}&offset=${safeOffset}`);
    const playlists = (data.items || [])
      .filter((p) => p && p.id)
      .map((p) => ({
        id: `spotify:pl:${p.id}`,
        spotifyPlaylistId: String(p.id),
        name: String(p.name || 'Adsız Liste'),
        description: String(p.description || '').replace(/<[^>]+>/g, ''),
        ownerName: String(p.owner?.display_name || p.owner?.id || ''),
        trackCount: Number(p.items?.total ?? p.tracks?.total ?? 0),
        coverUrl: String(p.images?.[0]?.url || ''),
        externalUrl: String(p.external_urls?.spotify || '')
      }));
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

    let playlistHeader = null;
    let embeddedMeta = null;
    if (safeOffset === 0) {
      try {
        embeddedMeta = await this._apiGet(`/playlists/${safeId}`);
        playlistHeader = {
          id: `spotify:pl:${embeddedMeta.id}`,
          spotifyPlaylistId: String(embeddedMeta.id),
          name: String(embeddedMeta.name || 'Spotify Listesi'),
          description: String(embeddedMeta.description || '').replace(/<[^>]+>/g, ''),
          ownerName: String(embeddedMeta.owner?.display_name || ''),
          trackCount: Number(embeddedMeta.items?.total ?? embeddedMeta.tracks?.total ?? 0),
          coverUrl: String(embeddedMeta.images?.[0]?.url || '')
        };
      } catch (metaErr) {
        if (metaErr?.statusCode !== 403 && metaErr?.statusCode !== 404) {
          throw metaErr;
        }
      }
    }

    try {
      // Spotify Web API (Feb 2026+) uses /playlists/{id}/items instead of deprecated /tracks
      const data = await this._apiGet(`/playlists/${safeId}/items?limit=${safeLimit}&offset=${safeOffset}`);
      const rawItems = Array.isArray(data.items) ? data.items : [];
      const tracks = rawItems.map(normalizeSpotifyApiTrack).filter(Boolean);
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

      // Check if GET /playlists/{id} itself already included embedded items
      const embeddedContainer = embeddedMeta?.items || embeddedMeta?.tracks;
      if (safeOffset === 0 && Array.isArray(embeddedContainer?.items) && embeddedContainer.items.length > 0) {
        const tracks = embeddedContainer.items.map(normalizeSpotifyApiTrack).filter(Boolean);
        return {
          playlist: playlistHeader,
          total: Number(embeddedContainer.total) || tracks.length,
          offset: 0,
          limit: safeLimit,
          hasMore: Boolean(embeddedContainer.next),
          tracks
        };
      }

      // Fall back gracefully to public Spotify embed metadata when Web API blocks /items
      try {
        const pub = await this.openPublicSpotifyLink(`https://open.spotify.com/playlist/${rawId}`);
        return {
          playlist: playlistHeader || {
            id: `spotify:pl:${rawId}`,
            spotifyPlaylistId: rawId,
            name: pub.name,
            description: pub.truncatedAt100 ? 'Herkese açık listeden ilk 100 şarkı' : '',
            ownerName: '',
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

  async searchTracks(query, { limit = 25 } = {}) {
    const q = String(query || '').trim();
    if (!q) return { tracks: [] };
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 25));
    const data = await this._apiGet(`/search?type=track&limit=${safeLimit}&q=${encodeURIComponent(q)}`);
    const tracks = (data.tracks?.items || []).map(normalizeSpotifyApiTrack).filter(Boolean);
    return { tracks };
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
      return {
        id: spId ? `sp_${spId}` : `sp_pub_${fallbackHash}`,
        source: 'spotify',
        spotifyId: spId,
        title: t.title,
        artist: t.artist,
        album: t.album || resolved.name,
        duration: Math.round((Number(t.durationMs) || 0) / 1000),
        durationMs: Number(t.durationMs) || 0,
        coverUrl: t.coverUrl || resolved.coverUrl || '',
        previewUrl: '',
        spotifyUrl: spId ? `https://open.spotify.com/track/${spId}` : ''
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
