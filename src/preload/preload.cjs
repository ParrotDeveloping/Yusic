const { contextBridge, ipcRenderer, webUtils } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('yusic', {
  init: () => ipcRenderer.invoke('yusic:app:init'),

  // Library
  scanLibrary: () => ipcRenderer.invoke('yusic:library:scan'),
  openMusicFolder: () => ipcRenderer.invoke('yusic:library:openFolder'),
  pickAndImportFiles: () => ipcRenderer.invoke('yusic:library:pickAndImport'),
  importFiles: (filePaths) => ipcRenderer.invoke('yusic:library:importFiles', filePaths),
  deleteTrack: (trackId) => ipcRenderer.invoke('yusic:library:deleteTrack', trackId),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file?.path || '';
    }
  },

  // Playlists
  createPlaylist: (name) => ipcRenderer.invoke('yusic:playlists:create', name),
  renamePlaylist: (id, name) => ipcRenderer.invoke('yusic:playlists:rename', { id, name }),
  deletePlaylist: (id) => ipcRenderer.invoke('yusic:playlists:delete', id),
  addTracksToPlaylist: (playlistId, trackIds) =>
    ipcRenderer.invoke('yusic:playlists:addTracks', { playlistId, trackIds }),
  removeTrackFromPlaylist: (playlistId, trackId) =>
    ipcRenderer.invoke('yusic:playlists:removeTrack', { playlistId, trackId }),
  reorderPlaylist: (playlistId, orderedTrackIds) =>
    ipcRenderer.invoke('yusic:playlists:reorder', { playlistId, orderedTrackIds }),

  // Settings
  updateSettings: (patch) => ipcRenderer.invoke('yusic:settings:update', patch),

  // Downloads
  detectUrl: (url) => ipcRenderer.invoke('yusic:downloads:detect', url),
  startDownload: (url, options) => ipcRenderer.invoke('yusic:downloads:start', { url, options }),
  cancelDownload: (jobId) => ipcRenderer.invoke('yusic:downloads:cancel', jobId),
  listDownloads: () => ipcRenderer.invoke('yusic:downloads:list'),
  clearCompletedDownloads: () => ipcRenderer.invoke('yusic:downloads:clearCompleted'),

  // Updates
  getUpdateState: () => ipcRenderer.invoke('yusic:updater:getState'),
  checkForUpdates: () => ipcRenderer.invoke('yusic:updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('yusic:updater:download'),
  installUpdate: () => ipcRenderer.invoke('yusic:updater:install'),
  openReleasePage: () => ipcRenderer.invoke('yusic:updater:openReleasePage'),

  // Events
  onLibraryUpdated: (cb) => subscribe('yusic:event:libraryUpdated', cb),
  onPlaylistsUpdated: (cb) => subscribe('yusic:event:playlistsUpdated', cb),
  onDownloadJobUpdated: (cb) => subscribe('yusic:event:downloadJobUpdated', cb),
  onUpdateStateChanged: (cb) => subscribe('yusic:event:updateState', cb)
});
