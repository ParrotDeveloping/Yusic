import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  UpdateManager,
  compareSemver,
  formatReleaseNotes,
  isNewerVersion
} from '../src/main/updater.js';
import {
  ROOT_DIR,
  initRuntimePaths,
  getRuntimePaths
} from '../src/main/paths.js';

test('compareSemver compares versions accurately with or without v prefix', () => {
  assert.equal(compareSemver('1.0.1', '1.0.0'), 1);
  assert.equal(compareSemver('v1.2.0', '1.1.9'), 1);
  assert.equal(compareSemver('v1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('1.0.0', 'v2.0.0'), -1);
  assert.equal(compareSemver('1.0.0', '1.0.10'), -1);
});

test('formatReleaseNotes strips HTML tags and formats array notes', () => {
  assert.equal(formatReleaseNotes('<b>Yeni özellik</b><br><ul><li>Hız ayarı</li></ul>'), 'Yeni özellik\n• Hız ayarı');
  assert.equal(
    formatReleaseNotes([{ version: '1.1.0', note: '<p>Düzeltmeler</p>' }]),
    'v1.1.0\nDüzeltmeler'
  );
});

test('UpdateManager checks GitHub API in dev mode cleanly', async () => {
  const opened = [];
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      tag_name: 'v1.2.0',
      name: 'Yusic v1.2.0',
      body: 'Yeni özellikler eklendi.',
      html_url: 'https://github.com/ParrotDeveloping/Yusic/releases/tag/v1.2.0',
      assets: [
        {
          name: 'Yusic-Setup-1.2.0.exe',
          browser_download_url: 'https://github.com/ParrotDeveloping/Yusic/releases/download/v1.2.0/Yusic-Setup-1.2.0.exe'
        }
      ]
    })
  });

  const mgr = new UpdateManager({
    currentVersion: '1.0.0',
    isPackaged: false,
    openExternalFn: async (u) => opened.push(u),
    fetchImpl: mockFetch
  });

  const st = await mgr.checkForUpdates();
  assert.equal(st.status, 'available');
  assert.equal(st.latestVersion, '1.2.0');
  assert.match(st.downloadUrl, /Yusic-Setup-1\.2\.0\.exe$/);

  const dl = await mgr.downloadUpdate();
  assert.equal(dl.openedExternal, true);
  assert.equal(opened.length, 1);

  const upToDateMgr = new UpdateManager({
    currentVersion: '1.2.0',
    isPackaged: false,
    fetchImpl: mockFetch
  });
  const st2 = await upToDateMgr.checkForUpdates();
  assert.equal(st2.status, 'not-available');
  assert.equal(st2.downloadUrl, null);
  const blockedDl = await upToDateMgr.downloadUpdate();
  assert.equal(blockedDl.skipped, true);
  assert.equal(isNewerVersion('v1.0.1', '1.0.1'), false);
  assert.equal(isNewerVersion('1.0.2', '1.0.1'), true);
});

test('UpdateManager ignores same or older version even if autoUpdater fires update-available', async () => {
  class SameVersionAutoUpdater extends EventEmitter {
    setFeedURL() {}
    async checkForUpdates() {
      this.emit('checking-for-update');
      this.emit('update-available', { version: '1.0.1' });
    }
    async downloadUpdate() {
      throw new Error('Should not download same version');
    }
  }
  const mgr = new UpdateManager({
    currentVersion: '1.0.1',
    isPackaged: true,
    autoUpdaterImpl: new SameVersionAutoUpdater()
  });
  const st = await mgr.checkForUpdates();
  assert.equal(st.status, 'not-available');
  const dl = await mgr.downloadUpdate();
  assert.equal(dl.skipped, true);
});

test('UpdateManager handles full packaged autoUpdater lifecycle', async () => {
  class MockAutoUpdater extends EventEmitter {
    constructor() {
      super();
      this.feedConfig = null;
      this.quitArgs = null;
    }
    setFeedURL(cfg) {
      this.feedConfig = cfg;
    }
    async checkForUpdates() {
      this.emit('checking-for-update');
      this.emit('update-available', {
        version: '1.1.0',
        releaseName: 'Yusic v1.1.0',
        releaseNotes: '<p>Otomatik güncelleme testi</p>'
      });
    }
    async downloadUpdate() {
      this.emit('download-progress', { percent: 55.4, bytesPerSecond: 1024, transferred: 55, total: 100 });
      this.emit('update-downloaded', { version: '1.1.0', releaseNotes: 'Hazır' });
    }
    quitAndInstall(isSilent, isForceRunAfter) {
      this.quitArgs = { isSilent, isForceRunAfter };
    }
  }

  const fakeAu = new MockAutoUpdater();
  const mgr = new UpdateManager({
    currentVersion: '1.0.0',
    isPackaged: true,
    autoUpdaterImpl: fakeAu
  });

  assert.equal(fakeAu.feedConfig.owner, 'ParrotDeveloping');
  assert.equal(fakeAu.feedConfig.repo, 'Yusic');

  const checked = await mgr.checkForUpdates();
  assert.equal(checked.status, 'available');
  assert.equal(checked.latestVersion, '1.1.0');
  assert.equal(checked.releaseNotes, 'Otomatik güncelleme testi');

  await mgr.downloadUpdate();
  assert.equal(mgr.getState().status, 'downloaded');
  assert.equal(mgr.getState().progress, 100);

  const res = mgr.installUpdate();
  assert.equal(res.ok, true);
  assert.deepEqual(fakeAu.quitArgs, { isSilent: false, isForceRunAfter: true });
});

test('initRuntimePaths separates packaged user data/music safely and restores dev paths', (t) => {
  t.after(() => {
    initRuntimePaths({ isPackaged: false });
  });

  const packaged = initRuntimePaths({
    isPackaged: true,
    userDataDir: 'C:\\Users\\Test\\AppData\\Roaming\\Yusic',
    musicDir: 'C:\\Users\\Test\\Music',
    exeDir: 'C:\\Users\\Test\\AppData\\Local\\Programs\\Yusic',
    resourcesDir: 'C:\\Users\\Test\\AppData\\Local\\Programs\\Yusic\\resources'
  });

  assert.equal(packaged.muzikDir, path.join('C:\\Users\\Test\\Music', 'Yusic'));
  assert.equal(packaged.dataDir, path.join('C:\\Users\\Test\\AppData\\Roaming\\Yusic', 'data'));
  assert.equal(packaged.bundledBinDir, path.join('C:\\Users\\Test\\AppData\\Local\\Programs\\Yusic\\resources', 'bin'));

  const dev = initRuntimePaths({ isPackaged: false });
  assert.equal(dev.muzikDir, path.join(ROOT_DIR, 'muzik'));
  assert.equal(getRuntimePaths().isPackaged, false);
});
