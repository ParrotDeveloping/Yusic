import { EventEmitter } from 'node:events';

export const GITHUB_OWNER = 'ParrotDeveloping';
export const GITHUB_REPO = 'Yusic';
export const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const LATEST_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

export function compareSemver(a, b) {
  const parse = (v) => {
    const clean = String(v || '')
      .trim()
      .replace(/^v/i, '')
      .split('-')[0];
    const parts = clean.split('.').map((n) => Number.parseInt(n, 10) || 0);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function stripHtmlTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatReleaseNotes(raw) {
  if (!raw) return '';
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        const ver = entry?.version ? `v${String(entry.version).replace(/^v/i, '')}` : '';
        const body = stripHtmlTags(entry?.note || '');
        return ver ? `${ver}\n${body}` : body;
      })
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }
  return stripHtmlTags(raw);
}

export class UpdateManager extends EventEmitter {
  constructor({
    currentVersion = '1.0.0',
    isPackaged = false,
    openExternalFn = null,
    autoUpdaterImpl = null,
    fetchImpl = fetch
  } = {}) {
    super();
    this.isPackaged = Boolean(isPackaged);
    this.openExternalFn = openExternalFn;
    this.autoUpdaterImpl = autoUpdaterImpl;
    this.fetchImpl = fetchImpl;
    this._au = null;
    this._auWired = false;

    this.state = {
      currentVersion: String(currentVersion || '1.0.0').replace(/^v/i, ''),
      isPackaged: this.isPackaged,
      status: 'idle',
      latestVersion: null,
      releaseName: null,
      releaseNotes: '',
      releaseUrl: RELEASES_URL,
      downloadUrl: null,
      progress: 0,
      bytesPerSecond: 0,
      transferred: 0,
      total: 0,
      error: null,
      lastCheckedAt: null
    };

    if (this.autoUpdaterImpl) {
      this._au = this.autoUpdaterImpl;
      this._wireAutoUpdater(this._au);
    }
  }

  getState() {
    return { ...this.state };
  }

  _patchState(patch) {
    this.state = { ...this.state, ...patch };
    const snapshot = this.getState();
    this.emit('state', snapshot);
    return snapshot;
  }

  _wireAutoUpdater(au) {
    if (!au || this._auWired) return;
    this._auWired = true;

    au.autoDownload = false;
    au.autoInstallOnAppQuit = true;
    au.allowPrerelease = false;
    if (typeof au.setFeedURL === 'function') {
      au.setFeedURL({
        provider: 'github',
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        releaseType: 'release'
      });
    }

    au.on('checking-for-update', () => {
      this._patchState({
        status: 'checking',
        error: null
      });
    });

    au.on('update-available', (info) => {
      const ver = String(info?.version || '').replace(/^v/i, '');
      this._patchState({
        status: 'available',
        latestVersion: ver || null,
        releaseName: info?.releaseName || (ver ? `Yusic v${ver}` : null),
        releaseNotes: formatReleaseNotes(info?.releaseNotes),
        releaseUrl: ver ? `${RELEASES_URL}/tag/v${ver}` : RELEASES_URL,
        progress: 0,
        error: null,
        lastCheckedAt: Date.now()
      });
    });

    au.on('update-not-available', (info) => {
      const ver = info?.version ? String(info.version).replace(/^v/i, '') : this.state.currentVersion;
      this._patchState({
        status: 'not-available',
        latestVersion: ver,
        releaseNotes: formatReleaseNotes(info?.releaseNotes),
        error: null,
        lastCheckedAt: Date.now()
      });
    });

    au.on('download-progress', (p) => {
      this._patchState({
        status: 'downloading',
        progress: Math.min(100, Math.max(0, Math.round(Number(p?.percent) || 0))),
        bytesPerSecond: Number(p?.bytesPerSecond) || 0,
        transferred: Number(p?.transferred) || 0,
        total: Number(p?.total) || 0
      });
    });

    au.on('update-downloaded', (info) => {
      const ver = info?.version ? String(info.version).replace(/^v/i, '') : this.state.latestVersion;
      this._patchState({
        status: 'downloaded',
        latestVersion: ver,
        releaseNotes: formatReleaseNotes(info?.releaseNotes) || this.state.releaseNotes,
        progress: 100,
        error: null
      });
    });

    au.on('error', (err) => {
      this._patchState({
        status: 'error',
        error: err?.message || String(err || 'Güncelleme kontrolü başarısız oldu.')
      });
    });
  }

  async _ensureAutoUpdater() {
    if (this._au) return this._au;
    if (this.autoUpdaterImpl) {
      this._au = this.autoUpdaterImpl;
    } else {
      const mod = await import('electron-updater');
      this._au = mod.default?.autoUpdater || mod.autoUpdater;
    }
    this._wireAutoUpdater(this._au);
    return this._au;
  }

  async checkForUpdates() {
    if (this.state.status === 'checking' || this.state.status === 'downloading') {
      return this.getState();
    }

    if (this.isPackaged) {
      this._patchState({ status: 'checking', error: null });
      try {
        const au = await this._ensureAutoUpdater();
        await au.checkForUpdates();
      } catch (err) {
        if (this.state.status !== 'error') {
          this._patchState({
            status: 'error',
            error: err?.message || 'Güncelleme sunucusuna bağlanılamadı.'
          });
        }
      }
      return this.getState();
    }

    // Development mode: check GitHub Releases REST API directly
    this._patchState({ status: 'checking', error: null });
    try {
      const res = await this.fetchImpl(LATEST_API_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `Yusic/${this.state.currentVersion}`
        }
      });

      if (res.status === 404) {
        return this._patchState({
          status: 'not-available',
          latestVersion: this.state.currentVersion,
          releaseName: null,
          releaseNotes: '',
          releaseUrl: RELEASES_URL,
          downloadUrl: null,
          lastCheckedAt: Date.now()
        });
      }

      if (!res.ok) {
        throw new Error(`GitHub API HTTP ${res.status}`);
      }

      const data = await res.json();
      const latestVersion = String(data?.tag_name || '').replace(/^v/i, '');
      const setupAsset = Array.isArray(data?.assets)
        ? data.assets.find((a) => String(a?.name || '').toLowerCase().endsWith('.exe'))
        : null;
      const isNewer = latestVersion && compareSemver(latestVersion, this.state.currentVersion) > 0;

      return this._patchState({
        status: isNewer ? 'available' : 'not-available',
        latestVersion: latestVersion || this.state.currentVersion,
        releaseName: data?.name || (latestVersion ? `Yusic v${latestVersion}` : null),
        releaseNotes: formatReleaseNotes(data?.body || ''),
        releaseUrl: data?.html_url || RELEASES_URL,
        downloadUrl: setupAsset?.browser_download_url || data?.html_url || RELEASES_URL,
        error: null,
        lastCheckedAt: Date.now()
      });
    } catch (err) {
      return this._patchState({
        status: 'error',
        error: err?.message || 'GitHub üzerinden güncelleme kontrolü başarısız oldu.'
      });
    }
  }

  async downloadUpdate() {
    if (!this.isPackaged) {
      const target = this.state.downloadUrl || this.state.releaseUrl || RELEASES_URL;
      if (this.openExternalFn) {
        await this.openExternalFn(target);
      }
      return { openedExternal: true, url: target, state: this.getState() };
    }

    if (this.state.status === 'downloaded') {
      return { alreadyDownloaded: true, state: this.getState() };
    }
    if (this.state.status === 'downloading') {
      return { alreadyDownloading: true, state: this.getState() };
    }

    this._patchState({ status: 'downloading', progress: 0, error: null });
    try {
      const au = await this._ensureAutoUpdater();
      await au.downloadUpdate();
      return { started: true, state: this.getState() };
    } catch (err) {
      this._patchState({
        status: 'error',
        error: err?.message || 'Güncelleme indirilemedi.'
      });
      return { started: false, state: this.getState() };
    }
  }

  installUpdate() {
    if (!this.isPackaged || !this._au) {
      return { ok: false, reason: 'not-packaged' };
    }
    if (this.state.status !== 'downloaded') {
      return { ok: false, reason: 'not-downloaded' };
    }
    this._au.quitAndInstall(false, true);
    return { ok: true };
  }

  async openReleasePage() {
    const target = this.state.releaseUrl || RELEASES_URL;
    if (this.openExternalFn) {
      await this.openExternalFn(target);
    }
    return { ok: true, url: target };
  }
}
