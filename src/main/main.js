import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
import { SpotifyAccountManager } from './spotifyAccount.js';
import { UpdateManager } from './updater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isSmokeTest = process.argv.includes('--smoke-test');

let mainWindow = null;
let store = null;
let library = null;
let streamServer = null;
let downloader = null;
let spotifyAccount = null;
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
    ffmpegPath: toolsStatus.ffmpegPath,
    ffmpegDir: toolsStatus.ffmpegDir,
    ytDlpPath: toolsStatus.ytDlpPath,
    nodePath: toolsStatus.nodePath
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

  spotifyAccount = new SpotifyAccountManager({
    store,
    openExternalFn: (url) => shell.openExternal(url)
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

  spotifyAccount.on('auth-changed', (status) => {
    broadcast('yusic:event:spotifyAuthChanged', status);
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
      trackSpeedOverrides: store.getTrackSpeedOverrides(),
      externalListPrefs: store.getExternalListPrefs(),
      spotifyAuth: spotifyAccount.getStatus(),
      downloads: downloader.listJobs(),
      toolsStatus,
      updateState: updater.getState()
    };
  });

  ipcMain.handle('yusic:library:scan', async () => {
    return library.scanAll(true);
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

  // Playlists
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

  ipcMain.handle('yusic:playlists:updateDetails', (_event, { id, patch }) => {
    const pl = store.updatePlaylistDetails(id, patch);
    broadcast('yusic:event:playlistsUpdated', store.getPlaylists());
    return pl;
  });

  ipcMain.handle('yusic:playlists:pickCover', async (_event, { playlistId, isExternal = false }) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Playlist Kapak Fotoğrafı Seç',
      properties: ['openFile'],
      filters: [
        {
          name: 'Görseller',
          extensions: ['png', 'jpg', 'jpeg', 'webp']
        }
      ]
    });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };

    const srcPath = res.filePaths[0];
    const buf = await fs.promises.readFile(srcPath);
    const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
    const rawExt = path.extname(srcPath).toLowerCase();
    const ext = ['.png', '.jpg', '.jpeg', '.webp'].includes(rawExt) ? rawExt : '.jpg';
    const fileName = `pl_${hash}${ext}`;
    const coversDir = getRuntimePaths().coversDir;
    fs.mkdirSync(coversDir, { recursive: true });
    const dest = path.join(coversDir, fileName);
    if (!fs.existsSync(dest)) {
      await fs.promises.writeFile(dest, buf);
    }

    if (isExternal) {
      const prefs = store.updateExternalListPref(playlistId, { coverFile: fileName });
      return { canceled: false, coverFile: fileName, externalListPrefs: prefs };
    }

    const updated = store.updatePlaylistDetails(playlistId, { coverFile: fileName });
    broadcast('yusic:event:playlistsUpdated', store.getPlaylists());
    return { canceled: false, coverFile: fileName, playlist: updated };
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

  // Settings & Speed Overrides
  ipcMain.handle('yusic:settings:update', (_event, patch) => {
    return store.updateSettings(patch);
  });

  ipcMain.handle('yusic:speed:setTrackOverride', (_event, { trackId, override }) => {
    return store.setTrackSpeedOverride(trackId, override);
  });

  ipcMain.handle('yusic:externalList:updatePref', (_event, { listId, patch }) => {
    return store.updateExternalListPref(listId, patch);
  });

  ipcMain.handle('yusic:externalList:addLocalTracks', (_event, { listId, trackIds }) => {
    return store.addLocalTracksToExternalList(listId, trackIds);
  });

  ipcMain.handle('yusic:externalList:removeLocalTrack', (_event, { listId, trackId }) => {
    return store.removeLocalTrackFromExternalList(listId, trackId);
  });

  // Spotify Account & Live Streaming
  ipcMain.handle('yusic:spotify:getStatus', () => spotifyAccount.getStatus());
  ipcMain.handle('yusic:spotify:saveClientId', (_event, clientId) => spotifyAccount.setClientId(clientId));
  ipcMain.handle('yusic:spotify:resetClientId', () => spotifyAccount.resetClientId());
  ipcMain.handle('yusic:spotify:login', (_event, payload) => {
    if (payload && typeof payload === 'object') {
      return spotifyAccount.startLogin(payload.clientId, { forceDialog: Boolean(payload.forceDialog) });
    }
    return spotifyAccount.startLogin(payload);
  });
  ipcMain.handle('yusic:spotify:logout', () => spotifyAccount.logout());
  ipcMain.handle('yusic:spotify:openDashboard', () =>
    shell.openExternal('https://developer.spotify.com/dashboard')
  );
  ipcMain.handle('yusic:spotify:liked', (_event, opts) => spotifyAccount.getLikedSongs(opts));
  ipcMain.handle('yusic:spotify:playlists', (_event, opts) => spotifyAccount.getUserPlaylists(opts));
  ipcMain.handle('yusic:spotify:playlistTracks', (_event, { spotifyPlaylistId, offset, limit }) =>
    spotifyAccount.getPlaylistTracks(spotifyPlaylistId, { offset, limit })
  );
  ipcMain.handle('yusic:spotify:createPlaylist', (_event, payload) =>
    spotifyAccount.createPlaylist(payload)
  );
  ipcMain.handle('yusic:spotify:updatePlaylist', (_event, { spotifyPlaylistId, patch }) =>
    spotifyAccount.updatePlaylistDetails(spotifyPlaylistId, patch)
  );
  ipcMain.handle('yusic:spotify:deletePlaylist', (_event, spotifyPlaylistId) =>
    spotifyAccount.unfollowPlaylist(spotifyPlaylistId)
  );
  ipcMain.handle('yusic:spotify:addPlaylistItems', (_event, { spotifyPlaylistId, uris, position }) =>
    spotifyAccount.addItemsToPlaylist(spotifyPlaylistId, uris, { position })
  );
  ipcMain.handle('yusic:spotify:removePlaylistItems', (_event, { spotifyPlaylistId, uris }) =>
    spotifyAccount.removeItemsFromPlaylist(spotifyPlaylistId, uris)
  );
  ipcMain.handle('yusic:spotify:reorderPlaylistItems', (_event, { spotifyPlaylistId, ...opts }) =>
    spotifyAccount.reorderPlaylistItems(spotifyPlaylistId, opts)
  );
  ipcMain.handle('yusic:spotify:librarySave', (_event, uris) => spotifyAccount.saveLibraryItems(uris));
  ipcMain.handle('yusic:spotify:libraryRemove', (_event, uris) => spotifyAccount.removeLibraryItems(uris));
  ipcMain.handle('yusic:spotify:libraryContains', (_event, uris) => spotifyAccount.checkLibraryContains(uris));
  ipcMain.handle('yusic:spotify:topTracks', (_event, opts) => spotifyAccount.getTopTracks(opts));
  ipcMain.handle('yusic:spotify:topArtists', (_event, opts) => spotifyAccount.getTopArtists(opts));
  ipcMain.handle('yusic:spotify:savedAlbums', (_event, opts) => spotifyAccount.getSavedAlbums(opts));
  ipcMain.handle('yusic:spotify:albumDetails', (_event, albumId) => spotifyAccount.getAlbumDetails(albumId));
  ipcMain.handle('yusic:spotify:artistDetails', (_event, artistId) => spotifyAccount.getArtistDetails(artistId));
  ipcMain.handle('yusic:spotify:recent', (_event, opts) => spotifyAccount.getRecentlyPlayed(opts));
  ipcMain.handle('yusic:spotify:search', (_event, query) => spotifyAccount.searchTracks(query));
  ipcMain.handle('yusic:spotify:searchCatalog', (_event, { query, ...opts }) =>
    spotifyAccount.searchCatalog(query, opts)
  );
  ipcMain.handle('yusic:spotify:openPublicLink', (_event, url) =>
    spotifyAccount.openPublicSpotifyLink(url)
  );
  ipcMain.handle('yusic:spotify:prefetch', (_event, track) => {
    streamServer.prefetchExternalStream(track);
    return true;
  });

  // Downloads
  ipcMain.handle('yusic:downloads:detect', (_event, url) => detectMediaUrl(url));
  ipcMain.handle('yusic:downloads:start', (_event, { url, options }) => downloader.enqueue(url, options));
  ipcMain.handle('yusic:downloads:cancel', (_event, jobId) => downloader.cancelJob(jobId));
  ipcMain.handle('yusic:downloads:list', () => downloader.listJobs());
  ipcMain.handle('yusic:downloads:clearCompleted', () => downloader.clearCompleted());

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
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: !isSmokeTest,
    backgroundColor: '#060911',
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

  const prevSettings = structuredClone(store.getSettings());

  try {
    await library.scanAll(true);
    const smokeTrack = library.getTrackByPath(smokeWav);
    if (!smokeTrack) throw new Error('Smoke track was not discovered by LibraryManager');

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

        // View mode switching (list -> compact -> grid -> list)
        document.getElementById('btn-view-grid').click();
        await new Promise(r => setTimeout(r, 50));
        const gridCardsCount = document.querySelectorAll('.track-card').length;
        document.getElementById('btn-view-compact').click();
        await new Promise(r => setTimeout(r, 50));
        const isCompact = document.getElementById('track-list').classList.contains('is-compact');
        document.getElementById('btn-view-list').click();

        // Spotify & Local separation check
        document.getElementById('nav-spotify').click();
        const spotifyViewVisible = !document.getElementById('view-spotify').hidden;
        const sidebarModeSpotify = document.getElementById('sidebar-library-heading')?.textContent;
        document.getElementById('nav-local').click();
        const sidebarModeLocal = document.getElementById('sidebar-library-heading')?.textContent;

        // Settings view, tabs, UI scale & 10-band EQ checks
        document.getElementById('nav-settings').click();
        const settingsViewVisible = !document.getElementById('view-settings').hidden;
        const eqTab = document.getElementById('stab-audio');
        eqTab.click();
        const eqPanelVisible = !document.getElementById('spanel-audio').hidden;
        const eqBandsCount = document.querySelectorAll('.eq-band-slider').length;
        const eqToggle = document.getElementById('chk-eq-enabled');
        eqToggle.checked = true;
        eqToggle.dispatchEvent(new Event('change', { bubbles: true }));
        const bassPresetBtn = document.querySelector('[data-eq-preset="bass"]');
        bassPresetBtn.click();

        const appearanceTab = document.getElementById('stab-appearance');
        appearanceTab.click();
        const scaleSlider = document.getElementById('ui-scale-slider');
        scaleSlider.value = '1.15';
        scaleSlider.dispatchEvent(new Event('input', { bubbles: true }));
        const zoomApplied = window.yusic.getZoomFactor();
        scaleSlider.value = '1';
        scaleSlider.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('nav-local').click();

        const resizerHandlesPresent = Boolean(
          document.getElementById('resizer-sidebar') &&
          document.getElementById('resizer-sidebar-split') &&
          document.getElementById('resizer-player') &&
          document.getElementById('resizer-corner')
        );

        const spotifyFullControlsPresent = Boolean(
          document.getElementById('sp-tab-top') &&
          document.getElementById('sp-tab-albums') &&
          document.getElementById('btn-sp-new-playlist') &&
          document.getElementById('sp-playlist-dialog') &&
          document.getElementById('sp-add-local-dialog')
        );

        // Dialog checks
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
        const updateBannerHidden = document.getElementById('update-banner').hidden;

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
          gridCardsCount,
          isCompact,
          spotifyViewVisible,
          sidebarModeSpotify,
          sidebarModeLocal,
          settingsViewVisible,
          eqPanelVisible,
          eqBandsCount,
          zoomApplied,
          resizerHandlesPresent,
          spotifyFullControlsPresent,
          dialogOpened,
          dialogClosed,
          updateDialogOpened,
          updateDialogClosed,
          updateBannerHidden,
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
    if (
      uiCheck.gridCardsCount < 1 ||
      !uiCheck.isCompact ||
      !uiCheck.spotifyViewVisible ||
      !uiCheck.settingsViewVisible ||
      !uiCheck.eqPanelVisible ||
      uiCheck.eqBandsCount !== 10 ||
      Math.abs(uiCheck.zoomApplied - 1.15) > 0.02 ||
      !uiCheck.resizerHandlesPresent ||
      !uiCheck.spotifyFullControlsPresent
    ) {
      throw new Error(`v1.0.3 UI check failed: ${JSON.stringify(uiCheck)}`);
    }
    const nextRepeat = { off: 'all', all: 'one', one: 'off' };
    const [r0, r1, r2, r3] = uiCheck.repeatCycle || [];
    if (!nextRepeat[r0] || r1 !== nextRepeat[r0] || r2 !== nextRepeat[r1] || r3 !== r0) {
      throw new Error(`Repeat cycle mismatch: ${JSON.stringify(uiCheck.repeatCycle)}`);
    }
    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(`Console/page errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
    }

    console.log(JSON.stringify({ ok: true, isPackaged: app.isPackaged, rangeStatus: rangeRes.status, uiCheck }, null, 2));
  } finally {
    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      console.error('SMOKE_CAPTURED_ERRORS:', JSON.stringify({ consoleErrors, pageErrors }));
    }
    if (fs.existsSync(smokeWav)) fs.unlinkSync(smokeWav);
    await library.scanAll();
    store.updateSettings(prevSettings);
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
