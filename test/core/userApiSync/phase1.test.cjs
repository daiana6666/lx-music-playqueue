const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { buildUserApiOverwrite, buildUserApiSyncData, getUserApiSyncComparableData } = require('../../../src/core/userApiSync/helpers')
const { createUserApiRepository } = require('../../../src/core/userApiSync/repository')
const { buildGitHubReplacement, verifyScriptBlob, createGitHubClient } = require('../../../src/core/userApiSync/githubClient')
const { downloadGitHubUserApiScripts } = require('../../../src/core/userApiSync/github')
const remote = { provider: 'github', repository: 'Macrohard0001/lx-ikun-music-sources', version: 'v260911', group: 'A', path: 'v260911/A/one.js', blobSha: 'a'.repeat(40), commitSha: 'b'.repeat(40) }
const api = { id: 'remote', name: 'Source', description: '', author: '', homepage: '', version: '1', allowShowUpdateAlert: true, scriptEncoding: 'plain', script: '/*\n * @name Test\n */\n', remote }
const payload = { source: 'desktop', updatedAt: 1, apis: [api] }

test('GitHub metadata survives pull, serialized restart, push and legacy omission', async() => {
  const imported = buildUserApiOverwrite([], payload)
  const saved = JSON.parse(JSON.stringify(imported.nextApis))
  const result = await buildUserApiSyncData(saved, async() => api.script)
  assert.deepEqual(result.apis[0].remote, remote)
  assert.deepEqual(getUserApiSyncComparableData(result), getUserApiSyncComparableData(payload))
  assert.deepEqual(buildUserApiOverwrite(saved, { ...payload, apis: [{ ...api, remote: undefined }] }).nextApis[0].remote, remote)
  assert.throws(() => buildUserApiOverwrite(saved, { ...payload, apis: [{ ...api, remote: { ...remote, group: 'wrong' } }] }), /remote/)
})

test('GitHub replacement preserves local sources, uses desktop IDs and rejects all-invalid batches', () => {
  const existing = [{ id: 'local' }]
  const items = [{ remote, script: api.script }, { remote: { ...remote, path: 'v260911/A/invalid.js' }, script: 'invalid' }]
  const result = buildGitHubReplacement(existing, items)
  assert.equal(result.nextApis[0].id, 'local')
  assert.equal(result.nextApis[1].id, 'user_api_github_' + createHash('sha256').update(remote.path).digest('hex').slice(0, 16))
  assert.equal(result.skipped.length, 1)
  assert.equal(buildGitHubReplacement(result.nextApis, [items[0]]).nextApis[1].id, result.nextApis[1].id)
  assert.throws(() => buildGitHubReplacement(existing, [items[1]]), /No valid/)
  assert.deepEqual(existing, [{ id: 'local' }])
  assert.throws(() => buildGitHubReplacement(existing, [items[0], { remote: { ...items[1].remote, commitSha: 'c'.repeat(40) }, script: api.script }]), /Mixed/)
})

test('downloads verify the exact Git blob and incomplete batches reject', async() => {
  const script = api.script
  const size = Buffer.byteLength(script)
  const blobSha = createHash('sha1').update(`blob ${size}\0${script}`).digest('hex')
  const file = { path: remote.path, group: 'A', size, blobSha }
  assert.equal(verifyScriptBlob(file, script), script)
  assert.throws(() => verifyScriptBlob(file, script + ' '), /verification/)
  const snapshot = { commitSha: remote.commitSha, version: remote.version, files: [file, { ...file, path: 'v260911/A/other.js' }] }
  await assert.rejects(downloadGitHubUserApiScripts(snapshot, async item => {
    if (item.path != file.path) throw new Error('Disconnected')
    return script
  }), /Disconnected/)
})

test('verified binary .js files are skipped without rejecting valid scripts in the same snapshot', async() => {
  const contents = [Buffer.from(api.script), Buffer.from([80, 75, 3, 4, 0, 255, 128])]
  const files = contents.map((bytes, index) => ({ path: `v260911/A/${index}.js`, group: 'A', size: bytes.length, blobSha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') }))
  const client = createGitHubClient(async url => {
    const index = url.endsWith('0.js') ? 0 : 1
    return new Response(contents[index])
  })
  const items = await client.downloadSnapshot({ commitSha: remote.commitSha, version: remote.version, files })
  const result = buildGitHubReplacement([], items)
  assert.equal(result.nextApis.length, 1)
  assert.equal(result.scriptsToSave[0][1], api.script)
  assert.match(result.skipped[0], /not a UTF-8/)
})

test('source catalog commits after scripts and retains the previous generation on failures', async() => {
  let catalog = null
  let failScript = false
  let failCatalog = false
  let key = 0
  const scripts = new Map([['legacy', 'old']])
  const io = {
    snapshot: { read: async() => catalog, write: async next => { if (failCatalog) throw new Error('catalog failure'); catalog = structuredClone(next) } },
    loadLegacy: async() => ({ apis: [{ id: 'one' }], scripts: { one: 'legacy' } }),
    readScript: async key => scripts.get(key),
    writeScript: async(key, script) => { if (failScript) throw new Error('script failure'); scripts.set(key, script) },
    removeScript: async key => { scripts.delete(key) },
    createKey: () => `:generation:${++key}`,
  }
  const repo = createUserApiRepository(io)
  const update = () => ({ nextApis: [{ id: 'one', remote }], scriptsToSave: [['one', 'new']] })
  failScript = true
  await assert.rejects(repo.mutate(update), /script failure/)
  assert.equal(await repo.getScript('one'), 'old')
  failScript = false
  failCatalog = true
  await assert.rejects(repo.mutate(update), /catalog failure/)
  assert.equal(await repo.getScript('one'), 'old')
  assert.equal(catalog, null)
  failCatalog = false
  await repo.mutate(update)
  const restarted = createUserApiRepository(io)
  assert.equal(await restarted.getScript('one'), 'new')
  assert.deepEqual((await restarted.getList())[0].remote, remote)
  await Promise.all([repo.mutate(apis => ({ nextApis: [...apis, { id: 'two' }], scriptsToSave: [['two', 'two']] })), repo.mutate(apis => ({ nextApis: apis.map(api => ({ ...api, version: '2' })) }))])
  assert.equal((await repo.getList()).length, 2)
  assert.equal(await repo.getScript('two'), 'two')
})
