const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { deflateSync } = require('node:zlib')
const { createGitHubClient, buildGitHubReplacement } = require('../../../src/core/userApiSync/githubClient')
const { readUploadPack, readMainRef } = require('../../../src/core/userApiSync/gitPack')
const loadTs = require('../../helpers/load-ts-module.cjs')

const hash = bytes => createHash('sha1').update(bytes).digest()
const object = (type, content) => {
  const bytes = Buffer.from(content)
  return { type, bytes, sha: hash(Buffer.concat([Buffer.from(`${type} ${bytes.length}\0`), bytes])).toString('hex') }
}
const tree = entries => object('tree', Buffer.concat(entries.map(([mode, name, target]) => Buffer.concat([Buffer.from(`${mode} ${name}\0`), Buffer.from(target.sha, 'hex')]))))
const pkt = value => `${(Buffer.byteLength(value) + 4).toString(16).padStart(4, '0')}${value}`
const header = (type, size) => {
  const bytes = [(type << 4) | (size & 15)]
  size = Math.floor(size / 16)
  while (size) { bytes[bytes.length - 1] |= 128; bytes.push(size & 127); size = Math.floor(size / 128) }
  return Buffer.from(bytes)
}
const encodeObject = value => Buffer.concat([header({ commit: 1, tree: 2, blob: 3 }[value.type], value.bytes.length), deflateSync(value.bytes)])
const pack = entries => {
  const bytes = Buffer.concat([Buffer.from('PACK\0\0\0\x02'), Buffer.from([0, 0, entries.length >> 8, entries.length & 255]), ...entries])
  return Buffer.concat([Buffer.from('0008NAK\n'), bytes, hash(bytes)])
}
const response = (status, content = '', headers = {}) => ({
  ok: status == 200, status, headers: { get: name => headers[name] ?? null },
  text: async() => Buffer.from(content).toString(),
  arrayBuffer: async() => Uint8Array.from(Buffer.from(content)).buffer,
})
const rateLimit = () => response(403, '', { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1789114166' })
const limits = { maxObjects: 200, maxObjectBytes: 100000, maxTotalBytes: 1000000 }
const script = object('blob', '/*\n * @name 备用中文音源\n */\n')
const binary = object('blob', Buffer.from([255, 0, 254]))
const group = tree([['100644', '测试.js', script], ['100644', 'binary.js', binary]])
const version = tree([['40000', '推荐', group]])
const root = tree([['40000', 'V260911', version], ['40000', 'v260810', { sha: 'c'.repeat(40) }]])
const commit = object('commit', `tree ${root.sha}\nauthor Fixture <fixture@example.test> 0 +0000\ncommitter Fixture <fixture@example.test> 0 +0000\n\nfixture\n`)
const refs = pkt('# service=git-upload-pack\n') + '0000' + pkt(`${commit.sha} HEAD\0filter no-progress\n`) + pkt(`${commit.sha} refs/heads/main\n`) + '0000'
const metadata = pack([commit, root, version, group].map(encodeObject))
const blobs = pack([script, binary].map(encodeObject))
const fixtureRequest = (calls, overrides = {}) => async(url, options) => {
  calls.push({ url, options })
  if (url.includes('api.github.com')) return overrides.api?.(url) ?? rateLimit()
  if (url.includes('/info/refs')) return response(200, overrides.refs ?? refs)
  assert.ok(url.endsWith('/git-upload-pack'))
  assert.equal(options.method, 'POST')
  assert.equal(options.headers['Content-Type'], 'application/x-git-upload-pack-request')
  assert.ok(!options.body.includes('thin-pack'))
  if (options.body.includes('filter blob:none')) {
    assert.ok(options.body.includes(`want ${commit.sha} `))
    assert.ok(options.body.includes('deepen 1\n'))
    return response(200, overrides.metadata ?? metadata)
  }
  assert.ok(options.body.includes(`want ${script.sha} `))
  assert.ok(options.body.includes(`want ${binary.sha}\n`))
  return response(200, overrides.blobs ?? blobs)
}

test('first import under REST 403 uses only official Git, verifies blobs and works without TextEncoder', async() => {
  const calls = []
  const encoder = global.TextEncoder
  try {
    delete global.TextEncoder
    const client = createGitHubClient(fixtureRequest(calls))
    const snapshot = await client.getSnapshot()
    assert.equal(snapshot.commitSha, commit.sha)
    assert.equal(snapshot.version, 'V260911')
    assert.deepEqual(snapshot.files.map(file => [file.path, file.blobSha, file.size]), [
      ['V260911/推荐/测试.js', script.sha, script.bytes.length], ['V260911/推荐/binary.js', binary.sha, binary.bytes.length],
    ])
    const items = await client.downloadSnapshot(snapshot)
    const imported = buildGitHubReplacement([{ id: 'local', name: 'local source' }], items)
    assert.equal(imported.nextApis.length, 2)
    assert.equal(imported.nextApis[0].id, 'local')
    assert.equal(imported.nextApis[1].name, '备用中文音源')
    assert.equal(imported.skipped.length, 1)
    assert.equal(calls.length, 4)
    const updated = buildGitHubReplacement(imported.nextApis, items)
    assert.deepEqual(updated.nextApis, imported.nextApis)
  } finally { global.TextEncoder = encoder }
})

test('Android Buffer subarray may return plain Uint8Array throughout Git import', async() => {
  const original = Buffer.prototype.subarray
  Buffer.prototype.subarray = function(start, end) {
    return new Uint8Array(original.call(this, start, end))
  }
  try {
    const client = createGitHubClient(fixtureRequest([]))
    const snapshot = await client.getSnapshot()
    const items = await client.downloadSnapshot(snapshot)
    assert.equal(buildGitHubReplacement([], items).nextApis[0].name, '备用中文音源')
    const base = object('blob', 'hello')
    const delta = Buffer.from([5, 6, 0x90, 5, 1, 33])
    const refDelta = Buffer.concat([header(7, delta.length), Buffer.from(base.sha, 'hex'), deflateSync(delta)])
    const resolved = readUploadPack(pack([refDelta, encodeObject(base)]), limits)
    assert.equal(resolved.get(object('blob', 'hello!').sha).bytes.toString(), 'hello!')
  } finally { Buffer.prototype.subarray = original }
})

test('tree API 403 retains the already resolved commit even if main moves', async() => {
  const calls = []
  const client = createGitHubClient(fixtureRequest(calls, { api: url => url.includes('/branches/') ? response(200, JSON.stringify({ commit: { sha: commit.sha } })) : rateLimit() }))
  const snapshot = await client.getSnapshot()
  assert.equal(snapshot.commitSha, commit.sha)
  assert.equal(calls.length, 4)
  assert.ok(calls.every(call => !call.url.includes('/info/refs')))
})

test('API 504 exhausts bounded retries, then imports through Git', async() => {
  const calls = []
  const client = createGitHubClient(fixtureRequest(calls, { api: () => response(504) }))
  assert.equal((await client.getSnapshot()).files.length, 2)
  assert.equal(calls.filter(call => call.url.includes('api.github.com')).length, 3)
})

test('API validation and size failures never fall back to a less strict snapshot', async() => {
  const calls = []
  const client = createGitHubClient(fixtureRequest(calls, { api: url => response(200, JSON.stringify(url.includes('/branches/') ? { commit: { sha: commit.sha } } : { tree: [], truncated: true })) }))
  await assert.rejects(client.getSnapshot(), { code: 'GITHUB_TREE_TRUNCATED' })
  assert.equal(calls.length, 2)
})

test('a valid pack containing the wrong commit or blob cannot replace pinned content', async() => {
  const otherCommit = object('commit', `tree ${root.sha}\n\nwrong commit\n`)
  const wrongBlob = object('blob', '/*\n * @name Unrelated\n */\n')
  for (const overrides of [
    { metadata: pack([otherCommit, root, version, group].map(encodeObject)) },
    { blobs: pack([wrongBlob, binary].map(encodeObject)) },
    { metadata: metadata.subarray(0, -1) },
  ]) {
    await assert.rejects(createGitHubClient(fixtureRequest([], overrides)).getSnapshot(), error => error.code == 'GITHUB_SNAPSHOT_FAILED' && error.failures[0].code == 'GITHUB_RATE_LIMIT' && error.failures[1].code == 'GITHUB_GIT_INVALID')
  }
})

test('metadata and fallback failures never reach the real update catalog mutation', async() => {
  let writes = 0
  const request = async() => rateLimit()
  const userApi = loadTs('src/core/userApi.ts', {
    '@/store/userApi': { action: {}, state: { list: [] } },
    '@/utils/data': { userApiRepository: { mutate: async() => { writes++ } } },
      '@/core/sourceRuntime': { invalidateSourceRuntimes: async() => {}, loadPrimarySource: async() => ({ apis: {}, qualitys: {} }) },
      '@/core/music/playbackSession': { playbackCoordinator: { invalidate() {} } },
      '@/utils/nativeModules/userApi': {}, '@/utils/log': {},
    '@/store/setting/state': {}, '@/utils/musicSdk/api-source-info': [],
    '@/core/userApiSync/helpers': {},
    '@/core/userApiSync/githubClient': { createGitHubClient: () => createGitHubClient(request), buildGitHubReplacement },
  })
  await assert.rejects(userApi.updateGitHubUserApis(), error => {
    assert.equal(error.existingSourcesRetained, true)
    assert.equal(error.code, 'GITHUB_SNAPSHOT_FAILED')
    assert.deepEqual(error.failures.map(reason => reason.status), [403, 403])
    assert.equal(error.failures[0].resetAt, 1789114166000)
    return true
  })
  assert.equal(writes, 0)
})

test('Git pack resolves forward reference and offset deltas with copy and insert operations', () => {
  const base = object('blob', 'hello')
  const delta = Buffer.from([5, 6, 0x90, 5, 1, 33]) // Copy five base bytes and insert !.
  const refDelta = Buffer.concat([header(7, delta.length), Buffer.from(base.sha, 'hex'), deflateSync(delta)])
  const baseEntry = encodeObject(base)
  const offsetDelta = Buffer.concat([header(6, delta.length), Buffer.from([baseEntry.length]), deflateSync(delta)])
  for (const entries of [[refDelta, baseEntry], [baseEntry, offsetDelta]]) {
    const result = readUploadPack(pack(entries), limits)
    assert.equal(result.get(object('blob', 'hello!').sha).bytes.toString(), 'hello!')
  }
})

test('Git pack rejects corrupt checksums, truncated streams, declared sizes, missing bases and delta bounds', () => {
  const corrupt = Buffer.from(blobs)
  corrupt[corrupt.length - 1] ^= 1
  assert.throws(() => readUploadPack(corrupt, limits), /checksum/)
  const base = object('blob', 'hello')
  const baseEntry = encodeObject(base)
  const refDelta = delta => Buffer.concat([header(7, delta.length), Buffer.from(base.sha, 'hex'), deflateSync(Buffer.from(delta))])
  for (const entries of [
    [Buffer.concat([header(3, 100001), deflateSync(Buffer.from('a'))])],
    [Buffer.concat([header(3, 1), deflateSync(Buffer.from('too many bytes'))])],
    [encodeObject(script).subarray(0, -2)],
    [refDelta([5, 1, 1, 33])],
    [baseEntry, refDelta([5, 6, 0x90, 6])],
    [baseEntry, refDelta([5, 1, 0])],
    [baseEntry, refDelta([4, 1, 1, 33])],
  ]) assert.throws(() => readUploadPack(pack(entries), limits), { code: 'GITHUB_GIT_INVALID' })
  assert.throws(() => readUploadPack(blobs, { ...limits, maxObjects: 1 }), /object count/)
  assert.throws(() => readUploadPack(blobs, { ...limits, maxTotalBytes: 1 }), /size limit/)
})

test('Git refs reject truncated packets and missing capabilities instead of guessing a revision', () => {
  assert.equal(readMainRef(Buffer.from(refs)), commit.sha)
  for (const value of [refs.slice(0, -2), refs.replace('filter', 'foobar'), pkt(`${commit.sha} refs/heads/other\n`) + '0000', refs + pkt(`${commit.sha} refs/heads/main\n`)]) {
    assert.throws(() => readMainRef(Buffer.from(value)), { code: 'GITHUB_GIT_INVALID' })
  }
})
