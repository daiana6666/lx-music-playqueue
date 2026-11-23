const REPOSITORY = 'Macrohard0001/lx-ikun-music-sources'
const fields = ['provider', 'repository', 'version', 'group', 'path', 'blobSha', 'commitSha']
const canonicalizeRemote = value => {
  if (value == null) return undefined
  if (typeof value != 'object' || Array.isArray(value)) throw new Error('Invalid userApi remote metadata')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (!fields.every(key => descriptors[key] && 'value' in descriptors[key] && typeof descriptors[key].value == 'string')) throw new Error('Invalid userApi remote metadata')
  const remote = Object.fromEntries(fields.map(key => [key, descriptors[key].value]))
  if (remote.provider != 'github' || remote.repository != REPOSITORY || !/^[vV]\d{6}$/.test(remote.version) || !/^[0-9a-f]{40}$/i.test(remote.blobSha) || !/^[0-9a-f]{40}$/i.test(remote.commitSha) || !remote.path.startsWith(remote.version + '/') || !/\.js$/i.test(remote.path) || remote.path.includes('\\')) throw new Error('Invalid userApi remote metadata')
  const parts = remote.path.slice(remote.version.length + 1).split('/')
  if (parts.some(part => !part || part == '.' || part == '..') || parts[parts.length - 1].length <= 3 || remote.group != (parts.length > 1 ? parts[0] : remote.version)) throw new Error('Invalid userApi remote group or path')
  try { encodeURIComponent(remote.path); encodeURIComponent(remote.group) } catch { throw new Error('Invalid userApi remote Unicode') }
  return remote
}
module.exports = { REPOSITORY, canonicalizeRemote }
