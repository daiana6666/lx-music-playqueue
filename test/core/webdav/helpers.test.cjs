const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildChildUrl,
  isSameWebDAVRoot,
  isUrlWithinRoot,
  normalizeDirUrl,
  normalizeRelativeFilePath,
  parsePropfindResponse,
  parseUrl,
} = require('../../../src/core/webdav/helpers.js')

test('nested PROPFIND relative hrefs resolve against the requested directory', () => {
  const entries = parsePropfindResponse(`
    <d:multistatus xmlns:d="DAV:">
      <d:response>
        <d:href>Artist%20A%20&amp;%20B/song.mp3</d:href>
        <d:propstat><d:prop><d:getcontentlength>42</d:getcontentlength></d:prop></d:propstat>
      </d:response>
    </d:multistatus>
  `, 'https://dav.example/music/album/', 'https://dav.example/music/')

  assert.deepEqual(entries, [{
    url: 'https://dav.example/music/album/Artist%20A%20%26%20B/song.mp3',
    path: 'album/Artist A & B/song.mp3',
    isDirectory: false,
    size: 42,
    etag: undefined,
    lastModified: undefined,
  }])
})

test('PROPFIND entries outside the configured root are ignored', () => {
  const entries = parsePropfindResponse(`
    <d:multistatus xmlns:d="DAV:">
      <d:response><d:href>https://other.example/music/song.mp3</d:href></d:response>
      <d:response><d:href>/music/../private/song.mp3</d:href></d:response>
      <d:response><d:href>/music-other/song.mp3</d:href></d:response>
      <d:response><d:href>/music/ok.mp3</d:href></d:response>
    </d:multistatus>
  `, 'https://dav.example/music/', 'https://dav.example/music/')

  assert.deepEqual(entries.map(entry => entry.path), ['ok.mp3'])
  assert.equal(isUrlWithinRoot('https://dav.example/music/', 'https://other.example/music/song.mp3'), false)
  assert.equal(isUrlWithinRoot('https://dav.example/music/', 'https://dav.example/music/../private/song.mp3'), false)
})

test('WebDAV roots and file paths are normalized without allowing traversal', () => {
  assert.equal(normalizeDirUrl('https://DAV.example/music?token=1'), 'https://DAV.example/music/?token=1')
  assert.equal(isSameWebDAVRoot('https://dav.example/music', 'https://DAV.example/music/'), true)
  assert.equal(normalizeRelativeFilePath('/album/Song%20Name.mp3'), 'album/Song Name.mp3')
  assert.equal(buildChildUrl('https://dav.example/music/album/', '../next/song.mp3'), 'https://dav.example/music/next/song.mp3')
  assert.throws(() => normalizeRelativeFilePath('../secret.mp3'), /Invalid WebDAV file path/)
  assert.throws(() => normalizeRelativeFilePath('%2e%2e/secret.mp3'), /Invalid WebDAV file path/)
  assert.throws(() => normalizeRelativeFilePath('%252e%252e/secret.mp3'), /Invalid WebDAV path/)
  assert.throws(() => parseUrl('ftp://dav.example/music/'), /Invalid WebDAV url/)
})
