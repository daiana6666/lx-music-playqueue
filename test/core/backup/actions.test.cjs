const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('../../helpers/load-ts-module.cjs')
const helpers = require('../../../src/core/backup/helpers')

test('backup imports validate and confirm before writes, isolate profile fields and await profile persistence', async() => {
  global.i18n = { t: key => key }
  const writes = []
  let confirm = false
  let input = { type: 'playList_v2', data: [{ id: 'one', name: 'List', list: [], group: 'external', profile: { description: 'Notes' } }] }
  const state = { defaultList: { id: 'default', name: 'Default' }, loveList: { id: 'love', name: 'Love' }, userList: [], allList: [] }
  const api = load('src/screens/Home/Views/Setting/settings/Backup/actions.ts', {
    '@/config/constant': { LIST_IDS: { DEFAULT: 'default', LOVE: 'love' } },
    '@/core/list': { getListMusics: async() => [], overwriteListFull: async value => writes.push(['lists', value]), createList: async value => writes.push(['create', value]) },
    '@/utils': { filterMusicList: value => value, fixNewMusicInfoQuality: value => value, toNewMusicInfo: value => value },
    '@/utils/log': { log: {} },
    '@/utils/tools': { handleReadFile: async() => input, confirmDialog: async() => confirm, toast: value => writes.push(['toast', value]) },
    '@/core/listProfile': { getListProfiles: async() => ({}), applyListProfiles: async value => { await new Promise(resolve => setImmediate(resolve)); writes.push(['profiles', value]) } },
    '@/core/backup/helpers': helpers, '@/store/list/state': state,
  })
  await api.importPlaylistFile('fixture.slxmc')
  assert.deepEqual(writes, [])
  confirm = true
  await api.importPlaylistFile('fixture.slxmc')
  assert.deepEqual(writes.map(item => item[0]), ['lists', 'profiles', 'toast'])
  assert.equal(Object.hasOwn(writes[0][1].userList[0], 'profile'), false)
  assert.equal(Object.hasOwn(writes[0][1].userList[0], 'group'), false)
  assert.deepEqual(writes[1][1], { one: { description: 'Notes', group: 'external' } })
  writes.length = 0
  input = { type: 'unsupported' }
  await assert.rejects(api.importPlaylistFile('fixture.slxmc'), /Unsupported/)
  assert.deepEqual(writes, [])
})

test('atomic profile store retains omitted backup fields and old durable state after a failed save', async() => {
  let fail = false
  let disk = { profiles: { one: { description: 'Existing', coverUrl: 'https://example.test/cover', group: 'mine' } }, collapsed: {} }
  const api = load('src/core/listProfile/index.ts', {
    '@/utils/atomicSnapshot': { createAtomicSnapshot: () => ({ read: async() => disk, write: async value => { if (fail) throw new Error('disk full'); disk = structuredClone(value) } }) },
  })
  await api.applyListProfiles({ one: { group: 'external' } })
  assert.deepEqual((await api.getListProfiles()).one, { description: 'Existing', coverUrl: 'https://example.test/cover', group: 'external' })
  fail = true
  await assert.rejects(api.applyListProfiles({ one: { description: 'Lost' } }), /disk full/)
  assert.equal((await api.getListProfiles()).one.description, 'Existing')
  assert.equal(disk.profiles.one.description, 'Existing')
})
