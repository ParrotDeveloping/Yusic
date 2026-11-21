import {
  clampSpeed,
  createShuffledQueue,
  getNextIndex,
  getPrevIndex,
  resolveEffectiveSpeed
} from '../main/playbackLogic.js';
import { compareSemver } from '../main/versionUtils.js';

const audio = document.getElementById('audio-player');

const DEFAULT_LAYOUT = Object.freeze({
  sidebarWidth: 288,
  sidebarNavHeight: 204,
  playerBarHeight: 90
});

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];
const EQ_PRESETS = Object.freeze({
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6, 5, 4, 2, 0.5, 0, 0, 0.5, 1, 1.5],
  pop: [-1.5, 1.5, 3.5, 4.5, 3, 0, -1, -1.5, 1.5, 2.5],
  rock: [4.5, 3.5, 2, 0.5, -1, -0.5, 1.5, 3.5, 4.5, 5],
  electronic: [5, 4, 1.5, 0, -1.5, 1.5, 0.5, 2.5, 4.5, 5],
  vocal: [-2.5, -2, -1, 1.5, 4, 4.5, 3.5, 1.5, -0.5, -1.5],
  acoustic: [3.5, 2.5, 1.5, 0.5, 1.5, 1.5, 2.5, 3.5, 2.5, 1.5],
  night: [2.5, 2, 1, 0, -1, 0, 1, 1.5, 0, -1]
});

const els = {
  appShell: document.getElementById('app-shell'),
  sidebar: document.getElementById('sidebar'),
  sidebarNavCard: document.getElementById('sidebar-nav-card'),
  sidebarLibraryCard: document.getElementById('sidebar-library-card'),
  resizerSidebarSplit: document.getElementById('resizer-sidebar-split'),
  resizerSidebar: document.getElementById('resizer-sidebar'),
  resizerPlayer: document.getElementById('resizer-player'),
  resizerCorner: document.getElementById('resizer-corner'),

  navLocal: document.getElementById('nav-local'),
  navSpotify: document.getElementById('nav-spotify'),
  navDownloader: document.getElementById('nav-downloader'),
  navSettings: document.getElementById('nav-settings'),
  badgeAllCount: document.getElementById('badge-all-count'),
  badgeSpotifyStatus: document.getElementById('badge-spotify-status'),
  badgeDlActive: document.getElementById('badge-dl-active'),

  sidebarLibraryHeading: document.getElementById('sidebar-library-heading'),
  localLibHeadBtns: document.getElementById('local-lib-head-btns'),
  spotifyLibHeadBtns: document.getElementById('spotify-lib-head-btns'),
  btnNewPlaylist: document.getElementById('btn-new-playlist'),
  btnOpenFolder: document.getElementById('btn-open-folder'),
  btnRescan: document.getElementById('btn-rescan'),
  btnPickFiles: document.getElementById('btn-pick-files'),
  btnSpSidebarRefresh: document.getElementById('btn-sp-sidebar-refresh'),
  sidebarPlaylists: document.getElementById('sidebar-playlists'),
  appVersionLabel: document.getElementById('app-version-label'),
  btnCheckUpdates: document.getElementById('btn-check-updates'),
  updateDot: document.getElementById('update-dot'),

  updateBanner: document.getElementById('update-banner'),
  updateBannerBadge: document.getElementById('update-banner-badge'),
  updateBannerTitle: document.getElementById('update-banner-title'),
  updateBannerSub: document.getElementById('update-banner-sub'),
  updateBannerProgress: document.getElementById('update-banner-progress'),
  btnBannerAction: document.getElementById('btn-banner-action'),
  btnBannerDetails: document.getElementById('btn-banner-details'),
  btnBannerDismiss: document.getElementById('btn-banner-dismiss'),

  viewLibrary: document.getElementById('view-library'),
  viewSpotify: document.getElementById('view-spotify'),
  viewDownloader: document.getElementById('view-downloader'),
  viewSettings: document.getElementById('view-settings'),

  // Local Library View
  libHero: document.getElementById('lib-hero'),
  libHeroCoverArt: document.getElementById('lib-hero-cover-art'),
  btnHeroPickCover: document.getElementById('btn-hero-pick-cover'),
  viewEyebrow: document.getElementById('view-eyebrow'),
  viewTitle: document.getElementById('view-title'),
  viewDesc: document.getElementById('view-desc'),
  viewMeta: document.getElementById('view-meta'),
  playlistSpeedPill: document.getElementById('playlist-speed-pill'),
  btnPlayAll: document.getElementById('btn-play-all'),
  btnShuffleAll: document.getElementById('btn-shuffle-all'),
  btnPlaylistSpeed: document.getElementById('btn-playlist-speed'),
  btnPlaylistEdit: document.getElementById('btn-playlist-edit'),
  searchInput: document.getElementById('search-input'),
  btnViewList: document.getElementById('btn-view-list'),
  btnViewCompact: document.getElementById('btn-view-compact'),
  btnViewGrid: document.getElementById('btn-view-grid'),
  sortWrap: document.getElementById('sort-wrap'),
  sortSelect: document.getElementById('sort-select'),
  trackTableHead: document.getElementById('track-table-head'),
  trackList: document.getElementById('track-list'),
  libraryEmpty: document.getElementById('library-empty'),
  emptyTitle: document.getElementById('empty-title'),
  emptyDesc: document.getElementById('empty-desc'),
  emptyMuzikPath: document.getElementById('empty-muzik-path'),
  btnEmptyOpenFolder: document.getElementById('btn-empty-open-folder'),
  btnEmptyGoSpotify: document.getElementById('btn-empty-go-spotify'),

  // Spotify View
  spTablist: document.getElementById('sp-tablist'),
  spTabLiked: document.getElementById('sp-tab-liked'),
  spTabPlaylists: document.getElementById('sp-tab-playlists'),
  spTabRecent: document.getElementById('sp-tab-recent'),
  spTabSearch: document.getElementById('sp-tab-search'),
  spTabPublic: document.getElementById('sp-tab-public'),
  spUserBar: document.getElementById('sp-user-bar'),
  spUserAvatar: document.getElementById('sp-user-avatar'),
  spUserName: document.getElementById('sp-user-name'),
  btnSpRefresh: document.getElementById('btn-sp-refresh'),
  btnSpLogout: document.getElementById('btn-sp-logout'),
  spConnectCard: document.getElementById('sp-connect-card'),
  btnSpLogin: document.getElementById('btn-sp-login'),
  btnSpGoPublic: document.getElementById('btn-sp-go-public'),
  btnSpOpenSettings: document.getElementById('btn-sp-open-settings'),
  spSearchBar: document.getElementById('sp-search-bar'),
  spSearchForm: document.getElementById('sp-search-form'),
  spSearchInput: document.getElementById('sp-search-input'),
  spPublicBar: document.getElementById('sp-public-bar'),
  spPublicForm: document.getElementById('sp-public-form'),
  spPublicUrl: document.getElementById('sp-public-url'),
  spPlaylistsGrid: document.getElementById('sp-playlists-grid'),
  spCollectionArea: document.getElementById('sp-collection-area'),
  spHero: document.getElementById('sp-hero'),
  spHeroCoverArt: document.getElementById('sp-hero-cover-art'),
  btnSpHeroPickCover: document.getElementById('btn-sp-hero-pick-cover'),
  spHeroEyebrow: document.getElementById('sp-hero-eyebrow'),
  spHeroTitle: document.getElementById('sp-hero-title'),
  spHeroDesc: document.getElementById('sp-hero-desc'),
  spHeroMeta: document.getElementById('sp-hero-meta'),
  spSpeedPill: document.getElementById('sp-speed-pill'),
  btnSpPlayAll: document.getElementById('btn-sp-play-all'),
  btnSpShuffleAll: document.getElementById('btn-sp-shuffle-all'),
  btnSpListSpeed: document.getElementById('btn-sp-list-speed'),
  spFilterInput: document.getElementById('sp-filter-input'),
  btnSpViewList: document.getElementById('btn-sp-view-list'),
  btnSpViewCompact: document.getElementById('btn-sp-view-compact'),
  btnSpViewGrid: document.getElementById('btn-sp-view-grid'),
  spTableHead: document.getElementById('sp-table-head'),
  spTrackList: document.getElementById('sp-track-list'),
  spLoadMoreWrap: document.getElementById('sp-load-more-wrap'),
  btnSpLoadMore: document.getElementById('btn-sp-load-more'),

  // Downloader View
  dlForm: document.getElementById('dl-form'),
  dlUrlInput: document.getElementById('dl-url-input'),
  btnDlStart: document.getElementById('btn-dl-start'),
  dlDetectPill: document.getElementById('dl-detect-pill'),
  chkAutoPlaylist: document.getElementById('chk-auto-playlist'),
  chkYtList: document.getElementById('chk-yt-list'),
  dlToolsWarning: document.getElementById('dl-tools-warning'),
  btnDlClear: document.getElementById('btn-dl-clear'),
  dlJobs: document.getElementById('dl-jobs'),

  // Settings View
  settingsTablist: document.getElementById('settings-tablist'),
  stabAppearance: document.getElementById('stab-appearance'),
  stabAudio: document.getElementById('stab-audio'),
  stabSpotify: document.getElementById('stab-spotify'),
  stabUpdates: document.getElementById('stab-updates'),
  spanelAppearance: document.getElementById('spanel-appearance'),
  spanelAudio: document.getElementById('spanel-audio'),
  spanelSpotify: document.getElementById('spanel-spotify'),
  spanelUpdates: document.getElementById('spanel-updates'),
  uiScaleLabel: document.getElementById('ui-scale-label'),
  uiScaleSlider: document.getElementById('ui-scale-slider'),
  uiScalePresets: document.getElementById('ui-scale-presets'),
  btnResetLayout: document.getElementById('btn-reset-layout'),
  layoutStatSidebar: document.getElementById('layout-stat-sidebar'),
  layoutStatNav: document.getElementById('layout-stat-nav'),
  layoutStatPlayer: document.getElementById('layout-stat-player'),
  chkEqEnabled: document.getElementById('chk-eq-enabled'),
  btnEqReset: document.getElementById('btn-eq-reset'),
  eqPresetsRow: document.getElementById('eq-presets-row'),
  eqBandsGrid: document.getElementById('eq-bands-grid'),
  settingsSpStatus: document.getElementById('settings-sp-status'),
  settingsSpClientId: document.getElementById('settings-sp-client-id'),
  btnSettingsSpSave: document.getElementById('btn-settings-sp-save'),
  btnSettingsSpReset: document.getElementById('btn-settings-sp-reset'),
  settingsSpRedirect: document.getElementById('settings-sp-redirect'),
  btnSettingsSpCopy: document.getElementById('btn-settings-sp-copy'),
  btnSettingsSpDashboard: document.getElementById('btn-settings-sp-dashboard'),
  settingsMuzikPath: document.getElementById('settings-muzik-path'),
  btnSettingsOpenFolder: document.getElementById('btn-settings-open-folder'),
  settingsUpdateDesc: document.getElementById('settings-update-desc'),
  settingsCurVer: document.getElementById('settings-cur-ver'),
  btnSettingsCheckUpdate: document.getElementById('btn-settings-check-update'),
  btnSettingsOpenGithub: document.getElementById('btn-settings-open-github'),

  // Player Bar & Speed Popover
  nowCoverImg: document.getElementById('now-cover-img'),
  nowCoverPlaceholder: document.querySelector('.now-cover-placeholder'),
  nowTitle: document.getElementById('now-title'),
  nowArtist: document.getElementById('now-artist'),
  visualizerCanvas: document.getElementById('visualizer-canvas'),

  btnShuffle: document.getElementById('btn-shuffle'),
  btnPrev: document.getElementById('btn-prev'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  iconPlay: document.getElementById('icon-play'),
  iconPause: document.getElementById('icon-pause'),
  btnNext: document.getElementById('btn-next'),
  btnRepeat: document.getElementById('btn-repeat'),
  repeatOneBadge: document.getElementById('repeat-one-badge'),
  timeCurrent: document.getElementById('time-current'),
  timeTotal: document.getElementById('time-total'),
  seekSlider: document.getElementById('seek-slider'),

  btnEqShortcut: document.getElementById('btn-eq-shortcut'),
  btnSpeedPanel: document.getElementById('btn-speed-panel'),
  speedTriggerSource: document.getElementById('speed-trigger-source'),
  speedTriggerRate: document.getElementById('speed-trigger-rate'),
  speedTriggerPitch: document.getElementById('speed-trigger-pitch'),
  btnMute: document.getElementById('btn-mute'),
  iconVolOn: document.getElementById('icon-vol-on'),
  iconVolOff: document.getElementById('icon-vol-off'),
  volumeSlider: document.getElementById('volume-slider'),

  speedPopover: document.getElementById('speed-popover'),
  speedPopoverSourceDesc: document.getElementById('speed-popover-source-desc'),
  btnSpeedReset: document.getElementById('btn-speed-reset'),
  speedValueLabel: document.getElementById('speed-value-label'),
  speedSlider: document.getElementById('speed-slider'),
  speedPresets: document.getElementById('speed-presets'),
  pitchPreserve: document.getElementById('pitch-preserve'),
  pitchChange: document.getElementById('pitch-change'),
  pitchHint: document.getElementById('pitch-hint'),
  btnSaveTrackSpeed: document.getElementById('btn-save-track-speed'),
  btnSaveListSpeed: document.getElementById('btn-save-list-speed'),
  btnClearActiveOverride: document.getElementById('btn-clear-active-override'),

  dropOverlay: document.getElementById('drop-overlay'),

  // Dialogs
  playlistDialog: document.getElementById('playlist-dialog'),
  playlistDialogTitle: document.getElementById('playlist-dialog-title'),
  playlistNameInput: document.getElementById('playlist-name-input'),
  playlistDialogSubmit: document.getElementById('playlist-dialog-submit'),

  playlistEditDialog: document.getElementById('playlist-edit-dialog'),
  plEditCoverPreview: document.getElementById('pl-edit-cover-preview'),
  btnPlEditPickCover: document.getElementById('btn-pl-edit-pick-cover'),
  btnPlEditClearCover: document.getElementById('btn-pl-edit-clear-cover'),
  plEditName: document.getElementById('pl-edit-name'),
  plEditDesc: document.getElementById('pl-edit-desc'),

  speedOverrideDialog: document.getElementById('speed-override-dialog'),
  spdOvTitle: document.getElementById('spd-ov-title'),
  spdOvTarget: document.getElementById('spd-ov-target'),
  spdOvLabel: document.getElementById('spd-ov-label'),
  spdOvSlider: document.getElementById('spd-ov-slider'),
  spdOvPresets: document.getElementById('spd-ov-presets'),
  ovPitchPreserve: document.getElementById('ov-pitch-preserve'),
  ovPitchChange: document.getElementById('ov-pitch-change'),

  addPlDialog: document.getElementById('add-to-playlist-dialog'),
  addPlTrackName: document.getElementById('add-pl-track-name'),
  addPlList: document.getElementById('add-pl-list'),
  addPlNewName: document.getElementById('add-pl-new-name'),
  btnAddPlQuick: document.getElementById('btn-add-pl-quick'),

  confirmDialog: document.getElementById('confirm-dialog'),
  confirmDialogTitle: document.getElementById('confirm-dialog-title'),
  confirmDialogMessage: document.getElementById('confirm-dialog-message'),
  confirmDialogOk: document.getElementById('confirm-dialog-ok'),

  updateDialog: document.getElementById('update-dialog'),
  updateCurVer: document.getElementById('update-cur-ver'),
  updateLatestVer: document.getElementById('update-latest-ver'),
  updateStatusMsg: document.getElementById('update-status-msg'),
  updateDialogProgressWrap: document.getElementById('update-dialog-progress-wrap'),
  updateDialogProgress: document.getElementById('update-dialog-progress'),
  updateDialogPct: document.getElementById('update-dialog-pct'),
  updateNotesWrap: document.getElementById('update-notes-wrap'),
  updateNotes: document.getElementById('update-notes'),
  btnUpdateRecheck: document.getElementById('btn-update-recheck'),
  btnUpdateGithub: document.getElementById('btn-update-github'),
  btnUpdateAction: document.getElementById('btn-update-action'),

  toastRegion: document.getElementById('toast-region'),
  ariaLiveRegion: document.getElementById('aria-live-region')
};

const state = {
  muzikDir: '',
  appVersion: '1.0.2',
  isPackaged: false,
  serverUrl: '',
  serverToken: '',
  tracks: [],
  trackMap: new Map(),
  spotifyTracksCache: new Map(),
  playlists: [],
  trackSpeedOverrides: {},
  externalListPrefs: {},
  downloads: [],
  toolsStatus: null,
  updateState: null,
  updateBannerDismissed: false,
  lastNotifiedUpdateStatus: null,

  settings: {
    volume: 0.85,
    muted: false,
    speed: 1.0,
    preservePitch: true,
    shuffle: false,
    repeatMode: 'off',
    autoCreatePlaylistOnDownload: true,
    downloadYoutubePlaylistOnWatch: true,
    libraryViewMode: 'list',
    uiScale: 1.0,
    eq: {
      enabled: false,
      preset: 'flat',
      bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    layout: { ...DEFAULT_LAYOUT }
  },

  viewTab: 'library', // 'library' | 'spotify' | 'downloader' | 'settings'
  settingsTab: 'appearance', // 'appearance' | 'audio' | 'spotify' | 'updates'
  activePlaylistId: null,
  searchQuery: '',
  sortBy: 'title',

  // Spotify View State
  spotifyAuth: { connected: false, clientId: '', user: null, redirectUri: '' },
  spotifySubTab: 'liked', // 'liked' | 'playlists' | 'recent' | 'search' | 'playlist-detail' | 'public'
  spotifyPlaylists: [],
  spotifyFilterQuery: '',
  spotifyCollection: {
    id: 'spotify:liked',
    title: 'Beğenilen Şarkılar',
    eyebrow: 'SPOTIFY BEĞENİLENLER',
    description: '',
    coverUrl: '',
    isLiked: true,
    spotifyPlaylistId: null,
    tracks: [],
    total: 0,
    hasMore: false,
    offset: 0,
    loading: false,
    truncatedAt100: false
  },

  baseQueueIds: [],
  queueIds: [],
  queueIndex: -1,
  currentTrackId: null,
  activeQueuePlaylistId: null,
  isSeeking: false,

  pendingPlaylistDialog: null,
  pendingEditPlaylistId: null,
  pendingSpeedOverrideCtx: null,
  pendingConfirmAction: null,
  pendingTrackForPlaylist: null
};

let settingsSaveTimer = null;
let audioCtx = null;
let eqFilters = [];
let analyserNode = null;
let analyserData = null;
let visualizerRaf = 0;
let playRequestToken = 0;

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatTotalDuration(totalSec) {
  const mins = Math.round((totalSec || 0) / 60);
  if (mins < 60) return `${mins} dk`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} sa ${m} dk`;
}

function clampInt(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
}

function clampScale(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 1.0;
  return Math.round(Math.min(1.5, Math.max(0.75, n)) * 100) / 100;
}

function getAnyTrackById(id) {
  return state.trackMap.get(id) || state.spotifyTracksCache.get(id) || null;
}

function rememberSpotifyTracks(tracks = []) {
  for (const t of tracks) {
    if (t?.id) state.spotifyTracksCache.set(t.id, t);
  }
}

function coverFileUrl(coverFile) {
  if (!coverFile) return '';
  return `${state.serverUrl}/cover/${encodeURIComponent(coverFile)}?t=${encodeURIComponent(state.serverToken)}`;
}

function coverUrlForTrack(track) {
  if (!track) return '';
  if (track.coverFile) return coverFileUrl(track.coverFile);
  if (track.coverUrl) return track.coverUrl;
  return '';
}

function audioUrlForTrack(track) {
  if (!track) return '';
  if (track.source === 'spotify') {
    const q = new URLSearchParams({
      t: state.serverToken,
      title: track.title || '',
      artist: track.artist || '',
      dur: String(track.durationMs || 0),
      preview: track.previewUrl || ''
    });
    return `${state.serverUrl}/stream/spotify/${encodeURIComponent(track.id)}?${q.toString()}`;
  }
  return `${state.serverUrl}/audio/${encodeURIComponent(track.id)}?t=${encodeURIComponent(state.serverToken)}`;
}

function syncSliderVisual(slider, ariaText = null) {
  if (!slider) return;
  slider.style.setProperty('--attr-min', slider.min === '' ? '0' : slider.min);
  slider.style.setProperty('--attr-max', slider.max === '' ? '100' : slider.max);
  slider.style.setProperty('--control-value', slider.value);
  if (ariaText !== null) {
    slider.setAttribute('aria-valuetext', ariaText);
  }
}

function saveSettingsPatch(patch, immediate = false) {
  state.settings = { ...state.settings, ...patch };
  if (immediate) {
    if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
    window.yusic.updateSettings(patch).catch(() => {});
    return;
  }
  if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    window.yusic.updateSettings(patch).catch(() => {});
  }, 220);
}

/* ---------------- Toast Notifications ---------------- */
function restackToasts() {
  const openToasts = Array.from(els.toastRegion.querySelectorAll('.toast'));
  openToasts.forEach((node, idx) => {
    node.style.setProperty('--toast-index', String(idx));
  });
}

function showToast(message, variant = 'info', durationMs = 4200) {
  if (document.querySelector('dialog:modal')) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${variant}`;
  toast.setAttribute('popover', 'manual');
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  toast.id = id;

  const textSpan = document.createElement('span');
  textSpan.className = 'toast-text';
  textSpan.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Bildirimi kapat');
  closeBtn.setAttribute('popovertarget', id);
  closeBtn.setAttribute('popovertargetaction', 'hide');

  toast.append(textSpan, closeBtn);
  els.toastRegion.appendChild(toast);

  let timer = null;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    if (toast.isConnected) toast.remove();
    restackToasts();
  };

  const scheduleHide = () => {
    if (timer) clearTimeout(timer);
    if (durationMs <= 0) return;
    timer = setTimeout(() => {
      if (toast.matches(':focus-within') || toast.matches(':hover')) {
        scheduleHide();
        return;
      }
      if (toast.isConnected) {
        try {
          toast.hidePopover();
        } catch {
          cleanup();
        }
      }
    }, durationMs);
  };

  toast.addEventListener('toggle', (e) => {
    if (e.newState === 'open') {
      restackToasts();
      scheduleHide();
    } else {
      cleanup();
      if (
        previousFocus &&
        previousFocus.isConnected &&
        (document.activeElement === document.body || !document.activeElement)
      ) {
        previousFocus.focus({ preventScroll: true });
      }
    }
  });

  toast.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      try {
        toast.hidePopover();
      } catch {
        cleanup();
      }
    }
  });

  els.ariaLiveRegion.textContent = message;

  try {
    toast.showPopover();
  } catch {
    restackToasts();
    scheduleHide();
  }
}

/* ---------------- Accessible Tablists ---------------- */
function bindTablistKeyboard(tablistEl, activateTabFn) {
  if (!tablistEl) return;
  tablistEl.addEventListener('keydown', (e) => {
    const tabs = Array.from(tablistEl.querySelectorAll('[role="tab"]'));
    if (tabs.length === 0) return;
    const idx = tabs.indexOf(document.activeElement);
    if (idx === -1) return;

    let nextIdx = -1;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = tabs.length - 1;
    else return;

    e.preventDefault();
    const target = tabs[nextIdx];
    target.focus();
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    activateTabFn(target);
  });
}

function syncSettingsTabs() {
  const mapping = [
    { key: 'appearance', tab: els.stabAppearance, panel: els.spanelAppearance },
    { key: 'audio', tab: els.stabAudio, panel: els.spanelAudio },
    { key: 'spotify', tab: els.stabSpotify, panel: els.spanelSpotify },
    { key: 'updates', tab: els.stabUpdates, panel: els.spanelUpdates }
  ];

  for (const item of mapping) {
    const active = state.settingsTab === item.key;
    item.tab.setAttribute('aria-selected', String(active));
    item.tab.setAttribute('tabindex', active ? '0' : '-1');
    item.panel.hidden = !active;
    if (active) {
      item.panel.setAttribute('tabindex', '0');
    } else {
      item.panel.removeAttribute('tabindex');
    }
  }
}

/* ---------------- UI Scaling & Resizable Panel Layout ---------------- */
function applyUiScale(rawScale, persist = false, immediate = false) {
  const scale = clampScale(rawScale);
  state.settings.uiScale = scale;

  try {
    window.yusic.setZoomFactor(scale);
  } catch {
    // Ignore zoom errors in non-Electron test environments
  }

  const pctText = `%${Math.round(scale * 100)}`;
  els.uiScaleSlider.value = String(scale);
  els.uiScaleLabel.textContent = pctText;
  syncSliderVisual(els.uiScaleSlider, pctText);

  for (const chip of els.uiScalePresets.querySelectorAll('.preset-chip')) {
    const chipScale = Number(chip.dataset.scale);
    chip.classList.toggle('is-selected', Math.abs(chipScale - scale) < 0.015);
  }

  if (persist) {
    saveSettingsPatch({ uiScale: scale }, immediate);
  }
}

function sanitizeLayoutValues(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    sidebarWidth: clampInt(r.sidebarWidth, 220, 520, DEFAULT_LAYOUT.sidebarWidth),
    sidebarNavHeight: clampInt(r.sidebarNavHeight, 145, 360, DEFAULT_LAYOUT.sidebarNavHeight),
    playerBarHeight: clampInt(r.playerBarHeight, 76, 140, DEFAULT_LAYOUT.playerBarHeight)
  };
}

function applyLayout(rawLayout) {
  const layout = sanitizeLayoutValues(rawLayout);
  state.settings.layout = layout;
  els.appShell.style.setProperty('--sidebar-width', `${layout.sidebarWidth}px`);
  els.appShell.style.setProperty('--sidebar-nav-height', `${layout.sidebarNavHeight}px`);
  els.appShell.style.setProperty('--player-bar-height', `${layout.playerBarHeight}px`);

  els.layoutStatSidebar.textContent = `Kenar Çubuğu: ${layout.sidebarWidth} px`;
  els.layoutStatNav.textContent = `Üst Menü: ${layout.sidebarNavHeight} px`;
  els.layoutStatPlayer.textContent = `Alt Oynatıcı: ${layout.playerBarHeight} px`;
}

function attachPointerResizer(handleEl, onStart, onMove, onDoubleClick) {
  if (!handleEl) return;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let snapshot = null;

  handleEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    snapshot = onStart();
    handleEl.classList.add('is-dragging');
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture errors
    }
  });

  handleEl.addEventListener('pointermove', (e) => {
    if (!dragging || !snapshot) return;
    onMove(e.clientX - startX, e.clientY - startY, snapshot);
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    handleEl.classList.remove('is-dragging');
    try {
      if (handleEl.hasPointerCapture(e.pointerId)) {
        handleEl.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
    saveSettingsPatch({ layout: { ...state.settings.layout } }, true);
  };

  handleEl.addEventListener('pointerup', endDrag);
  handleEl.addEventListener('pointercancel', endDrag);
  handleEl.addEventListener('dblclick', () => {
    onDoubleClick();
    saveSettingsPatch({ layout: { ...state.settings.layout } }, true);
  });
}

function setupPanelResizers() {
  attachPointerResizer(
    els.resizerSidebar,
    () => ({ ...state.settings.layout }),
    (dx, _dy, snap) => applyLayout({ ...snap, sidebarWidth: snap.sidebarWidth + dx }),
    () => applyLayout({ ...state.settings.layout, sidebarWidth: DEFAULT_LAYOUT.sidebarWidth })
  );

  attachPointerResizer(
    els.resizerSidebarSplit,
    () => ({ ...state.settings.layout }),
    (_dx, dy, snap) => applyLayout({ ...snap, sidebarNavHeight: snap.sidebarNavHeight + dy }),
    () => applyLayout({ ...state.settings.layout, sidebarNavHeight: DEFAULT_LAYOUT.sidebarNavHeight })
  );

  attachPointerResizer(
    els.resizerPlayer,
    () => ({ ...state.settings.layout }),
    (_dx, dy, snap) => applyLayout({ ...snap, playerBarHeight: snap.playerBarHeight - dy }),
    () => applyLayout({ ...state.settings.layout, playerBarHeight: DEFAULT_LAYOUT.playerBarHeight })
  );

  attachPointerResizer(
    els.resizerCorner,
    () => ({ ...state.settings.layout }),
    (dx, dy, snap) =>
      applyLayout({
        ...snap,
        sidebarWidth: snap.sidebarWidth + dx,
        playerBarHeight: snap.playerBarHeight - dy
      }),
    () => applyLayout({ ...DEFAULT_LAYOUT })
  );
}

/* ---------------- Web Audio Graph (10-Band EQ + Visualizer) ---------------- */
function ensureEqStateShape() {
  const eq = state.settings.eq || {};
  const bands = EQ_FREQUENCIES.map((_, idx) => {
    const v = Number(eq.bands?.[idx]);
    return Number.isFinite(v) ? Math.round(Math.min(12, Math.max(-12, v)) * 10) / 10 : 0;
  });
  state.settings.eq = {
    enabled: Boolean(eq.enabled),
    preset: String(eq.preset || 'flat'),
    bands
  };
  return state.settings.eq;
}

function buildEqBandsUI() {
  els.eqBandsGrid.innerHTML = '';
  EQ_FREQUENCIES.forEach((freq, idx) => {
    const col = document.createElement('div');
    col.className = 'eq-band-col';

    const dbLabel = document.createElement('span');
    dbLabel.className = 'eq-band-db';
    dbLabel.textContent = '0 dB';

    const sliderBox = document.createElement('div');
    sliderBox.className = 'eq-slider-box';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'yusic-slider eq-band-slider';
    slider.min = '-12';
    slider.max = '12';
    slider.step = '0.5';
    slider.value = '0';
    slider.dataset.bandIndex = String(idx);
    slider.setAttribute('aria-label', `${EQ_LABELS[idx]} frekans bandı`);

    slider.addEventListener('input', () => {
      const val = Math.round(Math.min(12, Math.max(-12, Number(slider.value) || 0)) * 10) / 10;
      const eq = ensureEqStateShape();
      eq.bands[idx] = val;
      eq.preset = 'custom';
      applyEqToAudioGraph();
      renderEqUI();
      saveSettingsPatch({ eq: { ...eq, bands: eq.bands.slice() } }, false);
    });

    sliderBox.appendChild(slider);

    const freqLabel = document.createElement('span');
    freqLabel.className = 'eq-band-freq';
    freqLabel.textContent = EQ_LABELS[idx];

    col.append(dbLabel, sliderBox, freqLabel);
    els.eqBandsGrid.appendChild(col);
  });
}

function applyEqToAudioGraph() {
  const eq = ensureEqStateShape();
  if (!audioCtx || eqFilters.length !== EQ_FREQUENCIES.length) return;
  const now = audioCtx.currentTime;
  eqFilters.forEach((filter, idx) => {
    const gain = eq.enabled ? eq.bands[idx] : 0;
    try {
      filter.gain.setTargetAtTime(gain, now, 0.015);
    } catch {
      filter.gain.value = gain;
    }
  });
}

function renderEqUI() {
  const eq = ensureEqStateShape();
  els.chkEqEnabled.checked = eq.enabled;
  els.btnEqShortcut.classList.toggle('is-modified', eq.enabled);

  for (const chip of els.eqPresetsRow.querySelectorAll('.preset-chip')) {
    chip.classList.toggle('is-selected', chip.dataset.eqPreset === eq.preset);
  }

  const sliders = els.eqBandsGrid.querySelectorAll('.eq-band-slider');
  const dbLabels = els.eqBandsGrid.querySelectorAll('.eq-band-db');
  sliders.forEach((slider, idx) => {
    const val = eq.bands[idx] || 0;
    slider.value = String(val);
    const formatted = `${val > 0 ? '+' : ''}${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)} dB`;
    syncSliderVisual(slider, formatted);
    if (dbLabels[idx]) dbLabels[idx].textContent = formatted;
  });
}

function ensureAudioGraphConnected() {
  if (audioCtx) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    const source = audioCtx.createMediaElementSource(audio);

    eqFilters = EQ_FREQUENCIES.map((freq, idx) => {
      const filter = audioCtx.createBiquadFilter();
      filter.frequency.value = freq;
      if (idx === 0) {
        filter.type = 'lowshelf';
      } else if (idx === EQ_FREQUENCIES.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
        filter.Q.value = 1.4;
      }
      return filter;
    });

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 64;
    analyserNode.smoothingTimeConstant = 0.78;

    let node = source;
    for (const filter of eqFilters) {
      node.connect(filter);
      node = filter;
    }
    node.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
    analyserData = new Uint8Array(analyserNode.frequencyBinCount);

    applyEqToAudioGraph();
  } catch {
    audioCtx = null;
    eqFilters = [];
    analyserNode = null;
  }
}

function drawVisualizer() {
  const canvas = els.visualizerCanvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const barCount = 12;
  const gap = 2;
  const barW = (canvas.width - gap * (barCount - 1)) / barCount;

  if (!analyserNode || audio.paused) {
    for (let i = 0; i < barCount; i++) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.fillRect(i * (barW + gap), canvas.height - 3, barW, 3);
    }
    visualizerRaf = 0;
    return;
  }

  analyserNode.getByteFrequencyData(analyserData);
  for (let i = 0; i < barCount; i++) {
    const val = analyserData[i + 1] || 0;
    const h = Math.max(3, (val / 255) * canvas.height);
    const grad = ctx.createLinearGradient(0, canvas.height - h, 0, canvas.height);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(1, '#1d4ed8');
    ctx.fillStyle = grad;
    ctx.fillRect(i * (barW + gap), canvas.height - h, barW, h);
  }
  visualizerRaf = requestAnimationFrame(drawVisualizer);
}

function kickVisualizer() {
  if (!visualizerRaf) {
    visualizerRaf = requestAnimationFrame(drawVisualizer);
  }
}

/* ---------------- Modal Dialog Fallbacks & Helpers ---------------- */
function setupDialogEnhancements() {
  const dialogs = document.querySelectorAll('dialog');
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    for (const dlg of dialogs) {
      if (dlg.getAttribute('closedby') !== 'any') continue;
      dlg.addEventListener('click', (event) => {
        if (event.target !== dlg) return;
        const rect = dlg.getBoundingClientRect();
        const inside =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!inside) dlg.close('cancel');
      });
    }
  }

  els.playlistDialog.addEventListener('close', async () => {
    const action = els.playlistDialog.returnValue;
    els.playlistDialog.returnValue = '';
    const ctx = state.pendingPlaylistDialog;
    state.pendingPlaylistDialog = null;
    if (action !== 'confirm' || !ctx) return;

    const name = els.playlistNameInput.value.trim();
    if (!name) return;

    if (ctx.mode === 'create') {
      const created = await window.yusic.createPlaylist(name);
      if (ctx.pendingTrackId && created?.id) {
        await window.yusic.addTracksToPlaylist(created.id, [ctx.pendingTrackId]);
        showToast(`"${created.name}" oluşturuldu ve şarkı eklendi.`, 'success');
      } else {
        showToast(`"${created.name}" playlisti oluşturuldu.`, 'success');
      }
      if (created?.id) {
        state.viewTab = 'library';
        state.activePlaylistId = created.id;
        renderAll();
      }
    } else if (ctx.mode === 'rename' && ctx.playlistId) {
      await window.yusic.renamePlaylist(ctx.playlistId, name);
      showToast('Playlist adı güncellendi.', 'success');
    }
  });

  els.playlistEditDialog.addEventListener('close', async () => {
    const action = els.playlistEditDialog.returnValue;
    els.playlistEditDialog.returnValue = '';
    const plId = state.pendingEditPlaylistId;
    state.pendingEditPlaylistId = null;
    if (action !== 'confirm' || !plId) return;

    const name = els.plEditName.value.trim();
    const description = els.plEditDesc.value.trim();
    await window.yusic.updatePlaylistDetails(plId, { name, description });
    showToast('Playlist bilgileri güncellendi.', 'success');
  });

  els.speedOverrideDialog.addEventListener('close', async () => {
    const action = els.speedOverrideDialog.returnValue;
    els.speedOverrideDialog.returnValue = '';
    const ctx = state.pendingSpeedOverrideCtx;
    state.pendingSpeedOverrideCtx = null;
    if (!ctx || action === 'cancel' || action === '') return;

    const speed = clampSpeed(els.spdOvSlider.value);
    const preservePitch = els.ovPitchPreserve.checked;
    const override = action === 'clear' ? null : { speed, preservePitch };

    if (ctx.kind === 'track') {
      state.trackSpeedOverrides = await window.yusic.setTrackSpeedOverride(ctx.id, override);
      showToast(
        override
          ? `"${ctx.label}" için ${speed.toFixed(2)}x hız kaydedildi.`
          : `"${ctx.label}" özel hızı kaldırıldı.`,
        'success'
      );
    } else if (ctx.kind === 'local-playlist') {
      await window.yusic.updatePlaylistDetails(ctx.id, { speedOverride: override });
      showToast(
        override
          ? `Liste hızı ${speed.toFixed(2)}x olarak kaydedildi.`
          : 'Liste özel hızı kaldırıldı.',
        'success'
      );
    } else if (ctx.kind === 'external-playlist') {
      state.externalListPrefs = await window.yusic.updateExternalListPref(ctx.id, {
        speedOverride: override
      });
      showToast(
        override
          ? `Liste hızı ${speed.toFixed(2)}x olarak kaydedildi.`
          : 'Liste özel hızı kaldırıldı.',
        'success'
      );
    }

    renderAll();
  });

  els.confirmDialog.addEventListener('close', async () => {
    const action = els.confirmDialog.returnValue;
    els.confirmDialog.returnValue = '';
    const cb = state.pendingConfirmAction;
    state.pendingConfirmAction = null;
    if (action === 'confirm' && typeof cb === 'function') {
      await cb();
    }
  });

  els.addPlDialog.addEventListener('close', () => {
    els.addPlDialog.returnValue = '';
    state.pendingTrackForPlaylist = null;
  });

  els.updateDialog.addEventListener('close', () => {
    els.updateDialog.returnValue = '';
  });
}

function openPlaylistDialog(mode, { playlistId = null, initialName = '', pendingTrackId = null } = {}) {
  state.pendingPlaylistDialog = { mode, playlistId, pendingTrackId };
  els.playlistDialogTitle.textContent = mode === 'rename' ? 'Playlisti Yeniden Adlandır' : 'Yeni Playlist';
  els.playlistDialogSubmit.textContent = mode === 'rename' ? 'Kaydet' : 'Oluştur';
  els.playlistNameInput.value = initialName;
  els.playlistDialog.showModal();
  els.playlistNameInput.focus();
  els.playlistNameInput.select();
}

function renderPlaylistEditCoverPreview(pl) {
  els.plEditCoverPreview.innerHTML = '';
  if (pl?.coverFile) {
    const img = document.createElement('img');
    img.src = coverFileUrl(pl.coverFile);
    img.alt = '';
    els.plEditCoverPreview.appendChild(img);
  } else {
    els.plEditCoverPreview.textContent = '♪';
  }
}

function openPlaylistEditDialog(pl) {
  if (!pl) return;
  state.pendingEditPlaylistId = pl.id;
  els.plEditName.value = pl.name;
  els.plEditDesc.value = pl.description || '';
  renderPlaylistEditCoverPreview(pl);
  els.playlistEditDialog.showModal();
  els.plEditName.focus();
}

function syncSpeedOverrideDialogUI(speed, preservePitch) {
  const s = clampSpeed(speed);
  els.spdOvSlider.value = String(s);
  const label = `${s.toFixed(2)}x`;
  els.spdOvLabel.textContent = label;
  syncSliderVisual(els.spdOvSlider, label);
  els.ovPitchPreserve.checked = Boolean(preservePitch);
  els.ovPitchChange.checked = !preservePitch;
  for (const chip of els.spdOvPresets.querySelectorAll('.preset-chip')) {
    chip.classList.toggle('is-selected', Math.abs(Number(chip.dataset.speed) - s) < 0.01);
  }
}

function openSpeedOverrideDialog({ kind, id, label, currentOverride }) {
  state.pendingSpeedOverrideCtx = { kind, id, label };
  els.spdOvTitle.textContent =
    kind === 'track' ? 'Şarkıya Özel Hız Ayarı' : 'Listeye Özel Hız Ayarı';
  els.spdOvTarget.textContent = label;

  const baseSpeed = currentOverride?.speed ?? state.settings.speed ?? 1.0;
  const basePitch =
    currentOverride?.preservePitch !== undefined
      ? currentOverride.preservePitch
      : state.settings.preservePitch;
  syncSpeedOverrideDialogUI(baseSpeed, basePitch);
  els.speedOverrideDialog.showModal();
}

function openConfirmDialog({ title, message, okLabel = 'Sil', onConfirm }) {
  state.pendingConfirmAction = onConfirm;
  els.confirmDialogTitle.textContent = title;
  els.confirmDialogMessage.textContent = message;
  els.confirmDialogOk.textContent = okLabel;
  els.confirmDialog.showModal();
}

function openAddToPlaylistDialog(track) {
  state.pendingTrackForPlaylist = track;
  els.addPlTrackName.textContent = `${track.artist} — ${track.title}`;
  els.addPlNewName.value = '';
  renderAddToPlaylistModalList();
  els.addPlDialog.showModal();
}

function renderAddToPlaylistModalList() {
  const track = state.pendingTrackForPlaylist;
  if (!track) return;
  els.addPlList.innerHTML = '';

  if (state.playlists.length === 0) {
    const p = document.createElement('p');
    p.className = 'playlist-empty-note';
    p.textContent = 'Henüz playlist yok. Aşağıdan hemen bir tane oluşturabilirsin.';
    els.addPlList.appendChild(p);
    return;
  }

  for (const pl of state.playlists) {
    const already = pl.trackIds.includes(track.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'add-pl-item';
    btn.innerHTML = `<span></span><span class="playlist-sub"></span>`;
    btn.firstElementChild.textContent = pl.name;
    btn.lastElementChild.textContent = already ? '✓ Listede' : '+ Ekle';
    btn.addEventListener('click', async () => {
      if (already) {
        await window.yusic.removeTrackFromPlaylist(pl.id, track.id);
        showToast(`"${track.title}" listeden çıkarıldı.`, 'info');
      } else {
        await window.yusic.addTracksToPlaylist(pl.id, [track.id]);
        showToast(`"${track.title}" -> "${pl.name}" eklendi.`, 'success');
      }
      renderAddToPlaylistModalList();
    });
    els.addPlList.appendChild(btn);
  }
}

/* ---------------- Speed, Volume & Transport ---------------- */
function getListSpeedOverride(listId) {
  if (!listId) return null;
  const localPl = state.playlists.find((p) => p.id === listId);
  if (localPl?.speedOverride) return localPl.speedOverride;
  const extPref = state.externalListPrefs?.[listId];
  if (extPref?.speedOverride) return extPref.speedOverride;
  return null;
}

function getActiveEffectiveSpeed() {
  const trackOverride = state.currentTrackId
    ? state.trackSpeedOverrides[state.currentTrackId] || null
    : null;
  const playlistOverride = getListSpeedOverride(state.activeQueuePlaylistId);
  return resolveEffectiveSpeed({
    trackOverride,
    playlistOverride,
    globalSettings: state.settings
  });
}

function applySpeedAndPitch() {
  const eff = getActiveEffectiveSpeed();
  const speed = clampSpeed(eff.speed);
  const preserve = Boolean(eff.preservePitch);

  audio.defaultPlaybackRate = speed;
  audio.playbackRate = speed;
  if ('preservesPitch' in audio) audio.preservesPitch = preserve;
  if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = preserve;

  const formatted = `${speed.toFixed(2)}x`;
  els.speedSlider.value = String(speed);
  syncSliderVisual(els.speedSlider, formatted);
  els.speedValueLabel.textContent = formatted;
  els.speedTriggerRate.textContent = formatted;
  els.speedTriggerPitch.textContent = preserve ? 'Sabit Ton' : 'Ton Değişir';

  els.speedTriggerSource.hidden = eff.source === 'global';
  els.speedTriggerSource.textContent = eff.source === 'track' ? 'Şarkı' : 'Liste';
  els.speedPopoverSourceDesc.textContent =
    eff.source === 'track'
      ? 'Bu şarkı için kayıtlı özel hız aktif'
      : eff.source === 'playlist'
        ? 'Aktif liste için kayıtlı özel hız aktif'
        : 'Genel çalma ayarı aktif';

  els.btnSpeedPanel.classList.toggle('is-modified', speed !== 1 || !preserve || eff.source !== 'global');
  els.btnSaveTrackSpeed.disabled = !state.currentTrackId;
  els.btnSaveListSpeed.disabled = !state.activeQueuePlaylistId;
  els.btnClearActiveOverride.hidden = eff.source === 'global';

  els.pitchPreserve.checked = preserve;
  els.pitchChange.checked = !preserve;
  els.pitchHint.textContent = preserve
    ? 'Şarkı hızlansa veya yavaşlasa bile ses tonu orijinal kalır.'
    : 'Hız arttıkça ses tonu incelir (Nightcore), azaldıkça kalınlaşır (Slowed).';

  for (const chip of els.speedPresets.querySelectorAll('.preset-chip')) {
    const chipVal = Number(chip.dataset.speed);
    chip.classList.toggle('is-selected', Math.abs(chipVal - speed) < 0.01);
  }
}

function applyVolume() {
  const vol = Math.min(1, Math.max(0, Number(state.settings.volume) || 0));
  const muted = Boolean(state.settings.muted);
  audio.volume = vol;
  audio.muted = muted;

  const displayVal = muted ? 0 : vol;
  els.volumeSlider.value = String(displayVal);
  syncSliderVisual(els.volumeSlider, `%${Math.round(displayVal * 100)}`);
  els.iconVolOn.hidden = muted || vol === 0;
  els.iconVolOff.hidden = !(muted || vol === 0);
  els.btnMute.setAttribute('aria-label', muted ? 'Sesi Aç' : 'Sesi Kapat');
}

function applyTransportState() {
  const shuffleOn = Boolean(state.settings.shuffle);
  els.btnShuffle.setAttribute('aria-pressed', String(shuffleOn));
  els.btnShuffle.title = shuffleOn ? 'Karışık Çal: Açık (S)' : 'Karışık Çal: Kapalı (S)';

  const mode = state.settings.repeatMode || 'off';
  els.btnRepeat.dataset.repeat = mode;
  els.repeatOneBadge.hidden = mode !== 'one';
  const labels = {
    off: 'Döngü: Kapalı (R)',
    all: 'Döngü: Tümünü Tekrarla (R)',
    one: 'Döngü: Tek Şarkı (R)'
  };
  els.btnRepeat.title = labels[mode];
  els.btnRepeat.setAttribute('aria-label', labels[mode]);

  const isPlaying = !audio.paused && !audio.ended && Boolean(state.currentTrackId);
  els.iconPlay.hidden = isPlaying;
  els.iconPause.hidden = !isPlaying;
  els.btnPlayPause.setAttribute('aria-label', isPlaying ? 'Duraklat' : 'Oynat');
}

/* ---------------- Playback Engine (AbortError Race-Guarded) ---------------- */
function setQueueAndPlay(orderedIds, startTrackId = null, queuePlaylistId = null) {
  const validIds = orderedIds.filter((id) => Boolean(getAnyTrackById(id)));
  if (validIds.length === 0) {
    showToast('Çalınabilecek şarkı bulunamadı.', 'info');
    return;
  }

  state.baseQueueIds = validIds;
  state.activeQueuePlaylistId = queuePlaylistId || null;
  const chosenId = startTrackId && validIds.includes(startTrackId) ? startTrackId : validIds[0];

  if (state.settings.shuffle) {
    state.queueIds = createShuffledQueue(validIds, startTrackId ? chosenId : null);
  } else {
    state.queueIds = validIds.slice();
  }

  const startIndex = startTrackId ? state.queueIds.indexOf(chosenId) : 0;
  playAtQueueIndex(startIndex >= 0 ? startIndex : 0);
}

async function playAtQueueIndex(index) {
  const reqToken = ++playRequestToken;

  if (index < 0 || index >= state.queueIds.length) {
    audio.pause();
    applyTransportState();
    return;
  }
  const trackId = state.queueIds[index];
  const track = getAnyTrackById(trackId);
  if (!track) return;

  state.queueIndex = index;
  state.currentTrackId = trackId;
  updateNowPlayingUI(track, track.source === 'spotify');
  highlightPlayingRows();

  // Pause cleanly before reassigning src to prevent AbortError storms on rapid clicks
  audio.pause();
  audio.src = audioUrlForTrack(track);
  applySpeedAndPitch();
  applyVolume();

  ensureAudioGraphConnected();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  try {
    await audio.play();
    if (reqToken !== playRequestToken) return;

    updateNowPlayingUI(track, false);
    applySpeedAndPitch();
    kickVisualizer();

    const nextIdx = getNextIndex(state.queueIds.length, index, state.settings.repeatMode, true);
    if (nextIdx >= 0 && nextIdx !== index) {
      const nextTrack = getAnyTrackById(state.queueIds[nextIdx]);
      if (nextTrack?.source === 'spotify') {
        window.yusic.prefetchSpotifyTrack(nextTrack).catch(() => {});
      }
    }
  } catch (err) {
    if (reqToken !== playRequestToken) return;
    const msg = String(err?.message || '');
    if (
      err?.name === 'AbortError' ||
      /interrupted by a (new load|call to pause)/i.test(msg)
    ) {
      return;
    }
    updateNowPlayingUI(track, false);
    showToast(`Şarkı çalınamadı: ${msg || 'Bilinmeyen hata'}`, 'error');
  }

  if (reqToken === playRequestToken) {
    applyTransportState();
  }
}

function updateNowPlayingUI(track, isConnecting = false) {
  if (!track) {
    els.nowTitle.textContent = 'Şarkı seçilmedi';
    els.nowArtist.textContent = 'Çalmak için listeden bir şarkıya tıkla';
    els.nowCoverImg.hidden = true;
    els.nowCoverPlaceholder.hidden = false;
    return;
  }

  els.nowTitle.textContent = track.title;
  els.nowArtist.textContent = isConnecting
    ? `${track.artist} • Akış bağlanıyor...`
    : track.artist;

  const coverUrl = coverUrlForTrack(track);
  if (coverUrl) {
    els.nowCoverImg.src = coverUrl;
    els.nowCoverImg.hidden = false;
    els.nowCoverPlaceholder.hidden = true;
  } else {
    els.nowCoverImg.removeAttribute('src');
    els.nowCoverImg.hidden = true;
    els.nowCoverPlaceholder.hidden = false;
  }

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || 'Yusic',
        artwork: coverUrl ? [{ src: coverUrl, sizes: '512x512', type: 'image/jpeg' }] : []
      });
    } catch {
      // Ignore MediaMetadata errors
    }
  }
}

function highlightPlayingRows() {
  for (const el of document.querySelectorAll('.track-row, .track-card')) {
    el.classList.toggle('is-playing', el.dataset.trackId === state.currentTrackId);
  }
}

function handleNext(isManual = true) {
  if (state.queueIds.length === 0) return;
  const nextIdx = getNextIndex(
    state.queueIds.length,
    state.queueIndex,
    state.settings.repeatMode,
    isManual
  );
  if (nextIdx === -1) {
    audio.pause();
    audio.currentTime = 0;
    applyTransportState();
    return;
  }
  if (!isManual && state.settings.repeatMode === 'one' && nextIdx === state.queueIndex) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    applySpeedAndPitch();
    return;
  }
  playAtQueueIndex(nextIdx);
}

function handlePrev() {
  if (state.queueIds.length === 0) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    if (audio.paused) audio.play().catch(() => {});
    return;
  }
  const prevIdx = getPrevIndex(
    state.queueIds.length,
    state.queueIndex,
    state.settings.repeatMode,
    audio.currentTime
  );
  if (prevIdx >= 0) {
    playAtQueueIndex(prevIdx);
  }
}

function togglePlayPause() {
  if (!state.currentTrackId) {
    if (state.viewTab === 'spotify' && state.spotifyCollection.tracks.length > 0) {
      setQueueAndPlay(
        state.spotifyCollection.tracks.map((t) => t.id),
        state.spotifyCollection.tracks[0].id,
        state.spotifyCollection.id
      );
      return;
    }
    const visible = getVisibleTracks();
    if (visible.length > 0) {
      setQueueAndPlay(visible.map((t) => t.id), visible[0].id, state.activePlaylistId);
    }
    return;
  }
  ensureAudioGraphConnected();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (audio.paused) {
    audio.play().catch(() => {});
    kickVisualizer();
  } else {
    audio.pause();
  }
}

function toggleShuffle() {
  const nextShuffle = !state.settings.shuffle;
  saveSettingsPatch({ shuffle: nextShuffle }, true);

  if (state.baseQueueIds.length > 0) {
    if (nextShuffle) {
      state.queueIds = createShuffledQueue(state.baseQueueIds, state.currentTrackId);
      state.queueIndex = state.currentTrackId ? state.queueIds.indexOf(state.currentTrackId) : 0;
    } else {
      state.queueIds = state.baseQueueIds.slice();
      state.queueIndex = state.currentTrackId ? state.queueIds.indexOf(state.currentTrackId) : 0;
    }
  }
  applyTransportState();
}

function cycleRepeatMode() {
  const order = ['off', 'all', 'one'];
  const idx = order.indexOf(state.settings.repeatMode || 'off');
  const nextMode = order[(idx + 1) % order.length];
  saveSettingsPatch({ repeatMode: nextMode }, true);
  applyTransportState();
}

/* ---------------- Shared Hero Cover & Track Collection Renderer ---------------- */
function renderHeroCoverArt(targetEl, { customCoverFile = null, spotifyCoverUrl = '', tracks = [], isLiked = false }) {
  targetEl.innerHTML = '';
  targetEl.classList.toggle('hero-cover-art--liked', Boolean(isLiked && !customCoverFile));

  if (customCoverFile) {
    const img = document.createElement('img');
    img.src = coverFileUrl(customCoverFile);
    img.alt = '';
    targetEl.appendChild(img);
    return;
  }

  if (spotifyCoverUrl) {
    const img = document.createElement('img');
    img.src = spotifyCoverUrl;
    img.alt = '';
    targetEl.appendChild(img);
    return;
  }

  if (isLiked) {
    targetEl.textContent = '♥';
    return;
  }

  const covers = [];
  for (const t of tracks) {
    const url = coverUrlForTrack(t);
    if (url && !covers.includes(url)) covers.push(url);
    if (covers.length >= 4) break;
  }

  if (covers.length === 1) {
    const img = document.createElement('img');
    img.src = covers[0];
    img.alt = '';
    targetEl.appendChild(img);
  } else if (covers.length >= 2) {
    const collage = document.createElement('div');
    collage.className = 'hero-collage';
    for (let i = 0; i < 4; i++) {
      if (covers[i]) {
        const img = document.createElement('img');
        img.src = covers[i];
        img.alt = '';
        collage.appendChild(img);
      } else {
        const tile = document.createElement('div');
        tile.className = 'hero-collage-tile';
        tile.textContent = '♪';
        collage.appendChild(tile);
      }
    }
    targetEl.appendChild(collage);
  } else {
    targetEl.textContent = '♪';
  }
}

function renderTrackCollection({
  containerEl,
  tableHeadEl,
  tracks,
  viewMode,
  localPlaylist = null,
  queueListId = null,
  allowReorder = false,
  isExternal = false
}) {
  containerEl.innerHTML = '';
  containerEl.classList.remove('is-compact', 'is-grid');
  if (viewMode === 'compact') containerEl.classList.add('is-compact');
  if (viewMode === 'grid') containerEl.classList.add('is-grid');

  tableHeadEl.hidden = tracks.length === 0 || viewMode === 'grid';

  const orderedIds = tracks.map((t) => t.id);

  tracks.forEach((track, idx) => {
    const trackOverride = state.trackSpeedOverrides[track.id] || null;
    const isPlaying = track.id === state.currentTrackId;
    const cover = coverUrlForTrack(track);

    if (viewMode === 'grid') {
      const card = document.createElement('article');
      card.className = 'track-card';
      card.dataset.trackId = track.id;
      if (isPlaying) card.classList.add('is-playing');

      if (cover) {
        const img = document.createElement('img');
        img.src = cover;
        img.alt = '';
        img.loading = 'lazy';
        card.appendChild(img);
      } else {
        const fallback = document.createElement('div');
        fallback.className = 'card-art-fallback';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = '♪';
        card.appendChild(fallback);
      }

      const h3 = document.createElement('h3');
      const playCardBtn = document.createElement('button');
      playCardBtn.type = 'button';
      playCardBtn.className = 'track-card-play';
      playCardBtn.textContent = track.title;
      playCardBtn.addEventListener('click', () => {
        setQueueAndPlay(orderedIds, track.id, queueListId);
      });
      h3.appendChild(playCardBtn);

      const metaP = document.createElement('p');
      metaP.className = 'track-card-meta';
      metaP.textContent = trackOverride
        ? `${track.artist} • ${trackOverride.speed.toFixed(2)}x`
        : track.artist;

      const footer = document.createElement('footer');
      const durSpan = document.createElement('span');
      durSpan.className = 'track-card-dur';
      durSpan.textContent = formatTime(track.duration);

      const btnWrap = document.createElement('div');
      btnWrap.className = 'track-actions';

      const spdBtn = document.createElement('button');
      spdBtn.type = 'button';
      spdBtn.className = trackOverride ? 'track-action-btn is-accent' : 'track-action-btn';
      spdBtn.textContent = trackOverride ? `${trackOverride.speed.toFixed(2)}x` : '⚡';
      spdBtn.title = 'Şarkıya özel hız ve ses tonu ayarla';
      spdBtn.addEventListener('click', () => {
        openSpeedOverrideDialog({
          kind: 'track',
          id: track.id,
          label: `${track.artist} — ${track.title}`,
          currentOverride: trackOverride
        });
      });
      btnWrap.appendChild(spdBtn);

      if (isExternal) {
        const dlBtn = document.createElement('button');
        dlBtn.type = 'button';
        dlBtn.className = 'track-action-btn';
        dlBtn.textContent = '⬇';
        dlBtn.title = 'MP3 olarak indir';
        dlBtn.addEventListener('click', () => downloadSpotifyTrackOffline(track));
        btnWrap.appendChild(dlBtn);
      } else if (localPlaylist) {
        const remBtn = document.createElement('button');
        remBtn.type = 'button';
        remBtn.className = 'track-action-btn track-action-btn--danger';
        remBtn.textContent = '×';
        remBtn.title = 'Listeden çıkar';
        remBtn.addEventListener('click', () =>
          window.yusic.removeTrackFromPlaylist(localPlaylist.id, track.id)
        );
        btnWrap.appendChild(remBtn);
      } else {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'track-action-btn';
        addBtn.textContent = '+';
        addBtn.title = 'Playliste ekle';
        addBtn.addEventListener('click', () => openAddToPlaylistDialog(track));
        btnWrap.appendChild(addBtn);
      }

      footer.append(durSpan, btnWrap);
      card.append(h3, metaP, footer);
      containerEl.appendChild(card);
      return;
    }

    const row = document.createElement('div');
    row.className = 'track-row';
    row.setAttribute('role', 'listitem');
    row.dataset.trackId = track.id;
    if (isPlaying) row.classList.add('is-playing');

    if (allowReorder && localPlaylist) {
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-yusic-track-index', String(idx));
      });
      row.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('application/x-yusic-track-index')) {
          e.preventDefault();
          row.classList.add('is-drag-over');
        }
      });
      row.addEventListener('dragleave', () => row.classList.remove('is-drag-over'));
      row.addEventListener('drop', async (e) => {
        row.classList.remove('is-drag-over');
        const fromStr = e.dataTransfer.getData('application/x-yusic-track-index');
        if (!fromStr) return;
        e.preventDefault();
        const fromIdx = Number.parseInt(fromStr, 10);
        if (Number.isNaN(fromIdx) || fromIdx === idx) return;
        const nextOrder = localPlaylist.trackIds.slice();
        const [moved] = nextOrder.splice(fromIdx, 1);
        nextOrder.splice(idx, 0, moved);
        await window.yusic.reorderPlaylist(localPlaylist.id, nextOrder);
      });
    }

    const idxEl = document.createElement('span');
    idxEl.className = 'col-idx';
    idxEl.innerHTML = `<span class="track-row-idx-num">${idx + 1}</span><span class="track-row-idx-play">▶</span>`;

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'track-play-btn';

    const thumb = document.createElement('span');
    thumb.className = 'track-thumb';
    if (cover) {
      const img = document.createElement('img');
      img.src = cover;
      img.alt = '';
      img.loading = 'lazy';
      thumb.appendChild(img);
    } else {
      thumb.textContent = '♪';
    }

    const textCol = document.createElement('span');
    textCol.className = 'track-text';
    const titleLine = document.createElement('span');
    titleLine.className = 'track-title-line';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'track-title';
    titleSpan.textContent = track.title;
    titleLine.appendChild(titleSpan);

    if (trackOverride) {
      const chip = document.createElement('span');
      chip.className = 'track-speed-chip';
      chip.textContent = `${trackOverride.speed.toFixed(2)}x${trackOverride.preservePitch ? '' : ' • Ton'}`;
      titleLine.appendChild(chip);
    }

    const artistSpan = document.createElement('span');
    artistSpan.className = 'track-artist';
    artistSpan.textContent = track.artist;
    textCol.append(titleLine, artistSpan);

    playBtn.append(thumb, textCol);
    playBtn.addEventListener('click', () => {
      setQueueAndPlay(orderedIds, track.id, queueListId);
    });

    const albumEl = document.createElement('span');
    albumEl.className = 'track-album';
    albumEl.textContent =
      track.album || track.folder || (track.ext ? track.ext.replace('.', '').toUpperCase() : 'Spotify');

    const durEl = document.createElement('span');
    durEl.className = 'track-dur';
    durEl.textContent = formatTime(track.duration);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'track-actions';

    const speedBtn = document.createElement('button');
    speedBtn.type = 'button';
    speedBtn.className = trackOverride ? 'track-action-btn is-accent' : 'track-action-btn';
    speedBtn.textContent = trackOverride ? `${trackOverride.speed.toFixed(2)}x` : '⚡ Hız';
    speedBtn.title = 'Bu şarkıya özel hız ayarla';
    speedBtn.addEventListener('click', () => {
      openSpeedOverrideDialog({
        kind: 'track',
        id: track.id,
        label: `${track.artist} — ${track.title}`,
        currentOverride: trackOverride
      });
    });
    actionsEl.appendChild(speedBtn);

    if (isExternal) {
      const dlBtn = document.createElement('button');
      dlBtn.type = 'button';
      dlBtn.className = 'track-action-btn';
      dlBtn.textContent = '⬇ MP3';
      dlBtn.title = 'Çevrimdışı MP3 indir';
      dlBtn.addEventListener('click', () => downloadSpotifyTrackOffline(track));
      actionsEl.appendChild(dlBtn);
    } else if (allowReorder && localPlaylist) {
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'track-action-btn';
      upBtn.textContent = '↑';
      upBtn.title = 'Yukarı taşı';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', async () => {
        const nextOrder = localPlaylist.trackIds.slice();
        [nextOrder[idx - 1], nextOrder[idx]] = [nextOrder[idx], nextOrder[idx - 1]];
        await window.yusic.reorderPlaylist(localPlaylist.id, nextOrder);
      });

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'track-action-btn';
      downBtn.textContent = '↓';
      downBtn.title = 'Aşağı taşı';
      downBtn.disabled = idx === tracks.length - 1;
      downBtn.addEventListener('click', async () => {
        const nextOrder = localPlaylist.trackIds.slice();
        [nextOrder[idx + 1], nextOrder[idx]] = [nextOrder[idx], nextOrder[idx + 1]];
        await window.yusic.reorderPlaylist(localPlaylist.id, nextOrder);
      });

      const removeFromPlBtn = document.createElement('button');
      removeFromPlBtn.type = 'button';
      removeFromPlBtn.className = 'track-action-btn track-action-btn--danger';
      removeFromPlBtn.textContent = 'Çıkar';
      removeFromPlBtn.title = 'Playlistten çıkar';
      removeFromPlBtn.addEventListener('click', async () => {
        await window.yusic.removeTrackFromPlaylist(localPlaylist.id, track.id);
      });

      actionsEl.append(upBtn, downBtn, removeFromPlBtn);
    } else if (localPlaylist) {
      const removeFromPlBtn = document.createElement('button');
      removeFromPlBtn.type = 'button';
      removeFromPlBtn.className = 'track-action-btn track-action-btn--danger';
      removeFromPlBtn.textContent = 'Çıkar';
      removeFromPlBtn.addEventListener('click', async () => {
        await window.yusic.removeTrackFromPlaylist(localPlaylist.id, track.id);
      });
      actionsEl.appendChild(removeFromPlBtn);
    } else {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'track-action-btn';
      addBtn.textContent = '+ Liste';
      addBtn.title = 'Playliste ekle';
      addBtn.addEventListener('click', () => openAddToPlaylistDialog(track));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'track-action-btn track-action-btn--danger';
      delBtn.textContent = 'Sil';
      delBtn.title = 'Müzik dosyasını Geri Dönüşüm Kutusuna taşı';
      delBtn.addEventListener('click', () => {
        openConfirmDialog({
          title: 'Şarkıyı Sil',
          message: `"${track.artist} - ${track.title}" dosyasını Geri Dönüşüm Kutusu'na taşımak istediğine emin misin?`,
          okLabel: 'Dosyayı Sil',
          onConfirm: async () => {
            await window.yusic.deleteTrack(track.id);
            showToast('Dosya Geri Dönüşüm Kutusuna taşındı.', 'info');
          }
        });
      });

      actionsEl.append(addBtn, delBtn);
    }

    row.append(idxEl, playBtn, albumEl, durEl, actionsEl);
    containerEl.appendChild(row);
  });
}

async function downloadSpotifyTrackOffline(track) {
  const url = track.externalUrl;
  if (!url) {
    showToast('Bu şarkı için Spotify bağlantısı bulunamadı.', 'error');
    return;
  }
  try {
    const job = await window.yusic.startDownload(url, { createPlaylist: false });
    if (!state.downloads.some((j) => j.id === job.id)) {
      state.downloads.unshift(job);
    }
    showToast(`"${track.title}" MP3 indirme kuyruğuna eklendi.`, 'success');
    renderSidebar();
  } catch (err) {
    showToast(err?.message || 'İndirme başlatılamadı.', 'error');
  }
}

/* ---------------- Local Library View ---------------- */
function getActivePlaylist() {
  if (!state.activePlaylistId) return null;
  return state.playlists.find((p) => p.id === state.activePlaylistId) || null;
}

function getVisibleTracks() {
  const pl = getActivePlaylist();
  let base;
  if (pl) {
    base = pl.trackIds.map((id) => state.trackMap.get(id)).filter(Boolean);
  } else {
    base = state.tracks.slice();
    const by = state.sortBy;
    if (by === 'title') base.sort((a, b) => a.title.localeCompare(b.title, 'tr'));
    else if (by === 'artist') base.sort((a, b) => a.artist.localeCompare(b.artist, 'tr'));
    else if (by === 'recent') base.sort((a, b) => b.addedAt - a.addedAt);
    else if (by === 'duration') base.sort((a, b) => (b.duration || 0) - (a.duration || 0));
  }

  const q = state.searchQuery.trim().toLocaleLowerCase('tr');
  if (!q) return base;
  return base.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLocaleLowerCase('tr').includes(q));
}

function syncViewModeButtons(buttons, activeMode) {
  for (const btn of buttons) {
    btn.classList.toggle('is-active', btn.dataset.mode === activeMode);
  }
}

/* ---------------- Context-Separated Sidebar Rendering ---------------- */
function renderSidebar() {
  els.badgeAllCount.textContent = String(state.tracks.length);
  els.badgeSpotifyStatus.hidden = !state.spotifyAuth?.connected;

  const activeJobsCount = state.downloads.filter(
    (j) => j.status === 'queued' || j.status === 'running'
  ).length;
  els.badgeDlActive.hidden = activeJobsCount === 0;
  els.badgeDlActive.textContent = String(activeJobsCount);

  els.navLocal.classList.toggle('is-active', state.viewTab === 'library');
  els.navSpotify.classList.toggle('is-active', state.viewTab === 'spotify');
  els.navDownloader.classList.toggle('is-active', state.viewTab === 'downloader');
  els.navSettings.classList.toggle('is-active', state.viewTab === 'settings');

  const isSpotifyMode = state.viewTab === 'spotify';
  els.sidebarLibraryHeading.textContent = isSpotifyMode ? 'Spotify Kitaplığı' : 'Yerel Kitaplık';
  els.localLibHeadBtns.hidden = isSpotifyMode;
  els.spotifyLibHeadBtns.hidden = !isSpotifyMode;

  els.sidebarPlaylists.innerHTML = '';

  if (isSpotifyMode) {
    renderSpotifySidebarItems();
  } else {
    renderLocalSidebarItems();
  }
}

function renderSpotifySidebarItems() {
  if (!state.spotifyAuth?.connected) {
    const empty = document.createElement('div');
    empty.className = 'playlist-empty-note';
    empty.textContent = 'Spotify hesabını bağlayınca beğendiklerin ve listelerin burada listelenir.';
    els.sidebarPlaylists.appendChild(empty);

    const quickRow = document.createElement('div');
    quickRow.className = 'playlist-row';
    if (state.spotifySubTab === 'public') quickRow.classList.add('is-active');
    const quickBtn = document.createElement('button');
    quickBtn.type = 'button';
    quickBtn.className = 'playlist-select-btn';
    quickBtn.innerHTML = `
      <span class="pl-mini-cover">🔗</span>
      <span class="pl-mini-text">
        <span class="playlist-name">Linkten Dinle</span>
        <span class="playlist-sub">Giriş yapmadan akış aç</span>
      </span>`;
    quickBtn.addEventListener('click', () => {
      state.spotifySubTab = 'public';
      renderAll();
      els.spPublicUrl.focus();
    });
    quickRow.appendChild(quickBtn);
    els.sidebarPlaylists.appendChild(quickRow);
    return;
  }

  const likedRow = document.createElement('div');
  likedRow.className = 'playlist-row';
  if (state.spotifySubTab === 'liked') likedRow.classList.add('is-active');
  const likedBtn = document.createElement('button');
  likedBtn.type = 'button';
  likedBtn.className = 'playlist-select-btn';
  likedBtn.innerHTML = `
    <span class="pl-mini-cover pl-mini-cover--liked">♥</span>
    <span class="pl-mini-text">
      <span class="playlist-name">Beğenilen Şarkılar</span>
      <span class="playlist-sub">Spotify • Canlı Akış</span>
    </span>`;
  likedBtn.addEventListener('click', () => {
    state.viewTab = 'spotify';
    state.spotifySubTab = 'liked';
    loadSpotifyLiked(true);
    renderAll();
  });
  likedRow.appendChild(likedBtn);
  els.sidebarPlaylists.appendChild(likedRow);

  if (state.spotifyPlaylists.length === 0) {
    const note = document.createElement('div');
    note.className = 'playlist-empty-note';
    note.textContent = 'Spotify playlisti bulunamadı veya yenileniyor...';
    els.sidebarPlaylists.appendChild(note);
    return;
  }

  for (const spl of state.spotifyPlaylists) {
    const spRow = document.createElement('div');
    spRow.className = 'playlist-row';
    if (state.spotifySubTab === 'playlist-detail' && state.spotifyCollection.id === spl.id) {
      spRow.classList.add('is-active');
    }

    const spBtn = document.createElement('button');
    spBtn.type = 'button';
    spBtn.className = 'playlist-select-btn';

    const thumb = document.createElement('span');
    thumb.className = 'pl-mini-cover';
    const extPref = state.externalListPrefs[spl.id];
    const coverSrc = extPref?.coverFile ? coverFileUrl(extPref.coverFile) : spl.coverUrl;
    if (coverSrc) {
      const img = document.createElement('img');
      img.src = coverSrc;
      img.alt = '';
      thumb.appendChild(img);
    } else {
      thumb.textContent = '♪';
    }

    const txt = document.createElement('span');
    txt.className = 'pl-mini-text';
    const nm = document.createElement('span');
    nm.className = 'playlist-name';
    nm.textContent = spl.name;
    const sub = document.createElement('span');
    sub.className = 'playlist-sub';
    sub.textContent = `${spl.trackCount} şarkı${spl.ownerName ? ` • ${spl.ownerName}` : ''}`;
    txt.append(nm, sub);
    spBtn.append(thumb, txt);
    spBtn.addEventListener('click', () => {
      state.viewTab = 'spotify';
      openSpotifyPlaylistDetail(spl, true);
      renderAll();
    });

    spRow.appendChild(spBtn);
    els.sidebarPlaylists.appendChild(spRow);
  }
}

function renderLocalSidebarItems() {
  const allRow = document.createElement('div');
  allRow.className = 'playlist-row';
  if (state.viewTab === 'library' && !state.activePlaylistId) {
    allRow.classList.add('is-active');
  }
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'playlist-select-btn';
  allBtn.innerHTML = `
    <span class="pl-mini-cover">♪</span>
    <span class="pl-mini-text">
      <span class="playlist-name">Tüm Yerel Müzikler</span>
      <span class="playlist-sub">${state.tracks.length} şarkı</span>
    </span>`;
  allBtn.addEventListener('click', () => {
    state.viewTab = 'library';
    state.activePlaylistId = null;
    renderAll();
  });
  allRow.appendChild(allBtn);
  els.sidebarPlaylists.appendChild(allRow);

  if (state.playlists.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'playlist-empty-note';
    empty.textContent = 'Henüz yerel playlist oluşturulmadı. "+" ile oluşturabilirsin.';
    els.sidebarPlaylists.appendChild(empty);
    return;
  }

  for (const pl of state.playlists) {
    const validTracks = pl.trackIds.map((id) => state.trackMap.get(id)).filter(Boolean);
    const row = document.createElement('div');
    row.className = 'playlist-row';
    row.setAttribute('role', 'listitem');
    if (state.viewTab === 'library' && state.activePlaylistId === pl.id) {
      row.classList.add('is-active');
    }

    const selBtn = document.createElement('button');
    selBtn.type = 'button';
    selBtn.className = 'playlist-select-btn';

    const miniCover = document.createElement('span');
    miniCover.className = 'pl-mini-cover';
    const firstTrackCover = validTracks.map(coverUrlForTrack).find(Boolean);
    if (pl.coverFile) {
      const img = document.createElement('img');
      img.src = coverFileUrl(pl.coverFile);
      img.alt = '';
      miniCover.appendChild(img);
    } else if (firstTrackCover) {
      const img = document.createElement('img');
      img.src = firstTrackCover;
      img.alt = '';
      miniCover.appendChild(img);
    } else {
      miniCover.textContent = '♪';
    }

    const txt = document.createElement('span');
    txt.className = 'pl-mini-text';
    const nm = document.createElement('span');
    nm.className = 'playlist-name';
    nm.textContent = pl.name;
    const sub = document.createElement('span');
    sub.className = 'playlist-sub';
    sub.textContent = pl.speedOverride
      ? `Playlist • ${validTracks.length} şarkı • ${pl.speedOverride.speed.toFixed(2)}x`
      : `Playlist • ${validTracks.length} şarkı`;
    txt.append(nm, sub);
    selBtn.append(miniCover, txt);

    selBtn.addEventListener('click', () => {
      state.viewTab = 'library';
      state.activePlaylistId = pl.id;
      renderAll();
    });

    const actions = document.createElement('div');
    actions.className = 'playlist-row-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-btn';
    editBtn.textContent = '✎';
    editBtn.title = 'Ayrıntıları & fotoğrafı düzenle';
    editBtn.setAttribute('aria-label', `${pl.name} düzenle`);
    editBtn.addEventListener('click', () => openPlaylistEditDialog(pl));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'icon-btn icon-btn--danger';
    delBtn.textContent = '🗑';
    delBtn.title = 'Playlisti sil';
    delBtn.setAttribute('aria-label', `${pl.name} playlistini sil`);
    delBtn.addEventListener('click', () => {
      openConfirmDialog({
        title: 'Playlisti Sil',
        message: `"${pl.name}" playlistini silmek istediğine emin misin? Müzik dosyaların silinmez.`,
        okLabel: 'Playlisti Sil',
        onConfirm: async () => {
          await window.yusic.deletePlaylist(pl.id);
          if (state.activePlaylistId === pl.id) state.activePlaylistId = null;
          showToast(`"${pl.name}" silindi.`, 'info');
          renderAll();
        }
      });
    });

    actions.append(editBtn, delBtn);
    row.append(selBtn, actions);
    els.sidebarPlaylists.appendChild(row);
  }
}

/* ---------------- Main Views Routing ---------------- */
function renderMainView() {
  els.viewLibrary.hidden = state.viewTab !== 'library';
  els.viewSpotify.hidden = state.viewTab !== 'spotify';
  els.viewDownloader.hidden = state.viewTab !== 'downloader';
  els.viewSettings.hidden = state.viewTab !== 'settings';

  if (state.viewTab === 'downloader') {
    renderDownloaderJobs();
    return;
  }

  if (state.viewTab === 'spotify') {
    renderSpotifyView();
    return;
  }

  if (state.viewTab === 'settings') {
    renderSettingsView();
    return;
  }

  const activePl = getActivePlaylist();
  if (state.activePlaylistId && !activePl) {
    state.activePlaylistId = null;
  }

  const visibleTracks = getVisibleTracks();
  const totalSec = visibleTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  const viewMode = activePl ? activePl.viewMode || 'list' : state.settings.libraryViewMode || 'list';

  els.libHero.classList.toggle('is-playlist-hero', Boolean(activePl));
  els.viewEyebrow.textContent = activePl ? 'YEREL PLAYLİST' : 'YEREL KÜTÜPHANE';
  els.viewTitle.textContent = activePl ? activePl.name : 'Tüm Yerel Müzikler';

  if (activePl && activePl.description) {
    els.viewDesc.hidden = false;
    els.viewDesc.textContent = activePl.description;
  } else {
    els.viewDesc.hidden = true;
    els.viewDesc.textContent = '';
  }

  els.viewMeta.textContent = `${visibleTracks.length} şarkı • ${formatTotalDuration(totalSec)}`;
  els.sortWrap.hidden = Boolean(activePl);
  els.btnHeroPickCover.hidden = !activePl;
  els.btnPlaylistSpeed.hidden = !activePl;
  els.btnPlaylistEdit.hidden = !activePl;

  if (activePl?.speedOverride) {
    els.playlistSpeedPill.hidden = false;
    els.playlistSpeedPill.textContent = `⚡ Liste Hızı: ${activePl.speedOverride.speed.toFixed(2)}x${
      activePl.speedOverride.preservePitch ? '' : ' • Ton Değişir'
    }`;
  } else {
    els.playlistSpeedPill.hidden = true;
  }

  renderHeroCoverArt(els.libHeroCoverArt, {
    customCoverFile: activePl?.coverFile || null,
    tracks: visibleTracks
  });

  syncViewModeButtons([els.btnViewList, els.btnViewCompact, els.btnViewGrid], viewMode);

  const isEmpty = visibleTracks.length === 0;
  els.libraryEmpty.hidden = !isEmpty;
  if (isEmpty) {
    els.trackList.innerHTML = '';
    els.trackTableHead.hidden = true;
    if (state.searchQuery.trim()) {
      els.emptyTitle.textContent = 'Aramanla eşleşen şarkı yok';
      els.emptyDesc.textContent = 'Farklı bir kelime deneyebilir veya arama kutusunu temizleyebilirsin.';
      els.emptyMuzikPath.hidden = true;
    } else if (activePl) {
      els.emptyTitle.textContent = 'Bu playlist henüz boş';
      els.emptyDesc.textContent = 'Tüm Yerel Müzikler görünümünden "+ Liste" düğmesiyle şarkı ekleyebilirsin.';
      els.emptyMuzikPath.hidden = true;
    } else {
      els.emptyTitle.textContent = 'Müzik klasörün henüz boş';
      els.emptyDesc.textContent =
        "Ses dosyalarını (.mp3, .wav, .flac, .ogg, .m4a, .aac, .opus) doğrudan aşağıdaki klasöre atabilir, pencereye sürükleyip bırakabilir ya da Spotify sekmesinden indirmeden dinleyebilirsin.";
      els.emptyMuzikPath.hidden = false;
      els.emptyMuzikPath.textContent = state.muzikDir;
    }
    return;
  }

  const canReorder = Boolean(activePl && !state.searchQuery.trim() && viewMode !== 'grid');
  renderTrackCollection({
    containerEl: els.trackList,
    tableHeadEl: els.trackTableHead,
    tracks: visibleTracks,
    viewMode,
    localPlaylist: activePl,
    queueListId: activePl?.id || null,
    allowReorder: canReorder,
    isExternal: false
  });
}

/* ---------------- Settings View Rendering ---------------- */
function renderSettingsView() {
  syncSettingsTabs();

  const scale = clampScale(state.settings.uiScale);
  const pct = `%${Math.round(scale * 100)}`;
  els.uiScaleSlider.value = String(scale);
  els.uiScaleLabel.textContent = pct;
  syncSliderVisual(els.uiScaleSlider, pct);
  for (const chip of els.uiScalePresets.querySelectorAll('.preset-chip')) {
    chip.classList.toggle('is-selected', Math.abs(Number(chip.dataset.scale) - scale) < 0.015);
  }

  applyLayout(state.settings.layout);
  renderEqUI();

  const auth = state.spotifyAuth || {};
  const connected = Boolean(auth.connected);
  els.settingsSpStatus.textContent = connected
    ? `Bağlı: ${auth.user?.displayName || 'Spotify'}`
    : 'Hazır (Giriş Bekleniyor)';
  els.settingsSpStatus.className = connected ? 'status-badge is-completed' : 'status-badge';
  els.settingsSpRedirect.textContent = auth.redirectUri || 'http://127.0.0.1:43821/callback';
  if (document.activeElement !== els.settingsSpClientId) {
    els.settingsSpClientId.value = auth.clientId || '';
  }
  els.settingsMuzikPath.textContent = state.muzikDir || '';
}

/* ---------------- Spotify Live View & Actions ---------------- */
async function loadSpotifyLiked(reset = true) {
  if (!state.spotifyAuth.connected) return;
  const col = state.spotifyCollection;
  col.id = 'spotify:liked';
  col.title = 'Beğenilen Şarkılar';
  col.eyebrow = 'SPOTIFY BEĞENİLENLER';
  col.description = 'Spotify hesabında beğendiğin şarkılar (indirmeden canlı akış)';
  col.coverUrl = '';
  col.isLiked = true;
  col.spotifyPlaylistId = null;
  col.truncatedAt100 = false;
  if (reset) {
    col.tracks = [];
    col.offset = 0;
    col.hasMore = false;
  }
  col.loading = true;
  renderSpotifyView();

  try {
    const res = await window.yusic.getSpotifyLikedSongs({ limit: 50, offset: col.offset });
    rememberSpotifyTracks(res.tracks);
    col.tracks = reset ? res.tracks : [...col.tracks, ...res.tracks];
    col.total = res.total;
    col.hasMore = res.hasMore;
    col.offset = col.tracks.length;
  } catch (err) {
    showToast(err?.message || 'Beğenilen şarkılar alınamadı.', 'error');
  } finally {
    col.loading = false;
    if (state.viewTab === 'spotify') renderSpotifyView();
  }
}

async function loadSpotifyPlaylistsList() {
  if (!state.spotifyAuth.connected) return;
  try {
    const res = await window.yusic.getSpotifyUserPlaylists({ limit: 50, offset: 0 });
    state.spotifyPlaylists = res.playlists || [];
    renderSidebar();
    if (state.viewTab === 'spotify') renderSpotifyView();
  } catch (err) {
    showToast(err?.message || 'Spotify listeleri alınamadı.', 'error');
  }
}

async function openSpotifyPlaylistDetail(spl, reset = true) {
  state.spotifySubTab = 'playlist-detail';
  const col = state.spotifyCollection;
  col.id = spl.id;
  col.title = spl.name;
  col.eyebrow = 'SPOTIFY PLAYLİST';
  col.description = spl.description || (spl.ownerName ? `Oluşturan: ${spl.ownerName}` : '');
  col.coverUrl = spl.coverUrl || '';
  col.isLiked = false;
  col.spotifyPlaylistId = spl.spotifyPlaylistId;
  col.truncatedAt100 = false;
  if (reset) {
    col.tracks = [];
    col.offset = 0;
    col.hasMore = false;
  }
  col.loading = true;
  renderSpotifyView();

  try {
    const res = await window.yusic.getSpotifyPlaylistTracks(spl.spotifyPlaylistId, {
      limit: 100,
      offset: col.offset
    });
    rememberSpotifyTracks(res.tracks);
    if (res.playlist) {
      col.title = res.playlist.name;
      col.description = res.playlist.description || col.description;
      col.coverUrl = res.playlist.coverUrl || col.coverUrl;
    }
    col.tracks = reset ? res.tracks : [...col.tracks, ...res.tracks];
    col.total = res.total;
    col.hasMore = res.hasMore;
    col.offset = col.tracks.length;
  } catch (err) {
    showToast(err?.message || 'Playlist şarkıları alınamadı.', 'error');
  } finally {
    col.loading = false;
    if (state.viewTab === 'spotify') renderSpotifyView();
  }
}

async function loadSpotifyRecent() {
  if (!state.spotifyAuth.connected) return;
  const col = state.spotifyCollection;
  col.id = 'spotify:recent';
  col.title = 'Son Dinlenenler';
  col.eyebrow = 'SPOTIFY GEÇMİŞ';
  col.description = 'Spotify üzerinde yakın zamanda dinlediklerin';
  col.coverUrl = '';
  col.isLiked = false;
  col.spotifyPlaylistId = null;
  col.tracks = [];
  col.hasMore = false;
  col.loading = true;
  renderSpotifyView();

  try {
    const res = await window.yusic.getSpotifyRecent({ limit: 30 });
    rememberSpotifyTracks(res.tracks);
    col.tracks = res.tracks;
    col.total = res.tracks.length;
  } catch (err) {
    showToast(err?.message || 'Son dinlenenler alınamadı.', 'error');
  } finally {
    col.loading = false;
    if (state.viewTab === 'spotify') renderSpotifyView();
  }
}

async function runSpotifyCatalogSearch(query) {
  const q = String(query || '').trim();
  if (!q) return;
  const col = state.spotifyCollection;
  col.id = 'spotify:search';
  col.title = `Arama: "${q}"`;
  col.eyebrow = 'SPOTIFY ARAMA';
  col.description = '';
  col.coverUrl = '';
  col.isLiked = false;
  col.spotifyPlaylistId = null;
  col.tracks = [];
  col.hasMore = false;
  col.loading = true;
  renderSpotifyView();

  try {
    const res = await window.yusic.searchSpotifyTracks(q);
    rememberSpotifyTracks(res.tracks);
    col.tracks = res.tracks;
    col.total = res.tracks.length;
  } catch (err) {
    showToast(err?.message || 'Spotify araması başarısız.', 'error');
  } finally {
    col.loading = false;
    if (state.viewTab === 'spotify') renderSpotifyView();
  }
}

function renderSpotifyView() {
  const auth = state.spotifyAuth || {};
  const connected = Boolean(auth.connected);

  els.spUserBar.hidden = !connected;
  if (connected && auth.user) {
    els.spUserName.textContent = auth.user.displayName;
    if (auth.user.imageUrl) {
      els.spUserAvatar.src = auth.user.imageUrl;
      els.spUserAvatar.hidden = false;
    } else {
      els.spUserAvatar.hidden = true;
    }
  }

  for (const tabBtn of els.spTablist.querySelectorAll('[role="tab"]')) {
    const isThis =
      tabBtn.dataset.sptab === state.spotifySubTab ||
      (tabBtn.dataset.sptab === 'playlists' && state.spotifySubTab === 'playlist-detail');
    tabBtn.setAttribute('aria-selected', String(isThis));
    tabBtn.setAttribute('tabindex', isThis ? '0' : '-1');
  }

  const isPublicTab = state.spotifySubTab === 'public';
  els.spConnectCard.hidden = connected || isPublicTab;
  els.spSearchBar.hidden = !(connected && state.spotifySubTab === 'search');
  els.spPublicBar.hidden = !isPublicTab;

  if (connected && state.spotifySubTab === 'playlists') {
    els.spPlaylistsGrid.hidden = false;
    els.spCollectionArea.hidden = true;
    els.spPlaylistsGrid.innerHTML = '';

    for (const spl of state.spotifyPlaylists) {
      const card = document.createElement('article');
      card.className = 'track-card';
      const extPref = state.externalListPrefs[spl.id];
      const cover = extPref?.coverFile ? coverFileUrl(extPref.coverFile) : spl.coverUrl;
      if (cover) {
        const img = document.createElement('img');
        img.src = cover;
        img.alt = '';
        img.loading = 'lazy';
        card.appendChild(img);
      } else {
        const fb = document.createElement('div');
        fb.className = 'card-art-fallback';
        fb.textContent = '♪';
        card.appendChild(fb);
      }
      const h3 = document.createElement('h3');
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'track-card-play';
      openBtn.textContent = spl.name;
      openBtn.addEventListener('click', () => openSpotifyPlaylistDetail(spl, true));
      h3.appendChild(openBtn);

      const meta = document.createElement('p');
      meta.className = 'track-card-meta';
      meta.textContent = `${spl.trackCount} şarkı${spl.ownerName ? ` • ${spl.ownerName}` : ''}`;

      card.append(h3, meta);
      els.spPlaylistsGrid.appendChild(card);
    }
    return;
  }

  els.spPlaylistsGrid.hidden = true;

  const showPublicCollection = isPublicTab && (state.spotifyCollection.tracks.length > 0 || state.spotifyCollection.loading);
  const showAccountCollection = connected && !isPublicTab && state.spotifySubTab !== 'playlists';
  if (!showAccountCollection && !showPublicCollection) {
    els.spCollectionArea.hidden = true;
    return;
  }

  els.spCollectionArea.hidden = false;
  const col = state.spotifyCollection;
  const extPref = state.externalListPrefs[col.id] || {};
  const viewMode = extPref.viewMode || 'list';

  els.spHero.classList.toggle('is-liked-hero', Boolean(col.isLiked));
  els.spHeroEyebrow.textContent = col.eyebrow;
  els.spHeroTitle.textContent = col.title;

  if (col.description) {
    els.spHeroDesc.hidden = false;
    els.spHeroDesc.textContent = col.description;
  } else {
    els.spHeroDesc.hidden = true;
  }

  const totalSec = col.tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  els.spHeroMeta.textContent = col.loading
    ? 'Yükleniyor...'
    : `${col.tracks.length}${col.total > col.tracks.length ? ` / ${col.total}` : ''} şarkı • ${formatTotalDuration(totalSec)}`;

  if (extPref.speedOverride) {
    els.spSpeedPill.hidden = false;
    els.spSpeedPill.textContent = `⚡ Liste Hızı: ${extPref.speedOverride.speed.toFixed(2)}x${
      extPref.speedOverride.preservePitch ? '' : ' • Ton Değişir'
    }`;
  } else {
    els.spSpeedPill.hidden = true;
  }

  renderHeroCoverArt(els.spHeroCoverArt, {
    customCoverFile: extPref.coverFile || null,
    spotifyCoverUrl: col.coverUrl || '',
    tracks: col.tracks,
    isLiked: col.isLiked
  });

  syncViewModeButtons([els.btnSpViewList, els.btnSpViewCompact, els.btnSpViewGrid], viewMode);

  const q = state.spotifyFilterQuery.trim().toLocaleLowerCase('tr');
  const filtered = q
    ? col.tracks.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLocaleLowerCase('tr').includes(q))
    : col.tracks;

  renderTrackCollection({
    containerEl: els.spTrackList,
    tableHeadEl: els.spTableHead,
    tracks: filtered,
    viewMode,
    localPlaylist: null,
    queueListId: col.id,
    allowReorder: false,
    isExternal: true
  });

  els.spLoadMoreWrap.hidden = !col.hasMore;
  els.btnSpLoadMore.disabled = col.loading;
}

/* ---------------- Downloader View ---------------- */
async function updateUrlDetectionBanner() {
  const url = els.dlUrlInput.value.trim();
  const pill = els.dlDetectPill;
  pill.classList.remove('is-spotify', 'is-youtube', 'is-invalid');

  if (!url) {
    pill.textContent = 'Link yapıştırıldığında platform otomatik algılanır';
    return null;
  }

  const info = await window.yusic.detectUrl(url);
  if (info.provider === 'spotify') {
    pill.classList.add('is-spotify');
    const kindLabels = { track: 'Tek Şarkı', playlist: 'Playlist (Tüm Şarkılar)', album: 'Albüm', artist: 'Sanatçı' };
    pill.textContent = `Spotify • ${kindLabels[info.kind] || 'İçerik'} -> MP3 olarak indirilecek`;
  } else if (info.provider === 'youtube') {
    pill.classList.add('is-youtube');
    const isPlaylist =
      info.kind === 'playlist' ||
      (info.kind === 'watch_with_playlist' && els.chkYtList.checked);
    pill.textContent = isPlaylist
      ? 'YouTube • Tüm Playlist -> MP3 olarak indirilecek'
      : 'YouTube • Tek Video -> MP3 olarak indirilecek';
  } else {
    pill.classList.add('is-invalid');
    pill.textContent = 'Geçersiz link. open.spotify.com, youtube.com veya youtu.be bağlantısı girin.';
  }
  return info;
}

function renderDownloaderJobs() {
  els.dlJobs.innerHTML = '';
  if (state.downloads.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state empty-state--compact';
    empty.innerHTML = `<p class="empty-desc">Henüz aktif veya tamamlanmış bir indirme yok. Spotify veya YouTube linki yapıştırıp <strong>MP3 İndir</strong>'e bas.</p>`;
    els.dlJobs.appendChild(empty);
    return;
  }

  const statusText = {
    queued: 'Sırada',
    running: 'İndiriliyor',
    completed: 'Tamamlandı',
    error: 'Hata',
    cancelled: 'İptal Edildi'
  };

  for (const job of state.downloads) {
    const card = document.createElement('article');
    card.className = 'dl-job-card';

    const top = document.createElement('div');
    top.className = 'dl-job-top';

    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'dl-job-title';
    title.textContent = job.title;
    const sub = document.createElement('p');
    sub.className = 'dl-job-sub';
    const counts = job.totalTracks > 1 ? ` • ${job.completedTracks}/${job.totalTracks} parça` : '';
    sub.textContent = `${job.provider.toUpperCase()} • ${job.message}${counts}`;
    info.append(title, sub);

    const badges = document.createElement('div');
    badges.className = 'dl-job-badges';
    const badge = document.createElement('span');
    badge.className = `status-badge is-${job.status}`;
    badge.textContent = statusText[job.status] || job.status;
    badges.appendChild(badge);

    if (job.status === 'queued' || job.status === 'running') {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-ghost btn-xs';
      cancelBtn.textContent = 'İptal Et';
      cancelBtn.addEventListener('click', () => window.yusic.cancelDownload(job.id));
      badges.appendChild(cancelBtn);
    }

    if (job.playlistId) {
      const openPlBtn = document.createElement('button');
      openPlBtn.type = 'button';
      openPlBtn.className = 'btn btn-secondary btn-xs';
      openPlBtn.textContent = 'Playlisti Aç';
      openPlBtn.addEventListener('click', () => {
        state.viewTab = 'library';
        state.activePlaylistId = job.playlistId;
        renderAll();
      });
      badges.appendChild(openPlBtn);
    }

    top.append(info, badges);
    card.appendChild(top);

    const track = document.createElement('div');
    track.className = 'dl-progress-track';
    const fill = document.createElement('div');
    fill.className = 'dl-progress-fill';
    fill.style.width = `${Math.min(100, Math.max(0, Number(job.progress) || 0))}%`;
    track.appendChild(fill);
    card.appendChild(track);

    if (job.truncatedAt100) {
      const note = document.createElement('p');
      note.className = 'dl-job-note';
      note.textContent =
        "Not: Spotify'ın herkese açık embed uç noktası giriş yapmadan en fazla 100 şarkı döndürür.";
      card.appendChild(note);
    }

    if (Array.isArray(job.items) && job.items.length > 0) {
      const details = document.createElement('details');
      details.className = 'dl-items-details';
      if (job.items.length <= 6 || job.status === 'running') details.open = true;

      const summary = document.createElement('summary');
      summary.textContent = `Parça Detayları (${job.items.length})`;
      details.appendChild(summary);

      const ul = document.createElement('ul');
      ul.className = 'dl-items-list scroller';
      for (const item of job.items) {
        const li = document.createElement('li');
        li.className = 'dl-item-row';
        const tSpan = document.createElement('span');
        tSpan.className = 'dl-item-title';
        tSpan.textContent = item.title;

        const sSpan = document.createElement('span');
        sSpan.className = `dl-item-state is-${item.status}`;
        if (item.status === 'completed') sSpan.textContent = '✓ MP3';
        else if (item.status === 'running') sSpan.textContent = `%${item.progress || 0}`;
        else if (item.status === 'error') sSpan.textContent = `Hata: ${item.error || 'Başarısız'}`;
        else sSpan.textContent = 'Bekliyor';

        li.append(tSpan, sSpan);
        ul.appendChild(li);
      }
      details.appendChild(ul);
      card.appendChild(details);
    }

    els.dlJobs.appendChild(card);
  }
}

/* ---------------- Auto-Updater Banner & Modal ---------------- */
function renderUpdateState() {
  const u = state.updateState;
  const verStr = u?.currentVersion || state.appVersion || '1.0.2';
  els.appVersionLabel.textContent = `Yusic v${verStr}`;
  els.updateCurVer.textContent = `v${verStr}`;
  els.settingsCurVer.textContent = `v${verStr}`;

  if (!u) return;

  const isReallyNewer = Boolean(u.latestVersion && compareSemver(u.latestVersion, verStr) > 0);
  const effectiveStatus =
    (u.status === 'available' || u.status === 'downloaded' || u.status === 'downloading') && !isReallyNewer
      ? 'not-available'
      : u.status;

  els.updateLatestVer.textContent = u.latestVersion ? `v${u.latestVersion}` : '—';
  const hasActionable = isReallyNewer && (effectiveStatus === 'available' || effectiveStatus === 'downloaded');
  els.updateDot.hidden = !hasActionable;

  const showBanner =
    !state.updateBannerDismissed &&
    isReallyNewer &&
    (effectiveStatus === 'available' || effectiveStatus === 'downloading' || effectiveStatus === 'downloaded');
  els.updateBanner.hidden = !showBanner;

  const pct = Math.min(100, Math.max(0, Number(u.progress) || 0));

  if (effectiveStatus === 'available' && isReallyNewer) {
    els.updateBannerBadge.textContent = `v${u.latestVersion}`;
    els.updateBannerTitle.textContent = `Yeni Yusic sürümü mevcut (v${u.latestVersion})`;
    els.updateBannerSub.textContent = u.isPackaged
      ? 'Uygulama içinden indirip otomatik güncelleyebilirsiniz.'
      : 'Kurulum dosyasını GitHub üzerinden indirebilirsiniz.';
    els.updateBannerProgress.hidden = true;
    els.btnBannerAction.hidden = false;
    els.btnBannerAction.textContent = u.isPackaged ? 'Güncellemeyi İndir' : 'Setup İndir';
  } else if (effectiveStatus === 'downloading' && isReallyNewer) {
    els.updateBannerBadge.textContent = `%${pct}`;
    els.updateBannerTitle.textContent = `Güncelleme indiriliyor (v${u.latestVersion || ''})...`;
    els.updateBannerSub.textContent = 'İndirme bitince tek tıkla kurulabilir.';
    els.updateBannerProgress.hidden = false;
    els.updateBannerProgress.value = pct;
    els.btnBannerAction.hidden = true;
  } else if (effectiveStatus === 'downloaded' && isReallyNewer) {
    els.updateBannerBadge.textContent = 'Hazır';
    els.updateBannerTitle.textContent = `Yusic v${u.latestVersion || ''} kuruluma hazır`;
    els.updateBannerSub.textContent = 'Yeniden başlatarak hemen güncelleyebilirsiniz.';
    els.updateBannerProgress.hidden = true;
    els.btnBannerAction.hidden = false;
    els.btnBannerAction.textContent = 'Şimdi Güncelle ve Yeniden Başlat';
  }

  const statusMessages = {
    idle: 'GitHub Releases üzerinden yeni sürüm kontrolü yapabilirsiniz.',
    checking: 'GitHub Releases kontrol ediliyor...',
    available: `Yeni sürüm bulundu: v${u.latestVersion}. Hemen indirebilirsiniz.`,
    'not-available': 'Tebrikler! En güncel Yusic sürümünü kullanıyorsunuz.',
    downloading: `Güncelleme paketi indiriliyor... (%${pct})`,
    downloaded: `v${u.latestVersion || ''} indirildi! Kurulumu tamamlamak için uygulamayı yeniden başlatın.`,
    error: `Güncelleme hatası: ${u.error || 'Bağlantı sağlanamadı.'}`
  };
  const msg = statusMessages[effectiveStatus] || statusMessages.idle;
  els.updateStatusMsg.textContent = msg;
  els.settingsUpdateDesc.textContent = msg;

  if (effectiveStatus === 'checking') {
    els.updateDialogProgressWrap.hidden = false;
    els.updateDialogProgress.removeAttribute('value');
    els.updateDialogPct.textContent = '...';
  } else if (effectiveStatus === 'downloading' && isReallyNewer) {
    els.updateDialogProgressWrap.hidden = false;
    els.updateDialogProgress.value = pct;
    els.updateDialogPct.textContent = `%${pct}`;
  } else {
    els.updateDialogProgressWrap.hidden = true;
  }

  if (u.releaseNotes && isReallyNewer) {
    els.updateNotesWrap.hidden = false;
    els.updateNotes.textContent = u.releaseNotes;
  } else {
    els.updateNotesWrap.hidden = true;
    els.updateNotes.textContent = '';
  }

  els.btnUpdateRecheck.disabled = effectiveStatus === 'checking' || effectiveStatus === 'downloading';

  if (effectiveStatus === 'available' && isReallyNewer) {
    els.btnUpdateAction.hidden = false;
    els.btnUpdateAction.textContent = u.isPackaged ? 'Güncellemeyi İndir' : "GitHub'dan İndir";
  } else if (effectiveStatus === 'downloaded' && isReallyNewer) {
    els.btnUpdateAction.hidden = false;
    els.btnUpdateAction.textContent = 'Şimdi Güncelle ve Yeniden Başlat';
  } else {
    els.btnUpdateAction.hidden = true;
  }
}

async function triggerUpdateAction() {
  const u = state.updateState;
  const curVer = u?.currentVersion || state.appVersion || '1.0.2';
  if (!u || !u.latestVersion || compareSemver(u.latestVersion, curVer) <= 0) {
    return;
  }
  if (u.status === 'available') {
    const res = await window.yusic.downloadUpdate();
    if (res?.openedExternal) {
      showToast('Kurulum dosyası tarayıcıda açıldı.', 'info');
    }
  } else if (u.status === 'downloaded') {
    await window.yusic.installUpdate();
  }
}

function renderAll() {
  renderSidebar();
  renderMainView();
  applySpeedAndPitch();
  applyVolume();
  applyTransportState();
  renderUpdateState();
}

function rebuildTrackMap(tracks) {
  state.tracks = tracks;
  state.trackMap = new Map(tracks.map((t) => [t.id, t]));
}

/* ---------------- Tab Activation Helpers ---------------- */
function activateSpotifyTab(tabEl) {
  const sub = tabEl?.dataset?.sptab;
  if (!sub) return;
  state.spotifySubTab = sub;
  if (sub === 'liked' && state.spotifyAuth.connected) loadSpotifyLiked(true);
  else if (sub === 'playlists' && state.spotifyAuth.connected) loadSpotifyPlaylistsList();
  else if (sub === 'recent' && state.spotifyAuth.connected) loadSpotifyRecent();
  renderSpotifyView();
}

function activateSettingsTab(tabEl) {
  const id = tabEl?.id;
  const map = {
    'stab-appearance': 'appearance',
    'stab-audio': 'audio',
    'stab-spotify': 'spotify',
    'stab-updates': 'updates'
  };
  if (map[id]) {
    state.settingsTab = map[id];
    renderSettingsView();
  }
}

/* ---------------- Event Bindings ---------------- */
function bindEvents() {
  // Navigation
  els.navLocal.addEventListener('click', () => {
    state.viewTab = 'library';
    renderAll();
  });

  els.navSpotify.addEventListener('click', () => {
    state.viewTab = 'spotify';
    if (
      state.spotifyAuth.connected &&
      state.spotifySubTab === 'liked' &&
      state.spotifyCollection.tracks.length === 0 &&
      !state.spotifyCollection.loading
    ) {
      loadSpotifyLiked(true);
    }
    renderAll();
  });

  els.navDownloader.addEventListener('click', () => {
    state.viewTab = 'downloader';
    renderAll();
  });

  els.navSettings.addEventListener('click', () => {
    state.viewTab = 'settings';
    renderAll();
  });

  // Local Library Controls
  els.btnOpenFolder.addEventListener('click', () => window.yusic.openMusicFolder());
  els.btnEmptyOpenFolder.addEventListener('click', () => window.yusic.openMusicFolder());
  els.btnEmptyGoSpotify.addEventListener('click', () => {
    state.viewTab = 'spotify';
    renderAll();
  });

  els.btnRescan.addEventListener('click', async () => {
    const tracks = await window.yusic.scanLibrary();
    rebuildTrackMap(tracks);
    renderAll();
    showToast(`Kütüphane tarandı: ${tracks.length} şarkı hazır.`, 'success');
  });

  els.btnPickFiles.addEventListener('click', async () => {
    const added = await window.yusic.pickAndImportFiles();
    if (added?.length > 0) {
      showToast(`${added.length} ses dosyası müzik klasörüne eklendi.`, 'success');
    }
  });

  els.btnNewPlaylist.addEventListener('click', () => openPlaylistDialog('create'));

  els.btnHeroPickCover.addEventListener('click', async () => {
    const pl = getActivePlaylist();
    if (!pl) return;
    const res = await window.yusic.pickPlaylistCover(pl.id, false);
    if (!res?.canceled && res?.coverFile) {
      showToast('Playlist kapak fotoğrafı güncellendi.', 'success');
    }
  });

  els.btnPlaylistEdit.addEventListener('click', () => {
    const pl = getActivePlaylist();
    if (pl) openPlaylistEditDialog(pl);
  });

  els.btnPlEditPickCover.addEventListener('click', async () => {
    const plId = state.pendingEditPlaylistId;
    if (!plId) return;
    const res = await window.yusic.pickPlaylistCover(plId, false);
    if (!res?.canceled && res?.playlist) {
      renderPlaylistEditCoverPreview(res.playlist);
    }
  });

  els.btnPlEditClearCover.addEventListener('click', async () => {
    const plId = state.pendingEditPlaylistId;
    if (!plId) return;
    const updated = await window.yusic.updatePlaylistDetails(plId, { coverFile: null });
    renderPlaylistEditCoverPreview(updated);
  });

  els.btnPlaylistSpeed.addEventListener('click', () => {
    const pl = getActivePlaylist();
    if (!pl) return;
    openSpeedOverrideDialog({
      kind: 'local-playlist',
      id: pl.id,
      label: pl.name,
      currentOverride: pl.speedOverride || null
    });
  });

  for (const btn of [els.btnViewList, els.btnViewCompact, els.btnViewGrid]) {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      const pl = getActivePlaylist();
      if (pl) {
        await window.yusic.updatePlaylistDetails(pl.id, { viewMode: mode });
      } else {
        saveSettingsPatch({ libraryViewMode: mode }, true);
        renderMainView();
      }
    });
  }

  els.btnAddPlQuick.addEventListener('click', async () => {
    const name = els.addPlNewName.value.trim();
    if (!name || !state.pendingTrackForPlaylist) return;
    const pl = await window.yusic.createPlaylist(name);
    await window.yusic.addTracksToPlaylist(pl.id, [state.pendingTrackForPlaylist.id]);
    showToast(`"${pl.name}" oluşturuldu ve şarkı eklendi.`, 'success');
    els.addPlNewName.value = '';
    renderAddToPlaylistModalList();
  });

  els.btnPlayAll.addEventListener('click', () => {
    const list = getVisibleTracks();
    if (list.length === 0) return;
    if (state.settings.shuffle) saveSettingsPatch({ shuffle: false }, true);
    setQueueAndPlay(list.map((t) => t.id), list[0].id, state.activePlaylistId);
    applyTransportState();
  });

  els.btnShuffleAll.addEventListener('click', () => {
    const list = getVisibleTracks();
    if (list.length === 0) return;
    saveSettingsPatch({ shuffle: true }, true);
    setQueueAndPlay(list.map((t) => t.id), null, state.activePlaylistId);
    applyTransportState();
  });

  els.searchInput.addEventListener('input', () => {
    state.searchQuery = els.searchInput.value;
    renderMainView();
  });

  els.sortSelect.addEventListener('change', () => {
    state.sortBy = els.sortSelect.value;
    renderMainView();
  });

  // Spotify View & Sidebar Refresh
  const refreshSpotifyState = async () => {
    await loadSpotifyPlaylistsList();
    if (state.spotifySubTab === 'liked') await loadSpotifyLiked(true);
    else if (state.spotifySubTab === 'recent') await loadSpotifyRecent();
    else if (state.spotifySubTab === 'playlist-detail' && state.spotifyCollection.spotifyPlaylistId) {
      await openSpotifyPlaylistDetail(
        {
          id: state.spotifyCollection.id,
          spotifyPlaylistId: state.spotifyCollection.spotifyPlaylistId,
          name: state.spotifyCollection.title,
          coverUrl: state.spotifyCollection.coverUrl,
          description: state.spotifyCollection.description
        },
        true
      );
    }
    showToast('Spotify kitaplığı yenilendi.', 'success');
  };

  els.btnSpRefresh.addEventListener('click', refreshSpotifyState);
  els.btnSpSidebarRefresh.addEventListener('click', refreshSpotifyState);

  els.btnSpLogin.addEventListener('click', async () => {
    els.btnSpLogin.disabled = true;
    els.btnSpLogin.textContent = 'Tarayıcıda Onay Bekleniyor...';
    try {
      const status = await window.yusic.loginSpotify();
      state.spotifyAuth = status;
      showToast('Spotify hesabın başarıyla bağlandı!', 'success');
      await Promise.all([loadSpotifyLiked(true), loadSpotifyPlaylistsList()]);
    } catch (err) {
      showToast(err?.message || 'Spotify bağlantısı tamamlanamadı.', 'error');
    } finally {
      els.btnSpLogin.disabled = false;
      els.btnSpLogin.textContent = 'Spotify ile Bağlan';
      renderAll();
    }
  });

  els.btnSpGoPublic.addEventListener('click', () => {
    state.spotifySubTab = 'public';
    renderSpotifyView();
    els.spPublicUrl.focus();
  });

  els.btnSpOpenSettings.addEventListener('click', () => {
    state.viewTab = 'settings';
    state.settingsTab = 'spotify';
    renderAll();
  });

  els.btnSpLogout.addEventListener('click', async () => {
    state.spotifyAuth = await window.yusic.logoutSpotify();
    state.spotifyPlaylists = [];
    state.spotifyCollection.tracks = [];
    showToast('Spotify oturumu kapatıldı.', 'info');
    renderAll();
  });

  els.spTablist.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (!tab) return;
    activateSpotifyTab(tab);
  });
  bindTablistKeyboard(els.spTablist, activateSpotifyTab);

  els.spSearchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runSpotifyCatalogSearch(els.spSearchInput.value);
  });

  els.spPublicForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = els.spPublicUrl.value.trim();
    if (!url) return;
    try {
      const opened = await window.yusic.openPublicSpotifyLink(url);
      rememberSpotifyTracks(opened.tracks);
      state.viewTab = 'spotify';
      state.spotifySubTab = 'public';
      state.spotifyCollection = {
        id: opened.id,
        title: opened.name,
        eyebrow: 'SPOTIFY AÇIK BAĞLANTI (CANLI AKIŞ)',
        description: opened.truncatedAt100
          ? 'Herkese açık bağlantıdan ilk 100 şarkı canlı dinleniyor'
          : 'İndirmeden canlı dinleniyor',
        coverUrl: opened.coverUrl,
        isLiked: false,
        spotifyPlaylistId: null,
        tracks: opened.tracks,
        total: opened.tracks.length,
        hasMore: false,
        offset: opened.tracks.length,
        loading: false,
        truncatedAt100: opened.truncatedAt100
      };
      els.spPublicUrl.value = '';
      renderAll();
      showToast(`"${opened.name}" akış için açıldı.`, 'success');
    } catch (err) {
      showToast(err?.message || 'Spotify bağlantısı açılamadı.', 'error');
    }
  });

  els.btnSpPlayAll.addEventListener('click', () => {
    const tracks = state.spotifyCollection.tracks;
    if (tracks.length === 0) return;
    if (state.settings.shuffle) saveSettingsPatch({ shuffle: false }, true);
    setQueueAndPlay(tracks.map((t) => t.id), tracks[0].id, state.spotifyCollection.id);
    applyTransportState();
  });

  els.btnSpShuffleAll.addEventListener('click', () => {
    const tracks = state.spotifyCollection.tracks;
    if (tracks.length === 0) return;
    saveSettingsPatch({ shuffle: true }, true);
    setQueueAndPlay(tracks.map((t) => t.id), null, state.spotifyCollection.id);
    applyTransportState();
  });

  els.btnSpListSpeed.addEventListener('click', () => {
    const col = state.spotifyCollection;
    const pref = state.externalListPrefs[col.id];
    openSpeedOverrideDialog({
      kind: 'external-playlist',
      id: col.id,
      label: col.title,
      currentOverride: pref?.speedOverride || null
    });
  });

  els.btnSpHeroPickCover.addEventListener('click', async () => {
    const col = state.spotifyCollection;
    const res = await window.yusic.pickPlaylistCover(col.id, true);
    if (!res?.canceled && res?.externalListPrefs) {
      state.externalListPrefs = res.externalListPrefs;
      renderAll();
      showToast('Kapak fotoğrafı güncellendi.', 'success');
    }
  });

  for (const btn of [els.btnSpViewList, els.btnSpViewCompact, els.btnSpViewGrid]) {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      state.externalListPrefs = await window.yusic.updateExternalListPref(
        state.spotifyCollection.id,
        { viewMode: mode }
      );
      renderSpotifyView();
    });
  }

  els.spFilterInput.addEventListener('input', () => {
    state.spotifyFilterQuery = els.spFilterInput.value;
    renderSpotifyView();
  });

  els.btnSpLoadMore.addEventListener('click', () => {
    if (state.spotifySubTab === 'liked') loadSpotifyLiked(false);
    else if (state.spotifySubTab === 'playlist-detail' && state.spotifyCollection.spotifyPlaylistId) {
      openSpotifyPlaylistDetail(
        {
          id: state.spotifyCollection.id,
          spotifyPlaylistId: state.spotifyCollection.spotifyPlaylistId,
          name: state.spotifyCollection.title,
          coverUrl: state.spotifyCollection.coverUrl,
          description: state.spotifyCollection.description
        },
        false
      );
    }
  });

  // Settings View Bindings
  els.settingsTablist.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (!tab) return;
    activateSettingsTab(tab);
  });
  bindTablistKeyboard(els.settingsTablist, activateSettingsTab);

  els.uiScaleSlider.addEventListener('input', () => {
    applyUiScale(els.uiScaleSlider.value, true, true);
  });

  els.uiScalePresets.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    applyUiScale(chip.dataset.scale, true, true);
  });

  els.btnResetLayout.addEventListener('click', () => {
    applyLayout({ ...DEFAULT_LAYOUT });
    saveSettingsPatch({ layout: { ...DEFAULT_LAYOUT } }, true);
    showToast('Panel boyutları varsayılan ölçülere sıfırlandı.', 'info');
  });

  // 10-Band EQ Controls
  buildEqBandsUI();

  els.chkEqEnabled.addEventListener('change', () => {
    const eq = ensureEqStateShape();
    eq.enabled = Boolean(els.chkEqEnabled.checked);
    applyEqToAudioGraph();
    renderEqUI();
    saveSettingsPatch({ eq: { ...eq, bands: eq.bands.slice() } }, true);
  });

  els.btnEqReset.addEventListener('click', () => {
    const eq = ensureEqStateShape();
    eq.preset = 'flat';
    eq.bands = EQ_PRESETS.flat.slice();
    applyEqToAudioGraph();
    renderEqUI();
    saveSettingsPatch({ eq: { ...eq, bands: eq.bands.slice() } }, true);
  });

  els.eqPresetsRow.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    const key = chip.dataset.eqPreset;
    const presetBands = EQ_PRESETS[key];
    if (!presetBands) return;
    const eq = ensureEqStateShape();
    eq.preset = key;
    eq.bands = presetBands.slice();
    if (key !== 'flat') eq.enabled = true;
    applyEqToAudioGraph();
    renderEqUI();
    saveSettingsPatch({ eq: { ...eq, bands: eq.bands.slice() } }, true);
  });

  els.btnEqShortcut.addEventListener('click', () => {
    state.viewTab = 'settings';
    state.settingsTab = 'audio';
    renderAll();
  });

  // Settings Spotify & Folder & Updates Controls
  els.btnSettingsSpSave.addEventListener('click', async () => {
    const id = els.settingsSpClientId.value.trim();
    if (!id) {
      showToast('Client ID boş olamaz.', 'error');
      return;
    }
    state.spotifyAuth = await window.yusic.saveSpotifyClientId(id);
    showToast('Spotify Client ID kaydedildi.', 'success');
    renderSettingsView();
  });

  els.btnSettingsSpReset.addEventListener('click', async () => {
    state.spotifyAuth = await window.yusic.resetSpotifyClientId();
    els.settingsSpClientId.value = state.spotifyAuth.clientId || '';
    showToast('Dahili varsayılan Spotify Client ID geri yüklendi.', 'info');
    renderSettingsView();
  });

  els.btnSettingsSpCopy.addEventListener('click', async () => {
    const uri = els.settingsSpRedirect.textContent;
    try {
      await navigator.clipboard.writeText(uri);
      showToast('Redirect URI panoya kopyalandı.', 'success');
    } catch {
      showToast(uri, 'info');
    }
  });

  els.btnSettingsSpDashboard.addEventListener('click', () => window.yusic.openSpotifyDashboard());
  els.btnSettingsOpenFolder.addEventListener('click', () => window.yusic.openMusicFolder());
  els.btnSettingsCheckUpdate.addEventListener('click', async () => {
    renderUpdateState();
    els.updateDialog.showModal();
    await window.yusic.checkForUpdates();
  });
  els.btnSettingsOpenGithub.addEventListener('click', () => window.yusic.openReleasePage());

  // Transport controls
  els.btnPlayPause.addEventListener('click', togglePlayPause);
  els.btnPrev.addEventListener('click', handlePrev);
  els.btnNext.addEventListener('click', () => handleNext(true));
  els.btnShuffle.addEventListener('click', toggleShuffle);
  els.btnRepeat.addEventListener('click', cycleRepeatMode);

  els.seekSlider.addEventListener('input', () => {
    state.isSeeking = true;
    const val = Number(els.seekSlider.value) || 0;
    els.timeCurrent.textContent = formatTime(val);
    syncSliderVisual(els.seekSlider, formatTime(val));
  });

  els.seekSlider.addEventListener('change', () => {
    const val = Number(els.seekSlider.value) || 0;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.min(audio.duration, Math.max(0, val));
    }
    state.isSeeking = false;
  });

  // Speed & Pitch Popover
  const persistCurrentSpeedChange = async (speed, preservePitch, immediate) => {
    const eff = getActiveEffectiveSpeed();
    if (eff.source === 'track' && state.currentTrackId) {
      state.trackSpeedOverrides = await window.yusic.setTrackSpeedOverride(state.currentTrackId, {
        speed,
        preservePitch
      });
      renderAll();
      return;
    }
    if (eff.source === 'playlist' && state.activeQueuePlaylistId) {
      const localPl = state.playlists.find((p) => p.id === state.activeQueuePlaylistId);
      if (localPl) {
        await window.yusic.updatePlaylistDetails(localPl.id, {
          speedOverride: { speed, preservePitch }
        });
      } else {
        state.externalListPrefs = await window.yusic.updateExternalListPref(
          state.activeQueuePlaylistId,
          { speedOverride: { speed, preservePitch } }
        );
      }
      renderAll();
      return;
    }
    saveSettingsPatch({ speed, preservePitch }, immediate);
    applySpeedAndPitch();
  };

  els.speedSlider.addEventListener('input', () => {
    const speed = clampSpeed(els.speedSlider.value);
    const eff = getActiveEffectiveSpeed();
    if (eff.source === 'global') {
      state.settings.speed = speed;
      applySpeedAndPitch();
      saveSettingsPatch({ speed }, false);
    } else {
      persistCurrentSpeedChange(speed, eff.preservePitch, false);
    }
  });

  els.btnSpeedReset.addEventListener('click', () => {
    const eff = getActiveEffectiveSpeed();
    persistCurrentSpeedChange(1.0, eff.preservePitch, true);
  });

  els.speedPresets.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-chip');
    if (!btn) return;
    const speed = clampSpeed(btn.dataset.speed);
    const eff = getActiveEffectiveSpeed();
    persistCurrentSpeedChange(speed, eff.preservePitch, true);
  });

  els.pitchPreserve.addEventListener('change', () => {
    if (!els.pitchPreserve.checked) return;
    const eff = getActiveEffectiveSpeed();
    persistCurrentSpeedChange(eff.speed, true, true);
  });

  els.pitchChange.addEventListener('change', () => {
    if (!els.pitchChange.checked) return;
    const eff = getActiveEffectiveSpeed();
    persistCurrentSpeedChange(eff.speed, false, true);
  });

  els.btnSaveTrackSpeed.addEventListener('click', async () => {
    if (!state.currentTrackId) return;
    const eff = getActiveEffectiveSpeed();
    state.trackSpeedOverrides = await window.yusic.setTrackSpeedOverride(state.currentTrackId, {
      speed: eff.speed,
      preservePitch: eff.preservePitch
    });
    showToast(`Şarkıya özel ${eff.speed.toFixed(2)}x hız kaydedildi.`, 'success');
    renderAll();
  });

  els.btnSaveListSpeed.addEventListener('click', async () => {
    if (!state.activeQueuePlaylistId) return;
    const eff = getActiveEffectiveSpeed();
    const localPl = state.playlists.find((p) => p.id === state.activeQueuePlaylistId);
    if (localPl) {
      await window.yusic.updatePlaylistDetails(localPl.id, {
        speedOverride: { speed: eff.speed, preservePitch: eff.preservePitch }
      });
    } else {
      state.externalListPrefs = await window.yusic.updateExternalListPref(
        state.activeQueuePlaylistId,
        { speedOverride: { speed: eff.speed, preservePitch: eff.preservePitch } }
      );
    }
    showToast(`Listeye özel ${eff.speed.toFixed(2)}x hız kaydedildi.`, 'success');
    renderAll();
  });

  els.btnClearActiveOverride.addEventListener('click', async () => {
    const eff = getActiveEffectiveSpeed();
    if (eff.source === 'track' && state.currentTrackId) {
      state.trackSpeedOverrides = await window.yusic.setTrackSpeedOverride(state.currentTrackId, null);
    } else if (eff.source === 'playlist' && state.activeQueuePlaylistId) {
      const localPl = state.playlists.find((p) => p.id === state.activeQueuePlaylistId);
      if (localPl) {
        await window.yusic.updatePlaylistDetails(localPl.id, { speedOverride: null });
      } else {
        state.externalListPrefs = await window.yusic.updateExternalListPref(
          state.activeQueuePlaylistId,
          { speedOverride: null }
        );
      }
    }
    showToast('Özel hız kaldırıldı, genel ayara dönüldü.', 'info');
    renderAll();
  });

  els.spdOvSlider.addEventListener('input', () => {
    syncSpeedOverrideDialogUI(els.spdOvSlider.value, els.ovPitchPreserve.checked);
  });
  els.spdOvPresets.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    syncSpeedOverrideDialogUI(chip.dataset.speed, els.ovPitchPreserve.checked);
  });

  // Volume & Mute
  els.volumeSlider.addEventListener('input', () => {
    const vol = Math.min(1, Math.max(0, Number(els.volumeSlider.value) || 0));
    state.settings.volume = vol;
    state.settings.muted = vol === 0;
    applyVolume();
    saveSettingsPatch({ volume: vol, muted: state.settings.muted }, false);
  });

  els.btnMute.addEventListener('click', () => {
    const nextMuted = !state.settings.muted;
    state.settings.muted = nextMuted;
    if (!nextMuted && state.settings.volume === 0) {
      state.settings.volume = 0.5;
    }
    applyVolume();
    saveSettingsPatch({ muted: nextMuted, volume: state.settings.volume }, true);
  });

  // Audio events
  audio.addEventListener('loadedmetadata', () => {
    const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
    els.seekSlider.max = String(dur > 0 ? dur : 100);
    els.seekSlider.value = '0';
    els.timeCurrent.textContent = '0:00';
    els.timeTotal.textContent = formatTime(dur);
    syncSliderVisual(els.seekSlider, '0:00');
    applySpeedAndPitch();
  });

  audio.addEventListener('timeupdate', () => {
    if (state.isSeeking) return;
    const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (dur > 0) els.seekSlider.max = String(dur);
    els.seekSlider.value = String(cur);
    els.timeCurrent.textContent = formatTime(cur);
    syncSliderVisual(els.seekSlider, formatTime(cur));
  });

  audio.addEventListener('play', () => {
    applySpeedAndPitch();
    applyTransportState();
    kickVisualizer();
  });

  audio.addEventListener('pause', () => {
    applyTransportState();
  });

  audio.addEventListener('ended', () => {
    handleNext(false);
  });

  audio.addEventListener('error', () => {
    if (!state.currentTrackId || !audio.getAttribute('src')) return;
    if (audio.error && audio.error.code === MediaError.MEDIA_ERR_ABORTED) return;
    showToast('Ses kaynağı yüklenemedi, sonraki parçaya geçiliyor.', 'error');
    if (state.queueIds.length > 1) {
      handleNext(false);
    } else {
      applyTransportState();
    }
  });

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('previoustrack', () => handlePrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => handleNext(true));
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (Number.isFinite(details.seekTime)) {
          audio.currentTime = details.seekTime;
        }
      });
    } catch {
      // Ignore
    }
  }

  // Downloader form
  els.dlUrlInput.addEventListener('input', () => updateUrlDetectionBanner());
  els.chkYtList.addEventListener('change', () => {
    saveSettingsPatch({ downloadYoutubePlaylistOnWatch: els.chkYtList.checked }, true);
    updateUrlDetectionBanner();
  });
  els.chkAutoPlaylist.addEventListener('change', () => {
    saveSettingsPatch({ autoCreatePlaylistOnDownload: els.chkAutoPlaylist.checked }, true);
  });

  els.dlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = els.dlUrlInput.value.trim();
    if (!url) return;
    try {
      const job = await window.yusic.startDownload(url, {
        createPlaylist: els.chkAutoPlaylist.checked,
        includeYoutubePlaylistOnWatch: els.chkYtList.checked
      });
      if (!state.downloads.some((j) => j.id === job.id)) {
        state.downloads.unshift(job);
      }
      els.dlUrlInput.value = '';
      updateUrlDetectionBanner();
      renderSidebar();
      renderDownloaderJobs();
      showToast('İndirme kuyruğa eklendi.', 'success');
    } catch (err) {
      showToast(err?.message || 'İndirme başlatılamadı.', 'error');
    }
  });

  els.btnDlClear.addEventListener('click', async () => {
    state.downloads = await window.yusic.clearCompletedDownloads();
    renderSidebar();
    renderDownloaderJobs();
  });

  // External Drag & Drop Audio Files onto Yusic window
  let dragDepth = 0;
  const hasExternalFiles = (e) =>
    Boolean(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));

  window.addEventListener('dragenter', (e) => {
    if (!hasExternalFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    els.dropOverlay.hidden = false;
  });

  window.addEventListener('dragover', (e) => {
    if (!hasExternalFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  window.addEventListener('dragleave', (e) => {
    if (!hasExternalFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) els.dropOverlay.hidden = true;
  });

  window.addEventListener('drop', async (e) => {
    if (!hasExternalFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    els.dropOverlay.hidden = true;

    const files = Array.from(e.dataTransfer.files || []);
    const paths = files.map((f) => window.yusic.getPathForFile(f)).filter(Boolean);
    if (paths.length === 0) return;

    const imported = await window.yusic.importFiles(paths);
    if (imported.length > 0) {
      showToast(`${imported.length} dosya müzik klasörüne eklendi.`, 'success');
    } else {
      showToast('Desteklenen ses dosyası bulunamadı veya dosyalar zaten klasörde.', 'info');
    }
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      document.querySelector('dialog:modal')
    ) {
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.code === 'ArrowRight' && e.shiftKey) {
      e.preventDefault();
      handleNext(true);
    } else if (e.code === 'ArrowLeft' && e.shiftKey) {
      e.preventDefault();
      handlePrev();
    } else if (e.code === 'ArrowRight') {
      if (Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      }
    } else if (e.code === 'ArrowLeft') {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
    } else if (e.key === 'm' || e.key === 'M') {
      els.btnMute.click();
    } else if (e.key === 's' || e.key === 'S') {
      toggleShuffle();
    } else if (e.key === 'r' || e.key === 'R') {
      cycleRepeatMode();
    }
  });

  // Main -> Renderer IPC events
  window.yusic.onLibraryUpdated((payload) => {
    const tracks = payload?.tracks || [];
    rebuildTrackMap(tracks);
    renderSidebar();
    if (state.viewTab === 'library') renderMainView();
    if (payload?.addedCount > 0) {
      showToast(`${payload.addedCount} yeni şarkı kütüphaneye aktarıldı.`, 'success');
    }
  });

  window.yusic.onPlaylistsUpdated((playlists) => {
    state.playlists = playlists || [];
    renderAll();
    if (els.addPlDialog.open) {
      renderAddToPlaylistModalList();
    }
  });

  window.yusic.onDownloadJobUpdated((job) => {
    if (!job) return;
    const prev = state.downloads.find((j) => j.id === job.id);
    const prevStatus = prev?.status;
    if (prev) {
      Object.assign(prev, job);
    } else {
      state.downloads.unshift(job);
    }
    renderSidebar();
    if (state.viewTab === 'downloader') renderDownloaderJobs();

    if (prevStatus !== 'completed' && job.status === 'completed') {
      showToast(`İndirme tamamlandı: ${job.title}`, 'success');
    } else if (prevStatus !== 'error' && job.status === 'error') {
      showToast(`İndirme hatası: ${job.error || job.title}`, 'error');
    }
  });

  window.yusic.onSpotifyAuthChanged((status) => {
    state.spotifyAuth = status || { connected: false, clientId: '', user: null };
    if (state.spotifyAuth.connected) {
      loadSpotifyPlaylistsList();
    }
    renderAll();
  });

  // Updater controls & events
  els.btnCheckUpdates.addEventListener('click', async () => {
    renderUpdateState();
    els.updateDialog.showModal();
    await window.yusic.checkForUpdates();
  });

  els.btnUpdateRecheck.addEventListener('click', async () => {
    await window.yusic.checkForUpdates();
  });

  els.btnUpdateGithub.addEventListener('click', async () => {
    await window.yusic.openReleasePage();
  });

  els.btnUpdateAction.addEventListener('click', triggerUpdateAction);
  els.btnBannerAction.addEventListener('click', triggerUpdateAction);
  els.btnBannerDetails.addEventListener('click', () => {
    renderUpdateState();
    els.updateDialog.showModal();
  });
  els.btnBannerDismiss.addEventListener('click', () => {
    state.updateBannerDismissed = true;
    renderUpdateState();
  });

  window.yusic.onUpdateStateChanged((nextState) => {
    if (!nextState) return;
    const curVer = nextState.currentVersion || state.appVersion;
    const isReallyNewer = Boolean(
      nextState.latestVersion && compareSemver(nextState.latestVersion, curVer) > 0
    );

    const prevStatus = state.updateState?.status;
    state.updateState = nextState;

    if (
      isReallyNewer &&
      (nextState.status === 'available' || nextState.status === 'downloaded') &&
      prevStatus !== nextState.status
    ) {
      state.updateBannerDismissed = false;
    }

    renderUpdateState();

    if (
      isReallyNewer &&
      nextState.status === 'available' &&
      state.lastNotifiedUpdateStatus !== `available:${nextState.latestVersion}`
    ) {
      state.lastNotifiedUpdateStatus = `available:${nextState.latestVersion}`;
      showToast(`Yeni sürüm mevcut: Yusic v${nextState.latestVersion}`, 'info');
    } else if (
      isReallyNewer &&
      nextState.status === 'downloaded' &&
      state.lastNotifiedUpdateStatus !== `downloaded:${nextState.latestVersion}`
    ) {
      state.lastNotifiedUpdateStatus = `downloaded:${nextState.latestVersion}`;
      showToast(`Yusic v${nextState.latestVersion} indirildi, yeniden başlatıp güncelleyebilirsiniz.`, 'success');
    }
  });
}

async function initApp() {
  setupDialogEnhancements();
  setupPanelResizers();
  bindEvents();

  const initData = await window.yusic.init();
  state.muzikDir = initData.muzikDir;
  state.appVersion = initData.appVersion || '1.0.2';
  state.isPackaged = Boolean(initData.isPackaged);
  state.serverUrl = initData.serverUrl;
  state.serverToken = initData.serverToken;
  state.playlists = initData.playlists || [];
  state.settings = {
    ...state.settings,
    ...(initData.settings || {}),
    eq: {
      enabled: Boolean(initData.settings?.eq?.enabled),
      preset: String(initData.settings?.eq?.preset || 'flat'),
      bands: Array.isArray(initData.settings?.eq?.bands)
        ? initData.settings.eq.bands.slice(0, 10)
        : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    layout: sanitizeLayoutValues(initData.settings?.layout)
  };
  state.trackSpeedOverrides = initData.trackSpeedOverrides || {};
  state.externalListPrefs = initData.externalListPrefs || {};
  state.spotifyAuth = initData.spotifyAuth || { connected: false, clientId: '', user: null };
  state.downloads = initData.downloads || [];
  state.toolsStatus = initData.toolsStatus || null;
  state.updateState = initData.updateState || null;

  rebuildTrackMap(initData.tracks || []);

  applyUiScale(state.settings.uiScale, false);
  applyLayout(state.settings.layout);
  renderEqUI();

  els.chkAutoPlaylist.checked = state.settings.autoCreatePlaylistOnDownload !== false;
  els.chkYtList.checked = state.settings.downloadYoutubePlaylistOnWatch !== false;
  els.dlToolsWarning.hidden = Boolean(
    state.toolsStatus?.readyForYoutube && state.toolsStatus?.readyForSpotify
  );

  if (state.spotifyAuth.connected) {
    loadSpotifyPlaylistsList().catch(() => {});
  }

  syncSliderVisual(els.seekSlider, '0:00');
  renderAll();
  drawVisualizer();
  document.body.dataset.yusicReady = '1';
}

initApp().catch((err) => {
  console.error('Yusic init error:', err);
});
