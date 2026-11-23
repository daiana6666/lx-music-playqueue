const test = require('node:test')
const assert = require('node:assert/strict')
const { gzipSync, deflateSync } = require('node:zlib')
const { decodeBackup, validatePlaylistBackup, getBackupProfiles, MAX_BACKUP_BYTES } = require('../../../src/core/backup/helpers')
const { normalizeProfile, resolveGroup, moveWithinGroup } = require('../../../src/core/listProfile/helpers')
const backup = () => ({ type: 'playList_v2', data: [{ id: 'one', name: 'Example', list: [{ id: 'wy_1', name: 'Song', singer: 'Artist', source: 'wy', meta: {} }], profile: { description: '简介', group: 'external', coverUrl: 'https://example.com/cover.jpg' } }] })

test('desktop/mobile playlist payload and portable profiles survive JSON/gzip/zlib roundtrips', () => {
  for (const encode of [bytes => bytes, gzipSync, deflateSync]) {
    const input = backup()
    const result = validatePlaylistBackup(decodeBackup(encode(Buffer.from(JSON.stringify(input)))))
    assert.deepEqual(result, input)
    assert.deepEqual(getBackupProfiles(result.data).one, input.data[0].profile)
  }
  assert.deepEqual(decodeBackup(Buffer.from(JSON.stringify(JSON.stringify(backup())))), backup())
})

test('unknown types, duplicate lists, malformed songs and truncated gzip fail before import', () => {
  assert.throws(() => validatePlaylistBackup({ type: 'playList_v3', data: [] }), /Unsupported/)
  const duplicate = backup()
  duplicate.data.push(duplicate.data[0])
  assert.throws(() => validatePlaylistBackup(duplicate), /Duplicate/)
  const malformed = backup()
  delete malformed.data[0].list[0].meta
  assert.throws(() => validatePlaylistBackup(malformed), /Invalid song/)
  assert.throws(() => decodeBackup(gzipSync(Buffer.from(JSON.stringify(backup()))).subarray(0, 30)), /incomplete|Invalid/)
})

test('inflated backup length is bounded while decoding', () => {
  const bytes = gzipSync(Buffer.from(' '.repeat(MAX_BACKUP_BYTES + 10)))
  assert.throws(() => decodeBackup(bytes), /exceeds/)
})

test('profile boundary excludes local paths, credentials and account authority', () => {
  assert.deepEqual(normalizeProfile({ description: '', group: 'mine', coverUrl: 'file:///C:/cover.jpg', managed: true, accountKey: 'secret' }), { description: '', group: 'mine' })
  assert.deepEqual(normalizeProfile({ coverUrl: 'https://user:pass@example.com/pic' }), {})
  assert.equal(resolveGroup({ source: 'wy' }, {}), 'external')
  assert.equal(resolveGroup({ source: 'wy' }, { group: 'mine' }), 'mine')
  assert.equal(resolveGroup({}, {}), 'mine')
})

test('group reordering preserves other group positions and clamps boundaries', () => {
  const lists = [{ id: 'a' }, { id: 'external', source: 'wy' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(moveWithinGroup(lists, {}, 'a', 1), ['b', 'external', 'a', 'c'])
  assert.deepEqual(moveWithinGroup(lists, {}, 'c', 1), lists.map(list => list.id))
})
