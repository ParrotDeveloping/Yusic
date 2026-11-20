export function clampSpeed(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1.0;
  const clamped = Math.min(2.5, Math.max(0.25, num));
  return Math.round(clamped * 100) / 100;
}

export function createShuffledQueue(trackIds, currentTrackId = null) {
  const unique = [...new Set((trackIds || []).map(String))];
  if (unique.length <= 1) return unique;

  const rest = currentTrackId && unique.includes(currentTrackId)
    ? unique.filter((id) => id !== currentTrackId)
    : unique.slice();

  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }

  if (currentTrackId && unique.includes(currentTrackId)) {
    return [currentTrackId, ...rest];
  }
  return rest;
}

export function getNextIndex(queueLen, currentIndex, repeatMode = 'off', isManual = false) {
  if (!Number.isInteger(queueLen) || queueLen <= 0) return -1;
  const idx = Number.isInteger(currentIndex) && currentIndex >= 0 ? currentIndex : -1;

  if (!isManual && repeatMode === 'one') {
    return idx >= 0 && idx < queueLen ? idx : 0;
  }

  const next = idx + 1;
  if (next < queueLen) return next;

  if (repeatMode === 'all') {
    return 0;
  }
  return -1;
}

export function getPrevIndex(queueLen, currentIndex, repeatMode = 'off', currentTimeSec = 0) {
  if (!Number.isInteger(queueLen) || queueLen <= 0) return -1;
  const idx = Number.isInteger(currentIndex) && currentIndex >= 0 ? currentIndex : 0;

  if (Number(currentTimeSec) > 3) {
    return idx < queueLen ? idx : 0;
  }

  if (idx - 1 >= 0) {
    return idx - 1;
  }

  if (repeatMode === 'all') {
    return queueLen - 1;
  }

  return 0;
}
