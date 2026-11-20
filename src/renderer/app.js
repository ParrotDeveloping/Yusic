import {
  clampSpeed,
  createShuffledQueue,
  getNextIndex,
  getPrevIndex
} from '../main/playbackLogic.js';

const audio = document.getElementById('audio-player');

const els = {
  navAllMusic: document.getElementById('nav-all-music'),
  navDownloader: document.getElementById('nav-downloader'),
  badgeAllCount: document.getElementById('badge-all-count'),
  badgeDlActive: document.getElementById('badge-dl-active'),
  btnOpenFolder: document.getElementById('btn-open-folder'),
  btnRescan: document.getElementById('btn-rescan'),
  btnPickFiles: document.getElementById('btn-pick-files'),
  btnNewPlaylist: document.getElementById('btn-new-playlist'),
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
  viewDownloader: document.getElementById('view-downloader'),
  viewEyebrow: document.getElementById('view-eyebrow'),
  viewTitle: document.getElementById('view-title'),
  viewMeta: document.getElementById('view-meta'),
  btnPlayAll: document.getElementById('btn-play-all'),
  btnShuffleAll: document.getElementById('btn-shuffle-all'),
  searchInput: document.getElementById('search-input'),
  sortWrap: document.getElementById('sort-wrap'),
  sortSelect: document.getElementById('sort-select'),
  trackTableHead: document.getElementById('track-table-head'),
  trackList: document.getElementById('track-list'),
  libraryEmpty: document.getElementById('library-empty'),
  emptyTitle: document.getElementById('empty-title'),
  emptyDesc: document.getElementById('empty-desc'),
  emptyMuzikPath: document.getElementById('empty-muzik-path'),
  btnEmptyOpenFolder: document.getElementById('btn-empty-open-folder'),
  btnEmptyGoDl: document.getElementById('btn-empty-go-dl'),

  dlForm: document.getElementById('dl-form'),
  dlUrlInput: document.getElementById('dl-url-input'),
  dlDetectPill: document.getElementById('dl-detect-pill'),
  chkAutoPlaylist: document.getElementById('chk-auto-playlist'),
  chkYtList: document.getElementById('chk-yt-list'),
  dlToolsWarning: document.getElementById('dl-tools-warning'),
  btnDlClear: document.getElementById('btn-dl-clear'),
  dlJobs: document.getElementById('dl-jobs'),

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

  btnSpeedPanel: document.getElementById('btn-speed-panel'),
  speedTriggerRate: document.getElementById('speed-trigger-rate'),
  speedTriggerPitch: document.getElementById('speed-trigger-pitch'),
  speedValueLabel: document.getElementById('speed-value-label'),
  speedSlider: document.getElementById('speed-slider'),
  speedPresets: document.getElementById('speed-presets'),
  btnSpeedReset: document.getElementById('btn-speed-reset'),
  pitchPreserve: document.getElementById('pitch-preserve'),
  pitchChange: document.getElementById('pitch-change'),
  pitchHint: document.getElementById('pitch-hint'),

  btnMute: document.getElementById('btn-mute'),
  iconVolOn: document.getElementById('icon-vol-on'),
  iconVolOff: document.getElementById('icon-vol-off'),
  volumeSlider: document.getElementById('volume-slider'),

  dropOverlay: document.getElementById('drop-overlay'),

  playlistDialog: document.getElementById('playlist-dialog'),
  playlistDialogTitle: document.getElementById('playlist-dialog-title'),
  playlistNameInput: document.getElementById('playlist-name-input'),
  playlistDialogSubmit: document.getElementById('playlist-dialog-submit'),

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
  appVersion: '1.0.0',
  isPackaged: false,
  serverUrl: '',
  serverToken: '',
  tracks: [],
  trackMap: new Map(),
  playlists: [],
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
    downloadYoutubePlaylistOnWatch: true
  },
  viewTab: 'library',
  activePlaylistId: null,
  searchQuery: '',
  sortBy: 'title',

  baseQueueIds: [],
  queueIds: [],
  queueIndex: -1,
  currentTrackId: null,
  isSeeking: false,

  pendingPlaylistDialog: null,
  pendingConfirmAction: null,
  pendingTrackForPlaylist: null
};

let settingsSaveTimer = null;
let audioCtx = null;
let analyserNode = null;
let analyserData = null;
let visualizerRaf = 0;

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

function audioUrlForTrack(trackId) {
  return `${state.serverUrl}/audio/${encodeURIComponent(trackId)}?t=${encodeURIComponent(state.serverToken)}`;
}

function coverUrlForTrack(track) {
  if (!track?.coverFile) return '';
  return `${state.serverUrl}/cover/${encodeURIComponent(track.coverFile)}?t=${encodeURIComponent(state.serverToken)}`;
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

/* ---------------- Toast Notifications (persistent-toast-notifications) ---------------- */
function restackToasts() {
  const openToasts = Array.from(els.toastRegion.querySelectorAll('.toast'));
  openToasts.forEach((node, idx) => {
    node.style.setProperty('--toast-index', String(idx));
  });
}

function showToast(message, variant = 'info', durationMs = 4200) {
  // Do not surface background toasts while a modal dialog is open
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
      try {
        toast.hidePopover();
      } catch {
        cleanup();
      }
    }, durationMs);
  };

  toast.addEventListener('toggle', (e) => {
    if (e.newState === 'closed') {
      const wasFocused = toast.contains(document.activeElement);
      const nextToast = toast.nextElementSibling || toast.previousElementSibling;
      cleanup();
      if (wasFocused) {
        const nextBtn = nextToast?.querySelector('.toast-close');
        if (nextBtn instanceof HTMLElement) nextBtn.focus();
        else if (previousFocus && previousFocus.isConnected) previousFocus.focus();
      }
    }
  });

  toast.addEventListener('focusin', () => {
    if (timer) clearTimeout(timer);
  });
  toast.addEventListener('focusout', () => scheduleHide());
  toast.addEventListener('mouseenter', () => {
    if (timer) clearTimeout(timer);
  });
  toast.addEventListener('mouseleave', () => scheduleHide());

  restackToasts();
  try {
    toast.showPopover();
  } catch {
    toast.classList.add(':popover-open');
  }
  scheduleHide();

  if (typeof document.ariaNotify === 'function') {
    document.ariaNotify(message);
  } else if (els.ariaLiveRegion) {
    els.ariaLiveRegion.textContent = message;
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
    btn.innerHTML = `<span></span><span class="playlist-count"></span>`;
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

/* ---------------- Speed, Pitch, Volume, Repeat, Shuffle ---------------- */
function applySpeedAndPitch() {
  const speed = clampSpeed(state.settings.speed);
  const preserve = Boolean(state.settings.preservePitch);

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
  els.btnSpeedPanel.classList.toggle('is-modified', speed !== 1 || !preserve);

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

/* ---------------- Web Audio Visualizer ---------------- */
function ensureVisualizerConnected() {
  if (audioCtx) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    const source = audioCtx.createMediaElementSource(audio);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 64;
    analyserNode.smoothingTimeConstant = 0.78;
    source.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
    analyserData = new Uint8Array(analyserNode.frequencyBinCount);
  } catch {
    audioCtx = null;
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
      ctx.fillStyle = 'rgba(167, 139, 250, 0.25)';
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
    grad.addColorStop(1, '#8b5cf6');
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

/* ---------------- Playback Engine ---------------- */
function setQueueAndPlay(orderedIds, startTrackId = null) {
  const validIds = orderedIds.filter((id) => state.trackMap.has(id));
  if (validIds.length === 0) {
    showToast('Çalınabilecek şarkı bulunamadı.', 'info');
    return;
  }

  state.baseQueueIds = validIds;
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
  if (index < 0 || index >= state.queueIds.length) {
    audio.pause();
    applyTransportState();
    return;
  }
  const trackId = state.queueIds[index];
  const track = state.trackMap.get(trackId);
  if (!track) return;

  state.queueIndex = index;
  state.currentTrackId = trackId;
  updateNowPlayingUI(track);
  highlightPlayingRow();

  audio.src = audioUrlForTrack(trackId);
  applySpeedAndPitch();
  applyVolume();

  ensureVisualizerConnected();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  try {
    await audio.play();
    applySpeedAndPitch();
    kickVisualizer();
  } catch (err) {
    showToast(`Şarkı çalınamadı: ${err?.message || 'Bilinmeyen hata'}`, 'error');
  }
  applyTransportState();
}

function updateNowPlayingUI(track) {
  if (!track) {
    els.nowTitle.textContent = 'Şarkı seçilmedi';
    els.nowArtist.textContent = 'Çalmak için listeden bir şarkıya tıkla';
    els.nowCoverImg.hidden = true;
    els.nowCoverPlaceholder.hidden = false;
    return;
  }

  els.nowTitle.textContent = track.title;
  els.nowArtist.textContent = track.artist;

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

function highlightPlayingRow() {
  for (const row of els.trackList.querySelectorAll('.track-row')) {
    row.classList.toggle('is-playing', row.dataset.trackId === state.currentTrackId);
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
    const visible = getVisibleTracks();
    if (visible.length > 0) {
      setQueueAndPlay(visible.map((t) => t.id), visible[0].id);
    }
    return;
  }
  if (audio.paused) {
    ensureVisualizerConnected();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    audio.play().then(() => {
      applySpeedAndPitch();
      kickVisualizer();
      applyTransportState();
    }).catch(() => {});
  } else {
    audio.pause();
    applyTransportState();
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
  const currentIdx = order.indexOf(state.settings.repeatMode || 'off');
  const nextMode = order[(currentIdx + 1) % order.length];
  saveSettingsPatch({ repeatMode: nextMode }, true);
  applyTransportState();
}

/* ---------------- Library & Playlist Rendering ---------------- */
function getActivePlaylist() {
  if (!state.activePlaylistId) return null;
  return state.playlists.find((p) => p.id === state.activePlaylistId) || null;
}

function getVisibleTracks() {
  const activePl = getActivePlaylist();
  let list;
  if (activePl) {
    list = activePl.trackIds.map((id) => state.trackMap.get(id)).filter(Boolean);
  } else {
    list = state.tracks.slice();
  }

  const q = state.searchQuery.trim().toLocaleLowerCase('tr');
  if (q) {
    list = list.filter((t) => {
      const hay = `${t.title} ${t.artist} ${t.album} ${t.folder}`.toLocaleLowerCase('tr');
      return hay.includes(q);
    });
  }

  if (!activePl) {
    const sortBy = state.sortBy;
    list.sort((a, b) => {
      if (sortBy === 'artist') {
        const c = a.artist.localeCompare(b.artist, 'tr', { sensitivity: 'base' });
        return c !== 0 ? c : a.title.localeCompare(b.title, 'tr', { sensitivity: 'base' });
      }
      if (sortBy === 'recent') {
        return (b.mtimeMs || 0) - (a.mtimeMs || 0);
      }
      if (sortBy === 'duration') {
        return (b.duration || 0) - (a.duration || 0);
      }
      return a.title.localeCompare(b.title, 'tr', { sensitivity: 'base' });
    });
  }

  return list;
}

function renderSidebar() {
  els.badgeAllCount.textContent = String(state.tracks.length);

  const activeJobsCount = state.downloads.filter(
    (j) => j.status === 'queued' || j.status === 'running'
  ).length;
  els.badgeDlActive.hidden = activeJobsCount === 0;
  els.badgeDlActive.textContent = String(activeJobsCount);

  els.navAllMusic.classList.toggle(
    'is-active',
    state.viewTab === 'library' && !state.activePlaylistId
  );
  els.navDownloader.classList.toggle('is-active', state.viewTab === 'downloader');

  els.sidebarPlaylists.innerHTML = '';
  if (state.playlists.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'playlist-empty-note';
    empty.textContent = 'Henüz playlist oluşturulmadı.';
    els.sidebarPlaylists.appendChild(empty);
    return;
  }

  for (const pl of state.playlists) {
    const validCount = pl.trackIds.filter((id) => state.trackMap.has(id)).length;
    const row = document.createElement('div');
    row.className = 'playlist-row';
    row.setAttribute('role', 'listitem');
    if (state.viewTab === 'library' && state.activePlaylistId === pl.id) {
      row.classList.add('is-active');
    }

    const selBtn = document.createElement('button');
    selBtn.type = 'button';
    selBtn.className = 'playlist-select-btn';
    selBtn.innerHTML = `<span class="playlist-name"></span><span class="playlist-count"></span>`;
    selBtn.querySelector('.playlist-name').textContent = pl.name;
    selBtn.querySelector('.playlist-count').textContent = String(validCount);
    selBtn.addEventListener('click', () => {
      state.viewTab = 'library';
      state.activePlaylistId = pl.id;
      renderAll();
    });

    const actions = document.createElement('div');
    actions.className = 'playlist-row-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'icon-btn';
    renameBtn.textContent = '✎';
    renameBtn.title = 'Yeniden adlandır';
    renameBtn.setAttribute('aria-label', `${pl.name} adını değiştir`);
    renameBtn.addEventListener('click', () => {
      openPlaylistDialog('rename', { playlistId: pl.id, initialName: pl.name });
    });

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

    actions.append(renameBtn, delBtn);
    row.append(selBtn, actions);
    els.sidebarPlaylists.appendChild(row);
  }
}

function renderMainView() {
  const isDl = state.viewTab === 'downloader';
  els.viewLibrary.hidden = isDl;
  els.viewDownloader.hidden = !isDl;

  if (isDl) {
    renderDownloaderJobs();
    return;
  }

  const activePl = getActivePlaylist();
  if (state.activePlaylistId && !activePl) {
    state.activePlaylistId = null;
  }

  const visibleTracks = getVisibleTracks();
  const totalSec = visibleTracks.reduce((acc, t) => acc + (t.duration || 0), 0);

  els.viewEyebrow.textContent = activePl ? 'PLAYLİST' : 'KÜTÜPHANE';
  els.viewTitle.textContent = activePl ? activePl.name : 'Tüm Müzikler';
  els.viewMeta.textContent = `${visibleTracks.length} şarkı • ${formatTotalDuration(totalSec)}`;
  els.sortWrap.hidden = Boolean(activePl);

  els.trackList.innerHTML = '';
  const isEmpty = visibleTracks.length === 0;
  els.trackTableHead.hidden = isEmpty;
  els.libraryEmpty.hidden = !isEmpty;

  if (isEmpty) {
    if (state.searchQuery.trim()) {
      els.emptyTitle.textContent = 'Aramanla eşleşen şarkı yok';
      els.emptyDesc.textContent = 'Farklı bir kelime deneyebilir veya arama kutusunu temizleyebilirsin.';
      els.emptyMuzikPath.hidden = true;
    } else if (activePl) {
      els.emptyTitle.textContent = 'Bu playlist henüz boş';
      els.emptyDesc.textContent = 'Tüm Müzikler sekmesindeki şarkılarda "+ Liste" butonunu kullanarak bu playliste şarkı ekleyebilirsin.';
      els.emptyMuzikPath.hidden = true;
    } else {
      els.emptyTitle.textContent = 'Müzik klasörün henüz boş';
      els.emptyDesc.textContent =
        "Ses dosyalarını (.mp3, .wav, .flac, .ogg, .m4a, .aac, .opus) doğrudan aşağıdaki klasöre atabilir, pencereye sürükleyip bırakabilir ya da Spotify/YouTube'dan indirebilirsin.";
      els.emptyMuzikPath.hidden = false;
      els.emptyMuzikPath.textContent = state.muzikDir;
    }
    return;
  }

  const canReorder = Boolean(activePl && !state.searchQuery.trim());
  const orderedIds = visibleTracks.map((t) => t.id);

  visibleTracks.forEach((track, idx) => {
    const row = document.createElement('div');
    row.className = 'track-row';
    row.setAttribute('role', 'listitem');
    row.dataset.trackId = track.id;
    if (track.id === state.currentTrackId) row.classList.add('is-playing');

    if (canReorder) {
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
        const nextOrder = activePl.trackIds.slice();
        const [moved] = nextOrder.splice(fromIdx, 1);
        nextOrder.splice(idx, 0, moved);
        await window.yusic.reorderPlaylist(activePl.id, nextOrder);
      });
    }

    const idxEl = document.createElement('span');
    idxEl.className = 'col-idx';
    idxEl.textContent = String(idx + 1);

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'track-play-btn';

    const thumb = document.createElement('span');
    thumb.className = 'track-thumb';
    const cover = coverUrlForTrack(track);
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
    const titleSpan = document.createElement('span');
    titleSpan.className = 'track-title';
    titleSpan.textContent = track.title;
    const artistSpan = document.createElement('span');
    artistSpan.className = 'track-artist';
    artistSpan.textContent = track.artist;
    textCol.append(titleSpan, artistSpan);

    playBtn.append(thumb, textCol);
    playBtn.addEventListener('click', () => {
      setQueueAndPlay(orderedIds, track.id);
    });

    const albumEl = document.createElement('span');
    albumEl.className = 'track-album';
    albumEl.textContent = track.album || track.folder || track.ext.replace('.', '').toUpperCase();

    const durEl = document.createElement('span');
    durEl.className = 'track-dur';
    durEl.textContent = formatTime(track.duration);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'track-actions';

    if (canReorder) {
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'track-action-btn';
      upBtn.textContent = '↑';
      upBtn.title = 'Yukarı taşı';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', async () => {
        const nextOrder = activePl.trackIds.slice();
        [nextOrder[idx - 1], nextOrder[idx]] = [nextOrder[idx], nextOrder[idx - 1]];
        await window.yusic.reorderPlaylist(activePl.id, nextOrder);
      });

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'track-action-btn';
      downBtn.textContent = '↓';
      downBtn.title = 'Aşağı taşı';
      downBtn.disabled = idx === visibleTracks.length - 1;
      downBtn.addEventListener('click', async () => {
        const nextOrder = activePl.trackIds.slice();
        [nextOrder[idx + 1], nextOrder[idx]] = [nextOrder[idx], nextOrder[idx + 1]];
        await window.yusic.reorderPlaylist(activePl.id, nextOrder);
      });

      const removeFromPlBtn = document.createElement('button');
      removeFromPlBtn.type = 'button';
      removeFromPlBtn.className = 'track-action-btn track-action-btn--danger';
      removeFromPlBtn.textContent = 'Çıkar';
      removeFromPlBtn.title = 'Playlistten çıkar';
      removeFromPlBtn.addEventListener('click', async () => {
        await window.yusic.removeTrackFromPlaylist(activePl.id, track.id);
      });

      actionsEl.append(upBtn, downBtn, removeFromPlBtn);
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
    els.trackList.appendChild(row);
  });
}

/* ---------------- Downloader Rendering ---------------- */
async function updateUrlDetectionBanner() {
  const raw = els.dlUrlInput.value.trim();
  const pill = els.dlDetectPill;
  pill.className = 'detect-pill';

  if (!raw) {
    pill.textContent = 'Link yapıştırıldığında platform otomatik algılanır';
    return;
  }

  const detected = await window.yusic.detectUrl(raw);
  if (!detected) {
    pill.classList.add('is-invalid');
    pill.textContent = 'Geçerli bir Spotify veya YouTube linki girin';
    return;
  }

  if (detected.provider === 'spotify') {
    pill.classList.add('is-spotify');
    const labels = {
      track: 'Spotify Tek Şarkı (MP3 olarak indirilir)',
      playlist: 'Spotify Playlist (Tüm liste MP3 olarak indirilir)',
      album: 'Spotify Albüm (Tüm albüm MP3 olarak indirilir)',
      short: 'Spotify Kısa Link (Açılıp MP3 olarak indirilir)'
    };
    pill.textContent = labels[detected.kind] || 'Spotify';
    return;
  }

  pill.classList.add('is-youtube');
  if (detected.kind === 'playlist') {
    pill.textContent = 'YouTube Playlist (Tüm video sesleri MP3 olarak indirilir)';
  } else if (detected.hasListParam) {
    pill.textContent = els.chkYtList.checked
      ? 'YouTube Video + Liste (&list= algılandı — tüm playlist MP3 indirilecek)'
      : 'YouTube Tek Video (MP3 olarak indirilir)';
  } else {
    pill.textContent = 'YouTube Tek Video (MP3 olarak indirilir)';
  }
}

function renderDownloaderJobs() {
  els.dlJobs.innerHTML = '';
  if (state.downloads.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state empty-state--compact';
    empty.innerHTML = `<p class="empty-desc">Henüz aktif veya tamamlanmış bir indirme yok. Spotify veya YouTube linki yapıştırıp <strong>İndir</strong>'e bas.</p>`;
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
      cancelBtn.addEventListener('click', () => {
        window.yusic.cancelDownload(job.id);
      });
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

function renderUpdateState() {
  const u = state.updateState;
  const curVer = u?.currentVersion || state.appVersion || '1.0.0';
  els.appVersionLabel.textContent = `Yusic v${curVer}`;
  els.updateCurVer.textContent = `v${curVer}`;

  if (!u) return;

  els.updateLatestVer.textContent = u.latestVersion ? `v${u.latestVersion}` : '—';
  const hasActionable = u.status === 'available' || u.status === 'downloaded';
  els.updateDot.hidden = !hasActionable;

  // Banner visibility
  const showBanner =
    !state.updateBannerDismissed &&
    (u.status === 'available' || u.status === 'downloading' || u.status === 'downloaded');
  els.updateBanner.hidden = !showBanner;

  const pct = Math.min(100, Math.max(0, Number(u.progress) || 0));

  if (u.status === 'available') {
    els.updateBannerBadge.textContent = `v${u.latestVersion}`;
    els.updateBannerTitle.textContent = `Yeni Yusic sürümü mevcut (v${u.latestVersion})`;
    els.updateBannerSub.textContent = u.isPackaged
      ? 'Uygulama içinden indirip otomatik güncelleyebilirsiniz.'
      : 'Kurulum dosyasını GitHub üzerinden indirebilirsiniz.';
    els.updateBannerProgress.hidden = true;
    els.btnBannerAction.hidden = false;
    els.btnBannerAction.textContent = u.isPackaged ? 'Güncellemeyi İndir' : 'Setup İndir';
  } else if (u.status === 'downloading') {
    els.updateBannerBadge.textContent = `%${pct}`;
    els.updateBannerTitle.textContent = `Güncelleme indiriliyor (v${u.latestVersion || ''})...`;
    els.updateBannerSub.textContent = 'İndirme bitince tek tıkla kurulabilir.';
    els.updateBannerProgress.hidden = false;
    els.updateBannerProgress.value = pct;
    els.btnBannerAction.hidden = true;
  } else if (u.status === 'downloaded') {
    els.updateBannerBadge.textContent = 'Hazır';
    els.updateBannerTitle.textContent = `Yusic v${u.latestVersion || ''} kuruluma hazır`;
    els.updateBannerSub.textContent = 'Yeniden başlatarak hemen güncelleyebilirsiniz.';
    els.updateBannerProgress.hidden = true;
    els.btnBannerAction.hidden = false;
    els.btnBannerAction.textContent = 'Şimdi Güncelle ve Yeniden Başlat';
  }

  // Modal dialog status
  const statusMessages = {
    idle: 'GitHub Releases üzerinden yeni sürüm kontrolü yapabilirsiniz.',
    checking: 'GitHub Releases kontrol ediliyor...',
    available: `Yeni sürüm bulundu: v${u.latestVersion}. Hemen indirebilirsiniz.`,
    'not-available': 'Tebrikler! En güncel Yusic sürümünü kullanıyorsunuz.',
    downloading: `Güncelleme paketi indiriliyor... (%${pct})`,
    downloaded: `v${u.latestVersion || ''} indirildi! Kurulumu tamamlamak için uygulamayı yeniden başlatın.`,
    error: `Güncelleme hatası: ${u.error || 'Bağlantı sağlanamadı.'}`
  };
  els.updateStatusMsg.textContent = statusMessages[u.status] || statusMessages.idle;

  if (u.status === 'checking') {
    els.updateDialogProgressWrap.hidden = false;
    els.updateDialogProgress.removeAttribute('value');
    els.updateDialogPct.textContent = '...';
  } else if (u.status === 'downloading') {
    els.updateDialogProgressWrap.hidden = false;
    els.updateDialogProgress.value = pct;
    els.updateDialogPct.textContent = `%${pct}`;
  } else {
    els.updateDialogProgressWrap.hidden = true;
  }

  if (u.releaseNotes) {
    els.updateNotesWrap.hidden = false;
    els.updateNotes.textContent = u.releaseNotes;
  } else {
    els.updateNotesWrap.hidden = true;
    els.updateNotes.textContent = '';
  }

  els.btnUpdateRecheck.disabled = u.status === 'checking' || u.status === 'downloading';

  if (u.status === 'available') {
    els.btnUpdateAction.hidden = false;
    els.btnUpdateAction.textContent = u.isPackaged ? 'Güncellemeyi İndir' : 'GitHub\'dan İndir';
  } else if (u.status === 'downloaded') {
    els.btnUpdateAction.hidden = false;
    els.btnUpdateAction.textContent = 'Şimdi Güncelle ve Yeniden Başlat';
  } else {
    els.btnUpdateAction.hidden = true;
  }
}

async function triggerUpdateAction() {
  const u = state.updateState;
  if (!u) return;
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

/* ---------------- Event Bindings ---------------- */
function bindEvents() {
  els.navAllMusic.addEventListener('click', () => {
    state.viewTab = 'library';
    state.activePlaylistId = null;
    renderAll();
  });

  els.navDownloader.addEventListener('click', () => {
    state.viewTab = 'downloader';
    renderAll();
  });

  els.btnOpenFolder.addEventListener('click', () => window.yusic.openMusicFolder());
  els.btnEmptyOpenFolder.addEventListener('click', () => window.yusic.openMusicFolder());
  els.btnEmptyGoDl.addEventListener('click', () => {
    state.viewTab = 'downloader';
    renderAll();
    els.dlUrlInput.focus();
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

  els.btnNewPlaylist.addEventListener('click', () => {
    openPlaylistDialog('create');
  });

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
    if (state.settings.shuffle) {
      saveSettingsPatch({ shuffle: false }, true);
    }
    setQueueAndPlay(list.map((t) => t.id), list[0].id);
    applyTransportState();
  });

  els.btnShuffleAll.addEventListener('click', () => {
    const list = getVisibleTracks();
    if (list.length === 0) return;
    saveSettingsPatch({ shuffle: true }, true);
    setQueueAndPlay(list.map((t) => t.id), null);
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

  // Transport controls
  els.btnPlayPause.addEventListener('click', togglePlayPause);
  els.btnPrev.addEventListener('click', handlePrev);
  els.btnNext.addEventListener('click', () => handleNext(true));
  els.btnShuffle.addEventListener('click', toggleShuffle);
  els.btnRepeat.addEventListener('click', cycleRepeatMode);

  // Seek slider
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

  // Speed & Pitch controls
  els.speedSlider.addEventListener('input', () => {
    const speed = clampSpeed(els.speedSlider.value);
    state.settings.speed = speed;
    applySpeedAndPitch();
    saveSettingsPatch({ speed }, false);
  });

  els.btnSpeedReset.addEventListener('click', () => {
    state.settings.speed = 1.0;
    applySpeedAndPitch();
    saveSettingsPatch({ speed: 1.0 }, true);
  });

  els.speedPresets.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-chip');
    if (!btn) return;
    const speed = clampSpeed(btn.dataset.speed);
    state.settings.speed = speed;
    applySpeedAndPitch();
    saveSettingsPatch({ speed }, true);
  });

  els.pitchPreserve.addEventListener('change', () => {
    if (!els.pitchPreserve.checked) return;
    state.settings.preservePitch = true;
    applySpeedAndPitch();
    saveSettingsPatch({ preservePitch: true }, true);
  });

  els.pitchChange.addEventListener('change', () => {
    if (!els.pitchChange.checked) return;
    state.settings.preservePitch = false;
    applySpeedAndPitch();
    saveSettingsPatch({ preservePitch: false }, true);
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
    if (!state.currentTrackId) return;
    showToast('Ses dosyası okunurken hata oluştu, sonraki parçaya geçiliyor.', 'error');
    if (state.queueIds.length > 1) {
      handleNext(false);
    } else {
      applyTransportState();
    }
  });

  // Media Session
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
      // Ignore unsupported media session actions
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
        autoCreatePlaylist: els.chkAutoPlaylist.checked,
        downloadYoutubePlaylist: els.chkYtList.checked
      });
      els.dlUrlInput.value = '';
      updateUrlDetectionBanner();
      const idx = state.downloads.findIndex((j) => j.id === job.id);
      if (idx === -1) state.downloads.unshift(job);
      else state.downloads[idx] = job;
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
    renderSidebar();
    if (state.viewTab === 'library' && state.activePlaylistId) {
      renderMainView();
    }
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
    const prevStatus = state.updateState?.status;
    state.updateState = nextState;

    if (
      (nextState.status === 'available' || nextState.status === 'downloaded') &&
      prevStatus !== nextState.status
    ) {
      state.updateBannerDismissed = false;
    }

    renderUpdateState();

    if (
      nextState.status === 'available' &&
      state.lastNotifiedUpdateStatus !== `available:${nextState.latestVersion}`
    ) {
      state.lastNotifiedUpdateStatus = `available:${nextState.latestVersion}`;
      showToast(`Yeni sürüm mevcut: Yusic v${nextState.latestVersion}`, 'info');
    } else if (
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
  bindEvents();

  const initData = await window.yusic.init();
  state.muzikDir = initData.muzikDir;
  state.appVersion = initData.appVersion || '1.0.0';
  state.isPackaged = Boolean(initData.isPackaged);
  state.serverUrl = initData.serverUrl;
  state.serverToken = initData.serverToken;
  state.playlists = initData.playlists || [];
  state.settings = { ...state.settings, ...(initData.settings || {}) };
  state.downloads = initData.downloads || [];
  state.toolsStatus = initData.toolsStatus || null;
  state.updateState = initData.updateState || null;

  rebuildTrackMap(initData.tracks || []);

  els.chkAutoPlaylist.checked = state.settings.autoCreatePlaylistOnDownload !== false;
  els.chkYtList.checked = state.settings.downloadYoutubePlaylistOnWatch !== false;
  els.dlToolsWarning.hidden = Boolean(
    state.toolsStatus?.readyForYoutube && state.toolsStatus?.readyForSpotify
  );

  syncSliderVisual(els.seekSlider, '0:00');
  renderAll();
  drawVisualizer();
  document.body.dataset.yusicReady = '1';
}

initApp().catch((err) => {
  console.error('Yusic init error:', err);
});
