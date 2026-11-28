import { EventEmitter } from 'node:events';
import {
  normalizeVersion,
  compareSemver,
  isNewerVersion,
  formatReleaseNotes
} from './versionUtils.js';

export { normalizeVersion, compareSemver, isNewerVersion, formatReleaseNotes };

export const GITHUB_OWNER = 'ParrotDeveloping';
export const GITHUB_REPO = 'Yusic';
export const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const LATEST_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

export class UpdateManager extends EventEmitter {
  constructor({
    currentVersion = '1.0.1',
    isPackaged = false,
    openExternalFn = null,
    autoUpdaterImpl = null,
    autoInstallDelayMs = 300,
    fetchImpl = fetch
  } = {}) {
    super();
    this.isPackaged = Boolean(isPackaged);
    this.openExternalFn = openExternalFn;
    this.autoUpdaterImpl = autoUpdaterImpl;
    this.autoInstallDelayMs = Math.max(0, Number(autoInstallDelayMs) || 0);
    this.fetchImpl = fetchImpl;
    this._au = null;
    this._auWired = false;
    this._autoInstallOnDownload = false;

    this.state = {
      currentVersion: normalizeVersion(currentVersion) || '1.0.1',
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
      const ver = normalizeVersion(info?.version);
      if (!isNewerVersion(ver, this.state.currentVersion)) {
        this._patchState({
          status: 'not-available',
          latestVersion: this.state.currentVersion,
          releaseName: null,
          releaseNotes: '',
          downloadUrl: null,
          progress: 0,
          error: null,
          lastCheckedAt: Date.now()
        });
        return;
      }

      this._patchState({
        status: 'available',
        latestVersion: ver,
        releaseName: info?.releaseName || `Yusic v${ver}`,
        releaseNotes: formatReleaseNotes(info?.releaseNotes),
        releaseUrl: `${RELEASES_URL}/tag/v${ver}`,
        progress: 0,
        error: null,
        lastCheckedAt: Date.now()
      });
    });

    au.on('update-not-available', (info) => {
      const ver = normalizeVersion(info?.version) || this.state.currentVersion;
      this._patchState({
        status: 'not-available',
        latestVersion: ver,
        releaseNotes: '',
        downloadUrl: null,
        progress: 0,
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
      const ver = normalizeVersion(info?.version) || this.state.latestVersion;
      if (!isNewerVersion(ver, this.state.currentVersion)) {
        this._patchState({
          status: 'not-available',
          latestVersion: this.state.currentVersion,
          downloadUrl: null,
          progress: 0,
          error: null
        });
        return;
      }
      this._patchState({
        status: 'downloaded',
        latestVersion: ver,
        releaseNotes: formatReleaseNotes(info?.releaseNotes) || this.state.releaseNotes,
        progress: 100,
        error: null
      });
      if (this._autoInstallOnDownload && this.isPackaged) {
        this._autoInstallOnDownload = false;
        if (this.autoInstallDelayMs <= 0) {
          this.installUpdate();
        } else {
          setTimeout(() => {
            this.installUpdate();
          }, this.autoInstallDelayMs);
        }
      }
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
      const latestVersion = normalizeVersion(data?.tag_name);
      const setupAsset = Array.isArray(data?.assets)
        ? data.assets.find((a) => String(a?.name || '').toLowerCase().endsWith('.exe'))
        : null;
      const isNewer = isNewerVersion(latestVersion, this.state.currentVersion);

      if (!isNewer) {
        return this._patchState({
          status: 'not-available',
          latestVersion: latestVersion || this.state.currentVersion,
          releaseName: null,
          releaseNotes: '',
          releaseUrl: data?.html_url || RELEASES_URL,
          downloadUrl: null,
          error: null,
          lastCheckedAt: Date.now()
        });
      }

      return this._patchState({
        status: 'available',
        latestVersion,
        releaseName: data?.name || `Yusic v${latestVersion}`,
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

  async downloadUpdate({ autoInstall = false } = {}) {
    if (this.state.status === 'downloaded') {
      if (autoInstall && this.isPackaged) {
        return { alreadyDownloaded: true, installed: this.installUpdate(), state: this.getState() };
      }
      return { alreadyDownloaded: true, state: this.getState() };
    }
    if (this.state.status === 'downloading') {
      if (autoInstall) this._autoInstallOnDownload = true;
      return { alreadyDownloading: true, state: this.getState() };
    }
    if (
      this.state.status !== 'available' ||
      !isNewerVersion(this.state.latestVersion, this.state.currentVersion)
    ) {
      return { skipped: true, reason: 'already-up-to-date', state: this.getState() };
    }

    if (!this.isPackaged) {
      const target = this.state.downloadUrl || this.state.releaseUrl || RELEASES_URL;
      if (this.openExternalFn) {
        await this.openExternalFn(target);
      }
      return { openedExternal: true, url: target, state: this.getState() };
    }

    const wantAutoInstall = Boolean(autoInstall);
    this._autoInstallOnDownload = wantAutoInstall;
    this._patchState({ status: 'downloading', progress: 0, error: null });
    try {
      const au = await this._ensureAutoUpdater();
      await au.downloadUpdate();
      return { started: true, autoInstall: wantAutoInstall, state: this.getState() };
    } catch (err) {
      this._autoInstallOnDownload = false;
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
    this._au.quitAndInstall(true, true);
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
