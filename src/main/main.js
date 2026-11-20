import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import {
  ICON_PATH,
  ensureAppDirs,
  getRuntimePaths,
  getToolsStatus,
  initRuntimePaths
} from './paths.js';
import { YusicStore } from './store.js';
import { LibraryManager } from './library.js';
import { StreamServer } from './streamServer.js';
import { DownloadManager } from './downloader.js';
import { detectMediaUrl } from './spotifyResolver.js';
import { UpdateManager } from './updater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isSmokeTest = process.argv.includes('--smoke-test');

let mainWindow = null;
let store = null;
let library = null;
let streamServer = null;
let downloader = null;
let updater = null;
let serverInfo = null;
let toolsStatus = null;

function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function ensurePackagedMusicShortcut(paths) {
  if (!paths.isPackaged || !paths.exeDir) return;
  try {
    const shortcutPath = path.join(paths.exeDir, 'Müzik Klasörü.lnk');
    shell.writeShortcutLink(shortcutPath, 'update', {
      target: paths.muzikDir,
      description: 'Yusic Müzik Klasörü'
    });
  } catch {
    // Ignore when install directory is read-only (e.g. Program Files)
  }
}

async function initBackend() {
  const paths = initRuntimePaths({
    isPackaged: app.isPackaged,
    userDataDir: app.getPath('userData'),
    musicDir: app.getPath('music'),
    exeDir: path.dirname(app.getPath('exe')),
    resourcesDir: process.resourcesPath
  });
  ensureAppDirs();
  ensurePackagedMusicShortcut(paths);

  toolsStatus = getToolsStatus();
  store = new YusicStore(paths.dbPath);

  library = new LibraryManager({
    muzikDir: paths.muzikDir,
    coversDir: paths.coversDir,
    store,
    trashFn: (filePath) => shell.trashItem(filePath)
  });

  await library.scanAll();
  library.startWatching();

  streamServer = new StreamServer({
    library,
    coversDir: paths.coversDir,
    ffmpegPath: toolsStatus.ffmpegPath
  });
  serverInfo = await streamServer.start();

  downloader = new DownloadManager({
    muzikDir: paths.muzikDir,
    tmpDir: paths.tmpDir,
    library,
    store,
    ytDlpPath: toolsStatus.ytDlpPath,
    ffmpegPath: toolsStatus.ffmpegPath,
    ffmpegDir: toolsStatus.ffmpegDir,
    nodePath: toolsStatus.nodePath
  });

  updater = new UpdateManager({
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    openExternalFn: (url) => shell.openExternal(url)
  });

  library.on('updated', (payload) => {
    broadcast('yusic:event:libraryUpdated', payload);
  });

  downloader.on('job:updated', (job) => {
    broadcast('yusic:event:downloadJobUpdated', job);
  });

  downloader.on('playlists:updated', (playlists) => {
    broadcast('yusic:event:playlistsUpdated', playlists);
  });

  updater.on('state', (updateState) => {
    broadcast('yusic:event:updateState', updateState);
  });
}

function registerIpc() {
  ipcMain.handle('yusic:app:init', async () => {
    const paths = getRuntimePaths();
    return {
      muzikDir: paths.muzikDir,
      appVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      serverUrl: serverInfo.url,
      serverToken: serverInfo.token,
      tracks: library.getTracks(),
      playlists: store.getPlaylists(),
      settings: store.getSettings(),
      downloads: downloader.listJobs(),
      toolsStatus,
      updateState: updater.getState()
    };
  });

  ipcMain.handle('yusic:library:scan', async () => {
    const tracks = await library.scanAll(true);
    return tracks;
  });

  ipcMain.handle('yusic:library:openFolder', async () => {
    ensureAppDirs();
    const err = await shell.openPath(getRuntimePaths().muzikDir);
    return { ok: !err, error: err || null };
  });

  ipcMain.handle('yusic:library:pickAndImport', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Müzik Dosyalarını Seç',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Ses Dosyaları',
          extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'webm', 'wma']
        }
      ]
    });
    if (res.canceled || res.filePaths.length === 0) return [];
    return library.importFiles(res.filePaths);
  });

  ipcMain.handle('yusic:library:importFiles', async (_event, filePaths) => {
    if (!Array.isArray(filePaths)) return [];
    return library.importFiles(filePaths);
  });

  ipcMain.handle('yusic:library:deleteTrack', async (_event, trackId) => {
    const ok = await library.deleteTrackFile(trackId);
    if (ok) {
      broadcast('yusic:event:playlistsUpdated', store.getPlaylists());
    }
    return ok;
  });

  ipcMain.handle('yusic:playlists:create', (_event, name) => {
    const pl = store.createPlaylist(name);
    broadcast('yusic:event:playlistsUpdated', store.getPlaylists());
    return pl;
  });

  ipcMain.handle('yusic:playlists:rename', (_event, { id, name }) => {
    const pl = store.renamePlaylist(id, name);
    broadcast('yusic:event:playlistsUpdated', store.getPlaylists());
    return pl;
  });

  ipcMain.handle('yusic:playlists:delete', (_event, id) => {
    const ok = store.deletePlaylist(id);
    broadcast('yusic:event:playlistsUpdated', store.getPlaylists());
    return ok;
  });

  ipcMain.handle('yusic:playlists:addTracks', (_event, { playlistId, trackIds }) => {
    const pl = store.addTracksToPlaylist(playlistId, trackIds);
    broadcast('yusic:event:playlistsUpdated', store.getPlaylists());
    return pl;
  });

  ipcMain.handle('yusic:playlists:removeTrack', (_event, { playlistId, trackId }) => {
    const pl = store.removeTrackFromPlaylist(playlistId, trackId);
    broadcast('yusic:event:playlistsUpdated', store.getPlaylists());
    return pl;
  });

  ipcMain.handle('yusic:playlists:reorder', (_event, { playlistId, orderedTrackIds }) => {
    const pl = store.reorderPlaylistTracks(playlistId, orderedTrackIds);
    broadcast('yusic:event:playlistsUpdated', store.getPlaylists());
    return pl;
  });

  ipcMain.handle('yusic:settings:update', (_event, patch) => {
    return store.updateSettings(patch);
  });

  ipcMain.handle('yusic:downloads:detect', (_event, url) => {
    return detectMediaUrl(url);
  });

  ipcMain.handle('yusic:downloads:start', (_event, { url, options }) => {
    return downloader.enqueue(url, options);
  });

  ipcMain.handle('yusic:downloads:cancel', (_event, jobId) => {
    return downloader.cancelJob(jobId);
  });

  ipcMain.handle('yusic:downloads:list', () => {
    return downloader.listJobs();
  });

  ipcMain.handle('yusic:downloads:clearCompleted', () => {
    return downloader.clearCompleted();
  });

  // Updater IPC
  ipcMain.handle('yusic:updater:getState', () => updater.getState());
  ipcMain.handle('yusic:updater:check', () => updater.checkForUpdates());
  ipcMain.handle('yusic:updater:download', () => updater.downloadUpdate());
  ipcMain.handle('yusic:updater:install', () => updater.installUpdate());
  ipcMain.handle('yusic:updater:openReleasePage', () => updater.openReleasePage());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Yusic',
    width: 1240,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    show: !isSmokeTest,
    backgroundColor: '#0c0d12',
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function runSmokeTest() {
  const { execFileSync } = await import('node:child_process');
  const consoleErrors = [];
  const pageErrors = [];

  mainWindow.webContents.on('console-message', (event) => {
    const level = event?.level;
    const message = event?.message;
    if (level === 'error' || (typeof level === 'number' && level >= 3)) {
      consoleErrors.push(message);
    }
  });
  mainWindow.webContents.on('page-error', (err) => {
    pageErrors.push(err.message);
  });

  await new Promise((resolve) => {
    mainWindow.webContents.once('did-finish-load', resolve);
  });

  if (!toolsStatus.readyForYoutube || !toolsStatus.readyForSpotify) {
    throw new Error(`Tools not ready in smoke test: ${JSON.stringify(toolsStatus)}`);
  }

  const paths = getRuntimePaths();
  const smokeWav = path.join(paths.muzikDir, '__yusic_smoke_test__.wav');
  execFileSync(
    toolsStatus.ffmpegPath,
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', smokeWav],
    { windowsHide: true }
  );

  try {
    await library.scanAll(true);
    const smokeTrack = library.getTrackByPath(smokeWav);
    if (!smokeTrack) throw new Error('Smoke track was not discovered by LibraryManager');

    // Check HTTP 206 Range request against StreamServer
    const audioUrl = `${serverInfo.url}/audio/${smokeTrack.id}?t=${encodeURIComponent(serverInfo.token)}`;
    const rangeRes = await fetch(audioUrl, { headers: { Range: 'bytes=0-1023' } });
    if (rangeRes.status !== 206) {
      throw new Error(`Expected HTTP 206 Partial Content, got ${rangeRes.status}`);
    }
    await rangeRes.arrayBuffer();

    const uiCheck = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        for (let i = 0; i < 40; i++) {
          if (document.body.dataset.yusicReady === '1') break;
          await new Promise(r => setTimeout(r, 100));
        }
        if (document.body.dataset.yusicReady !== '1') {
          throw new Error('Renderer did not become ready');
        }

        const audio = document.getElementById('audio-player');
        if (!audio) throw new Error('Missing #audio-player');

        audio.src = ${JSON.stringify(audioUrl)};
        await new Promise((res, rej) => {
          audio.addEventListener('loadedmetadata', res, { once: true });
          audio.addEventListener('error', () => rej(new Error('Audio element failed to load')), { once: true });
        });

        const speedSlider = document.getElementById('speed-slider');
        speedSlider.value = '1.5';
        speedSlider.dispatchEvent(new Event('input', { bubbles: true }));

        const pitchChangeRadio = document.getElementById('pitch-change');
        pitchChangeRadio.checked = true;
        pitchChangeRadio.dispatchEvent(new Event('change', { bubbles: true }));

        const afterChange = {
          playbackRate: audio.playbackRate,
          preservesPitch: audio.preservesPitch,
          duration: audio.duration
        };

        speedSlider.value = '1';
        speedSlider.dispatchEvent(new Event('input', { bubbles: true }));
        const pitchPreserveRadio = document.getElementById('pitch-preserve');
        pitchPreserveRadio.checked = true;
        pitchPreserveRadio.dispatchEvent(new Event('change', { bubbles: true }));

        const plDialog = document.getElementById('playlist-dialog');
        document.getElementById('btn-new-playlist').click();
        const dialogOpened = plDialog.open;
        plDialog.close('cancel');
        const dialogClosed = !plDialog.open;

        const updateDialog = document.getElementById('update-dialog');
        document.getElementById('btn-check-updates').click();
        const updateDialogOpened = updateDialog.open;
        updateDialog.close('cancel');
        const updateDialogClosed = !updateDialog.open;
        const updateState = await window.yusic.getUpdateState();

        const repeatBtn = document.getElementById('btn-repeat');
        const shuffleBtn = document.getElementById('btn-shuffle');
        const r0 = repeatBtn.dataset.repeat;
        repeatBtn.click();
        const r1 = repeatBtn.dataset.repeat;
        repeatBtn.click();
        const r2 = repeatBtn.dataset.repeat;
        repeatBtn.click();
        const r3 = repeatBtn.dataset.repeat;

        return {
          title: document.title,
          versionText: document.getElementById('app-version-label')?.textContent,
          afterChange,
          dialogOpened,
          dialogClosed,
          updateDialogOpened,
          updateDialogClosed,
          updateVersion: updateState?.currentVersion,
          repeatCycle: [r0, r1, r2, r3],
          shufflePressed: shuffleBtn.getAttribute('aria-pressed'),
          trackRowCount: document.querySelectorAll('.track-row').length
        };
      })()
    `);

    if (uiCheck.afterChange.playbackRate !== 1.5 || uiCheck.afterChange.preservesPitch !== false) {
      throw new Error(`Unexpected audio state: ${JSON.stringify(uiCheck.afterChange)}`);
    }
    if (!uiCheck.dialogOpened || !uiCheck.dialogClosed) {
      throw new Error(`Dialog open/close check failed: ${JSON.stringify(uiCheck)}`);
    }
    if (!uiCheck.updateDialogOpened || !uiCheck.updateDialogClosed) {
      throw new Error(`Update dialog check failed: ${JSON.stringify(uiCheck)}`);
    }
    if (uiCheck.repeatCycle.join(',') !== 'off,all,one,off') {
      throw new Error(`Repeat cycle mismatch: ${JSON.stringify(uiCheck.repeatCycle)}`);
    }
    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(`Console/page errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
    }

    console.log(JSON.stringify({ ok: true, isPackaged: app.isPackaged, rangeStatus: rangeRes.status, uiCheck }, null, 2));
  } finally {
    if (fs.existsSync(smokeWav)) fs.unlinkSync(smokeWav);
    await library.scanAll();
    store.updateSettings({
      speed: 1.0,
      preservePitch: true,
      repeatMode: 'off',
      shuffle: false
    });
  }
}

app.whenReady().then(async () => {
  await initBackend();
  registerIpc();
  createWindow();

  if (isSmokeTest) {
    try {
      await runSmokeTest();
      await library.stopWatching();
      await streamServer.stop();
      app.exit(0);
    } catch (err) {
      console.error('SMOKE TEST FAILED:', err);
      await library?.stopWatching();
      await streamServer?.stop();
      app.exit(1);
    }
  } else {
    setTimeout(() => {
      updater.checkForUpdates().catch(() => {});
    }, 4000);
  }
});

app.on('window-all-closed', async () => {
  if (library) await library.stopWatching();
  if (streamServer) await streamServer.stop();
  if (process.platform !== 'darwin') app.quit();
});
