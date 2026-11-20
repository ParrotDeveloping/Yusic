const SPOTIFY_ENTITY_RE =
  /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|playlist|album)\/([A-Za-z0-9]+)/i;

const SPOTIFY_SHORT_RE = /^(?:https?:\/\/)?(?:spotify\.link|spoti\.fi)\//i;

const YOUTUBE_HOST_RE = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)$/i;

export function detectMediaUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;

  let parsed;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const normalized = parsed.toString();

  if (SPOTIFY_SHORT_RE.test(normalized)) {
    return {
      provider: 'spotify',
      kind: 'short',
      id: null,
      url: normalized
    };
  }

  const spMatch = normalized.match(SPOTIFY_ENTITY_RE);
  if (spMatch) {
    return {
      provider: 'spotify',
      kind: spMatch[1].toLowerCase(),
      id: spMatch[2],
      url: normalized
    };
  }

  if (YOUTUBE_HOST_RE.test(parsed.hostname)) {
    const pathname = parsed.pathname.toLowerCase();
    const hasListParam = Boolean(parsed.searchParams.get('list'));
    const hasVideoId = Boolean(parsed.searchParams.get('v')) || parsed.hostname.toLowerCase() === 'youtu.be' || pathname.startsWith('/shorts/');
    if (pathname.startsWith('/playlist') || (hasListParam && !hasVideoId)) {
      return {
        provider: 'youtube',
        kind: 'playlist',
        hasListParam: true,
        url: normalized
      };
    }
    if (hasVideoId) {
      return {
        provider: 'youtube',
        kind: 'video',
        hasListParam,
        url: normalized
      };
    }
  }

  return null;
}

function normalizeSpaces(str) {
  return String(str || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function resolveSpotifyUrl(rawUrl, fetchImpl = fetch) {
  let targetUrl = String(rawUrl || '').trim();
  if (!targetUrl.startsWith('http')) {
    targetUrl = `https://${targetUrl}`;
  }

  let match = targetUrl.match(SPOTIFY_ENTITY_RE);
  if (!match && SPOTIFY_SHORT_RE.test(targetUrl)) {
    const redirectRes = await fetchImpl(targetUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    });
    targetUrl = redirectRes.url || targetUrl;
    match = targetUrl.match(SPOTIFY_ENTITY_RE);
  }

  if (!match) {
    throw new Error('Geçersiz Spotify bağlantısı. Şarkı, albüm veya playlist linki girin.');
  }

  const entityType = match[1].toLowerCase();
  const entityId = match[2];
  const embedUrl = `https://open.spotify.com/embed/${entityType}/${entityId}`;

  const res = await fetchImpl(embedUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });

  if (!res.ok) {
    throw new Error(`Spotify bilgileri alınamadı (HTTP ${res.status}). Bağlantının herkese açık olduğundan emin olun.`);
  }

  const html = await res.text();
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) {
    throw new Error('Spotify embed verisi ayrıştırılamadı.');
  }
  const endIdx = html.indexOf('</script>', startIdx);
  if (endIdx === -1) {
    throw new Error('Spotify embed verisi eksik.');
  }

  const nextData = JSON.parse(html.slice(startIdx + marker.length, endIdx));
  const entity = nextData?.props?.pageProps?.state?.data?.entity;
  if (!entity) {
    throw new Error('Spotify öğesi bulunamadı veya gizli/özel.');
  }

  const coverUrl =
    entity.coverArt?.sources?.[0]?.url ||
    entity.visualIdentity?.image?.[0]?.url ||
    '';
  const name = normalizeSpaces(entity.name || entity.title || 'Spotify');

  if (entityType === 'track') {
    const artist = Array.isArray(entity.artists) && entity.artists.length > 0
      ? entity.artists.map((a) => normalizeSpaces(a.name)).filter(Boolean).join(', ')
      : normalizeSpaces(entity.subtitle) || 'Bilinmeyen Sanatçı';
    return {
      type: 'track',
      id: entityId,
      name,
      coverUrl,
      truncatedAt100: false,
      tracks: [
        {
          title: name,
          artist,
          album: '',
          durationMs: Number(entity.duration) || 0,
          spotifyId: entityId,
          coverUrl
        }
      ]
    };
  }

  const rawList = Array.isArray(entity.trackList) ? entity.trackList : [];
  if (rawList.length === 0) {
    throw new Error('Bu Spotify listesinde indirilebilir şarkı bulunamadı.');
  }

  const tracks = rawList.map((item) => {
    const uriParts = String(item.uri || '').split(':');
    const trackId = uriParts.length === 3 ? uriParts[2] : '';
    return {
      title: normalizeSpaces(item.title) || 'Adsız Şarkı',
      artist: normalizeSpaces(item.subtitle) || 'Bilinmeyen Sanatçı',
      album: entityType === 'album' ? name : '',
      durationMs: Number(item.duration) || 0,
      spotifyId: trackId,
      coverUrl: ''
    };
  });

  return {
    type: entityType,
    id: entityId,
    name,
    coverUrl,
    truncatedAt100: tracks.length >= 100,
    tracks
  };
}

export async function fetchSpotifyTrackOembedCover(spotifyId, fetchImpl = fetch) {
  if (!spotifyId) return '';
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(
      `https://open.spotify.com/track/${spotifyId}`
    )}`;
    const res = await fetchImpl(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return '';
    const data = await res.json();
    return String(data?.thumbnail_url || '');
  } catch {
    return '';
  }
}
