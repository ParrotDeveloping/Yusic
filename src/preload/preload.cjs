const { contextBridge, ipcRenderer, webFrame, webUtils } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('yusic', {
  init: () => ipcRenderer.invoke('yusic:app:init'),
  setZoomFactor: (factor) => {
    const f = Math.min(1.5, Math.max(0.75, Number(factor) || 1));
    webFrame.setZoomFactor(f);
    return f;
  },
  getZoomFactor: () => webFrame.getZoomFactor(),

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
  updatePlaylistDetails: (id, patch) => ipcRenderer.invoke('yusic:playlists:updateDetails', { id, patch }),
  pickPlaylistCover: (playlistId, isExternal = false) =>
    ipcRenderer.invoke('yusic:playlists:pickCover', { playlistId, isExternal }),
  deletePlaylist: (id) => ipcRenderer.invoke('yusic:playlists:delete', id),
  addTracksToPlaylist: (playlistId, trackIds) =>
    ipcRenderer.invoke('yusic:playlists:addTracks', { playlistId, trackIds }),
  removeTrackFromPlaylist: (playlistId, trackId) =>
    ipcRenderer.invoke('yusic:playlists:removeTrack', { playlistId, trackId }),
  reorderPlaylist: (playlistId, orderedTrackIds) =>
    ipcRenderer.invoke('yusic:playlists:reorder', { playlistId, orderedTrackIds }),

  // Settings & Speed Overrides
  updateSettings: (patch) => ipcRenderer.invoke('yusic:settings:update', patch),
  setTrackSpeedOverride: (trackId, override) =>
    ipcRenderer.invoke('yusic:speed:setTrackOverride', { trackId, override }),
  updateExternalListPref: (listId, patch) =>
    ipcRenderer.invoke('yusic:externalList:updatePref', { listId, patch }),
  addLocalTracksToSpotifyList: (listId, trackIds) =>
    ipcRenderer.invoke('yusic:externalList:addLocalTracks', { listId, trackIds }),
  removeLocalTrackFromSpotifyList: (listId, trackId) =>
    ipcRenderer.invoke('yusic:externalList:removeLocalTrack', { listId, trackId }),

  // Spotify Account & Live Streaming
  getSpotifyStatus: () => ipcRenderer.invoke('yusic:spotify:getStatus'),
  saveSpotifyClientId: (clientId) => ipcRenderer.invoke('yusic:spotify:saveClientId', clientId),
  resetSpotifyClientId: () => ipcRenderer.invoke('yusic:spotify:resetClientId'),
  loginSpotify: (clientId, opts = null) =>
    opts ? ipcRenderer.invoke('yusic:spotify:login', { clientId, ...opts }) : ipcRenderer.invoke('yusic:spotify:login', clientId),
  logoutSpotify: () => ipcRenderer.invoke('yusic:spotify:logout'),
  openSpotifyDashboard: () => ipcRenderer.invoke('yusic:spotify:openDashboard'),
  getSpotifyLikedSongs: (opts) => ipcRenderer.invoke('yusic:spotify:liked', opts),
  getSpotifyUserPlaylists: (opts) => ipcRenderer.invoke('yusic:spotify:playlists', opts),
  getSpotifyPlaylistTracks: (spotifyPlaylistId, opts) =>
    ipcRenderer.invoke('yusic:spotify:playlistTracks', { spotifyPlaylistId, ...(opts || {}) }),
  createSpotifyPlaylist: (payload) => ipcRenderer.invoke('yusic:spotify:createPlaylist', payload),
  updateSpotifyPlaylist: (spotifyPlaylistId, patch) =>
    ipcRenderer.invoke('yusic:spotify:updatePlaylist', { spotifyPlaylistId, patch }),
  deleteSpotifyPlaylist: (spotifyPlaylistId) =>
    ipcRenderer.invoke('yusic:spotify:deletePlaylist', spotifyPlaylistId),
  addSpotifyPlaylistItems: (spotifyPlaylistId, uris, position) =>
    ipcRenderer.invoke('yusic:spotify:addPlaylistItems', { spotifyPlaylistId, uris, position }),
  removeSpotifyPlaylistItems: (spotifyPlaylistId, uris) =>
    ipcRenderer.invoke('yusic:spotify:removePlaylistItems', { spotifyPlaylistId, uris }),
  reorderSpotifyPlaylistItems: (spotifyPlaylistId, opts) =>
    ipcRenderer.invoke('yusic:spotify:reorderPlaylistItems', { spotifyPlaylistId, ...(opts || {}) }),
  saveSpotifyLibrary: (uris) => ipcRenderer.invoke('yusic:spotify:librarySave', uris),
  removeSpotifyLibrary: (uris) => ipcRenderer.invoke('yusic:spotify:libraryRemove', uris),
  checkSpotifyLibrary: (uris) => ipcRenderer.invoke('yusic:spotify:libraryContains', uris),
  getSpotifyTopTracks: (opts) => ipcRenderer.invoke('yusic:spotify:topTracks', opts),
  getSpotifyTopArtists: (opts) => ipcRenderer.invoke('yusic:spotify:topArtists', opts),
  getSpotifySavedAlbums: (opts) => ipcRenderer.invoke('yusic:spotify:savedAlbums', opts),
  getSpotifyAlbum: (albumId) => ipcRenderer.invoke('yusic:spotify:albumDetails', albumId),
  getSpotifyArtist: (artistId) => ipcRenderer.invoke('yusic:spotify:artistDetails', artistId),
  getSpotifyRecent: (opts) => ipcRenderer.invoke('yusic:spotify:recent', opts),
  searchSpotifyTracks: (query) => ipcRenderer.invoke('yusic:spotify:search', query),
  searchSpotifyCatalog: (query, opts) =>
    ipcRenderer.invoke('yusic:spotify:searchCatalog', { query, ...(opts || {}) }),
  openPublicSpotifyLink: (url) => ipcRenderer.invoke('yusic:spotify:openPublicLink', url),
  prefetchSpotifyTrack: (track) => ipcRenderer.invoke('yusic:spotify:prefetch', track),

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
  onSpotifyAuthChanged: (cb) => subscribe('yusic:event:spotifyAuthChanged', cb),
  onUpdateStateChanged: (cb) => subscribe('yusic:event:updateState', cb)
});
