const { sha1 } = require('@noble/hashes/sha1')
const { bytesToHex } = require('@noble/hashes/utils')
const zlib = require('pako/lib/zlib/inflate.js')
const ZStream = require('pako/lib/zlib/zstream.js')

const invalid = detail => { throw Object.assign(new Error(`Invalid Git response: ${detail}`), { code: 'GITHUB_GIT_INVALID' }) }
const objectHash = (type, bytes) => bytesToHex(sha1.create().update(Buffer.from(`${type} ${bytes.length}\0`)).update(bytes).digest())
const packet = text => `${(Buffer.byteLength(text) + 4).toString(16).padStart(4, '0')}${text}`
const readPacket = (bytes, offset) => {
  const header = bytes.toString('ascii', offset, offset + 4)
  if (!/^[0-9a-f]{4}$/i.test(header)) invalid('packet header')
  const length = parseInt(header, 16)
  if (length == 0) return { text: '', next: offset + 4 }
  if (length < 4 || length > 65520 || offset + length > bytes.length) invalid('packet length')
  return { text: bytes.toString('utf8', offset + 4, offset + length), next: offset + length }
}
const readMainRef = bytes => {
  bytes = Buffer.from(bytes)
  let offset = 0
  let commitSha
  let supportsFilter = false
  while (offset < bytes.length) {
    const item = readPacket(bytes, offset)
    offset = item.next
    const [ref, capabilities = ''] = item.text.trimEnd().split('\0')
    supportsFilter ||= capabilities.split(' ').includes('filter')
    const match = /^([a-f0-9]{40}) refs\/heads\/main$/.exec(ref)
    if (match) {
      if (commitSha) invalid('duplicate main ref')
      commitSha = match[1]
    }
  }
  if (!commitSha || !supportsFilter) invalid('missing main ref or partial fetch support')
  return commitSha
}

const applyDelta = (base, delta, maxBytes) => {
  let offset = 0
  const readByte = () => {
    if (offset >= delta.length) invalid('truncated delta')
    return delta[offset++]
  }
  const readSize = () => {
    let value = 0
    let shift = 0
    let byte
    do {
      byte = readByte()
      value += (byte & 127) * 2 ** shift
      shift += 7
      if (!Number.isSafeInteger(value) || shift > 49) invalid('delta size')
    } while (byte & 128)
    return value
  }
  if (readSize() != base.length) invalid('delta base size')
  const length = readSize()
  if (length > maxBytes) invalid('expanded delta size limit')
  const result = Buffer.alloc(length)
  let written = 0
  while (offset < delta.length) {
    const command = readByte()
    if (command & 128) {
      let start = 0
      let size = 0
      for (let i = 0; i < 4; i++) if (command & (1 << i)) start += readByte() * 2 ** (i * 8)
      for (let i = 0; i < 3; i++) if (command & (16 << i)) size += readByte() * 2 ** (i * 8)
      size ||= 65536
      if (start + size > base.length || written + size > length) invalid('delta copy bounds')
      result.set(base.subarray(start, start + size), written)
      written += size
    } else {
      if (!command || offset + command > delta.length || written + command > length) invalid('delta insert bounds')
      result.set(delta.subarray(offset, offset + command), written)
      written += command
      offset += command
    }
  }
  if (written != length) invalid('delta result size')
  return result
}

// Read a self-contained, non-sideband upload-pack response. No thin packs are requested.
// Bound allocations before inflating and validate both the pack trailer and every object ID.
const readUploadPack = (input, { maxObjects, maxObjectBytes, maxTotalBytes }) => {
  const response = Buffer.from(input)
  let start = 0
  let acknowledged = false
  while (response.toString('ascii', start, start + 4) != 'PACK') {
    const item = readPacket(response, start)
    if (item.text == 'NAK\n') acknowledged = true
    else if (item.text && !/^shallow [a-f0-9]{40}\n?$/.test(item.text)) invalid('upload-pack negotiation')
    start = item.next
  }
  if (!acknowledged) invalid('missing pack acknowledgement')
  // Some React Native Buffer implementations inherit Uint8Array.subarray and
  // return plain arrays. Keep Buffer methods explicitly at byte-view boundaries.
  const bytes = Buffer.from(response.buffer, response.byteOffset + start, response.length - start)
  if (bytes.length < 32 || bytes.length > maxTotalBytes + 1000000) invalid('pack size')
  const actualHash = bytesToHex(sha1(bytes.subarray(0, -20)))
  const expectedHash = bytesToHex(bytes.subarray(-20))
  if (actualHash != expectedHash) invalid(`pack checksum (${bytes.length} bytes, expected ${expectedHash}, received ${actualHash})`)
  const version = bytes.readUInt32BE(4)
  const count = bytes.readUInt32BE(8)
  if (![2, 3].includes(version) || !count || count > maxObjects) invalid('pack version or object count')
  const end = bytes.length - 20
  let offset = 12
  let inflatedBytes = 0
  const entries = new Map()
  const objects = new Map()
  const types = { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' }
  const readByte = () => {
    if (offset >= end) invalid('truncated object')
    return bytes[offset++]
  }
  for (let i = 0; i < count; i++) {
    const position = offset
    let byte = readByte()
    const kind = (byte >> 4) & 7
    let size = byte & 15
    let shift = 4
    while (byte & 128) {
      byte = readByte()
      size += (byte & 127) * 2 ** shift
      shift += 7
      if (!Number.isSafeInteger(size) || shift > 49) invalid('object size')
    }
    inflatedBytes += size
    if (size > maxObjectBytes || inflatedBytes > maxTotalBytes) invalid('inflated pack size limit')
    const entry = { type: types[kind], depth: 0 }
    if (kind == 6) {
      byte = readByte()
      let distance = byte & 127
      while (byte & 128) {
        byte = readByte()
        distance = (distance + 1) * 128 + (byte & 127)
        if (!Number.isSafeInteger(distance) || distance > position) invalid('delta offset')
      }
      entry.baseOffset = position - distance
      if (!distance || !entries.has(entry.baseOffset)) invalid('missing offset base')
    } else if (kind == 7) {
      if (offset + 20 > end) invalid('truncated delta base')
      entry.baseSha = bytesToHex(bytes.subarray(offset, offset + 20))
      offset += 20
    } else if (!entry.type) invalid('object type')

    // The low-level zlib interface stops at one stream; Inflate also accepts
    // concatenated streams and would consume the following Git object header.
    const stream = new ZStream()
    if (zlib.inflateInit(stream) != 0) invalid('inflate initialization')
    stream.input = bytes.subarray(offset, end)
    stream.avail_in = stream.input.length
    stream.output = new Uint8Array(size + 1)
    stream.avail_out = size + 1
    let status
    try { status = zlib.inflate(stream, 4) } finally { zlib.inflateEnd(stream) }
    if (status != 1 || stream.total_out != size || !stream.total_in) invalid('compressed object size or checksum')
    offset += stream.total_in
    entry.bytes = Buffer.from(stream.output.subarray(0, size))
    entries.set(position, entry)
    if (entry.type) objects.set(objectHash(entry.type, entry.bytes), entry)
  }
  if (offset != end) invalid('trailing pack data')

  let pending = [...entries.values()].filter(entry => !entry.type)
  let totalBytes = [...objects.values()].reduce((sum, entry) => sum + entry.bytes.length, 0)
  while (pending.length) {
    let resolved = 0
    for (const entry of pending) {
      const base = entry.baseSha ? objects.get(entry.baseSha) : entries.get(entry.baseOffset)
      if (!base?.type) continue
      entry.depth = base.depth + 1
      if (entry.depth > 50) invalid('delta depth limit')
      entry.bytes = applyDelta(base.bytes, entry.bytes, Math.min(maxObjectBytes, maxTotalBytes - totalBytes))
      totalBytes += entry.bytes.length
      entry.type = base.type
      objects.set(objectHash(entry.type, entry.bytes), entry)
      resolved++
    }
    if (!resolved) invalid('missing or cyclic delta base')
    pending = pending.filter(entry => !entry.type)
  }
  return objects
}

module.exports = { packet, readMainRef, readUploadPack, objectHash }
