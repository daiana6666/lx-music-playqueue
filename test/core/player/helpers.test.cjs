const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createGettingUrlId,
  resolveProjectSourceResource,
  runWithLoadingState,
  shouldClearGettingUrlId,
  shouldUseProjectSourceOnly,
} = require('../../../src/core/player/helpers.js')

test('getting url id ignores late source toggle metadata', () => {
  const musicInfo = {
    id: 'wy_1',
    source: 'wy',
    meta: {},
  }

  const beforeToggle = createGettingUrlId(musicInfo)
  musicInfo.meta.toggleMusicInfo = {
    id: 'kw_1',
    source: 'kw',
    meta: {},
  }

  assert.equal(createGettingUrlId(musicInfo), beforeToggle)
})

test('getting url cleanup uses music identity instead of object reference', () => {
  assert.equal(
    shouldClearGettingUrlId(
      { id: 'wy_1', source: 'wy', meta: {} },
      { id: 'wy_1', source: 'wy', meta: {} },
    ),
    true,
  )
  assert.equal(
    shouldClearGettingUrlId(
      { id: 'wy_1', source: 'wy', meta: {} },
      { id: 'wy_2', source: 'wy', meta: {} },
    ),
    false,
  )
})

test('netease playback is forced through project sources', () => {
  assert.equal(shouldUseProjectSourceOnly({ id: 'wy_1', source: 'wy', meta: {} }), true)
  assert.equal(shouldUseProjectSourceOnly({ id: 'kw_1', source: 'kw', meta: {} }), false)
  assert.equal(shouldUseProjectSourceOnly({ id: 'local_1', source: 'local', meta: {} }), false)
})

test('project-source fallback skips stale and failed candidates', async() => {
  const attempted = []
  const stale = { id: 'stale', source: 'kw' }
  const first = { id: 'first', source: 'kg' }
  const playable = { id: 'playable', source: 'tx' }

  const result = await resolveProjectSourceResource({
    cachedMusicInfo: stale,
    matchedList: [stale, first, playable],
    normalizeMusicInfo: value => value,
    canUse: () => true,
    getResource: async(musicInfo) => {
      attempted.push(musicInfo.id)
      if (musicInfo.id != 'playable') throw new Error('unavailable')
      return `https://media.example/${musicInfo.id}`
    },
  })

  assert.deepEqual(attempted, ['stale', 'first', 'playable'])
  assert.deepEqual(result, {
    musicInfo: playable,
    resource: 'https://media.example/playable',
  })
})

test('project-source fallback does not search when cached source is playable', async() => {
  let searched = false
  const cached = { id: 'cached', source: 'kw' }
  const result = await resolveProjectSourceResource({
    cachedMusicInfo: cached,
    getMatchedList: async() => {
      searched = true
      return [{ id: 'unused', source: 'kg' }]
    },
    normalizeMusicInfo: value => value,
    canUse: () => true,
    getResource: async musicInfo => `https://media.example/${musicInfo.id}`,
  })

  assert.equal(searched, false)
  assert.equal(result.musicInfo, cached)
})

test('preload loading state is released when the task rejects', async() => {
  const state = { isLoading: false }
  await assert.rejects(
    runWithLoadingState(state, async() => { throw new Error('next-track failure') }),
    /next-track failure/,
  )
  assert.equal(state.isLoading, false)
})
