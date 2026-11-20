import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSpeed,
  createShuffledQueue,
  getNextIndex,
  getPrevIndex,
  resolveEffectiveSpeed
} from '../src/main/playbackLogic.js';

test('clampSpeed constrains range and rounds cleanly', () => {
  assert.equal(clampSpeed(0.1), 0.25);
  assert.equal(clampSpeed(3.5), 2.5);
  assert.equal(clampSpeed(1.256), 1.26);
  assert.equal(clampSpeed('invalid'), 1.0);
});

test('createShuffledQueue keeps currentTrackId first and preserves all unique items', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'a'];
  const q = createShuffledQueue(ids, 'c');
  assert.equal(q[0], 'c');
  assert.equal(q.length, 5);
  assert.deepEqual(new Set(q), new Set(['a', 'b', 'c', 'd', 'e']));
});

test('getNextIndex handles repeat off, all, and one', () => {
  assert.equal(getNextIndex(0, 0, 'off', false), -1);
  assert.equal(getNextIndex(3, 1, 'off', false), 2);
  assert.equal(getNextIndex(3, 2, 'off', false), -1);
  assert.equal(getNextIndex(3, 2, 'all', false), 0);
  assert.equal(getNextIndex(3, 1, 'one', false), 1);
  assert.equal(getNextIndex(3, 1, 'one', true), 2);
  assert.equal(getNextIndex(3, 2, 'one', true), -1);
});

test('getPrevIndex restarts after 3s and wraps only on repeat all', () => {
  assert.equal(getPrevIndex(3, 2, 'off', 5), 2);
  assert.equal(getPrevIndex(3, 2, 'off', 1), 1);
  assert.equal(getPrevIndex(3, 0, 'off', 1), 0);
  assert.equal(getPrevIndex(3, 0, 'all', 1), 2);
});

test('resolveEffectiveSpeed follows track > playlist > global precedence', () => {
  const globalSettings = { speed: 1.0, preservePitch: true };
  const playlistOverride = { speed: 1.25, preservePitch: false };
  const trackOverride = { speed: 1.75, preservePitch: true };

  assert.deepEqual(
    resolveEffectiveSpeed({ trackOverride, playlistOverride, globalSettings }),
    { speed: 1.75, preservePitch: true, source: 'track' }
  );

  assert.deepEqual(
    resolveEffectiveSpeed({ trackOverride: null, playlistOverride, globalSettings }),
    { speed: 1.25, preservePitch: false, source: 'playlist' }
  );

  assert.deepEqual(
    resolveEffectiveSpeed({ trackOverride: null, playlistOverride: null, globalSettings }),
    { speed: 1.0, preservePitch: true, source: 'global' }
  );
});
