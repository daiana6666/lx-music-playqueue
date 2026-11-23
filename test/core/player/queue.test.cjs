const test = require('node:test')
const assert = require('node:assert/strict')
const { isPlayableRecord, findQueueEntry, buildQueueSections } = require('../../../src/core/player/queue')
const { createRecentPlayList, normalizeRecentPlayList } = require('../../../src/core/netease/helpers')

const song = (id, source = 'kg') => ({ id, source, name: id, singer: 'Artist', meta: {} })
const entry = (id, isTempPlay = false) => ({ musicInfo: song(id), listId: 'list', isTempPlay })
const queue = overrides => buildQueueSections({ current: entry('b'), temp: [], history: [], playlist: ['a', 'b', 'c'].map(id => song(id)), listId: 'list', playerIndex: 1, mode: 'list', randomNext: null, privateFm: false, room: null, ...overrides })
const pendingIds = sections => sections.find(item => item.kind == 'pending')?.data.map(row => row.entry.musicInfo.id) ?? []

test('queue uses list order, wraps a loop and keeps FM sequential', () => {
  assert.deepEqual(pendingIds(queue({})), ['c'])
  assert.deepEqual(pendingIds(queue({ mode: 'listLoop' })), ['c', 'a'])
  assert.deepEqual(pendingIds(queue({ mode: 'listLoop', privateFm: true })), ['c'])
  assert.deepEqual(pendingIds(queue({ mode: 'singleLoop' })), [])
  assert.deepEqual(pendingIds(queue({ mode: 'none' })), [])
})

test('shuffle renders only the chosen candidate or already recorded future history', () => {
  assert.deepEqual(pendingIds(queue({ mode: 'random' })), [])
  assert.deepEqual(pendingIds(queue({ mode: 'random', randomNext: entry('a') })), ['a'])
  assert.deepEqual(pendingIds(queue({ mode: 'random', randomNext: entry('a'), history: ['a', 'b', 'c'].map(id => entry(id)) })), ['a'])
  assert.deepEqual(pendingIds(queue({ mode: 'random', history: ['a', 'b', 'c'].map(id => entry(id)) })), ['c'])
})

test('known future history takes precedence in every list mode and skips removed songs', () => {
  const history = ['b', 'removed', 'a', 'c'].map(id => entry(id))
  assert.deepEqual(pendingIds(queue({ history })), ['a', 'c'])
  assert.deepEqual(pendingIds(queue({ history, mode: 'singleLoop' })), ['a', 'c'])
  assert.deepEqual(pendingIds(queue({ history, privateFm: true })), ['c'])
})

test('temporary playback resumes the underlying list and row keys survive insertion', () => {
  const later = entry('later', true)
  const first = queue({ current: entry('temporary', true), temp: [later] })
  assert.deepEqual(pendingIds(first), ['c'])
  const key = first.find(section => section.kind == 'later').data[0].key
  const updated = queue({ temp: [entry('inserted', true), later] })
  assert.equal(updated.find(section => section.kind == 'later').data[1].key, key)
})

test('party queue supersedes local order and carries room-specific identity', () => {
  const room = { roomId: 'room-a', playback: { currentIndex: 1, queue: ['a', 'b', 'c'].map(id => ({ id, musicInfo: song(id) })) } }
  const first = queue({ room, temp: [entry('later', true)] })
  assert.deepEqual(first.map(section => section.kind), ['current', 'pending'])
  assert.deepEqual(pendingIds(first), ['c'])
  const second = queue({ room: { ...room, roomId: 'room-b' } })
  assert.notEqual(first[1].data[0].key, second[1].data[0].key)
})

test('recent history retains 520 records across reload and distinguishes platform identities', () => {
  let records = []
  for (let index = 0; index < 530; index++) records = createRecentPlayList(records, song(String(index)), 520)
  records = normalizeRecentPlayList(JSON.parse(JSON.stringify(records)), 520)
  assert.equal(records.length, 520)
  assert.equal(records[0].id, '529')
  assert.equal(records.at(-1).id, '10')
  records = createRecentPlayList(records, song('529', 'wy'), 520)
  assert.equal(records.filter(item => item.id == '529').length, 2)
  records = createRecentPlayList(records, song('529'), 520)
  assert.equal(records[0].source, 'kg')
  assert.equal(records.length, 520)
})

test('records missing playback data remain distinguishable from playable records', () => {
  assert.equal(isPlayableRecord(song('a')), true)
  assert.equal(isPlayableRecord({ id: 'a', source: 'kg', name: 'Old record' }), false)
  assert.equal(isPlayableRecord({ ...song('a'), source: 'unknown' }), false)
  assert.equal(isPlayableRecord(null), false)
})

test('stale queue reference cannot target a new occurrence of the same song', () => {
  const old = { musicInfo: song('a'), listId: 'list', isTempPlay: true }
  const replacement = { ...old }
  assert.equal(findQueueEntry([replacement], old), undefined)
  assert.equal(findQueueEntry([replacement, old], old), old)
})
