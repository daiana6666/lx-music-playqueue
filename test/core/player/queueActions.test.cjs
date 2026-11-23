const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('../../helpers/load-ts-module.cjs')
const song = id => ({ id, source: 'kg', name: id, singer: 'Artist', meta: {} })
const entry = id => ({ musicInfo: song(id), listId: 'original', isTempPlay: false })

test('queue actions use the playable list, retain entry semantics, reject stale clicks and respect party control', async() => {
  global.i18n = { t: key => key }
  const state = { playInfo: { playerListId: 'original', playerPlayIndex: 1 }, playMusicInfo: entry('b'), playedList: [], tempPlayList: [] }
  const party = { room: null }
  const dislike = { dislikeInfo: { names: new Set(), musicNames: new Set(['c']), singerNames: new Set() } }
  const calls = []
  let control = true
  const filter = load('src/core/player/utils.ts', {
    './playedList': {}, '@/config/constant': { SPLIT_CHAR: { DISLIKE_NAME: '@', DISLIKE_NAME_ALIAS: '_' } }, '@/store/dislikeList': { state: dislike },
  })
  const actions = load('src/core/player/queueActions.ts', {
    '@/store/player/state': state, '@/store/list/state': { tempListMeta: {} }, '@/store/setting/state': { setting: { 'player.togglePlayMethod': 'list' } },
    '@/store/privateFm/state': {}, '@/store/party/state': party, '@/store/dislikeList': { state: dislike }, './utils': filter,
    '@/core/party': { canControlPartyPlayback: () => control, playPartyQueueItem: async(...args) => calls.push(args) },
    './playInfo': { getList: () => ['a', 'b', 'c', 'd'].map(song) }, './queue': require('../../../src/core/player/queue'),
    './player': { peekRandomNextMusicInfo: () => null, resetRandomNextMusicInfo: () => {}, play: () => {}, playQueuedMusicInfo: async value => calls.push(value) },
    './tempPlayList': { removeTempPlayList: index => state.tempPlayList.splice(index, 1) }, '@/store/privateFm/action': { PRIVATE_FM_TEMP_LIST_ID: 'fm' },
  })
  assert.deepEqual(actions.getPlaybackQueue().find(section => section.kind == 'pending').data.map(row => row.entry.musicInfo.id), ['d'])
  const later = { ...entry('later'), isTempPlay: true, listId: 'different' }
  state.tempPlayList.push(later)
  const row = actions.getPlaybackQueue().find(section => section.kind == 'later').data[0]
  state.tempPlayList.unshift({ ...entry('inserted'), isTempPlay: true })
  await actions.playPlaybackQueueItem(row)
  assert.strictEqual(calls[0], later)
  assert.equal(state.tempPlayList.length, 1)
  assert.equal(state.tempPlayList[0].musicInfo.id, 'inserted')
  await assert.rejects(actions.playPlaybackQueueItem(row), /queue_changed/)
  party.room = { roomId: 'room', playback: { currentIndex: 1, queue: [{ id: 'first-b', musicInfo: song('b') }, { id: 'second-b', musicInfo: song('b') }, { id: 'third-b', musicInfo: song('b') }] } }
  const pending = actions.getPlaybackQueue().find(section => section.kind == 'pending').data
  assert.equal(pending.length, 1)
  control = false
  await assert.rejects(actions.playPlaybackQueueItem(pending[0]), /no_control/)
  control = true
  await actions.playPlaybackQueueItem(pending[0])
  assert.deepEqual(calls.at(-1), ['room', 'third-b'])
})
