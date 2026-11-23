const test = require('node:test')
const assert = require('node:assert/strict')
const { createListeningTimeTracker } = require('../../../../src/core/init/player/listeningTime.js')

test('listening tracker converts media progress to real time at playback rate', () => {
  const tracker = createListeningTimeTracker()
  tracker.reset(10)
  assert.equal(tracker.update(14, 2), 2)
})

test('listening tracker carries fractional real seconds', () => {
  const tracker = createListeningTimeTracker()
  tracker.reset(0)
  assert.equal(tracker.update(1, 2), 0)
  assert.equal(tracker.update(2, 2), 1)
})

test('listening tracker accepts one long screen-off gap but rejects a seek', () => {
  const tracker = createListeningTimeTracker()
  tracker.reset(0)
  assert.equal(tracker.update(120, 1), 0)
  tracker.reset(0)
  tracker.allowLongGap()
  assert.equal(tracker.update(120, 2), 60)
})
