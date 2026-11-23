const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildUserApiSyncData,
  buildUserApiOverwrite,
  getUserApiSyncComparableData,
  resolveSyncedApiSource,
  validateUserApiSyncData,
} = require('../../../src/core/userApiSync/helpers.js')

const desktopPayload = (apis, updatedAt = 1000) => ({
  source: 'desktop',
  updatedAt,
  apis,
})

const desktopApi = (id, script, overrides = {}) => ({
  id,
  name: `Name ${id}`,
  description: `Desc ${id}`,
  author: `Author ${id}`,
  homepage: '',
  version: '1.0.0',
  allowShowUpdateAlert: true,
  scriptEncoding: 'plain',
  script,
  ...overrides,
})

test('snapshot overwrite preserves mobile-only APIs and matching managed ids', () => {
  const existingApis = [
    {
      id: 'mobile_only',
      name: 'Mobile only',
      description: '',
      author: '',
      homepage: '',
      version: '',
      allowShowUpdateAlert: true,
    },
    {
      id: 'local_api',
      name: 'Local',
      description: '',
      author: '',
      homepage: '',
      version: '',
      allowShowUpdateAlert: true,
    },
    {
      id: 'synced_removed',
      remoteId: 'desktop_removed',
      remoteSource: 'desktop',
      name: 'Removed desktop',
      description: '',
      author: '',
      homepage: '',
      version: '',
      allowShowUpdateAlert: true,
    },
    {
      id: 'synced_keep',
      remoteId: 'desktop_keep',
      remoteSource: 'desktop',
      name: 'Old keep',
      description: '',
      author: '',
      homepage: '',
      version: '',
      allowShowUpdateAlert: true,
    },
  ]
  const data = desktopPayload([
    desktopApi('local_api', '/* local */\n', { name: 'Local from server' }),
    desktopApi('desktop_keep', '/* keep */\n', { name: 'New keep' }),
    desktopApi('desktop_new', '/* new */\n', { allowShowUpdateAlert: false }),
  ])

  const result = buildUserApiOverwrite(existingApis, data)

  assert.deepEqual(result.nextApis.map(api => api.id), ['mobile_only', 'local_api', 'synced_keep', 'user_api_sync_desktop_new'])
  assert.deepEqual(result.removedScriptIds, ['synced_removed'])
  assert.deepEqual(result.scriptsToSave, [
    ['local_api', '/* local */\n'],
    ['synced_keep', '/* keep */\n'],
    ['user_api_sync_desktop_new', '/* new */\n'],
  ])
  assert.equal(result.nextApis[0].name, 'Mobile only')
  assert.equal(result.nextApis[0].remoteSource, undefined)
  assert.equal(result.nextApis[1].name, 'Local from server')
  assert.equal(result.nextApis[1].remoteId, 'local_api')
  assert.equal(result.nextApis[1].remoteSource, 'desktop')
  assert.equal(result.nextApis[2].name, 'New keep')
  assert.equal(result.nextApis[2].remoteId, 'desktop_keep')
  assert.equal(result.nextApis[2].remoteSource, 'desktop')
  assert.equal(result.nextApis[3].allowShowUpdateAlert, false)
})

test('empty snapshot clears only desktop-managed user APIs', () => {
  const result = buildUserApiOverwrite([
    { id: 'local_api', name: 'Local' },
    { id: 'synced_old', remoteId: 'desktop_old', remoteSource: 'desktop', name: 'Old' },
  ], desktopPayload([]))

  assert.deepEqual(result.nextApis.map(api => api.id), ['local_api'])
  assert.deepEqual(result.removedScriptIds, ['synced_old'])
  assert.deepEqual(result.scriptsToSave, [])
})

test('snapshot overwrite does not reuse an unrelated mobile user API id', () => {
  const result = buildUserApiOverwrite([
    {
      id: 'user_api_sync_desktop_new',
      name: 'Mobile local source with colliding id',
      description: '',
      author: '',
      homepage: '',
      version: '',
      allowShowUpdateAlert: true,
    },
  ], desktopPayload([
    desktopApi('desktop_new', '/* new */\n'),
  ]))

  assert.deepEqual(result.nextApis.map(api => api.id), ['user_api_sync_desktop_new', 'user_api_sync_desktop_new_1'])
  assert.deepEqual(result.scriptsToSave, [
    ['user_api_sync_desktop_new_1', '/* new */\n'],
  ])
  assert.deepEqual(result.removedScriptIds, [])
})

test('snapshot overwrite promotes a same-id mobile API returned by merge', () => {
  const result = buildUserApiOverwrite([
    {
      id: 'mobile_api',
      name: 'Mobile source',
      description: '',
      author: '',
      homepage: '',
      version: '',
      allowShowUpdateAlert: true,
    },
  ], desktopPayload([
    desktopApi('mobile_api', '/* merged */\n'),
  ]))

  assert.deepEqual(result.nextApis.map(api => api.id), ['mobile_api'])
  assert.equal(result.nextApis[0].remoteId, 'mobile_api')
  assert.equal(result.nextApis[0].remoteSource, 'desktop')
  assert.deepEqual(result.removedScriptIds, [])
})

test('sync payload validation rejects unsupported source and script encoding', () => {
  assert.throws(() => {
    validateUserApiSyncData({ source: 'mobile', updatedAt: 1, apis: [] })
  }, /desktop/)

  assert.throws(() => {
    validateUserApiSyncData(desktopPayload([
      desktopApi('desktop_api', 'gz_xxx', { scriptEncoding: 'gzip' }),
    ]))
  }, /plain/)

  assert.throws(() => {
    validateUserApiSyncData(desktopPayload([
      desktopApi('desktop_api', 'const source = {}'),
    ]))
  }, /custom source script/)
})

test('sync payload validation rejects duplicate ids and invalid metadata', () => {
  const api = {
    id: 'remote-a',
    name: 'Remote A',
    description: '',
    author: '',
    homepage: '',
    version: '1.0.0',
    allowShowUpdateAlert: true,
    scriptEncoding: 'plain',
    script: '/* Remote A */\n',
  }

  assert.throws(() => validateUserApiSyncData({
    source: 'desktop',
    updatedAt: Date.now(),
    apis: [api, { ...api }],
  }), /Duplicate userApi id/)

  assert.throws(() => validateUserApiSyncData({
    source: 'desktop',
    updatedAt: Date.now(),
    apis: [{ ...api, name: 123 }],
  }), /Invalid userApi name/)

  assert.throws(() => validateUserApiSyncData({
    source: 'desktop',
    updatedAt: Number.NaN,
    apis: [],
  }), /Invalid userApi updatedAt/)
})

test('comparable sync data ignores updatedAt', () => {
  const api = desktopApi('desktop_api', '/* source */\n')

  assert.deepEqual(
    getUserApiSyncComparableData(desktopPayload([api], 1)),
    getUserApiSyncComparableData(desktopPayload([api], 2)),
  )
})

test('local sync data includes mobile-only and synced user APIs', async() => {
  const data = await buildUserApiSyncData([
    {
      id: 'local_api',
      name: 'Local',
      description: '',
      author: '',
      homepage: '',
      version: '1.0.0',
      allowShowUpdateAlert: true,
    },
    {
      id: 'synced_api',
      remoteId: 'desktop_api',
      remoteSource: 'desktop',
      name: 'Synced',
      description: 'Desc',
      author: 'Author',
      homepage: 'https://example.com',
      version: '2.0.0',
      allowShowUpdateAlert: false,
    },
  ], async(id) => `/* ${id} */\n`, 123)

  assert.deepEqual(data, {
    source: 'desktop',
    updatedAt: 123,
    apis: [
      {
        id: 'local_api',
        name: 'Local',
        description: '',
        author: '',
        homepage: '',
        version: '1.0.0',
        allowShowUpdateAlert: true,
        scriptEncoding: 'plain',
        script: '/* local_api */\n',
      },
      {
        id: 'desktop_api',
        name: 'Synced',
        description: 'Desc',
        author: 'Author',
        homepage: 'https://example.com',
        version: '2.0.0',
        allowShowUpdateAlert: false,
        scriptEncoding: 'plain',
        script: '/* synced_api */\n',
      },
    ],
  })
})

test('removed active custom source falls back directly to a built-in source', () => {
  assert.equal(
    resolveSyncedApiSource('user_api_removed', [{ id: 'user_api_keep' }], 'kw'),
    'kw',
  )
  assert.equal(
    resolveSyncedApiSource('user_api_keep', [{ id: 'user_api_keep' }], 'kw'),
    'user_api_keep',
  )
  assert.equal(resolveSyncedApiSource('kg', [], 'kw'), 'kg')
})
