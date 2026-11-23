const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { createGitHubRequest } = require('../../../src/core/userApiSync/githubRequest')
const { createGitHubClient, buildGitHubReplacement } = require('../../../src/core/userApiSync/githubClient')

const response = (status, content = '', headers = {}) => ({
  ok: status == 200, status,
  headers: { get: key => headers[key] ?? null },
  text: async() => content,
  arrayBuffer: async() => Uint8Array.from(Buffer.from(content)).buffer,
})
const script = '/*\n * @name 中文音源\n */\n'
const file = { path: 'V260911/中文/测试.js', group: '中文', size: Buffer.byteLength(script), blobSha: createHash('sha1').update(`blob ${Buffer.byteLength(script)}\0${script}`).digest('hex') }
const snapshot = { commitSha: 'a'.repeat(40), version: 'V260911', files: [file] }

test('the complete download and replacement works without the TextEncoder missing in Hermes', async() => {
  const encoder = global.TextEncoder
  try {
    delete global.TextEncoder
    const items = await createGitHubClient(async() => response(200, script)).downloadSnapshot(snapshot)
    const result = buildGitHubReplacement([], items)
    assert.equal(result.nextApis[0].name, '中文音源')
    assert.equal(result.scriptsToSave[0][1], script)
  } finally { global.TextEncoder = encoder }
})

test('504 retries with backoff and succeeds; 403/404/429 fail once with useful classifications', async() => {
  let count = 0
  const delays = []
  const read = createGitHubRequest(async() => response(++count < 3 ? 504 : 200, 'ok'), { delay: async value => delays.push(value) })
  assert.equal(await read('https://example.test/a', 100), 'ok')
  assert.deepEqual(delays, [300, 1200])
  for (const [status, headers, code] of [
    [403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' }, 'GITHUB_RATE_LIMIT'],
    [403, {}, 'GITHUB_FORBIDDEN'], [404, {}, 'GITHUB_NOT_FOUND'], [429, { 'retry-after': '60' }, 'GITHUB_RATE_LIMIT'],
  ]) {
    let calls = 0
    await assert.rejects(createGitHubRequest(async() => { calls++; return response(status, '', headers) })('https://example.test/a', 100), error => error.code == code && error.status == status)
    assert.equal(calls, 1)
  }
})

test('hanging requests time out even if the native fetch ignores abort; oversized responses are not retried', async() => {
  await assert.rejects(createGitHubRequest(async() => new Promise(() => {}), { timeoutMs: 10, delay: async() => {} })('https://example.test/a', 100, { attempts: 1 }), { code: 'GITHUB_TIMEOUT' })
  let count = 0
  await assert.rejects(createGitHubRequest(async() => { count++; return response(200, 'too big') })('https://example.test/a', 2), { code: 'GITHUB_SIZE_LIMIT' })
  assert.equal(count, 1)
})

test('raw and CDN failure falls back to the pinned official blob, preserving byte verification', async() => {
  const calls = []
  const items = await createGitHubClient(async url => {
    calls.push(url)
    if (!url.includes('/git/blobs/')) return response(404)
    assert.ok(url.endsWith(file.blobSha))
    return response(200, JSON.stringify({ sha: file.blobSha, encoding: 'base64', content: Buffer.from(script).toString('base64') }))
  }).downloadSnapshot(snapshot)
  assert.equal(items[0].script, script)
  assert.equal(calls.length, 3)
})

test('failure keeps every download error and never replaces an existing source catalog', async() => {
  const existing = [{ id: 'local' }]
  let writes = 0
  const client = createGitHubClient(async url => response(url.includes('raw.githubusercontent') ? 504 : url.includes('jsdelivr') ? 404 : 403))
  await assert.rejects((async() => {
    const items = await client.downloadSnapshot(snapshot)
    buildGitHubReplacement(existing, items)
    writes++
  })(), error => {
    assert.equal(error.code, 'GITHUB_DOWNLOAD_FAILED')
    assert.deepEqual(error.failures.map(item => item.status), [504, 404, 403])
    return true
  })
  assert.equal(writes, 0)
  assert.deepEqual(existing, [{ id: 'local' }])
})
