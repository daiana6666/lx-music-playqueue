const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('../../helpers/load-ts-module.cjs')
const settle = async() => new Promise(resolve => setImmediate(resolve))

test('cancellation during native skip removes old tracks before the next song can play', async() => {
  const queue = []
  let index = null
  let releaseSkip
  let block = true
  let isPlaying = true
  const played = []
  const failures = []
  global.lx = { restorePlayInfo: null }
  global.app_event = { playerError: () => failures.push('error') }
  const player = load('src/plugins/player/playList.ts', {
    'react-native-track-player': {
      getCurrentTrack: async() => index,
      getTrack: async i => queue[i],
      add: async tracks => queue.push(...tracks),
      getQueue: async() => [...queue],
      skip: async i => {
        assert.equal(isPlaying, false, 'skip must not implicitly play a replacement')
        index = i
        if (block) { block = false; await new Promise(resolve => { releaseSkip = resolve }) }
      },
      pause: async() => { isPlaying = false },
      play: async() => { isPlaying = true; played.push(queue[index].musicId) },
      seekTo: async() => {},
      remove: async indices => {
        const current = queue[index]
        for (const i of [...indices].sort((a, b) => b - a)) queue.splice(i, 1)
        index = queue.indexOf(current)
        if (index < 0) index = null
      },
    },
    'react-native-background-timer': { setTimeout, clearTimeout },
    '@/config': { defaultUrl: 'asset:///silent.mp3' },
    '@/store/setting/state': { setting: {} },
  })
  const song = id => ({ id, name: id, singer: 'test', source: 'kw', meta: {} })
  const a = new AbortController()
  player.playMusic(song('A'), { url: 'https://test/A', signal: a.signal, sessionId: 'A' }, 0)
  await settle()
  assert.ok(releaseSkip)
  a.abort()
  player.playMusic(song('B'), { url: 'https://test/B', sessionId: 'B' }, 0)
  releaseSkip()
  await settle(); await settle()
  assert.deepEqual(played, ['kw:B'])
  assert.deepEqual(failures, [])
  assert.equal(queue.length, 2)
  assert.ok(queue.every(track => track.musicId == 'kw:B'))
  assert.equal(player.getLoadedPlaybackSessionId(), 'B')
  assert.equal((await player.getCurrentTrack()).musicId, 'kw:B')
})
